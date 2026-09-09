-- PH2-07: security observability read path.
--
-- Why this exists: since Phase 2 the platform has emitted structured security
-- events — rejected sign-ins, exhausted rate-limit budgets, spray observation,
-- invalid webhook signatures, staging-gate probes — and nothing has read them.
-- They land in the platform's short-retention runtime log and are gone. This
-- migration gives them a bounded, redacted, server-authoritative store that an
-- authorized admin can review and that alert rules can be evaluated over.
--
-- What it deliberately does NOT hold: no raw payloads, no email addresses, no
-- client network addresses, no whole customer or subscription identifiers, no
-- tokens. The application redacts before writing; the constraints below bound
-- what a write can carry regardless.
--
-- Additive and forward-compatible: three new tables and their functions. No
-- existing table, function or contract is touched.
-- Rollback: supabase/rollback/security_observability_read_path.sql

create table public.security_events (
  id uuid primary key default gen_random_uuid(),
  -- The emitter's stamp. The same emission can arrive twice (persisted in
  -- process and delivered again by the platform log drain); this is what keeps
  -- it one row.
  event_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  environment text not null,
  event_type text not null,
  category text not null,
  severity text not null,
  source text not null,
  outcome text not null,
  correlation_id text not null,
  -- A redacted provider-object suffix ("…abc123"), never a whole identifier.
  account_ref text,
  synthetic boolean not null default false,
  ingest_source text not null,
  metadata jsonb not null default '{}'::jsonb,
  constraint security_events_event_id_key unique (event_id),
  constraint security_events_event_id_check check (event_id ~ '^[0-9a-f]{32}$'),
  constraint security_events_environment_check check (
    environment in ('production', 'staging', 'preview', 'local', 'unknown')
  ),
  constraint security_events_event_type_check check (event_type ~ '^[a-z0-9][a-z0-9._-]{2,79}$'),
  constraint security_events_category_check check (category in (
    'authentication', 'authorization', 'capability', 'billing', 'database', 'deletion', 'environment', 'health', 'pilot'
  )),
  constraint security_events_severity_check check (severity in ('info', 'medium', 'high', 'critical')),
  constraint security_events_source_check check (source ~ '^[a-z0-9-]{1,64}$'),
  constraint security_events_outcome_check check (outcome in (
    'blocked', 'denied', 'observed', 'failed', 'recovered', 'ignored', 'succeeded', 'unavailable'
  )),
  constraint security_events_correlation_check check (correlation_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  constraint security_events_account_ref_check check (account_ref is null or char_length(account_ref) between 1 and 16),
  constraint security_events_ingest_source_check check (ingest_source in ('in-process', 'log-drain', 'synthetic')),
  constraint security_events_metadata_check check (jsonb_typeof(metadata) = 'object' and pg_column_size(metadata) <= 4096)
);

create index security_events_occurred_idx on public.security_events (occurred_at desc);
create index security_events_type_occurred_idx on public.security_events (event_type, occurred_at desc);
create index security_events_severity_occurred_idx on public.security_events (severity, occurred_at desc);
create index security_events_metadata_idx on public.security_events using gin (metadata jsonb_path_ops);

-- One row per (rule, partition): the atomic de-duplication and cooldown state.
create table public.security_alert_state (
  rule_key text not null,
  synthetic boolean not null default false,
  last_fired_at timestamptz,
  fired_count integer not null default 0,
  primary key (rule_key, synthetic),
  constraint security_alert_state_rule_key_check check (rule_key ~ '^[a-z0-9-]{3,64}$'),
  constraint security_alert_state_fired_count_check check (fired_count >= 0)
);

create table public.security_alerts (
  id uuid primary key default gen_random_uuid(),
  fired_at timestamptz not null default now(),
  rule_key text not null,
  severity text not null,
  environment text not null,
  event_types text[] not null,
  window_seconds integer not null,
  threshold integer not null,
  count integer not null,
  correlation_id text not null,
  synthetic boolean not null default false,
  delivery jsonb not null default '{}'::jsonb,
  constraint security_alerts_rule_key_check check (rule_key ~ '^[a-z0-9-]{3,64}$'),
  constraint security_alerts_severity_check check (severity in ('info', 'medium', 'high', 'critical')),
  constraint security_alerts_environment_check check (
    environment in ('production', 'staging', 'preview', 'local', 'unknown')
  ),
  constraint security_alerts_window_check check (window_seconds between 60 and 604800),
  constraint security_alerts_threshold_check check (threshold >= 1),
  constraint security_alerts_count_check check (count >= 0),
  constraint security_alerts_correlation_check check (correlation_id ~ '^[A-Za-z0-9_-]{8,80}$'),
  constraint security_alerts_delivery_check check (jsonb_typeof(delivery) = 'object' and pg_column_size(delivery) <= 1024)
);

