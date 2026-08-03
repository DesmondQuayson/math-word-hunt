-- Phase 8H stores privacy-conscious aggregate signals and server-owned
-- operational controls. It intentionally contains no student identity,
-- consumer identity, email address, IP address, token, or learning profile.

create table public.platform_analytics_events (
  id uuid primary key default gen_random_uuid(),
  metric_key text not null check (metric_key in (
    'game-completion','map-prep-launch','email-confirmation-success','email-confirmation-failure',
    'email-recovery-success','email-recovery-failure','vercel-error','supabase-error'
  )),
  occurred_at timestamptz not null default statement_timestamp(),
  grade_number smallint check (grade_number between 1 and 9),
  topic_slug text check (topic_slug is null or (topic_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(topic_slug)<=96)),
  lesson_slug text check (lesson_slug is null or (lesson_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(lesson_slug)<=96)),
  outcome text not null check (outcome in ('success','failure','unavailable')),
  quantity integer not null default 1 check (quantity between 1 and 10000),
  source text not null check (source in ('runtime','email','vercel','supabase','system')),
  check (lesson_slug is null or topic_slug is not null),
  check (topic_slug is null or grade_number is not null)
);
create index platform_analytics_events_range_idx on public.platform_analytics_events(occurred_at,metric_key);

create table public.platform_feature_flags (
  flag_key text primary key check (flag_key in (
    'maintenance-mode','announcement-published','checkout-emergency-disabled','admin-emergency-disabled'
  )),
  enabled boolean not null default false,
  message text check (message is null or (message=btrim(message) and char_length(message) between 1 and 280)),
  version bigint not null default 1 check (version>=1),
  updated_by uuid references public.admin_users(id) on delete set null,
  updated_at timestamptz not null default statement_timestamp(),
  check (not (enabled and flag_key in ('maintenance-mode','announcement-published')) or message is not null)
);
insert into public.platform_feature_flags(flag_key) values
  ('maintenance-mode'),('announcement-published'),('checkout-emergency-disabled'),('admin-emergency-disabled');

create table public.platform_feature_flag_history (
  id uuid primary key default gen_random_uuid(),
  flag_key text not null,
  prior_enabled boolean not null,
  enabled boolean not null,
  prior_message text,
  message text,
  version bigint not null check(version>=2),
  reason text not null check(reason=btrim(reason) and char_length(reason) between 3 and 500),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  admin_session_id uuid references public.admin_sessions(id) on delete set null,
  created_at timestamptz not null default statement_timestamp()
);
create index platform_feature_flag_history_created_idx on public.platform_feature_flag_history(created_at desc,flag_key);

create table public.platform_retention_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null check(job_key='aggregate-analytics-400-day-retention'),
  cutoff_at timestamptz not null,
  deleted_event_count integer not null check(deleted_event_count>=0),
  reason text not null check(reason=btrim(reason) and char_length(reason) between 3 and 500),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  admin_session_id uuid references public.admin_sessions(id) on delete set null,
  completed_at timestamptz not null default statement_timestamp()
);

alter table public.platform_analytics_events enable row level security;
alter table public.platform_analytics_events force row level security;
alter table public.platform_feature_flags enable row level security;
alter table public.platform_feature_flags force row level security;
alter table public.platform_feature_flag_history enable row level security;
alter table public.platform_feature_flag_history force row level security;
alter table public.platform_retention_runs enable row level security;
alter table public.platform_retention_runs force row level security;
revoke all on table public.platform_analytics_events,public.platform_feature_flags,
  public.platform_feature_flag_history,public.platform_retention_runs from public,anon,authenticated,service_role;
grant select on table public.platform_analytics_events,public.platform_feature_flags,
  public.platform_feature_flag_history,public.platform_retention_runs to service_role;

create or replace function private.reject_phase8h_evidence_mutation()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Phase 8H operational evidence is append-only';end;$$;
revoke all on function private.reject_phase8h_evidence_mutation() from public,anon,authenticated,service_role;
create trigger platform_feature_flag_history_immutable before update or delete on public.platform_feature_flag_history
  for each row execute function private.reject_phase8h_evidence_mutation();
create trigger platform_retention_runs_immutable before update or delete on public.platform_retention_runs
  for each row execute function private.reject_phase8h_evidence_mutation();

