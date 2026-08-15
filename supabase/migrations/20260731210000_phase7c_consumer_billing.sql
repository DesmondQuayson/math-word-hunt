-- Phase 7C adapts the existing server-only billing projection for consumer
-- ownership. Protected Preview teacher rows remain valid and isolated.
alter table public.billing_customers
  alter column owner_teacher_id drop not null,
  add column owner_consumer_id uuid references public.consumer_accounts(user_id) on delete cascade;
alter table public.billing_customers
  add constraint billing_customers_exactly_one_owner_check check (
    (owner_teacher_id is not null)::integer + (owner_consumer_id is not null)::integer = 1
  ),
  add constraint billing_customers_consumer_identity_unique
    unique (id, owner_consumer_id, stripe_environment),
  add constraint billing_customers_consumer_environment_unique
    unique (owner_consumer_id, stripe_environment);

alter table public.billing_subscriptions
  alter column owner_teacher_id drop not null,
  add column owner_consumer_id uuid references public.consumer_accounts(user_id) on delete cascade,
  add column first_paid_at timestamptz,
  add column last_paid_at timestamptz,
  add column last_payment_failed_at timestamptz,
  add column renewal_grace_ends_at timestamptz;
alter table public.billing_subscriptions
  drop constraint billing_subscriptions_plan_key_check;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_plan_key_check check (
    plan_key in ('teacher-pro-monthly', 'teacher-pro-annual', 'mathnexa-monthly')
  ),
  add constraint billing_subscriptions_exactly_one_owner_check check (
    (owner_teacher_id is not null)::integer + (owner_consumer_id is not null)::integer = 1
  ),
  add constraint billing_subscriptions_consumer_customer_fkey
    foreign key (billing_customer_id, owner_consumer_id, stripe_environment)
    references public.billing_customers(id, owner_consumer_id, stripe_environment) on delete cascade,
  add constraint billing_subscriptions_payment_timeline_check check (
    (first_paid_at is null or last_paid_at is not null) and
    (first_paid_at is null or last_paid_at >= first_paid_at) and
    (renewal_grace_ends_at is null or (
      first_paid_at is not null and last_payment_failed_at is not null and
      renewal_grace_ends_at > last_payment_failed_at
    ))
  );
create unique index billing_subscriptions_one_current_per_consumer
  on public.billing_subscriptions (owner_consumer_id, stripe_environment)
  where owner_consumer_id is not null
    and subscription_status not in ('canceled', 'incomplete_expired');
create index billing_subscriptions_consumer_status_idx
  on public.billing_subscriptions (owner_consumer_id, stripe_environment, subscription_status)
  where owner_consumer_id is not null;

alter table public.billing_webhook_events
  drop constraint billing_webhook_events_event_type_check;
alter table public.billing_webhook_events
  add constraint billing_webhook_events_event_type_check check (event_type in (
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed',
    'customer.deleted'
  ));
alter table public.billing_webhook_events
  drop constraint billing_webhook_events_stripe_object_id_check;
alter table public.billing_webhook_events
  add constraint billing_webhook_events_stripe_object_id_check check (
    stripe_object_id is null or stripe_object_id ~ '^(cs|sub|in|cus)_[A-Za-z0-9]+$'
  );

alter table public.consumer_accounts
  add column trial_redemption_checkout_hash text check (
    trial_redemption_checkout_hash is null or trial_redemption_checkout_hash ~ '^[a-f0-9]{64}$'
  );

alter table public.consumer_game_entitlements
  drop constraint consumer_game_entitlements_entitlement_state_check;
alter table public.consumer_game_entitlements
  add column grace_ends_at timestamptz,
  add constraint consumer_game_entitlements_entitlement_state_check check (entitlement_state in (
    'no-entitlement', 'trial-pending', 'trial-active', 'trial-expired',
    'subscription-active', 'subscription-past-due', 'subscription-grace-period',
    'subscription-canceled-through-period-end', 'subscription-expired'
  )),
  add constraint consumer_game_entitlements_grace_check check (
    (entitlement_state = 'subscription-grace-period' and
      current_period_ends_at is not null and grace_ends_at > current_period_ends_at) or
    (entitlement_state <> 'subscription-grace-period' and grace_ends_at is null)
  );

