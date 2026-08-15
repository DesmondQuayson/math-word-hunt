-- Phase 7E records immutable, versioned commercial consent before a Stripe
-- Setup Checkout can activate a subscription. Browser roles can read only
-- their own evidence; only trusted server code can create or bind it.
create table public.consumer_commercial_acceptances (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.consumer_accounts(user_id) on delete cascade,
  stripe_environment text not null check (stripe_environment in ('test', 'live')),
  product_key text not null check (product_key = 'mathnexa-monthly'),
  amount_minor_units integer not null check (amount_minor_units = 599),
  currency text not null check (currency = 'usd'),
  billing_interval text not null check (billing_interval = 'month'),
  trial_seconds integer not null check (trial_seconds = 86400),
  terms_version text not null check (terms_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  privacy_version text not null check (privacy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  cancellation_policy_version text not null check (cancellation_policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  refund_policy_version text not null check (refund_policy_version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  subscription_terms_accepted boolean not null check (subscription_terms_accepted),
  automatic_renewal_accepted boolean not null check (automatic_renewal_accepted),
  trial_accepted boolean not null check (trial_accepted),
  monthly_price_accepted boolean not null check (monthly_price_accepted),
  cancellation_policy_accepted boolean not null check (cancellation_policy_accepted),
  refund_policy_accepted boolean not null check (refund_policy_accepted),
  privacy_and_terms_accepted boolean not null check (privacy_and_terms_accepted),
  accepted_at timestamptz not null default statement_timestamp()
);
create index consumer_commercial_acceptances_owner_idx
  on public.consumer_commercial_acceptances (owner_user_id, accepted_at desc);

create table public.consumer_checkout_acceptance_bindings (
  id uuid primary key default gen_random_uuid(),
  acceptance_id uuid not null unique references public.consumer_commercial_acceptances(id) on delete cascade,
  owner_user_id uuid not null references public.consumer_accounts(user_id) on delete cascade,
  stripe_environment text not null check (stripe_environment in ('test', 'live')),
  setup_checkout_hash text not null check (setup_checkout_hash ~ '^[a-f0-9]{64}$'),
  bound_at timestamptz not null default statement_timestamp(),
  unique (stripe_environment, setup_checkout_hash)
);

create table public.consumer_refund_requests (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.consumer_accounts(user_id) on delete cascade,
  billing_subscription_id uuid not null references public.billing_subscriptions(id) on delete restrict,
  request_scope text not null default 'first-charge-review' check (request_scope = 'first-charge-review'),
  request_status text not null default 'requested'
    check (request_status in ('requested', 'reviewing', 'approved', 'declined', 'completed')),
  requested_at timestamptz not null default statement_timestamp(),
  resolved_at timestamptz,
  check ((request_status in ('approved', 'declined', 'completed')) = (resolved_at is not null)),
  unique (owner_user_id, billing_subscription_id)
);

alter table public.consumer_commercial_acceptances enable row level security;
alter table public.consumer_checkout_acceptance_bindings enable row level security;
alter table public.consumer_refund_requests enable row level security;
alter table public.consumer_commercial_acceptances force row level security;
alter table public.consumer_checkout_acceptance_bindings force row level security;
alter table public.consumer_refund_requests force row level security;

create policy consumer_commercial_acceptances_select_own on public.consumer_commercial_acceptances
for select to authenticated using (owner_user_id = (select auth.uid()));
create policy consumer_checkout_acceptance_bindings_select_own on public.consumer_checkout_acceptance_bindings
for select to authenticated using (owner_user_id = (select auth.uid()));
create policy consumer_refund_requests_select_own on public.consumer_refund_requests
for select to authenticated using (owner_user_id = (select auth.uid()));

revoke all on table public.consumer_commercial_acceptances,
  public.consumer_checkout_acceptance_bindings, public.consumer_refund_requests
  from public, anon, authenticated;
grant select on table public.consumer_commercial_acceptances,
  public.consumer_checkout_acceptance_bindings, public.consumer_refund_requests
  to authenticated;
grant select, insert on table public.consumer_commercial_acceptances,
  public.consumer_checkout_acceptance_bindings to service_role;
grant select, insert, update on table public.consumer_refund_requests to service_role;

create or replace function public.bind_consumer_checkout_acceptance(
  p_acceptance_id uuid,
  p_owner_user_id uuid,
  p_stripe_environment text,
  p_checkout_hash text
) returns boolean
language plpgsql security invoker set search_path = '' as $$
begin
  if p_stripe_environment not in ('test', 'live') or p_checkout_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid Checkout acceptance binding';
  end if;
  if not exists (
    select 1 from public.consumer_commercial_acceptances
    where id = p_acceptance_id and owner_user_id = p_owner_user_id
      and stripe_environment = p_stripe_environment
      and product_key = 'mathnexa-monthly' and amount_minor_units = 599
      and currency = 'usd' and billing_interval = 'month' and trial_seconds = 86400
      and terms_version = '2026-08-01' and privacy_version = '2026-08-01'
      and cancellation_policy_version = '2026-08-01' and refund_policy_version = '2026-08-01'
      and accepted_at >= statement_timestamp() - interval '1 hour'
  ) then return false; end if;
  insert into public.consumer_checkout_acceptance_bindings (
    acceptance_id, owner_user_id, stripe_environment, setup_checkout_hash
  ) values (p_acceptance_id, p_owner_user_id, p_stripe_environment, p_checkout_hash)
  on conflict (stripe_environment, setup_checkout_hash) do nothing;
  return exists (
    select 1 from public.consumer_checkout_acceptance_bindings
    where owner_user_id = p_owner_user_id and stripe_environment = p_stripe_environment
      and setup_checkout_hash = p_checkout_hash
  );
end;
$$;
revoke all on function public.bind_consumer_checkout_acceptance(uuid, uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.bind_consumer_checkout_acceptance(uuid, uuid, text, text) to service_role;

create or replace function public.has_current_consumer_checkout_acceptance(
  p_owner_user_id uuid,
  p_stripe_environment text,
  p_checkout_hash text
) returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1
    from public.consumer_checkout_acceptance_bindings binding
    join public.consumer_commercial_acceptances acceptance on acceptance.id = binding.acceptance_id
    where binding.owner_user_id = p_owner_user_id
      and binding.stripe_environment = p_stripe_environment
      and binding.setup_checkout_hash = p_checkout_hash
      and acceptance.owner_user_id = p_owner_user_id
      and acceptance.stripe_environment = p_stripe_environment
      and acceptance.product_key = 'mathnexa-monthly'
      and acceptance.amount_minor_units = 599 and acceptance.currency = 'usd'
      and acceptance.billing_interval = 'month' and acceptance.trial_seconds = 86400
      and acceptance.terms_version = '2026-08-01'
      and acceptance.privacy_version = '2026-08-01'
      and acceptance.cancellation_policy_version = '2026-08-01'
      and acceptance.refund_policy_version = '2026-08-01'
  );
$$;
revoke all on function public.has_current_consumer_checkout_acceptance(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.has_current_consumer_checkout_acceptance(uuid, text, text) to service_role;

create or replace function public.request_own_consumer_refund_review()
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := (select auth.uid());
  subscription_id uuid;
  request_id uuid;
begin
  if owner_id is null then raise insufficient_privilege using message = 'Authentication required'; end if;
  if not exists (
    select 1 from public.consumer_accounts
    where user_id = owner_id and account_status in ('active', 'deletion_pending')
  ) then raise insufficient_privilege using message = 'Account unavailable'; end if;
  select id into subscription_id from public.billing_subscriptions
    where owner_consumer_id = owner_id and first_paid_at is not null
      and first_paid_at >= statement_timestamp() - interval '7 days'
    order by first_paid_at desc limit 1;
  if subscription_id is null then raise exception 'No eligible first charge'; end if;
  insert into public.consumer_refund_requests (owner_user_id, billing_subscription_id)
    values (owner_id, subscription_id)
    on conflict (owner_user_id, billing_subscription_id) do update
      set owner_user_id = excluded.owner_user_id
    returning id into request_id;
  return request_id;
end;
$$;
revoke all on function public.request_own_consumer_refund_review() from public, anon;
grant execute on function public.request_own_consumer_refund_review() to authenticated;
