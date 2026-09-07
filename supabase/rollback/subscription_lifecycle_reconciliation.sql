-- Rollback for 20260907130000_subscription_lifecycle_reconciliation.sql.
-- Restores the Phase 7C projection entry point and removes the reconciliation
-- surface. Billing evidence rows are preserved; only the synchronization
-- metadata columns added by the migration are dropped.
-- Apply only after the application build that calls the synchronizer has been
-- rolled back, otherwise webhook processing fails closed (503, Stripe retries).

drop function if exists public.mark_consumer_billing_reconciliation_attempt(uuid, text, integer);
drop function if exists public.apply_consumer_billing_projection(
  uuid, text, uuid, text, text, text, text, text, timestamptz,
  timestamptz, boolean, timestamptz, timestamptz, timestamptz,
  timestamptz, integer, boolean
);
drop function if exists public.synchronize_consumer_billing_subscription(
  text, uuid, text, uuid, text, text, text, text, text, timestamptz, timestamptz, boolean,
  timestamptz, timestamptz, timestamptz, timestamptz, text, timestamptz, timestamptz, integer, boolean
);

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

create or replace function public.prepare_admin_account_operation(
  p_admin_user_id uuid,p_admin_session_id uuid,p_target_user_id uuid,p_operation text,
  p_idempotency_key text,p_reason text
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_sensitive boolean;v_before jsonb;
begin
  v_sensitive:=p_operation in ('revoke-sessions','suspend','restore','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke');
  if p_operation not in ('resend-confirmation','revoke-sessions','suspend','restore','open-portal','cancel-at-period-end','submit-refund-review','deny-refund-review','grant-complimentary','remove-complimentary','emergency-revoke')
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

alter table public.billing_webhook_events
  drop constraint billing_webhook_events_failure_class_check;
alter table public.billing_webhook_events
  add constraint billing_webhook_events_failure_class_check check (failure_class in (
    'configuration', 'environment_mismatch', 'invalid_owner', 'unknown_plan', 'provider_unavailable',
    'database_unavailable', 'projection_conflict', 'unsupported_payload', 'api_version_mismatch',
    'stale_event', 'ownership_conflict', 'duplicate_subscription'
  ));
-- Receipts already recorded for invoice.payment_succeeded must be renamed
-- before the narrower event-type constraint can be restored.
update public.billing_webhook_events set event_type = 'invoice.paid' where event_type = 'invoice.payment_succeeded';
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

alter table public.billing_subscriptions
  drop constraint if exists billing_subscriptions_latest_invoice_id_check,
  drop constraint if exists billing_subscriptions_synchronization_source_check;
alter table public.billing_subscriptions
  drop column if exists ended_at,
  drop column if exists latest_invoice_id,
  drop column if exists last_synchronized_at,
  drop column if exists last_synchronization_source;
alter table public.billing_customers
  drop column if exists last_reconciliation_attempt_at;
