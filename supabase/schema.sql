-- ============================================================
--  ClaimDesk — Supabase schema
--  Run this ONCE in your Supabase project:
--    Supabase Dashboard → SQL Editor → New query → paste → Run
--
--  Creates the tables ClaimDesk needs, a storage bucket for
--  signed scans, and "open for testing" security rules.
--
--  ⚠️  SECURITY NOTE (read before going live):
--  While there are no real logins yet, every policy below allows
--  full anonymous access (anyone with the anon key can read/write).
--  That is fine for testing. When real Supabase Auth is added
--  later, replace every policy marked "TESTING — TIGHTEN LATER"
--  with authenticated/role-based rules.
-- ============================================================

create extension if not exists "pgcrypto";   -- for gen_random_uuid()

-- ── TABLE: jobs (one row per BPC work order) ────────────────
create table if not exists public.jobs (
  wo            text primary key,
  cust          text,
  loc           text,
  phase         text,
  stage         text,
  claim_ref     text,
  data          jsonb not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists jobs_stage_idx on public.jobs (stage);
create index if not exists jobs_claim_ref_idx on public.jobs (claim_ref);

-- ── TABLE: documents (soft-copy docs + signed-scan refs) ────
create table if not exists public.documents (
  id             uuid primary key default gen_random_uuid(),
  wo             text references public.jobs(wo) on delete cascade,
  doc_type       text not null,
  is_signed      boolean not null default false,
  storage_path   text,
  filename       text,
  html           text,
  uploaded_role  text,
  created_at     timestamptz not null default now()
);
create index if not exists documents_wo_idx on public.documents (wo);

-- ── TABLE: claim_batches ────────────────────────────────────
create table if not exists public.claim_batches (
  id            text primary key,
  cert_no       text,
  wos           jsonb not null default '[]',
  docs          jsonb not null default '{}',
  scans         jsonb not null default '{}',
  created_at    timestamptz not null default now()
);

-- ── TABLE: activity_log ─────────────────────────────────────
create table if not exists public.activity_log (
  id          uuid primary key default gen_random_uuid(),
  wo          text,
  action      text,
  role        text,
  ts          timestamptz not null default now()
);
create index if not exists activity_log_ts_idx on public.activity_log (ts desc);

-- ── TABLE: notifications ────────────────────────────────────
create table if not exists public.notifications (
  id          text primary key,
  role        text not null,
  msg         text,
  wo          text,
  is_read     boolean not null default false,
  ts          timestamptz not null default now()
);
create index if not exists notifications_role_idx on public.notifications (role, ts desc);

-- ── TABLE: app_meta (small key/value store) ─────────────────
create table if not exists public.app_meta (
  key    text primary key,
  value  jsonb
);
insert into public.app_meta (key, value)
values ('certSeq', '1'::jsonb)
on conflict (key) do nothing;

-- ── keep updated_at fresh on jobs ───────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
for each row execute function public.touch_updated_at();

-- ============================================================
--  ROW LEVEL SECURITY — PRODUCTION RULES
-- ============================================================
alter table public.jobs           enable row level security;
alter table public.documents      enable row level security;
alter table public.claim_batches  enable row level security;
alter table public.activity_log   enable row level security;
alter table public.notifications  enable row level security;
alter table public.app_meta       enable row level security;

-- IMPORTANT: Before deploying, ensure Supabase Auth is configured and users have role claims.
-- Store user role in JWT custom claims: auth.jwt() ->> 'user_role'
-- Roles: 'admin', 'finance', 'manager', 'system'

-- ── Jobs: All authenticated users can read. Admins can write/update. ──
drop policy if exists "jobs_read_all" on public.jobs;
create policy "jobs_read_all" on public.jobs for select to authenticated using (true);

drop policy if exists "jobs_insert_admin_only" on public.jobs;
create policy "jobs_insert_admin_only" on public.jobs for insert to authenticated 
  with check (auth.jwt() ->> 'user_role' = 'admin');

drop policy if exists "jobs_update_admin_only" on public.jobs;
create policy "jobs_update_admin_only" on public.jobs for update to authenticated 
  using (auth.jwt() ->> 'user_role' = 'admin') 
  with check (auth.jwt() ->> 'user_role' = 'admin');

drop policy if exists "jobs_delete_admin_only" on public.jobs;
create policy "jobs_delete_admin_only" on public.jobs for delete to authenticated 
  using (auth.jwt() ->> 'user_role' = 'admin');

-- ── Documents: All users can read. Only uploader's role can delete. ──
drop policy if exists "documents_read_all" on public.documents;
create policy "documents_read_all" on public.documents for select to authenticated using (true);

drop policy if exists "documents_write_uploader" on public.documents;
create policy "documents_write_uploader" on public.documents for insert to authenticated 
  with check (auth.uid() is not null);

drop policy if exists "documents_delete_own" on public.documents;
create policy "documents_delete_own" on public.documents for delete to authenticated 
  using (uploaded_role = (auth.jwt() ->> 'user_role'));

-- ── Claim Batches: Finance can create/update. All can read. ──
drop policy if exists "claim_batches_read_all" on public.claim_batches;
create policy "claim_batches_read_all" on public.claim_batches for select to authenticated using (true);

drop policy if exists "claim_batches_insert_finance" on public.claim_batches;
create policy "claim_batches_insert_finance" on public.claim_batches for insert to authenticated 
  with check (auth.jwt() ->> 'user_role' in ('finance', 'admin'));

drop policy if exists "claim_batches_update_finance" on public.claim_batches;
create policy "claim_batches_update_finance" on public.claim_batches for update to authenticated 
  using (auth.jwt() ->> 'user_role' in ('finance', 'admin'))
  with check (auth.jwt() ->> 'user_role' in ('finance', 'admin'));

-- ── Activity Log: All users can write (append-only). All can read. ──
drop policy if exists "activity_log_read_all" on public.activity_log;
create policy "activity_log_read_all" on public.activity_log for select to authenticated using (true);

drop policy if exists "activity_log_insert_all" on public.activity_log;
create policy "activity_log_insert_all" on public.activity_log for insert to authenticated 
  with check (auth.uid() is not null);

-- ── Notifications: Users can only read their own. ──
drop policy if exists "notifications_read_own" on public.notifications;
create policy "notifications_read_own" on public.notifications for select to authenticated 
  using (role = (auth.jwt() ->> 'user_role'));

drop policy if exists "notifications_insert_system" on public.notifications;
create policy "notifications_insert_system" on public.notifications for insert to authenticated 
  with check (auth.jwt() ->> 'user_role' = 'admin');

-- ── App Meta: Read-only for users (system jobs update). ──
drop policy if exists "app_meta_read_all" on public.app_meta;
create policy "app_meta_read_all" on public.app_meta for select to authenticated using (true);

drop policy if exists "app_meta_write_admin" on public.app_meta;
create policy "app_meta_write_admin" on public.app_meta for update to authenticated 
  using (auth.jwt() ->> 'user_role' = 'admin')
  with check (auth.jwt() ->> 'user_role' = 'admin');

-- ============================================================
--  STORAGE BUCKET for signed scans
-- ============================================================
insert into storage.buckets (id, name, public)
values ('claimdesk-scans', 'claimdesk-scans', true)
on conflict (id) do nothing;

-- TESTING — TIGHTEN LATER: allow anon read/write on the bucket
drop policy if exists "testing_scans_all" on storage.objects;
create policy "testing_scans_all" on storage.objects
  for all to anon, authenticated
  using (bucket_id = 'claimdesk-scans')
  with check (bucket_id = 'claimdesk-scans');

-- Done.
