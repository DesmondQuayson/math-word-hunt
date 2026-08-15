-- Phase 7B adds an isolated consumer identity model without deleting or
-- weakening the existing protected-Preview teacher model. New projects remain
-- in legacy-preview mode until an explicit service-only Production setup step.
create table private.platform_identity_policy (
  singleton boolean primary key default true check (singleton),
  identity_model text not null check (identity_model in ('legacy-preview', 'consumer-v1')),
  updated_at timestamptz not null default now()
);
insert into private.platform_identity_policy (singleton, identity_model) values (true, 'legacy-preview');
revoke all on table private.platform_identity_policy from public, anon, authenticated;
grant select, update on table private.platform_identity_policy to service_role;

create or replace function public.set_platform_identity_model(p_identity_model text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_identity_model not in ('legacy-preview', 'consumer-v1') then
    raise exception using errcode = '22023', message = 'invalid_identity_model';
  end if;
  update private.platform_identity_policy
    set identity_model = p_identity_model, updated_at = statement_timestamp()
    where singleton;
end;
$$;
revoke all on function public.set_platform_identity_model(text) from public, anon, authenticated;
grant execute on function public.set_platform_identity_model(text) to service_role;

create table public.consumer_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  account_status text not null default 'active'
    check (account_status in ('active', 'suspended', 'deletion_pending')),
  email_confirmed_at timestamptz,
  trial_redeemed_at timestamptz,
  deletion_requested_at timestamptz,
  deletion_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (updated_at >= created_at),
  check (trial_redeemed_at is null or trial_redeemed_at >= created_at),
  check (
    (account_status = 'deletion_pending' and deletion_requested_at is not null) or
    (account_status <> 'deletion_pending' and deletion_requested_at is null)
  ),
  check (deletion_completed_at is null or (
    deletion_requested_at is not null and deletion_completed_at >= deletion_requested_at
  ))
);

create table public.consumer_game_entitlements (
  user_id uuid primary key references public.consumer_accounts(user_id) on delete cascade,
  entitlement_state text not null check (entitlement_state in (
    'no-entitlement', 'trial-pending', 'trial-active', 'trial-expired',
    'subscription-active', 'subscription-past-due',
    'subscription-canceled-through-period-end', 'subscription-expired'
  )),
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  source_reference_hash text check (
    source_reference_hash is null or source_reference_hash ~ '^[a-f0-9]{64}$'
  ),
  authoritative_version bigint not null default 0 check (authoritative_version >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (updated_at >= created_at),
  check (
    (entitlement_state in ('trial-active', 'trial-expired') and
      trial_started_at is not null and trial_ends_at = trial_started_at + interval '24 hours') or
    (entitlement_state = 'trial-pending' and trial_started_at is null and trial_ends_at is null) or
    (entitlement_state not in ('trial-pending', 'trial-active', 'trial-expired') and
      trial_started_at is null and trial_ends_at is null)
  ),
  check (
    (entitlement_state in ('subscription-active', 'subscription-canceled-through-period-end') and
      current_period_ends_at is not null) or
    (entitlement_state not in ('subscription-active', 'subscription-canceled-through-period-end'))
  )
);

create table public.consumer_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.consumer_accounts(user_id) on delete cascade,
  request_status text not null default 'requested'
    check (request_status in ('requested', 'processing', 'completed', 'rejected')),
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (request_status = 'completed' and completed_at is not null) or
    (request_status <> 'completed' and completed_at is null)
  ),
  check (completed_at is null or completed_at >= requested_at)
);
create unique index consumer_account_deletion_one_open_idx
  on public.consumer_account_deletion_requests (owner_user_id)
  where request_status in ('requested', 'processing');

create trigger consumer_accounts_set_updated_at before update on public.consumer_accounts
for each row execute function private.set_updated_at();
create trigger consumer_game_entitlements_set_updated_at before update on public.consumer_game_entitlements
for each row execute function private.set_updated_at();

create or replace function private.prevent_consumer_trial_replay()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.trial_redeemed_at is not null and
     new.trial_redeemed_at is distinct from old.trial_redeemed_at then
    raise exception using errcode = '23514', message = 'consumer_trial_redemption_is_immutable';
  end if;
  return new;