create index security_alerts_fired_idx on public.security_alerts (fired_at desc);

alter table public.security_events enable row level security;
alter table public.security_events force row level security;
alter table public.security_alert_state enable row level security;
alter table public.security_alert_state force row level security;
alter table public.security_alerts enable row level security;
alter table public.security_alerts force row level security;

revoke all on table public.security_events from public, anon, authenticated, service_role;
revoke all on table public.security_alert_state from public, anon, authenticated, service_role;
revoke all on table public.security_alerts from public, anon, authenticated, service_role;

-- The read path reads the two evidence tables directly; every write goes
-- through a bounded security-definer function. The alert state is never read
-- or written directly.
grant select on table public.security_events to service_role;
grant select on table public.security_alerts to service_role;

-- Records a batch of normalized events. One malformed element is skipped, not
-- fatal to the batch; a duplicate event_id is silently absorbed. Returns the
-- number of rows actually inserted.
create or replace function public.record_security_events(p_events jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  inserted integer := 0;
  affected integer;
begin
  if p_events is null or jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 500 then
    raise exception 'Invalid security event batch';
  end if;
  for item in select value from jsonb_array_elements(p_events) loop
    begin
      insert into public.security_events (
        event_id, occurred_at, environment, event_type, category, severity, source, outcome,
        correlation_id, account_ref, synthetic, ingest_source, metadata
      ) values (
        item->>'event_id',
        (item->>'occurred_at')::timestamptz,
        item->>'environment',
        item->>'event_type',
        item->>'category',
        item->>'severity',
        item->>'source',
        item->>'outcome',
        item->>'correlation_id',
        nullif(item->>'account_ref', ''),
        coalesce((item->>'synthetic')::boolean, false),
        item->>'ingest_source',
        case when jsonb_typeof(item->'metadata') = 'object' then item->'metadata' else '{}'::jsonb end
      )
      on conflict (event_id) do nothing;
      get diagnostics affected = row_count;
      inserted := inserted + affected;
    exception when others then
      -- A malformed element must not discard the rest of the batch.
      null;
    end;
  end loop;
  return inserted;
end;
$$;
revoke all on function public.record_security_events(jsonb) from public, anon, authenticated;
grant execute on function public.record_security_events(jsonb) to service_role;

-- The alert rules' counting primitive. Real and synthetic partitions are
-- always counted separately, and only the named deployment is counted.
create or replace function public.count_security_events_since(
  p_event_types text[],
  p_since timestamptz,
  p_synthetic boolean,
  p_environment text,
  p_metadata_filter jsonb
)
returns bigint
language sql
security definer
stable
set search_path = ''
as $$
  select count(*)
  from public.security_events
  where event_type = any(p_event_types)
    and occurred_at >= p_since
    and synthetic = coalesce(p_synthetic, false)
    and environment = p_environment
    and metadata @> coalesce(p_metadata_filter, '{}'::jsonb);
$$;
revoke all on function public.count_security_events_since(text[], timestamptz, boolean, text, jsonb) from public, anon, authenticated;
grant execute on function public.count_security_events_since(text[], timestamptz, boolean, text, jsonb) to service_role;

-- Atomic de-duplication: the first caller inside a cooldown wins, every other
-- caller — including another serverless instance in the same second — loses.
create or replace function public.claim_security_alert(
  p_rule_key text,
  p_synthetic boolean,
  p_cooldown_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  request_time timestamptz := statement_timestamp();
  partition boolean := coalesce(p_synthetic, false);
  current_row public.security_alert_state%rowtype;
begin
  if p_rule_key !~ '^[a-z0-9-]{3,64}$' or p_cooldown_seconds not between 60 and 604800 then
    raise exception 'Invalid security alert claim';
  end if;
  insert into public.security_alert_state (rule_key, synthetic, last_fired_at, fired_count)
    values (p_rule_key, partition, null, 0)
    on conflict (rule_key, synthetic) do nothing;
  select * into current_row
    from public.security_alert_state
    where rule_key = p_rule_key and synthetic = partition
    for update;
  if current_row.last_fired_at is not null and
     current_row.last_fired_at + make_interval(secs => p_cooldown_seconds) > request_time then
    return false;
  end if;
  update public.security_alert_state
    set last_fired_at = request_time, fired_count = fired_count + 1
    where rule_key = p_rule_key and synthetic = partition;
  return true;
end;
$$;
revoke all on function public.claim_security_alert(text, boolean, integer) from public, anon, authenticated;
grant execute on function public.claim_security_alert(text, boolean, integer) to service_role;

create or replace function public.record_security_alert(
  p_rule_key text,
  p_severity text,
  p_environment text,
  p_event_types text[],
  p_window_seconds integer,
  p_threshold integer,
  p_count integer,
  p_correlation_id text,
  p_synthetic boolean,
  p_delivery jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
begin
  insert into public.security_alerts (
    rule_key, severity, environment, event_types, window_seconds, threshold, count,
    correlation_id, synthetic, delivery
  ) values (
    p_rule_key, p_severity, p_environment, coalesce(p_event_types, '{}'::text[]), p_window_seconds,
    p_threshold, p_count, p_correlation_id, coalesce(p_synthetic, false),
    case when jsonb_typeof(p_delivery) = 'object' then p_delivery else '{}'::jsonb end
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.record_security_alert(text, text, text, text[], integer, integer, integer, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_security_alert(text, text, text, text[], integer, integer, integer, text, boolean, jsonb)
  to service_role;

-- The Security Health summary: counts per event class over the three
-- standing windows, from the database clock. Seven days is the outer bound of
-- what the summary considers at all.
create or replace function public.summarize_security_events(p_environment text)
returns table (
  event_type text,
  severity text,
  synthetic boolean,
  last_hour bigint,
  last_day bigint,
  last_week bigint,
  last_occurred_at timestamptz
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    event_type,
    severity,
    synthetic,
    count(*) filter (where occurred_at >= now() - interval '1 hour'),
    count(*) filter (where occurred_at >= now() - interval '24 hours'),
    count(*),
    max(occurred_at)
  from public.security_events
  where occurred_at >= now() - interval '7 days'
    and environment = p_environment
  group by event_type, severity, synthetic
  order by event_type, severity, synthetic;
$$;
revoke all on function public.summarize_security_events(text) from public, anon, authenticated;
grant execute on function public.summarize_security_events(text) to service_role;

-- Whether the read path itself is alive: when each ingest source last
-- delivered, and how much it delivered in the last day.
create or replace function public.security_pipeline_health(p_environment text)
returns table (
  ingest_source text,
  last_received_at timestamptz,
  events_last_day bigint
)
language sql
security definer
stable
set search_path = ''
as $$
  select
    ingest_source,
    max(received_at),
    count(*) filter (where received_at >= now() - interval '24 hours')
  from public.security_events
  where environment = p_environment
  group by ingest_source
  order by ingest_source;
$$;
revoke all on function public.security_pipeline_health(text) from public, anon, authenticated;
grant execute on function public.security_pipeline_health(text) to service_role;

-- Bounded retention. Security telemetry is not kept "just in case": events
-- older than the configured window (7–90 days) and alerts older than theirs
-- (30–365 days) are deleted by the scheduled job.
create or replace function public.purge_security_events(
  p_event_retention_days integer,
  p_alert_retention_days integer
)
returns table (events_deleted bigint, alerts_deleted bigint)
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_events bigint;
  removed_alerts bigint;
begin
  if p_event_retention_days not between 7 and 90 or p_alert_retention_days not between 30 and 365 then
    raise exception 'Invalid security retention window';
  end if;
  delete from public.security_events
    where occurred_at < now() - make_interval(days => p_event_retention_days);
  get diagnostics removed_events = row_count;
  delete from public.security_alerts
    where fired_at < now() - make_interval(days => p_alert_retention_days);
  get diagnostics removed_alerts = row_count;
  return query select removed_events, removed_alerts;
end;
$$;
revoke all on function public.purge_security_events(integer, integer) from public, anon, authenticated;
grant execute on function public.purge_security_events(integer, integer) to service_role;
