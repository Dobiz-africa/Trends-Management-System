-- TrendsDesk production migration (idempotent)
create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text,
  role text not null check (role in ('admin','linesman','finance','md')),
  is_admin boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Older ClaimsDesk installations already have this table with fewer columns.
alter table public.users add column if not exists full_name text;
alter table public.users add column if not exists role text default 'linesman';
alter table public.users add column if not exists is_admin boolean not null default false;
alter table public.users add column if not exists is_active boolean not null default true;
alter table public.users add column if not exists created_at timestamptz not null default now();
alter table public.users add column if not exists updated_at timestamptz not null default now();
update public.users set role='linesman' where role is null;
alter table public.users alter column role set not null;
alter table public.users alter column role set default 'linesman';

create table if not exists public.invites (
  token uuid primary key default gen_random_uuid(),
  email text not null,
  role text not null check (role in ('admin','linesman','finance','md')),
  created_by uuid references public.users(id),
  used boolean not null default false,
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);

alter table public.jobs add column if not exists workflow_version integer not null default 3;
alter table public.jobs alter column workflow_version set default 3;
alter table public.jobs add column if not exists location jsonb not null default '{}';
alter table public.jobs add column if not exists wo_date date;
alter table public.jobs add column if not exists start_date date;
alter table public.jobs add column if not exists completion_date date;
alter table public.jobs add column if not exists deleted_at timestamptz;
alter table public.jobs add column if not exists deleted_by uuid references public.users(id);
alter table public.jobs add column if not exists deletion_reason text;
create index if not exists jobs_active_stage_idx on public.jobs(stage) where deleted_at is null;

alter table public.documents add column if not exists status text not null default 'generated'
  check (status in ('draft','generated','pending_signature','signed','complete'));
alter table public.documents add column if not exists metadata jsonb not null default '{}';
alter table public.documents add column if not exists updated_at timestamptz not null default now();

create table if not exists public.claim_versions (
  id uuid primary key default gen_random_uuid(),
  batch_id text not null references public.claim_batches(id) on delete cascade,
  version integer not null,
  status text not null default 'draft' check (status in ('draft','finalized')),
  wos jsonb not null default '[]',
  fields jsonb not null default '{}',
  totals jsonb not null default '{}',
  validation jsonb not null default '{}',
  documents jsonb not null default '{}',
  created_by uuid references public.users(id),
  finalized_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique(batch_id, version)
);
create unique index if not exists one_draft_per_claim
  on public.claim_versions(batch_id) where status = 'draft';

