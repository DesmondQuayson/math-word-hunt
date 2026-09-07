-- Subscription lifecycle reliability + entitlement reconciliation.
--
-- Why this exists: the consumer entitlement was a webhook-only projection.
-- `consumer_game_entitlements.current_period_ends_at` was written only when a
-- Stripe event was accepted and processed, and nothing ever compared the local
-- record with Stripe again. When a renewal's events did not land (redirecting
-- endpoint host, rejected API version, endpoint downtime, exhausted retries),
-- the stored period end from the PREVIOUS cycle expired and the access gate
-- reported "Subscription ended" to a customer whose renewal had been charged.
--
-- This migration is additive and forward-compatible:
--   * one canonical synchronizer, `synchronize_consumer_billing_subscription`,
--     that both the webhook path and the reconciliation path call;
--   * `apply_consumer_billing_projection` keeps its signature and delegates to
--     the synchronizer, so existing callers and tests keep working;
--   * reconciliation bookkeeping columns (last synchronized, source, ended_at,
--     latest invoice) and a per-customer reconciliation throttle;
--   * `invoice.payment_succeeded` accepted as an alias of `invoice.paid`;
--   * the owner-only admin "Sync with Stripe" operation.
-- Rollback: supabase/rollback/subscription_lifecycle_reconciliation.sql

alter table public.billing_customers
  add column if not exists last_reconciliation_attempt_at timestamptz;

alter table public.billing_subscriptions
  add column if not exists ended_at timestamptz,
  add column if not exists latest_invoice_id text,
  add column if not exists last_synchronized_at timestamptz,
  add column if not exists last_synchronization_source text;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_latest_invoice_id_check check (
    latest_invoice_id is null or latest_invoice_id ~ '^in_[A-Za-z0-9]+$'
  ),
  add constraint billing_subscriptions_synchronization_source_check check (
    last_synchronization_source is null or
    last_synchronization_source in ('webhook', 'reconciliation', 'admin')
  );

alter table public.billing_webhook_events
  drop constraint billing_webhook_events_event_type_check;
alter table public.billing_webhook_events
  add constraint billing_webhook_events_event_type_check check (event_type in (
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'customer.deleted'
  ));
alter table public.billing_webhook_events
  drop constraint billing_webhook_events_failure_class_check;
alter table public.billing_webhook_events
  add constraint billing_webhook_events_failure_class_check check (failure_class in (
    'configuration', 'environment_mismatch', 'invalid_owner', 'unknown_plan', 'provider_unavailable',
    'database_unavailable', 'projection_conflict', 'unsupported_payload', 'api_version_mismatch',
    'stale_event', 'ownership_conflict', 'duplicate_subscription', 'invoice_state_conflict',
    'unknown_subscription_status', 'conflicting_current_subscription', 'trial_shape_conflict'
  ));

