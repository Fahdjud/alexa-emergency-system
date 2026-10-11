-- Runs the escalation scheduler inside Supabase: every 30 seconds pg_cron
-- calls the app's /api/escalation/tick through pg_net, authenticated with
-- CRON_SECRET. Both secrets are read from Supabase Vault.
--
-- Prerequisites:
--   1. Enable the pg_cron and pg_net extensions.
--   2. Add two Vault secrets: "cron_secret" (the app's CRON_SECRET) and
--      "app_base_url" (for example https://your-app.vercel.app).
--      Surrounding whitespace and a trailing "/" are ignored.
--
-- Re-running this file replaces the job.
-- Check:  select status, start_time from cron.job_run_details order by start_time desc limit 5;
-- Stop:   select cron.unschedule('safety-escalation-tick');

select cron.schedule(
  'safety-escalation-tick',
  '30 seconds',
  $$
  select net.http_post(
    url := (select btrim(decrypted_secret, E' \t\r\n/') from vault.decrypted_secrets where name = 'app_base_url') || '/api/escalation/tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select btrim(decrypted_secret, E' \t\r\n') from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 25000
  );
  $$
);