create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id text not null,
  recipient_id uuid references public.users(id),
  recipient_email text not null,
  channel text not null default 'email',
  idempotency_key text not null unique,
  provider_id text,
  status text not null default 'queued'
    check (status in ('queued','sent','delivered','bounced','complained','suppressed','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists notification_deliveries_provider_idx on public.notification_deliveries(provider_id);

create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path=public as $$
begin new.updated_at=now(); return new; end $$;

drop trigger if exists jobs_touch on public.jobs;
create trigger jobs_touch before update on public.jobs
for each row execute function public.touch_updated_at();
drop trigger if exists users_touch on public.users;
create trigger users_touch before update on public.users
for each row execute function public.touch_updated_at();
drop trigger if exists documents_touch on public.documents;
create trigger documents_touch before update on public.documents
for each row execute function public.touch_updated_at();
drop trigger if exists claim_versions_touch on public.claim_versions;
create trigger claim_versions_touch before update on public.claim_versions
for each row execute function public.touch_updated_at();
drop trigger if exists notification_deliveries_touch on public.notification_deliveries;
create trigger notification_deliveries_touch before update on public.notification_deliveries
for each row execute function public.touch_updated_at();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare requested_role text;
begin
  requested_role:=coalesce(new.raw_user_meta_data->>'role','linesman');
  if requested_role not in ('admin','linesman','finance','md') then requested_role:='linesman'; end if;
  insert into public.users(id,email,full_name,role,is_admin)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name',new.email),requested_role,requested_role='admin')
  on conflict(id) do update set email=excluded.email;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.current_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.users where id = auth.uid() and is_active $$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public
as $$ select coalesce((select is_admin or role='admin' from public.users where id=auth.uid() and is_active),false) $$;

-- Legacy-stage backfill. Original actions remain in jobs.data for audit/recovery.
update public.jobs set
  stage = case stage
    when 'teams_notified' then 'work_instruction_ready'
    when 'work_complete' then 'work_instruction_ready'
    when 'gis_notified' then 'final_gis_pending'
    when 'gis_complete' then 'final_gis_pending'
    when 'gis_notified_early' then 'field_received'
    when 'gis_complete_early' then 'gis_ready'
    else stage end,
  workflow_version = 3
where workflow_version <> 3 or stage in
  ('teams_notified','work_complete','gis_notified','gis_complete','gis_notified_early','gis_complete_early');

alter table public.users enable row level security;
alter table public.invites enable row level security;
alter table public.jobs enable row level security;
alter table public.documents enable row level security;
alter table public.claim_batches enable row level security;
alter table public.claim_versions enable row level security;
alter table public.activity_log enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.app_meta enable row level security;

do $$ declare r record; begin
  for r in select schemaname, tablename, policyname from pg_policies
    where schemaname='public' and tablename in
      ('users','invites','jobs','documents','claim_batches','claim_versions','activity_log','notifications','notification_deliveries','app_meta')
  loop execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename); end loop;
end $$;

create policy users_read on public.users for select to authenticated
  using (id=auth.uid() or public.current_role() in ('admin','md'));
create policy users_admin_write on public.users for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy invites_admin_all on public.invites for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy jobs_authenticated_read on public.jobs for select to authenticated
  using (deleted_at is null or public.current_role() in ('admin','md'));
create policy jobs_admin_insert on public.jobs for insert to authenticated
  with check (public.current_role()='admin');
create policy jobs_admin_update on public.jobs for update to authenticated
  using (public.current_role()='admin') with check (public.current_role()='admin');
create policy jobs_admin_delete on public.jobs for delete to authenticated
  using (public.current_role()='admin');
create policy documents_authenticated_read on public.documents for select to authenticated
  using (public.current_role() in ('admin','finance','md','linesman'));
create policy documents_role_insert on public.documents for insert to authenticated with check (
  public.current_role() in ('admin','finance') or
  (public.current_role()='linesman' and uploaded_role='linesman' and doc_type like 'ln_%')
);
create policy documents_uploader_or_admin_update on public.documents for update to authenticated
  using (public.current_role()='admin' or uploaded_role=public.current_role())
  with check (public.current_role()='admin' or uploaded_role=public.current_role());
create policy documents_uploader_or_admin_delete on public.documents for delete to authenticated
  using (public.current_role()='admin' or uploaded_role=public.current_role());
create policy claim_batches_read on public.claim_batches for select to authenticated
  using (public.current_role() in ('admin','finance','md'));
create policy claim_batches_finance_write on public.claim_batches for all to authenticated
  using (public.current_role()='finance') with check (public.current_role()='finance');
create policy claim_versions_read on public.claim_versions for select to authenticated
  using (public.current_role() in ('admin','finance','md'));
create policy claim_versions_finance_write on public.claim_versions for all to authenticated
  using (public.current_role()='finance') with check (public.current_role()='finance');
create policy activity_read on public.activity_log for select to authenticated
  using (public.current_role() in ('admin','finance','md'));
create policy activity_append on public.activity_log for insert to authenticated with check (auth.uid() is not null);
create policy notifications_role_read on public.notifications for select to authenticated
  using (role=public.current_role());
create policy notifications_authenticated_insert on public.notifications for insert to authenticated
  with check (auth.uid() is not null);
create policy notifications_role_update on public.notifications for update to authenticated
  using (role=public.current_role()) with check (role=public.current_role());
create policy deliveries_admin_read on public.notification_deliveries for select to authenticated
  using (public.current_role() in ('admin','md'));
create policy app_meta_read on public.app_meta for select to authenticated using (true);
create policy app_meta_admin_write on public.app_meta for all to authenticated
  using (public.current_role()='admin') with check (public.current_role()='admin');

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('claimdesk-scans','claimdesk-scans',false,26214400,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists testing_scans_all on storage.objects;
drop policy if exists scans_authenticated_read on storage.objects;
drop policy if exists scans_role_insert on storage.objects;
drop policy if exists scans_owner_update on storage.objects;
drop policy if exists scans_owner_delete on storage.objects;
create policy scans_authenticated_read on storage.objects for select to authenticated
  using (bucket_id='claimdesk-scans' and public.current_role() in ('admin','finance','md','linesman'));
create policy scans_role_insert on storage.objects for insert to authenticated with check (
  bucket_id='claimdesk-scans' and public.current_role() in ('admin','finance','linesman')
);
create policy scans_owner_update on storage.objects for update to authenticated
  using(bucket_id='claimdesk-scans' and (owner_id=auth.uid()::text or public.current_role()='admin'));
create policy scans_owner_delete on storage.objects for delete to authenticated
  using(bucket_id='claimdesk-scans' and (owner_id=auth.uid()::text or public.current_role()='admin'));

do $$ begin
  alter publication supabase_realtime add table public.jobs;
exception when duplicate_object then null; end $$;

insert into public.users(id,email,full_name,role,is_admin)
select id,email,coalesce(raw_user_meta_data->>'full_name',email),
  case when raw_user_meta_data->>'role' in ('admin','linesman','finance','md') then raw_user_meta_data->>'role' else 'linesman' end,
  raw_user_meta_data->>'role'='admin'
from auth.users
on conflict(id) do nothing;