-- The canonical synchronizer. Every write to billing_subscriptions and the
-- derived consumer_game_entitlements row for a Stripe subscription goes through
-- here, whether the trigger was a signed webhook event or an authoritative
-- re-fetch of the Stripe subscription (reconciliation / admin sync).
--
-- p_observed_at is the authority timestamp of the snapshot: `event.created`
-- for webhooks, the fetch time for reconciliation. A snapshot older than the
-- newest one already applied for the same subscription is ignored, so a late
-- or replayed event can never roll the period backwards.
create or replace function public.synchronize_consumer_billing_subscription(
  p_source text,
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
  p_ended_at timestamptz,
  p_trial_start timestamptz,
  p_trial_end timestamptz,
  p_latest_invoice_id text,
  p_latest_invoice_paid_at timestamptz,
  p_observed_at timestamptz,
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
  projected_period_end timestamptz;
  terminal boolean;
  other_current_exists boolean;
  is_webhook boolean;
begin
  if p_source not in ('webhook', 'reconciliation', 'admin') then
    raise exception 'Invalid synchronization source';
  end if;
  is_webhook := p_source = 'webhook';
  if p_grace_days not between 1 and 30 then raise exception 'Invalid renewal grace'; end if;
  if p_observed_at is null then raise exception 'Invalid synchronization timestamp'; end if;
  if p_subscription_status not in (
    'active', 'trialing', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'paused', 'canceled'
  ) then
    -- Unknown provider statuses never silently become "ended". The caller
    -- records manual review and leaves the last known entitlement untouched.
    raise exception 'Unknown subscription status';
  end if;
  if is_webhook then
    if p_event_record_id is null then raise exception 'Webhook synchronization requires a claimed event'; end if;
    if not exists (
      select 1 from public.billing_webhook_events
        where id = p_event_record_id and processing_state = 'processing'
    ) then raise exception 'Billing event is not claimed'; end if;
  elsif p_event_record_id is not null then
    raise exception 'Reconciliation cannot carry a webhook receipt';
  end if;

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
  if latest_event is not null and p_observed_at < latest_event then
    if is_webhook then
      update public.billing_webhook_events set
        processing_state = 'ignored', failure_class = null,
        processing_started_at = null, lease_expires_at = null
        where id = p_event_record_id;
    end if;
    return 'stale_ignored';
  end if;

  terminal := p_subscription_status in ('canceled', 'incomplete_expired');
  other_current_exists := exists (
    select 1 from public.billing_subscriptions
      where owner_consumer_id = p_owner_user_id
        and stripe_environment = p_stripe_environment
        and stripe_subscription_id <> p_stripe_subscription_id
        and subscription_status not in ('canceled', 'incomplete_expired')
  );
  if not terminal and other_current_exists then
    -- Another local row still claims to be current. The caller synchronizes
    -- every subscription of the customer (terminal ones first) before this
    -- call, so reaching here means Stripe itself reports two live
    -- subscriptions for one customer: a human decision, never a guess.
    if is_webhook then
      update public.billing_webhook_events set
        processing_state = 'manual_review', failure_class = 'conflicting_current_subscription',
        processing_started_at = null, lease_expires_at = null
        where id = p_event_record_id;
    end if;
    return 'conflicting_current_subscription';
  end if;

  if p_subscription_status = 'trialing' and (
    p_trial_start is null or p_trial_end is null or p_trial_end <> p_trial_start + interval '24 hours'
  ) then
    -- The product sells exactly one 24-hour trial. A trial of another shape
    -- cannot be represented as trial access; it is reviewed, never coerced.
    if is_webhook then
      update public.billing_webhook_events set
        processing_state = 'manual_review', failure_class = 'trial_shape_conflict',
        processing_started_at = null, lease_expires_at = null
        where id = p_event_record_id;
    end if;
    return 'trial_shape_conflict';
  end if;

  -- Payment evidence. Webhook invoice events carry it directly; reconciliation
  -- carries the provider's latest paid invoice timestamp instead.
  projected_first_paid := existing_first_paid;
  if p_event_type in ('invoice.paid', 'invoice.payment_succeeded') then
    projected_first_paid := coalesce(existing_first_paid, p_observed_at);
    projected_last_paid := greatest(coalesce(projected_last_paid, p_observed_at), p_observed_at, projected_first_paid);
    projected_failed_at := null;
    projected_grace_end := null;
  elsif p_event_type = 'invoice.payment_failed' then
    projected_failed_at := coalesce(projected_failed_at, p_observed_at);
    projected_grace_end := case when existing_first_paid is not null
      then coalesce(
        projected_grace_end,
        projected_failed_at + make_interval(days => p_grace_days)
      )
      else null end;
  elsif p_event_type = 'checkout.session.completed' and p_subscription_status = 'active' then
    projected_first_paid := coalesce(existing_first_paid, p_observed_at);
    projected_last_paid := coalesce(projected_last_paid, p_observed_at);
  end if;
  if p_latest_invoice_paid_at is not null then
    projected_first_paid := coalesce(projected_first_paid, p_latest_invoice_paid_at);
    projected_last_paid := greatest(coalesce(projected_last_paid, p_latest_invoice_paid_at), p_latest_invoice_paid_at, projected_first_paid);
  end if;
  if p_subscription_status = 'active' then
    -- Stripe only reports `active` once the latest invoice is settled, so any
    -- earlier failure evidence has been recovered from.
    projected_failed_at := null;
    projected_grace_end := null;
  elsif p_subscription_status = 'past_due' and projected_first_paid is not null and projected_grace_end is null then
    -- A renewal failure whose invoice.payment_failed event was not seen (or
    -- arrived after this snapshot). Grace starts at the first observation and
    -- never extends afterwards.
    projected_failed_at := coalesce(projected_failed_at, p_observed_at);
    projected_grace_end := projected_failed_at + make_interval(days => p_grace_days);
  end if;
  if projected_grace_end is not null and (projected_first_paid is null or projected_failed_at is null) then
    projected_grace_end := null;
  end if;

  insert into public.billing_subscriptions (
    owner_consumer_id, billing_customer_id, stripe_environment,
    stripe_subscription_id, product_key, plan_key, stripe_price_id,
    subscription_status, current_period_start, current_period_end,
    cancel_at_period_end, canceled_at, ended_at, trial_end, latest_invoice_id,
    first_paid_at, last_paid_at, last_payment_failed_at, renewal_grace_ends_at,
    latest_authoritative_event_created_at, last_synchronized_at, last_synchronization_source
  ) values (
    p_owner_user_id, customer_record_id, p_stripe_environment,
    p_stripe_subscription_id, 'math-vocabulary-hunt', 'mathnexa-monthly',
    p_stripe_price_id, p_subscription_status, p_current_period_start,
    p_current_period_end, p_cancel_at_period_end, p_canceled_at, p_ended_at,
    case when p_subscription_status = 'trialing' then p_trial_end else null end,
    p_latest_invoice_id,
    projected_first_paid, projected_last_paid, projected_failed_at,
    projected_grace_end, p_observed_at, statement_timestamp(), p_source
  ) on conflict (stripe_environment, stripe_subscription_id) do update set
    plan_key = excluded.plan_key,
    stripe_price_id = excluded.stripe_price_id,
    subscription_status = excluded.subscription_status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end,
    canceled_at = excluded.canceled_at,
    ended_at = excluded.ended_at,
    trial_end = excluded.trial_end,
    latest_invoice_id = coalesce(excluded.latest_invoice_id, public.billing_subscriptions.latest_invoice_id),
    first_paid_at = excluded.first_paid_at,
    last_paid_at = excluded.last_paid_at,
    last_payment_failed_at = excluded.last_payment_failed_at,
    renewal_grace_ends_at = excluded.renewal_grace_ends_at,
    latest_authoritative_event_created_at = excluded.latest_authoritative_event_created_at,
    last_synchronized_at = excluded.last_synchronized_at,
    last_synchronization_source = excluded.last_synchronization_source
  where public.billing_subscriptions.owner_consumer_id = excluded.owner_consumer_id
    and public.billing_subscriptions.billing_customer_id = excluded.billing_customer_id
  returning id into subscription_record_id;
  if subscription_record_id is null then raise exception 'Billing subscription ownership conflict'; end if;

  if terminal and other_current_exists then
    -- A historical subscription ending can never override the entitlement the
    -- customer's current subscription grants.
    if is_webhook then
      update public.billing_webhook_events set
        processing_state = 'processed', processed_at = statement_timestamp(),
        processing_started_at = null, lease_expires_at = null, failure_class = null
        where id = p_event_record_id;
    end if;
    return 'superseded_ignored';
  end if;

  -- Entitlement projection. Time comparisons against the paid-through boundary
  -- belong to the access gate, which evaluates them with server time on every
  -- request; the projection records the provider's boundary faithfully.
  if p_emergency_default_deny or account_state <> 'active' then
    projected_state := 'subscription-expired';
    projected_period_end := coalesce(p_ended_at, p_current_period_end, p_observed_at);
  elsif p_subscription_status = 'trialing' then
    projected_state := 'trial-active';
    projected_period_end := null;
  elsif p_subscription_status = 'active' then
    projected_state := case when p_cancel_at_period_end
      then 'subscription-canceled-through-period-end' else 'subscription-active' end;
    projected_period_end := p_current_period_end;
  elsif p_subscription_status = 'past_due' and projected_grace_end > statement_timestamp() then
    projected_state := 'subscription-grace-period';
    projected_period_end := coalesce(projected_failed_at, p_observed_at);
  elsif p_subscription_status in ('past_due', 'unpaid', 'incomplete', 'paused') then
    -- Locked but recoverable: the subscription still exists at the provider
    -- and a successful payment restores access automatically.
    projected_state := 'subscription-past-due';
    projected_period_end := p_current_period_end;
  else
    projected_state := 'subscription-expired';
    projected_period_end := coalesce(p_ended_at, p_canceled_at, p_current_period_end, p_observed_at);
  end if;

  insert into public.consumer_game_entitlements (
    user_id, entitlement_state, trial_started_at, trial_ends_at,
    current_period_ends_at, grace_ends_at, source_reference_hash,
    authoritative_version
  ) values (
    p_owner_user_id, projected_state,
    case when projected_state = 'trial-active' then p_trial_start else null end,
    case when projected_state = 'trial-active' then p_trial_end else null end,
    projected_period_end,
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

  if is_webhook then
    update public.billing_webhook_events set
      processing_state = 'processed',
      processed_at = statement_timestamp(),
      processing_started_at = null,
      lease_expires_at = null,
      failure_class = null
      where id = p_event_record_id;
  end if;
  return projected_state;
end;
$$;
revoke all on function public.synchronize_consumer_billing_subscription(
  text, uuid, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, integer, boolean
) from public, anon, authenticated;
grant execute on function public.synchronize_consumer_billing_subscription(
  text, uuid, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, integer, boolean
) to service_role;
comment on function public.synchronize_consumer_billing_subscription is
  'Canonical consumer subscription synchronizer shared by webhook processing and Stripe reconciliation. Stale snapshots are ignored; unknown statuses are refused; a historical subscription never overrides the current one.';

-- Compatibility wrapper: the pre-existing webhook projection entry point now
-- delegates to the canonical synchronizer with source = webhook.
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
language sql
security invoker
set search_path = ''
as $$
  select public.synchronize_consumer_billing_subscription(
    'webhook', p_event_record_id, p_event_type, p_owner_user_id, p_stripe_environment,
    p_stripe_customer_id, p_stripe_subscription_id, p_stripe_price_id, p_subscription_status,
    p_current_period_start, p_current_period_end, p_cancel_at_period_end, p_canceled_at,
    null, p_trial_start, p_trial_end, null, null, p_event_created_at, p_grace_days,
    p_emergency_default_deny
  );
$$;

-- Per-customer reconciliation throttle. Returns true when the caller has won
-- the right to contact the provider now; false when another request did so
-- within the minimum interval. This keeps provider calls bounded even when a
-- denied customer keeps refreshing, and serializes concurrent repairs.
create or replace function public.mark_consumer_billing_reconciliation_attempt(
  p_owner_user_id uuid,
  p_stripe_environment text,
  p_minimum_interval_seconds integer
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare claimed boolean;
begin
  if p_minimum_interval_seconds not between 0 and 86400 then raise exception 'Invalid reconciliation interval'; end if;
  update public.billing_customers
    set last_reconciliation_attempt_at = statement_timestamp()
    where owner_consumer_id = p_owner_user_id
      and stripe_environment = p_stripe_environment
      and (
        last_reconciliation_attempt_at is null or
        last_reconciliation_attempt_at <= statement_timestamp() - make_interval(secs => p_minimum_interval_seconds)
      );
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;
revoke all on function public.mark_consumer_billing_reconciliation_attempt(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.mark_consumer_billing_reconciliation_attempt(uuid, text, integer)
  to service_role;

-- Owner-only admin operation: "Sync with Stripe". Same bounded, idempotent,
-- audited operation contract as the Phase 8G workflows; not sensitive because it
-- only re-reads provider state and re-applies the canonical projection.
create or replace function public.prepare_admin_account_operation(
  p_admin_user_id uuid,p_admin_session_id uuid,p_target_user_id uuid,p_operation text,
  p_idempotency_key text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_sensitive boolean;v_before jsonb;
begin
  v_sensitive:=p_operation in ('revoke-sessions','suspend','restore','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke');
  if p_operation not in ('resend-confirmation','revoke-sessions','suspend','restore','open-portal','cancel-at-period-end','submit-refund-review','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke','sync-billing')
    or p_idempotency_key!~'^[A-Za-z0-9:_-]{16,160}$' then raise exception 'Invalid bounded account operation';end if;
  perform private.require_admin_account_session(p_admin_user_id,p_admin_session_id,v_sensitive);
  if exists(select 1 from public.admin_users where user_id=p_target_user_id and revoked_at is null) then raise exception 'Active admin identities require the emergency admin revocation workflow';end if;
  if v_sensitive and (btrim(coalesce(p_reason,''))='' or char_length(btrim(p_reason))>500) then raise exception 'A bounded operation reason is required';end if;
  v_before:=private.admin_consumer_snapshot(p_target_user_id);
  if v_before is null then raise exception 'Consumer account not found';end if;
  insert into public.admin_account_operations(idempotency_key,admin_user_id,admin_session_id,target_user_id,operation,reason,before_snapshot)
    values(p_idempotency_key,p_admin_user_id,p_admin_session_id,p_target_user_id,p_operation,nullif(btrim(coalesce(p_reason,'')),''),v_before)
    on conflict(idempotency_key) do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.admin_account_operations where idempotency_key=p_idempotency_key
      and admin_user_id=p_admin_user_id and target_user_id=p_target_user_id and operation=p_operation;
    if v_id is null then raise exception 'Idempotency ownership conflict';end if;
  else
    insert into public.admin_audit_log(admin_user_id,action,target,metadata)
      values(p_admin_user_id,'admin.account.operation.prepared',p_target_user_id::text,jsonb_build_object('operation',p_operation,'operation_id',v_id));
  end if;
  return v_id;
end;$$;
revoke all on function public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text) to service_role;

comment on column public.billing_subscriptions.last_synchronized_at is
  'When the row was last written from an authoritative Stripe snapshot (webhook event or reconciliation).';
comment on column public.billing_subscriptions.last_synchronization_source is
  'Which path wrote the last snapshot: webhook, reconciliation, or admin.';
comment on column public.billing_customers.last_reconciliation_attempt_at is
  'Throttle anchor for on-demand Stripe reconciliation; bounded provider calls per customer.';