create or replace function public.record_platform_aggregate_event(
  p_metric_key text,p_occurred_at timestamptz,p_grade_number smallint,p_topic_slug text,
  p_lesson_slug text,p_outcome text,p_quantity integer,p_source text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;
begin
  if p_occurred_at<statement_timestamp()-interval '7 days' or p_occurred_at>statement_timestamp()+interval '5 minutes' then
    raise exception 'Aggregate event timestamp outside accepted window';
  end if;
  insert into public.platform_analytics_events(metric_key,occurred_at,grade_number,topic_slug,lesson_slug,outcome,quantity,source)
    values(p_metric_key,p_occurred_at,p_grade_number,nullif(btrim(coalesce(p_topic_slug,'')),''),nullif(btrim(coalesce(p_lesson_slug,'')),''),p_outcome,p_quantity,p_source)
    returning id into v_id;
  return v_id;
end;$$;
revoke all on function public.record_platform_aggregate_event(text,timestamptz,smallint,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.record_platform_aggregate_event(text,timestamptz,smallint,text,text,text,integer,text) to service_role;

create or replace function public.set_platform_feature_flag(
  p_admin_user_id uuid,p_admin_session_id uuid,p_flag_key text,p_enabled boolean,
  p_message text,p_reason text,p_expected_version bigint
) returns bigint language plpgsql security definer set search_path='' as $$
declare v_current public.platform_feature_flags%rowtype;v_next bigint;
begin
  if p_flag_key not in ('maintenance-mode','announcement-published','checkout-emergency-disabled','admin-emergency-disabled')
    or btrim(coalesce(p_reason,''))='' or char_length(btrim(p_reason)) not between 3 and 500
    or (p_message is not null and (p_message<>btrim(p_message) or char_length(p_message) not between 1 and 280))
    or (p_enabled and p_flag_key in ('maintenance-mode','announcement-published') and p_message is null)
  then raise exception 'Invalid bounded feature flag change';end if;
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,
    p_flag_key in ('checkout-emergency-disabled','admin-emergency-disabled'));
  select * into v_current from public.platform_feature_flags where flag_key=p_flag_key for update;
  if v_current.version<>p_expected_version then raise exception 'Feature flag version conflict';end if;
  v_next:=v_current.version+1;
  update public.platform_feature_flags set enabled=p_enabled,message=p_message,version=v_next,
    updated_by=p_admin_user_id,updated_at=statement_timestamp() where flag_key=p_flag_key;
  insert into public.platform_feature_flag_history(flag_key,prior_enabled,enabled,prior_message,message,version,reason,admin_user_id,admin_session_id)
    values(p_flag_key,v_current.enabled,p_enabled,v_current.message,p_message,v_next,btrim(p_reason),p_admin_user_id,p_admin_session_id);
  insert into public.admin_audit_log(admin_user_id,action,target,metadata)
    values(p_admin_user_id,'admin.operations.feature-flag.changed',p_flag_key,
      jsonb_build_object('enabled',p_enabled,'version',v_next,'reason',btrim(p_reason)));
  if p_flag_key='admin-emergency-disabled' and p_enabled then
    update public.admin_sessions set revoked_at=coalesce(revoked_at,statement_timestamp()),ended_at=coalesce(ended_at,statement_timestamp()),end_reason='emergency-revocation'
      where ended_at is null and revoked_at is null;
  end if;
  return v_next;
end;$$;
revoke all on function public.set_platform_feature_flag(uuid,uuid,text,boolean,text,text,bigint) from public,anon,authenticated;
grant execute on function public.set_platform_feature_flag(uuid,uuid,text,boolean,text,text,bigint) to service_role;

create or replace function public.run_platform_analytics_retention(
  p_admin_user_id uuid,p_admin_session_id uuid,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_count integer;v_cutoff timestamptz:=statement_timestamp()-interval '400 days';
begin
  if btrim(coalesce(p_reason,''))='' or char_length(btrim(p_reason)) not between 3 and 500 then raise exception 'Retention reason required';end if;
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,true);
  delete from public.platform_analytics_events where occurred_at<v_cutoff;
  get diagnostics v_count=row_count;
  insert into public.platform_retention_runs(job_key,cutoff_at,deleted_event_count,reason,admin_user_id,admin_session_id)
    values('aggregate-analytics-400-day-retention',v_cutoff,v_count,btrim(p_reason),p_admin_user_id,p_admin_session_id) returning id into v_id;
  insert into public.admin_audit_log(admin_user_id,action,target,metadata)
    values(p_admin_user_id,'admin.operations.retention.completed','aggregate-analytics',jsonb_build_object('run_id',v_id,'deleted_event_count',v_count,'cutoff_at',v_cutoff));
  return v_id;
end;$$;
revoke all on function public.run_platform_analytics_retention(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.run_platform_analytics_retention(uuid,uuid,text) to service_role;

create or replace function public.get_platform_storage_usage()
returns table(bucket_id text,object_count bigint,total_bytes bigint)
language sql stable security definer set search_path='' as $$
  select o.bucket_id,count(*)::bigint,coalesce(sum(
    case when coalesce(o.metadata->>'size','')~'^\d{1,20}$' then (o.metadata->>'size')::bigint else 0 end
  ),0)::bigint from storage.objects o group by o.bucket_id order by o.bucket_id;
$$;
revoke all on function public.get_platform_storage_usage() from public,anon,authenticated;
grant execute on function public.get_platform_storage_usage() to service_role;

create or replace function public.get_platform_migration_status()
returns table(applied_count bigint,latest_version text)
language sql stable security definer set search_path='' as $$
  select count(*)::bigint,max(m.version)::text from supabase_migrations.schema_migrations m;
$$;
revoke all on function public.get_platform_migration_status() from public,anon,authenticated;
grant execute on function public.get_platform_migration_status() to service_role;

comment on table public.platform_analytics_events is 'Aggregate operational signals only. No student, consumer, email, IP, token, or identifiable learning history is permitted.';
comment on table public.platform_feature_flags is 'Server-owned fail-safe operational switches; browser roles have no read or write authority.';
comment on table public.platform_feature_flag_history is 'Immutable, owner-attributed history of every feature flag transition.';
comment on table public.platform_retention_runs is 'Immutable evidence for bounded aggregate analytics retention; admin audit evidence is never deleted.';
