alter table public.billing_webhook_events drop constraint billing_webhook_events_processing_state_check;
alter table public.billing_webhook_events add constraint billing_webhook_events_processing_state_check check (processing_state in (
  'received', 'processing', 'processed', 'retryable_failure', 'manual_review', 'ignored'
));
alter table public.billing_webhook_events drop constraint billing_webhook_events_check1;
alter table public.billing_webhook_events add constraint billing_webhook_events_failure_state_check check (
  (processing_state in ('retryable_failure', 'manual_review') and failure_class is not null) or
  processing_state not in ('retryable_failure', 'manual_review')
);
alter table public.billing_webhook_events drop constraint billing_webhook_events_failure_class_check;
alter table public.billing_webhook_events add constraint billing_webhook_events_failure_class_check check (failure_class in (
  'configuration', 'environment_mismatch', 'invalid_owner', 'unknown_plan', 'provider_unavailable',
  'database_unavailable', 'projection_conflict', 'unsupported_payload', 'api_version_mismatch',
  'stale_event', 'ownership_conflict', 'duplicate_subscription'
));
alter table public.billing_webhook_events
  add column processing_started_at timestamptz,
  add column lease_expires_at timestamptz,
  add column last_attempt_at timestamptz,
  add column replay_count integer not null default 0 check (replay_count between 0 and 1000);
alter table public.billing_webhook_events add constraint billing_webhook_processing_lease_check check (
  (processing_state = 'processing' and processing_started_at is not null and lease_expires_at > processing_started_at) or
  (processing_state <> 'processing' and lease_expires_at is null)
);

create or replace function private.prevent_stale_billing_projection()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.latest_authoritative_event_created_at < old.latest_authoritative_event_created_at then
    raise exception 'Stale billing projection rejected';
  end if;
  return new;
end;
$$;
create trigger billing_subscriptions_prevent_stale before update on public.billing_subscriptions
for each row execute function private.prevent_stale_billing_projection();

create or replace function public.claim_billing_webhook_event(p_event_record_id uuid, p_lease_seconds integer default 30)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare claimed boolean;
begin
  if p_lease_seconds not between 5 and 300 then raise exception 'Invalid processing lease'; end if;
  update public.billing_webhook_events
  set processing_state = 'processing',
      processing_started_at = statement_timestamp(),
      lease_expires_at = statement_timestamp() + make_interval(secs => p_lease_seconds),
      last_attempt_at = statement_timestamp(),
      attempt_count = case when processing_state = 'received' then attempt_count else attempt_count + 1 end,
      failure_class = null
  where id = p_event_record_id and (
    processing_state in ('received', 'retryable_failure') or
    (processing_state = 'processing' and lease_expires_at < statement_timestamp())
  );
  get diagnostics claimed = row_count;
  return claimed;
end;
$$;

create or replace function public.finish_billing_webhook_event(
  p_event_record_id uuid, p_state text, p_failure_class text default null, p_replay boolean default false
) returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_state not in ('processed', 'retryable_failure', 'manual_review', 'ignored') then raise exception 'Invalid terminal state'; end if;
  update public.billing_webhook_events set
    processing_state = p_state,
    processed_at = case when p_state = 'processed' then statement_timestamp() else null end,
    processing_started_at = null,
    lease_expires_at = null,
    failure_class = p_failure_class,
    replay_count = replay_count + case when p_replay then 1 else 0 end
  where id = p_event_record_id and processing_state = 'processing';
  if not found then raise exception 'Billing event is not claimed'; end if;
end;
$$;

revoke all on function public.claim_billing_webhook_event(uuid, integer) from public, anon, authenticated;
revoke all on function public.finish_billing_webhook_event(uuid, text, text, boolean) from public, anon, authenticated;
grant execute on function public.claim_billing_webhook_event(uuid, integer) to service_role;
grant execute on function public.finish_billing_webhook_event(uuid, text, text, boolean) to service_role;

create or replace function public.apply_billing_subscription_projection(
  p_event_record_id uuid,
  p_owner_teacher_id uuid,
  p_stripe_environment text,
  p_stripe_customer_id text,
  p_stripe_subscription_id text,
  p_plan_key text,
  p_stripe_price_id text,
  p_subscription_status text,
  p_current_period_start timestamptz,
  p_current_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_canceled_at timestamptz,
  p_event_created_at timestamptz,
  p_entitlement_eligible boolean
) returns text language plpgsql security invoker set search_path = '' as $$
declare
  v_customer_id uuid;
  v_subscription_id uuid;
  v_account_status text;
  v_latest timestamptz;
  v_feature text;
