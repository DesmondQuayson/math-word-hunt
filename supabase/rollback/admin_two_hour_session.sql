-- Rollback for 20260930100000_admin_two_hour_session.sql.
--
-- ORDER: roll the application back to the previous runtime FIRST (it does not
-- use the new columns or functions); only then run this file. The new runtime
-- reads last_activity_at/step_up_at and calls the new functions, so it fails
-- closed (admin unavailable) against a rolled-back database.
--
-- Effects:
-- - live sessions longer than the old 30-minute ceiling are ended ('expired'),
--   so every admin signs in again under the restored policy;
-- - the 30-minute ceiling and the three-reason end rule are restored NOT VALID,
--   so historical rows (2-hour sessions, 'idle-expired' ends) are kept as
--   evidence while every new row is checked;
-- - start/end/require functions return to their previous definitions; the
--   step-up, activity and duplicate-safe functions are removed;
-- - the activity and step-up columns are dropped.
-- Audit rows written under the new policy are never modified or deleted.

update public.admin_sessions set ended_at = statement_timestamp(), end_reason = 'expired'
where ended_at is null and expires_at > started_at + interval '30 minutes';

drop function if exists public.begin_admin_account_operation(uuid,uuid,uuid,text,text,text);
drop function if exists public.record_admin_step_up(uuid, uuid, text, text);
drop function if exists public.touch_admin_session(text);

create or replace function private.require_admin_account_session(
  p_admin_user_id uuid,p_admin_session_id uuid,p_require_fresh boolean
) returns void language plpgsql security invoker set search_path='' as $$
begin
  if not exists(
    select 1 from public.admin_users au join public.admin_sessions s on s.admin_user_id=au.id
    where au.id=p_admin_user_id and au.role='owner' and au.revoked_at is null and au.mfa_enrolled
      and s.id=p_admin_session_id and s.assurance_level='aal2' and s.ended_at is null
      and s.revoked_at is null and s.expires_at>statement_timestamp()
      and (not p_require_fresh or s.started_at>=statement_timestamp()-interval '5 minutes')
  ) then raise insufficient_privilege using message=case when p_require_fresh then 'Fresh owner reauthentication required' else 'Active owner session required' end;
  end if;
end;$$;
revoke all on function private.require_admin_account_session(uuid,uuid,boolean) from public,anon,authenticated,service_role;

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
begin
  perform id from public.admin_users
    where id = p_admin_user_id and revoked_at is null and mfa_enrolled
    for update;
  if not found then
    raise exception 'Active MFA-enrolled admin required';
  end if;
  if p_expires_at <= statement_timestamp() or
     p_expires_at > statement_timestamp() + interval '30 minutes' then
    raise exception 'Invalid admin session expiry';
  end if;

  insert into public.admin_sessions (
    admin_user_id, token_hash, assurance_level, expires_at
  ) values (
    p_admin_user_id, p_token_hash, 'aal2', p_expires_at
  ) returning id into created_id;

  insert into public.admin_audit_log (
    admin_user_id, action, target, metadata, ip, user_agent
  ) values (
    p_admin_user_id,
    'admin.session.started',
    created_id::text,
    jsonb_build_object('expires_at', p_expires_at),
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
  if p_reason not in ('signed-out', 'expired') then
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

alter table public.admin_sessions
  drop constraint if exists admin_sessions_step_up_window_check,
  drop constraint if exists admin_sessions_activity_window_check,
  drop constraint if exists admin_sessions_absolute_lifetime_check,
  drop constraint if exists admin_sessions_end_reason_check;

alter table public.admin_sessions
  add constraint admin_sessions_check1
    check (expires_at <= started_at + interval '30 minutes') not valid,
  add constraint admin_sessions_end_reason_check
    check (end_reason is null or end_reason in ('signed-out', 'expired', 'emergency-revocation')) not valid;

drop trigger if exists admin_sessions_default_activity on public.admin_sessions;
drop function if exists private.default_admin_session_activity();

alter table public.admin_sessions
  drop column if exists step_up_at,
  drop column if exists last_activity_at;
