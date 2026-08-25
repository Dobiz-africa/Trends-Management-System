# TrendsDesk

Production work-order and claim-document portal for Trends Engineering Services.

## Local verification

```text
npm.cmd run dev
npm.cmd test
node --check app.js
```

Copy `.env.example` to `.env.local`, add the test Supabase credentials, then run `npm.cmd run dev` and open `http://127.0.0.1:4173`. The committed local server exposes only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SCANS_BUCKET` to the browser and supports local email-notification testing.

### Email notification test

1. During local testing, keep `APP_URL=http://127.0.0.1:4173`. Before production, verify the sending domain for `claims.trendsengineering.com` in Resend and create a sending API key.
2. Set `RESEND_API_KEY`, `NOTIFICATION_FROM`, and `APP_URL` in `.env.local` and in the Vercel project environments. Keep the API key server-only.
3. For production, create a Resend webhook for `https://claims.trendsengineering.com/api/resend-webhook`, subscribe to delivered, bounced, complained, and suppressed events, then set its signing secret as `RESEND_WEBHOOK_SECRET`.
4. Ensure each active `public.users` profile has the correct role and a real email address; notifications are emailed to every active user in the targeted role.
5. Run `npm.cmd run dev` (or the equivalent `npm.cmd run dev:api`) for local email testing.
6. Perform a workflow action that creates a notification, then inspect `public.notification_deliveries`: `sent` means Resend accepted it; the webhook later changes it to `delivered`, `bounced`, `complained`, or `suppressed`. Check `last_error` for failures.

## Production rollout

1. Back up the Supabase database and storage metadata.
2. For a fresh test project, apply `supabase/test-schema.sql`. For an existing production installation, apply `supabase/production-migration.sql` after taking a backup.
3. Verify all users have an active `public.users` profile with one of: `admin`, `linesman`, `finance`, or `md`.
4. Configure Vercel environment variables:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SCANS_BUCKET=claimdesk-scans`
   - `APP_URL=https://claims.trendsengineering.com`
   - `RESEND_API_KEY`
   - `RESEND_WEBHOOK_SECRET`
   - `NOTIFICATION_FROM=TrendsDesk <notifications@YOUR_VERIFIED_SENDING_DOMAIN>`
5. Verify the sending domain in Resend and point delivery webhooks to `/api/resend-webhook`.
6. Add `claims.trendsengineering.com` to the Vercel project and Supabase Auth redirect allow-list.
7. Deploy to staging, run the report acceptance checklist, then promote the same deployment to production.

The production migration changes the scan bucket to private, replaces anonymous policies with authenticated role policies, backfills removed workflow stages, and adds claim-version and delivery tracking tables. Finalized claims are immutable; corrections use a new certificate/version draft.
