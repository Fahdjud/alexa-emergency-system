-- Database schema for the safety assistant (Supabase / Postgres).
--
-- Contacts, incidents and the monitor's heartbeat are stored here so that
-- escalation continues when the monitor tab closes. The script is idempotent:
-- run it in the Supabase SQL Editor on first setup and again after upgrades,
-- then run db/schedule.sql to start the scheduler.
--
-- Row-level security is enabled with no policies, so the anon and
-- publishable keys have no access; only the server's service-role key does.
-- Timestamps are epoch milliseconds.

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
  language text not null,
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

-- Email alerts (AWS SNS). Separate statements so existing tables are upgraded.
alter table contacts add column if not exists email text;
alter table contacts add column if not exists email_status text
  check (email_status in ('pending', 'failed'));

-- How the acknowledging contact answered.
alter table incidents add column if not exists ack_response text
  check (ack_response in ('handling', 'on-my-way', 'calling'));

-- Languages are defined by the app's language packs; drop the old en/ar check.
alter table incidents drop constraint if exists incidents_language_check;

-- The scheduler looks up open incidents by status every 30 seconds.
create index if not exists incidents_status_idx on incidents (status);
create index if not exists incidents_created_idx on incidents (created_at_ms);

-- A single row: one household, one monitor.
create table if not exists monitor_status (
  id text primary key default 'home' check (id = 'home'),
  last_seen_ms bigint not null,
  listening boolean not null,
  offline_alert_sent_at_ms bigint
);

alter table contacts enable row level security;
alter table incidents enable row level security;
alter table monitor_status enable row level security;

-- Private bucket for audio snippets, read only by the server.
insert into storage.buckets (id, name, public)
values ('incident-snippets', 'incident-snippets', false)
on conflict (id) do nothing;
