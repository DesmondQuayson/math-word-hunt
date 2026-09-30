-- Super Admin session policy (Phase 2B).
--
-- Session lifecycle, enforced here and re-checked by the application on
-- every protected request:
--   absolute  expires_at <= started_at + 2 hours (was 30 minutes). Fixed when
--             the session starts after MFA; activity never extends it.
--   idle      a session is live only while last_activity_at is within the
--             last 60 minutes. touch_admin_session() refreshes it at most once
--             a minute and only for a live session, so it can never outlive
--             expires_at.
--   step-up   step_up_at is the last TOTP verification (the sign-in MFA
--             counts). Sensitive operations need step_up_at within the last
--             5 minutes; record_admin_step_up() records a fresh verification
--             without restarting the session.
--
-- Also: 'idle-expired' becomes a session end reason, and
-- begin_admin_account_operation() replaces prepare_admin_account_operation()
-- for the application. It reports whether this request created the operation,
-- so a repeated request never runs an operation's side effects twice, and it
-- audits the suppressed duplicate.
--
-- Compatible with the previous runtime: existing sessions and direct inserts
-- start with last_activity_at = step_up_at = started_at, so "fresh" keeps its
-- old meaning (MFA within 5 minutes) until the new runtime records step-ups.

-- 1. Remove the 30-minute ceiling and the three-reason end rule first. Each old
--    constraint is located by its definition and must exist exactly once;
--    anything else aborts the migration. Dropping them before the backfill
--    below also keeps a re-apply after the rollback (which restores them as
--    NOT VALID, and NOT VALID rules still check updated rows) working.
do $$
declare
  v_count integer;
  v_name text;
begin
  select count(*), min(conname) into v_count, v_name from pg_constraint
    where conrelid = 'public.admin_sessions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%''00:30:00''::interval%';
  if v_count <> 1 then
    raise exception 'admin_sessions 30-minute ceiling found % times', v_count;
  end if;
  execute format('alter table public.admin_sessions drop constraint %I', v_name);

  select count(*), min(conname) into v_count, v_name from pg_constraint
    where conrelid = 'public.admin_sessions'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%''signed-out''::text%';
  if v_count <> 1 then
    raise exception 'admin_sessions end-reason rule found % times', v_count;
  end if;
  execute format('alter table public.admin_sessions drop constraint %I', v_name);
end;
$$;

-- 2. Activity and step-up timestamps. -----------------------------------------
alter table public.admin_sessions
  add column last_activity_at timestamptz,
  add column step_up_at timestamptz;

update public.admin_sessions set last_activity_at = started_at, step_up_at = started_at;

create or replace function private.default_admin_session_activity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.last_activity_at := coalesce(new.last_activity_at, new.started_at);
  new.step_up_at := coalesce(new.step_up_at, new.started_at);
  return new;
end;
$$;
revoke all on function private.default_admin_session_activity() from public, anon, authenticated, service_role;

create trigger admin_sessions_default_activity
before insert on public.admin_sessions
for each row execute function private.default_admin_session_activity();

alter table public.admin_sessions
  alter column last_activity_at set not null,
  alter column step_up_at set not null;

-- New rules: the 2-hour ceiling, the widened end reasons, and activity and
-- step-up times that always fall inside the session's own lifetime.
alter table public.admin_sessions
  add constraint admin_sessions_absolute_lifetime_check
    check (expires_at <= started_at + interval '2 hours'),
  add constraint admin_sessions_end_reason_check
    check (end_reason is null or end_reason in ('signed-out', 'expired', 'idle-expired', 'emergency-revocation')),
  add constraint admin_sessions_activity_window_check
    check (last_activity_at >= started_at and last_activity_at <= expires_at),
  add constraint admin_sessions_step_up_window_check
    check (step_up_at >= started_at and step_up_at <= expires_at);

