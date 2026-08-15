-- Phase 8A: isolated Super Admin identity, session, audit, rate-limit, and
-- protected-storage foundation. Browser roles receive no access to admin data.

create table public.admin_users (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role = 'owner'),
  mfa_enrolled boolean not null default false,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  check (revoked_at is null or revoked_at >= created_at)
);

create index admin_users_active_user_idx
  on public.admin_users (user_id) where revoked_at is null;

create table public.admin_sessions (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete cascade,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  assurance_level text not null check (assurance_level = 'aal2'),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  ended_at timestamptz,
  revoked_at timestamptz,
  end_reason text check (
    end_reason is null or end_reason in ('signed-out', 'expired', 'emergency-revocation')
  ),
  check (expires_at > started_at),
  check (expires_at <= started_at + interval '30 minutes'),
  check (ended_at is null or ended_at >= started_at),
  check (revoked_at is null or revoked_at >= started_at),
  check ((ended_at is null and end_reason is null) or (ended_at is not null and end_reason is not null))
);

create index admin_sessions_active_admin_idx
  on public.admin_sessions (admin_user_id, expires_at)
  where ended_at is null and revoked_at is null;

create table public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid references public.admin_users(id) on delete set null,
  action text not null check (
    action = btrim(action) and
    char_length(action) between 3 and 80 and
    action ~ '^[a-z0-9][a-z0-9._-]+$'
  ),
  target text check (
    target is null or (target = btrim(target) and char_length(target) between 1 and 160)
  ),
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object' and octet_length(metadata::text) <= 4096
  ),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  created_at timestamptz not null default now()
);

create index admin_audit_log_admin_created_idx
  on public.admin_audit_log (admin_user_id, created_at desc);
create index admin_audit_log_action_created_idx
  on public.admin_audit_log (action, created_at desc);

create table public.admin_auth_rate_limits (
  scope text not null check (scope in ('login', 'mfa')),
  subject_hash text not null check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  blocked_until timestamptz,
  primary key (scope, subject_hash)
);

alter table public.admin_users enable row level security;
alter table public.admin_users force row level security;
alter table public.admin_sessions enable row level security;
alter table public.admin_sessions force row level security;
alter table public.admin_audit_log enable row level security;
alter table public.admin_audit_log force row level security;
alter table public.admin_auth_rate_limits enable row level security;
alter table public.admin_auth_rate_limits force row level security;

revoke all on table public.admin_users from public, anon, authenticated, service_role;
revoke all on table public.admin_sessions from public, anon, authenticated, service_role;
revoke all on table public.admin_audit_log from public, anon, authenticated, service_role;
revoke all on table public.admin_auth_rate_limits from public, anon, authenticated, service_role;

grant select, insert on table public.admin_users to service_role;
grant select on table public.admin_sessions to service_role;
grant select on table public.admin_audit_log to service_role;

create or replace function private.protect_admin_identity_boundary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.user_id is distinct from old.user_id or new.role is distinct from old.role or
     new.created_at is distinct from old.created_at or
     (old.revoked_at is not null and new.revoked_at is distinct from old.revoked_at) then
    raise exception 'admin identity boundary is immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.protect_admin_identity_boundary() from public, anon, authenticated, service_role;

create trigger admin_users_protect_identity
before update on public.admin_users
for each row execute function private.protect_admin_identity_boundary();

create or replace function private.reject_admin_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'admin_audit_log is append-only';
end;
$$;
revoke all on function private.reject_admin_audit_mutation() from public, anon, authenticated, service_role;

create trigger admin_audit_log_reject_mutation
before update or delete on public.admin_audit_log
for each row execute function private.reject_admin_audit_mutation();

