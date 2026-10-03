-- db/schema.sql: the database for the safety assistant (Supabase / Postgres).
--
-- Why this file exists: the app had no database. Escalation must keep going
-- when the browser tab closes, so contacts, incidents and the monitor's
-- heartbeat live here. Run it once in Supabase -> SQL Editor. It is safe to
-- run again. Then run db/schedule.sql to start the escalation scheduler.
--
-- Security: row-level security is on with no policies, so the public
-- (anon / publishable) key can read and write nothing. Only the server, using
-- the secret service_role key, can. Times are stored as epoch milliseconds,
-- the same as the app's records.

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  priority integer not null check (priority >= 1),
  telegram_chat_id text,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  incident_type text not null,
  severity text not null check (severity in ('critical', 'high', 'medium')),
  status text not null check (status in ('confirming', 'cancelled', 'escalating', 'acknowledged', 'unacknowledged')),
  language text not null check (language in ('en', 'ar')),
  created_at_ms bigint not null,
  confirm_deadline_ms bigint not null,
  escalation_started_at_ms bigint,
  escalation_reason text check (escalation_reason in ('asked-for-help', 'no-answer')),
  steps_sent integer not null default 0,
  trigger_description text not null,
  transcript text,
  classification jsonb,
  snippet_path text,
  acknowledged_by_contact_id uuid references contacts (id) on delete set null,
  acknowledged_at_ms bigint
);

-- The scheduler looks up open incidents by status every 30 seconds.
create index if not exists incidents_status_idx on incidents (status);
create index if not exists incidents_created_idx on incidents (created_at_ms);

-- One row: this demo has one household and one monitor.
create table if not exists monitor_status (
  id text primary key default 'home' check (id = 'home'),
  last_seen_ms bigint not null,
  listening boolean not null,
  offline_alert_sent_at_ms bigint
);

alter table contacts enable row level security;
alter table incidents enable row level security;
alter table monitor_status enable row level security;

-- Private bucket for the audio snippets (never public; the server reads them with the secret key).
insert into storage.buckets (id, name, public)
values ('incident-snippets', 'incident-snippets', false)
on conflict (id) do nothing;