create or replace function public.claim_consumer_trial_redemption(
  p_owner_user_id uuid,
  p_checkout_hash text,
  p_redeemed_at timestamptz
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  existing_hash text;
  existing_redeemed_at timestamptz;
begin
  if p_checkout_hash !~ '^[a-f0-9]{64}$' or p_redeemed_at > statement_timestamp() + interval '1 minute' then
    raise exception 'Invalid trial redemption';
  end if;
  select trial_redemption_checkout_hash, trial_redeemed_at
    into existing_hash, existing_redeemed_at
    from public.consumer_accounts where user_id = p_owner_user_id and account_status = 'active'
    for update;
  if not found then return 'account_restricted'; end if;
  if existing_redeemed_at is not null and existing_hash is null then
    return 'trial_ineligible';
  end if;
  if existing_hash is not null then
    return case when existing_hash = p_checkout_hash then 'already_claimed' else 'trial_ineligible' end;
  end if;
  update public.consumer_accounts
    set trial_redeemed_at = p_redeemed_at,
        trial_redemption_checkout_hash = p_checkout_hash
    where user_id = p_owner_user_id;
  insert into public.consumer_game_entitlements (
    user_id, entitlement_state, source_reference_hash, authoritative_version
  ) values (
    p_owner_user_id, 'trial-pending', p_checkout_hash, 1
  ) on conflict (user_id) do update set
    entitlement_state = 'trial-pending',
    trial_started_at = null,
    trial_ends_at = null,
    current_period_ends_at = null,
    grace_ends_at = null,
    source_reference_hash = excluded.source_reference_hash,
    authoritative_version = public.consumer_game_entitlements.authoritative_version + 1;
  return 'claimed';
end;
$$;
revoke all on function public.claim_consumer_trial_redemption(uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.claim_consumer_trial_redemption(uuid, text, timestamptz)
  to service_role;

create or replace function public.apply_consumer_billing_projection(
  p_event_record_id uuid,
  p_event_type text,
  p_owner_user_id uuid,
  p_stripe_environment text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_stripe_price_id text,
  p_subscription_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz,
  p_trial_start timestamptz,
  p_trial_end timestamptz,
  p_event_created_at timestamptz,
  p_grace_days integer,
  p_emergency_default_deny boolean
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  customer_record_id uuid;
  subscription_record_id uuid;
  account_state text;
  latest_event timestamptz;
  existing_first_paid timestamptz;
  projected_first_paid timestamptz;
  projected_last_paid timestamptz;
  projected_failed_at timestamptz;
  projected_grace_end timestamptz;
  projected_state text;
begin
  if p_grace_days not between 1 and 30 then raise exception 'Invalid renewal grace'; end if;
  if not exists (
    select 1 from public.billing_webhook_events
      where id = p_event_record_id and processing_state = 'processing'
  ) then raise exception 'Billing event is not claimed'; end if;

  select account_status into account_state
    from public.consumer_accounts where user_id = p_owner_user_id;
  if account_state is null then raise exception 'Billing owner missing'; end if;

  select id into customer_record_id from public.billing_customers
    where owner_consumer_id = p_owner_user_id and stripe_environment = p_stripe_environment;
  if customer_record_id is null then
    insert into public.billing_customers (
      owner_consumer_id, stripe_environment, stripe_customer_id
    ) values (
      p_owner_user_id, p_stripe_environment, p_stripe_customer_id
    ) returning id into customer_record_id;
  elsif not exists (
    select 1 from public.billing_customers
      where id = customer_record_id and stripe_customer_id = p_stripe_customer_id
  ) then
    raise exception 'Billing ownership conflict';
  end if;

  select latest_authoritative_event_created_at, first_paid_at, last_paid_at,
         last_payment_failed_at, renewal_grace_ends_at
    into latest_event, existing_first_paid, projected_last_paid,
         projected_failed_at, projected_grace_end
    from public.billing_subscriptions
    where stripe_environment = p_stripe_environment
      and stripe_subscription_id = p_stripe_subscription_id;
  if latest_event is not null and p_event_created_at < latest_event then
    update public.billing_webhook_events set
      processing_state = 'ignored', failure_class = null,
      processing_started_at = null, lease_expires_at = null
      where id = p_event_record_id;
    return 'stale_ignored';
  end if;

  projected_first_paid := existing_first_paid;
  if p_event_type = 'invoice.paid' then
    projected_first_paid := coalesce(existing_first_paid, p_event_created_at);
    projected_last_paid := p_event_created_at;
    projected_failed_at := null;
    projected_grace_end := null;
  elsif p_event_type = 'invoice.payment_failed' then
    projected_failed_at := coalesce(projected_failed_at, p_event_created_at);
    projected_grace_end := case when existing_first_paid is not null
      then coalesce(
        projected_grace_end,
        p_event_created_at + make_interval(days => p_grace_days)
      )
      else null end;
  elsif p_event_type = 'checkout.session.completed' and p_subscription_status = 'active' then
    projected_first_paid := coalesce(existing_first_paid, p_event_created_at);
    projected_last_paid := coalesce(projected_last_paid, p_event_created_at);
  end if;

  insert into public.billing_subscriptions (
    owner_consumer_id, billing_customer_id, stripe_environment,
    stripe_subscription_id, product_key, plan_key, stripe_price_id,
    subscription_status, current_period_start, current_period_end,
    cancel_at_period_end, canceled_at, trial_end,
    first_paid_at, last_paid_at, last_payment_failed_at, renewal_grace_ends_at,
    latest_authoritative_event_created_at
  ) values (
    p_owner_user_id, customer_record_id, p_stripe_environment,
    p_stripe_subscription_id, 'math-vocabulary-hunt', 'mathnexa-monthly',
    p_stripe_price_id, p_subscription_status, p_current_period_start,
    p_current_period_end, p_cancel_at_period_end, p_canceled_at,
    case when p_subscription_status = 'trialing' then p_trial_end else null end,
    projected_first_paid, projected_last_paid, projected_failed_at,
    projected_grace_end, p_event_created_at
  ) on conflict (stripe_environment, stripe_subscription_id) do update set
    plan_key = excluded.plan_key,
    stripe_price_id = excluded.stripe_price_id,
    subscription_status = excluded.subscription_status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    trial_end = excluded.trial_end,
    first_paid_at = excluded.first_paid_at,
    last_paid_at = excluded.last_paid_at,
    last_payment_failed_at = excluded.last_payment_failed_at,
    renewal_grace_ends_at = excluded.renewal_grace_ends_at,
    latest_authoritative_event_created_at = excluded.latest_authoritative_event_created_at
  where public.billing_subscriptions.owner_consumer_id = excluded.owner_consumer_id
    and public.billing_subscriptions.billing_customer_id = excluded.billing_customer_id
  returning id into subscription_record_id;
  if subscription_record_id is null then raise exception 'Billing subscription ownership conflict'; end if;

  if p_emergency_default_deny or account_state <> 'active' then
    projected_state := 'subscription-expired';
  elsif p_subscription_status = 'trialing'
      and p_trial_start is not null and p_trial_end = p_trial_start + interval '24 hours'
      and p_trial_end > statement_timestamp() then
    projected_state := 'trial-active';
  elsif p_event_type = 'invoice.payment_failed' and projected_first_paid is null then
    projected_state := 'subscription-past-due';
  elsif p_event_type = 'invoice.payment_failed' and projected_grace_end > statement_timestamp() then
    projected_state := 'subscription-grace-period';
  elsif p_subscription_status = 'active' and p_current_period_end > statement_timestamp() then
    projected_state := case when p_cancel_at_period_end
      then 'subscription-canceled-through-period-end' else 'subscription-active' end;
  elsif p_subscription_status = 'past_due' and projected_grace_end > statement_timestamp() then
    projected_state := 'subscription-grace-period';
  elsif p_subscription_status = 'past_due' then
    projected_state := 'subscription-past-due';
  else
    projected_state := 'subscription-expired';
  end if;

  insert into public.consumer_game_entitlements (
    user_id, entitlement_state, trial_started_at, trial_ends_at,
    current_period_ends_at, grace_ends_at, source_reference_hash,
    authoritative_version
  ) values (
    p_owner_user_id, projected_state,
    case when projected_state in ('trial-active', 'trial-expired') then p_trial_start else null end,
    case when projected_state in ('trial-active', 'trial-expired') then p_trial_end else null end,
    case when projected_state = 'subscription-grace-period'
      then p_event_created_at
      when projected_state in (
      'subscription-active', 'subscription-past-due',
      'subscription-canceled-through-period-end',
      'subscription-expired'
    ) then p_current_period_end else null end,
    case when projected_state = 'subscription-grace-period' then projected_grace_end else null end,
    encode(extensions.digest(p_stripe_subscription_id, 'sha256'), 'hex'),
    1
  ) on conflict (user_id) do update set
    entitlement_state = excluded.entitlement_state,
    trial_started_at = excluded.trial_started_at,
    trial_ends_at = excluded.trial_ends_at,
    current_period_ends_at = excluded.current_period_ends_at,
    grace_ends_at = excluded.grace_ends_at,
    source_reference_hash = excluded.source_reference_hash,
    authoritative_version = public.consumer_game_entitlements.authoritative_version + 1;

  update public.billing_webhook_events set
    processing_state = 'processed',
    processed_at = statement_timestamp(),
    processing_started_at = null,
    lease_expires_at = null,
    failure_class = null
    where id = p_event_record_id;
  return projected_state;
end;
$$;
revoke all on function public.apply_consumer_billing_projection(
  uuid, text, uuid, text, text, text, text, text, timestamptz,
  timestamptz, boolean, timestamptz, timestamptz, timestamptz,
  timestamptz, integer, boolean
) from public, anon, authenticated;
grant execute on function public.apply_consumer_billing_projection(
  uuid, text, uuid, text, text, text, text, text, timestamptz,
  timestamptz, boolean, timestamptz, timestamptz, timestamptz,
  timestamptz, integer, boolean
) to service_role;

create or replace function public.revoke_consumer_billing_customer(
  p_event_record_id uuid,
  p_owner_user_id uuid,
  p_stripe_environment text,
  p_event_created_at timestamptz
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.billing_webhook_events
      where id = p_event_record_id and processing_state = 'processing'
  ) then raise exception 'Billing event is not claimed'; end if;
  update public.billing_subscriptions set
    subscription_status = 'canceled',
    canceled_at = coalesce(canceled_at, p_event_created_at),
    current_period_end = least(coalesce(current_period_end, p_event_created_at), p_event_created_at),
    trial_end = null,
    renewal_grace_ends_at = null,
    latest_authoritative_event_created_at = greatest(
      latest_authoritative_event_created_at, p_event_created_at
    )
    where owner_consumer_id = p_owner_user_id
      and stripe_environment = p_stripe_environment;
  insert into public.consumer_game_entitlements (
    user_id, entitlement_state, current_period_ends_at, authoritative_version
  ) values (
    p_owner_user_id, 'subscription-expired', p_event_created_at, 1
  ) on conflict (user_id) do update set
    entitlement_state = 'subscription-expired',
    trial_started_at = null,
    trial_ends_at = null,
    current_period_ends_at = p_event_created_at,
    grace_ends_at = null,
    authoritative_version = public.consumer_game_entitlements.authoritative_version + 1;
  update public.billing_webhook_events set
    processing_state = 'processed', processed_at = statement_timestamp(),
    processing_started_at = null, lease_expires_at = null, failure_class = null
    where id = p_event_record_id;
  return 'subscription-expired';
end;
$$;
revoke all on function public.revoke_consumer_billing_customer(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.revoke_consumer_billing_customer(uuid, uuid, text, timestamptz)
  to service_role;