create or replace function public.record_admin_audit_event(
  p_admin_user_id uuid,
  p_action text,
  p_target text,
  p_metadata jsonb,
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
  insert into public.admin_audit_log (
    admin_user_id, action, target, metadata, ip, user_agent
  ) values (
    p_admin_user_id,
    p_action,
    nullif(btrim(coalesce(p_target, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    case when p_ip is null then null else p_ip::inet end,
    left(nullif(p_user_agent, ''), 512)
  ) returning id into created_id;
  return created_id;
end;
$$;
revoke all on function public.record_admin_audit_event(uuid, text, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.record_admin_audit_event(uuid, text, text, jsonb, text, text)
  to service_role;

create or replace function public.consume_admin_auth_rate_limit(
  p_scope text,
  p_subject_hash text,
  p_max_attempts integer,
  p_window_seconds integer,
  p_block_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_row public.admin_auth_rate_limits%rowtype;
  request_time timestamptz := statement_timestamp();
  next_attempts integer;
begin
  if p_scope not in ('login', 'mfa') or p_subject_hash !~ '^[0-9a-f]{64}$' or
     p_max_attempts not between 1 and 20 or p_window_seconds not between 30 and 3600 or
     p_block_seconds not between 30 and 86400 then
    raise exception 'Invalid admin rate-limit contract';
  end if;

  select * into current_row
    from public.admin_auth_rate_limits
    where scope = p_scope and subject_hash = p_subject_hash
    for update;

  if found and current_row.blocked_until is not null and current_row.blocked_until > request_time then
    return false;
  end if;

  if not found or current_row.window_started_at + make_interval(secs => p_window_seconds) <= request_time then
    next_attempts := 1;
    insert into public.admin_auth_rate_limits (
      scope, subject_hash, window_started_at, attempts, blocked_until
    ) values (p_scope, p_subject_hash, request_time, next_attempts, null)
    on conflict (scope, subject_hash) do update set
      window_started_at = excluded.window_started_at,
      attempts = excluded.attempts,
      blocked_until = null;
  else
    next_attempts := current_row.attempts + 1;
    update public.admin_auth_rate_limits set
      attempts = next_attempts,
      blocked_until = case
        when next_attempts > p_max_attempts then request_time + make_interval(secs => p_block_seconds)
        else null
      end
    where scope = p_scope and subject_hash = p_subject_hash;
  end if;

  return next_attempts <= p_max_attempts;
end;
$$;
revoke all on function public.consume_admin_auth_rate_limit(text, text, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_admin_auth_rate_limit(text, text, integer, integer, integer)
  to service_role;

create or replace function public.clear_admin_auth_rate_limit(
  p_scope text,
  p_subject_hash text
)
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.admin_auth_rate_limits
  where scope = p_scope and subject_hash = p_subject_hash;
$$;
revoke all on function public.clear_admin_auth_rate_limit(text, text)
  from public, anon, authenticated;
grant execute on function public.clear_admin_auth_rate_limit(text, text) to service_role;

create or replace function public.mark_admin_mfa_enrolled(p_admin_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.admin_users
  set mfa_enrolled = true
  where id = p_admin_user_id and revoked_at is null;
  if not found then
    raise exception 'Active admin required';
  end if;
end;
$$;
revoke all on function public.mark_admin_mfa_enrolled(uuid) from public, anon, authenticated;
grant execute on function public.mark_admin_mfa_enrolled(uuid) to service_role;

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

create or replace function public.revoke_admin_access(
  p_user_id uuid,
  p_reason text,
  p_ip text,
  p_user_agent text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_admin public.admin_users%rowtype;
  revoked_session_count integer := 0;
  was_already_revoked boolean;
begin
  if btrim(coalesce(p_reason, '')) = '' or char_length(btrim(p_reason)) > 160 then
    raise exception 'A bounded revocation reason is required';
  end if;

  select * into target_admin from public.admin_users where user_id = p_user_id for update;
  if not found then raise exception 'Admin user not found'; end if;
  was_already_revoked := target_admin.revoked_at is not null;

  update public.admin_users set revoked_at = coalesce(revoked_at, statement_timestamp())
  where id = target_admin.id;

  update public.admin_sessions set
    revoked_at = coalesce(revoked_at, statement_timestamp()),
    ended_at = coalesce(ended_at, statement_timestamp()),
    end_reason = coalesce(end_reason, 'emergency-revocation')
  where admin_user_id = target_admin.id and ended_at is null and revoked_at is null;
  get diagnostics revoked_session_count = row_count;

  insert into public.admin_audit_log (
    admin_user_id, action, target, metadata, ip, user_agent
  ) values (
    target_admin.id,
    'admin.revoked',
    target_admin.id::text,
    jsonb_build_object(
      'reason', btrim(p_reason),
      'sessions_invalidated', revoked_session_count,
      'already_revoked', was_already_revoked
    ),
    case when p_ip is null then null else p_ip::inet end,
    left(nullif(p_user_agent, ''), 512)
  );

  return revoked_session_count;
end;
$$;
revoke all on function public.revoke_admin_access(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.revoke_admin_access(uuid, text, text, text) to service_role;

-- Future media stays server-only in Phase 8A. The bucket is private and the
-- restrictive policies continue to deny browser roles even if a permissive
-- policy for another bucket is added later.
insert into storage.buckets (
  id, name, public, file_size_limit, allowed_mime_types
) values (
  'admin-assets',
  'admin-assets',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
);

create policy admin_assets_hide_bucket_from_browser
on storage.buckets as restrictive for select to anon, authenticated
using (id <> 'admin-assets');

create policy admin_assets_server_only_select
on storage.objects as restrictive for select to anon, authenticated
using (bucket_id <> 'admin-assets');

create policy admin_assets_server_only_insert
on storage.objects as restrictive for insert to anon, authenticated
with check (bucket_id <> 'admin-assets');

create policy admin_assets_server_only_update
on storage.objects as restrictive for update to anon, authenticated
using (bucket_id <> 'admin-assets')
with check (bucket_id <> 'admin-assets');

create policy admin_assets_server_only_delete
on storage.objects as restrictive for delete to anon, authenticated
using (bucket_id <> 'admin-assets');

comment on table public.admin_users is
  'Phase 8A server-owned admin allowlist. JWT/browser role claims have no authority.';
comment on table public.admin_audit_log is
  'Append-only Phase 8A admin security audit ledger; secrets and credentials are prohibited.';