begin
  if not exists (select 1 from public.billing_webhook_events where id = p_event_record_id and processing_state = 'processing') then
    raise exception 'Billing event is not claimed';
  end if;
  select account_status into v_account_status from public.teacher_profiles where user_id = p_owner_teacher_id;
  if v_account_status is null then raise exception 'Billing owner missing'; end if;

  select id into v_customer_id from public.billing_customers
    where owner_teacher_id = p_owner_teacher_id and stripe_environment = p_stripe_environment;
  if v_customer_id is null then
    insert into public.billing_customers (owner_teacher_id, stripe_environment, stripe_customer_id)
      values (p_owner_teacher_id, p_stripe_environment, p_stripe_customer_id) returning id into v_customer_id;
  elsif not exists (select 1 from public.billing_customers where id = v_customer_id and stripe_customer_id = p_stripe_customer_id) then
    raise exception 'Billing ownership conflict';
  end if;

  select latest_authoritative_event_created_at into v_latest from public.billing_subscriptions
    where stripe_environment = p_stripe_environment and stripe_subscription_id = p_stripe_subscription_id;
  if v_latest is not null and p_event_created_at < v_latest then
    update public.billing_webhook_events set processing_state = 'ignored', failure_class = null,
      processing_started_at = null, lease_expires_at = null
      where id = p_event_record_id;
    return 'stale_ignored';
  end if;

  insert into public.billing_subscriptions (
    owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id,
    product_key, plan_key, stripe_price_id, subscription_status, current_period_start,
    current_period_end, cancel_at_period_end, canceled_at, latest_authoritative_event_created_at
  ) values (
    p_owner_teacher_id, v_customer_id, p_stripe_environment, p_stripe_subscription_id,
    'math-vocabulary-hunt', p_plan_key, p_stripe_price_id, p_subscription_status,
    p_current_period_start, p_current_period_end, p_cancel_at_period_end, p_canceled_at,
    p_event_created_at
  ) on conflict (stripe_environment, stripe_subscription_id) do update set
    plan_key = excluded.plan_key, stripe_price_id = excluded.stripe_price_id,
    subscription_status = excluded.subscription_status,
    current_period_start = excluded.current_period_start, current_period_end = excluded.current_period_end,
    cancel_at_period_end = excluded.cancel_at_period_end, canceled_at = excluded.canceled_at,
    latest_authoritative_event_created_at = excluded.latest_authoritative_event_created_at
  where billing_subscriptions.owner_teacher_id = excluded.owner_teacher_id
    and billing_subscriptions.billing_customer_id = excluded.billing_customer_id
  returning id into v_subscription_id;
  if v_subscription_id is null then raise exception 'Billing subscription ownership conflict'; end if;

  update public.product_entitlements set status = 'revoked', expires_at = coalesce(expires_at, statement_timestamp())
    where teacher_user_id = p_owner_teacher_id and source = 'subscription' and status = 'active';

  if p_entitlement_eligible and v_account_status = 'active' and p_subscription_status = 'active'
     and p_current_period_end > statement_timestamp() then
    foreach v_feature in array array['complete-library', 'classroom-tools', 'premium-game-modes'] loop
      update public.product_entitlements set status = 'active', starts_at = coalesce(p_current_period_start, statement_timestamp()),
        expires_at = p_current_period_end, billing_subscription_id = v_subscription_id,
        source_reference = p_stripe_subscription_id
        where teacher_user_id = p_owner_teacher_id and product_key = 'math-vocabulary-hunt'
          and scope = 'feature' and feature_key = v_feature and source = 'subscription';
      if not found then
        begin
          insert into public.product_entitlements (
            teacher_user_id, product_key, scope, feature_key, status, source,
            source_reference, billing_subscription_id, starts_at, expires_at
          ) values (
            p_owner_teacher_id, 'math-vocabulary-hunt', 'feature', v_feature, 'active',
            'subscription', p_stripe_subscription_id, v_subscription_id,
            coalesce(p_current_period_start, statement_timestamp()), p_current_period_end
          );
        exception when unique_violation then raise exception 'Entitlement provenance conflict';
        end;
      end if;
    end loop;
  end if;

  update public.billing_webhook_events set processing_state = 'processed', processed_at = statement_timestamp(),
    processing_started_at = null, lease_expires_at = null, failure_class = null
    where id = p_event_record_id;
  return case when p_entitlement_eligible and v_account_status = 'active' and p_subscription_status = 'active'
    and p_current_period_end > statement_timestamp() then 'active' else 'denied' end;
end;
$$;
revoke all on function public.apply_billing_subscription_projection(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz, boolean) from public, anon, authenticated;
grant execute on function public.apply_billing_subscription_projection(uuid, uuid, text, text, text, text, text, text, timestamptz, timestamptz, boolean, timestamptz, timestamptz, boolean) to service_role;