end;
$$;
revoke all on function private.prevent_consumer_trial_replay() from public, anon, authenticated;
create trigger consumer_accounts_prevent_trial_replay
before update of trial_redeemed_at on public.consumer_accounts
for each row execute function private.prevent_consumer_trial_replay();

-- Existing Preview provisioning is retained, but it becomes a no-op only when
-- the isolated project is explicitly switched to the consumer identity model.
create or replace function private.provision_teacher_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_display_name text;
  configured_model text;
begin
  select identity_model into strict configured_model
    from private.platform_identity_policy where singleton;
  if configured_model = 'consumer-v1' then return new; end if;

  requested_display_name := nullif(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if requested_display_name is null or char_length(requested_display_name) > 80 then
    requested_display_name := 'Teacher';
  end if;
  insert into public.teacher_profiles (
    user_id, display_name, school_or_organization_label, account_status
  ) values (
    new.id, requested_display_name, null, 'active'
  ) on conflict (user_id) do nothing;
  return new;
exception
  when others then
    raise exception 'Teacher profile provisioning failed';
end;
$$;
revoke all on function private.provision_teacher_profile() from public, anon, authenticated;

create or replace function private.provision_consumer_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  configured_model text;
begin
  select identity_model into strict configured_model
    from private.platform_identity_policy where singleton;
  if configured_model <> 'consumer-v1' then return new; end if;

  insert into public.consumer_accounts (
    user_id, account_status, email_confirmed_at
  ) values (
    new.id, 'active', new.email_confirmed_at
  ) on conflict (user_id) do update set
    email_confirmed_at = excluded.email_confirmed_at;
  return new;
exception
  when others then
    raise exception 'Consumer account provisioning failed';
end;
$$;
revoke all on function private.provision_consumer_account() from public, anon, authenticated;
create trigger provision_consumer_account_after_auth_user
after insert or update of email_confirmed_at on auth.users
for each row execute function private.provision_consumer_account();

alter table public.consumer_accounts enable row level security;
alter table public.consumer_game_entitlements enable row level security;
alter table public.consumer_account_deletion_requests enable row level security;
alter table public.consumer_accounts force row level security;
alter table public.consumer_game_entitlements force row level security;
alter table public.consumer_account_deletion_requests force row level security;

create policy consumer_accounts_select_own on public.consumer_accounts
for select to authenticated using (user_id = (select auth.uid()));
create policy consumer_game_entitlements_select_own on public.consumer_game_entitlements
for select to authenticated using (user_id = (select auth.uid()));
create policy consumer_account_deletion_requests_select_own on public.consumer_account_deletion_requests
for select to authenticated using (owner_user_id = (select auth.uid()));

revoke all on table public.consumer_accounts from public, anon, authenticated;
revoke all on table public.consumer_game_entitlements from public, anon, authenticated;
revoke all on table public.consumer_account_deletion_requests from public, anon, authenticated;
grant select on table public.consumer_accounts to authenticated;
grant select on table public.consumer_game_entitlements to authenticated;
grant select on table public.consumer_account_deletion_requests to authenticated;
grant select, insert, update on table public.consumer_accounts,
  public.consumer_game_entitlements, public.consumer_account_deletion_requests to service_role;

create or replace function public.request_own_consumer_account_deletion()
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  owner_id uuid := (select auth.uid());
  request_id uuid;
begin
  if owner_id is null then
    raise insufficient_privilege using message = 'Authentication required';
  end if;
  update public.consumer_accounts
    set account_status = 'deletion_pending',
        deletion_requested_at = statement_timestamp()
    where user_id = owner_id and account_status = 'active'
    returning user_id into owner_id;
  if not found then
    raise insufficient_privilege using message = 'Active consumer account required';
  end if;
  insert into public.consumer_account_deletion_requests (owner_user_id)
    values (owner_id) returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_own_consumer_account_deletion() from public, anon;
grant execute on function public.request_own_consumer_account_deletion() to authenticated;
