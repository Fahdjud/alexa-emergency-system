-- db/schedule.sql: runs the escalation scheduler every 30 seconds from
-- inside Supabase.
--
-- Why this file exists: escalation timers cannot live in the browser tab or in
-- a serverless function, which both stop. pg_cron (scheduler) and pg_net (HTTP
-- calls) are built into Supabase. Every 30 s they call the app's
-- /api/escalation/tick with the CRON_SECRET. The secrets are kept in Supabase
-- Vault, never written into this file.
--
-- Before running:
--   1. Database -> Extensions: enable pg_cron and pg_net.
--   2. Store two secrets in Vault (Project Settings -> Vault, or Integrations ->
--      Vault): "cron_secret" = your CRON_SECRET, and "app_base_url" =
--      https://<your-app>.vercel.app (no trailing slash). The dashboard keeps
--      the values out of saved SQL snippets.
--   3. Run this file. Running it again replaces the job (same name).
--
-- Check it runs:  select * from cron.job_run_details order by start_time desc limit 5;
-- Stop it:        select cron.unschedule('safety-escalation-tick');

select cron.schedule(
  'safety-escalation-tick',
  '30 seconds',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/escalation/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