-- 3. Session start: up to 2 hours. A request up to one minute past the ceiling
--    (clock skew between the application and the database) is clamped to
--    exactly 2 hours after the start; anything longer is rejected.
create or replace function public.start_admin_session(
  p_admin_user_id uuid,
  p_token_hash text,
  p_expires_at timestamptz,
  p_ip text,
  p_user_agent text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created_id uuid;
  v_expires_at timestamptz;
begin
  perform id from public.admin_users
    where id = p_admin_user_id and revoked_at is null and mfa_enrolled
    for update;
  if not found then
    raise exception 'Active MFA-enrolled admin required';
  end if;
  if p_expires_at <= statement_timestamp() or
     p_expires_at > statement_timestamp() + interval '121 minutes' then
    raise exception 'Invalid admin session expiry';
  end if;
  v_expires_at := least(p_expires_at, now() + interval '2 hours');

  insert into public.admin_sessions (
    admin_user_id, token_hash, assurance_level, expires_at
  ) values (
    p_admin_user_id, p_token_hash, 'aal2', v_expires_at
  ) returning id into created_id;

  insert into public.admin_audit_log (
    admin_user_id, action, target, metadata, ip, user_agent
  ) values (
    p_admin_user_id,
    'admin.session.started',
    created_id::text,
    jsonb_build_object('expires_at', v_expires_at, 'idle_timeout_minutes', 60),
    case when p_ip is null then null else p_ip::inet end,
    left(nullif(p_user_agent, ''), 512)
  );

  return created_id;
end;
$$;
revoke all on function public.start_admin_session(uuid, text, timestamptz, text, text)
  from public, anon, authenticated;
grant execute on function public.start_admin_session(uuid, text, timestamptz, text, text)
  to service_role;

-- 4. Session end: 'idle-expired' joins 'signed-out' and 'expired'. Every end
--    is audited as admin.session.ended with its reason.
create or replace function public.end_admin_session(
  p_token_hash text,
  p_reason text,
  p_ip text,
  p_user_agent text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  ended_session public.admin_sessions%rowtype;
begin
  if p_reason not in ('signed-out', 'expired', 'idle-expired') then
    raise exception 'Invalid admin session end reason';
  end if;

  update public.admin_sessions set
    ended_at = statement_timestamp(),
    end_reason = p_reason
  where token_hash = p_token_hash and ended_at is null
  returning * into ended_session;

  if not found then return false; end if;

  insert into public.admin_audit_log (
    admin_user_id, action, target, metadata, ip, user_agent
  ) values (
    ended_session.admin_user_id,
    'admin.session.ended',
    ended_session.id::text,
    jsonb_build_object('reason', p_reason),
    case when p_ip is null then null else p_ip::inet end,
    left(nullif(p_user_agent, ''), 512)
  );
  return true;
end;
$$;
revoke all on function public.end_admin_session(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.end_admin_session(text, text, text, text) to service_role;

-- 5. Idle activity: at most one write a minute, only for a live session.
create or replace function public.touch_admin_session(p_token_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return false;
  end if;
  update public.admin_sessions set last_activity_at = statement_timestamp()
  where token_hash = p_token_hash
    and ended_at is null
    and revoked_at is null
    and expires_at > statement_timestamp()
    and last_activity_at > statement_timestamp() - interval '60 minutes'
    and last_activity_at <= statement_timestamp() - interval '60 seconds';
  return found;
end;
$$;
revoke all on function public.touch_admin_session(text) from public, anon, authenticated;
grant execute on function public.touch_admin_session(text) to service_role;

-- 6. Step-up: records a TOTP verification the application has just completed
--    for this live session. It never changes expires_at.
create or replace function public.record_admin_step_up(
  p_admin_user_id uuid,
  p_admin_session_id uuid,
  p_ip text,
  p_user_agent text
)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_at timestamptz := statement_timestamp();
begin
  update public.admin_sessions s set step_up_at = v_at, last_activity_at = v_at
  from public.admin_users au
  where s.id = p_admin_session_id
    and s.admin_user_id = p_admin_user_id
    and au.id = s.admin_user_id
    and au.role = 'owner' and au.revoked_at is null and au.mfa_enrolled
    and s.assurance_level = 'aal2'
    and s.ended_at is null and s.revoked_at is null
    and s.expires_at > v_at
    and s.last_activity_at > v_at - interval '60 minutes';
  if not found then
    raise insufficient_privilege using message = 'Active owner session required';
  end if;

  insert into public.admin_audit_log (
    admin_user_id, action, target, metadata, ip, user_agent
  ) values (
    p_admin_user_id,
    'admin.step-up.success',
    p_admin_session_id::text,
    jsonb_build_object('method', 'totp'),
    case when p_ip is null then null else p_ip::inet end,
    left(nullif(p_user_agent, ''), 512)
  );
  return v_at;
end;
$$;
revoke all on function public.record_admin_step_up(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.record_admin_step_up(uuid, uuid, text, text) to service_role;

-- 7. Owner session contract for privileged database operations: now also
--    idle-aware, and "fresh" means a step-up within the last 5 minutes rather
--    than a session younger than 5 minutes. Same signature and messages.
create or replace function private.require_admin_account_session(
  p_admin_user_id uuid,p_admin_session_id uuid,p_require_fresh boolean
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if not exists(
    select 1 from public.admin_users au join public.admin_sessions s on s.admin_user_id=au.id
    where au.id=p_admin_user_id and au.role='owner' and au.revoked_at is null and au.mfa_enrolled
      and s.id=p_admin_session_id and s.assurance_level='aal2' and s.ended_at is null
      and s.revoked_at is null and s.expires_at>statement_timestamp()
      and s.last_activity_at>statement_timestamp()-interval '60 minutes'
      and (not p_require_fresh or s.step_up_at>=statement_timestamp()-interval '5 minutes')
  ) then raise insufficient_privilege using message=case when p_require_fresh then 'Fresh owner reauthentication required' else 'Active owner session required' end;
  end if;
end;$$;
revoke all on function private.require_admin_account_session(uuid,uuid,boolean) from public,anon,authenticated,service_role;

-- 8. Duplicate-safe account operations. Same validation, reasons and audit as
--    prepare_admin_account_operation (kept for the previous runtime), plus:
--    - created = false when the idempotency key already exists (a double
--      submission or retry): nothing new is written except an
--      admin.account.operation.duplicate-suppressed audit row, and the caller
--      must not run the operation's side effects again;
--    - step-up freshness also covers the Stripe portal and refund-review
--      operations, which previously needed only a live session.
create or replace function public.begin_admin_account_operation(
  p_admin_user_id uuid,p_admin_session_id uuid,p_target_user_id uuid,p_operation text,
  p_idempotency_key text,p_reason text
) returns table(operation_id uuid,created boolean,operation_state text)
language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_state text;v_reason_required boolean;v_step_up_required boolean;v_before jsonb;
begin
  if p_operation not in ('resend-confirmation','revoke-sessions','suspend','restore','open-portal','cancel-at-period-end','submit-refund-review','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke','sync-billing')
    or p_idempotency_key is null or p_idempotency_key!~'^[A-Za-z0-9:_-]{16,160}$' then raise exception 'Invalid bounded account operation';end if;

  select o.id,o.operation_state into v_id,v_state from public.admin_account_operations o where o.idempotency_key=p_idempotency_key;
  if found then
    if not exists(select 1 from public.admin_account_operations o where o.id=v_id and o.admin_user_id=p_admin_user_id
        and o.target_user_id=p_target_user_id and o.operation=p_operation) then raise exception 'Idempotency ownership conflict';end if;
    perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,false);
    insert into public.admin_audit_log(admin_user_id,action,target,metadata)
      values(p_admin_user_id,'admin.account.operation.duplicate-suppressed',p_target_user_id::text,
        jsonb_build_object('operation',p_operation,'operation_id',v_id,'operation_state',v_state));
    return query select v_id,false,v_state;
    return;
  end if;

  v_reason_required:=p_operation in ('revoke-sessions','suspend','restore','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke');
  v_step_up_required:=v_reason_required or p_operation in ('open-portal','cancel-at-period-end','submit-refund-review');
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,v_step_up_required);
  if exists(select 1 from public.admin_users where user_id=p_target_user_id and revoked_at is null) then raise exception 'Active admin identities require the emergency admin revocation workflow';end if;
  if v_reason_required and (btrim(coalesce(p_reason,''))='' or char_length(btrim(p_reason))>500) then raise exception 'A bounded operation reason is required';end if;
  v_before:=private.admin_consumer_snapshot(p_target_user_id);
  if v_before is null then raise exception 'Consumer account not found';end if;

  insert into public.admin_account_operations(idempotency_key,admin_user_id,admin_session_id,target_user_id,operation,reason,before_snapshot)
    values(p_idempotency_key,p_admin_user_id,p_admin_session_id,p_target_user_id,p_operation,nullif(btrim(coalesce(p_reason,'')),''),v_before)
    on conflict(idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    -- A concurrent identical request inserted first: this one is the duplicate.
    select o.id,o.operation_state into v_id,v_state from public.admin_account_operations o where o.idempotency_key=p_idempotency_key
      and o.admin_user_id=p_admin_user_id and o.target_user_id=p_target_user_id and o.operation=p_operation;
    if v_id is null then raise exception 'Idempotency ownership conflict';end if;
    insert into public.admin_audit_log(admin_user_id,action,target,metadata)
      values(p_admin_user_id,'admin.account.operation.duplicate-suppressed',p_target_user_id::text,
        jsonb_build_object('operation',p_operation,'operation_id',v_id,'operation_state',v_state));
    return query select v_id,false,v_state;
    return;
  end if;

  insert into public.admin_audit_log(admin_user_id,action,target,metadata)
    values(p_admin_user_id,'admin.account.operation.prepared',p_target_user_id::text,jsonb_build_object('operation',p_operation,'operation_id',v_id));
  return query select v_id,true,'prepared'::text;
end;$$;
revoke all on function public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text) to service_role;

comment on column public.admin_sessions.last_activity_at is
  'Last authorized admin request (written at most once a minute). The session is idle-expired 60 minutes after it.';
comment on column public.admin_sessions.step_up_at is
  'Last TOTP verification for this session (sign-in MFA or step-up). Sensitive operations need it within 5 minutes.';
