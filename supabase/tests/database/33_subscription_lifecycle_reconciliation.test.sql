begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Subscription lifecycle reliability: the canonical synchronizer must keep the
-- local projection and the derived entitlement in step with Stripe across
-- trial -> payment 1 -> payment 2 -> payment 3 -> payment 4, duplicate and
-- out-of-order deliveries, reconciliation without any webhook, cancellation at
-- period end, failed/recovered renewals, historical-vs-current subscriptions,
-- and unknown provider statuses.

select has_column('public', 'billing_subscriptions', 'last_synchronized_at', 'subscriptions record when they were last confirmed against the provider');
select has_column('public', 'billing_subscriptions', 'last_synchronization_source', 'subscriptions record which path confirmed them');
select has_column('public', 'billing_subscriptions', 'ended_at', 'subscriptions record the provider end timestamp');
select has_column('public', 'billing_customers', 'last_reconciliation_attempt_at', 'customers carry the reconciliation throttle anchor');
select has_function('public', 'synchronize_consumer_billing_subscription', 'canonical synchronizer exists');
select has_function('public', 'mark_consumer_billing_reconciliation_attempt', array['uuid', 'text', 'integer'], 'reconciliation throttle exists');

set local role service_role;
select lives_ok($$select public.set_platform_identity_model('consumer-v1')$$, 'consumer identity model selected');
reset role;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('a0000000-0000-0000-0000-000000000031', 'authenticated', 'authenticated', 'lifecycle-a@example.invalid', crypt('ConsumerPass123', gen_salt('bf')), now(), '{}'),
  ('a0000000-0000-0000-0000-000000000032', 'authenticated', 'authenticated', 'lifecycle-b@example.invalid', crypt('ConsumerPass123', gen_salt('bf')), now(), '{}');

insert into public.billing_customers (id, owner_consumer_id, stripe_environment, stripe_customer_id) values
  ('a1000000-0000-0000-0000-000000000031', 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA'),
  ('a1000000-0000-0000-0000-000000000032', 'a0000000-0000-0000-0000-000000000032', 'test', 'cus_LifecycleB');

-- Event receipts for the webhook-sourced steps. Timestamps are the provider
-- authority timestamps (event.created); all in the past, monthly cadence.
insert into public.billing_webhook_events (id, stripe_event_id, event_type, stripe_environment, stripe_object_id, event_created_at, payload_sha256) values
  ('b2000000-0000-0000-0000-000000000001', 'evt_LcTrial',     'checkout.session.completed',    'test', 'cs_LcSetup',   timestamptz '2026-03-01 12:00:00+00', repeat('1', 64)),
  ('b2000000-0000-0000-0000-000000000002', 'evt_LcActive',    'customer.subscription.updated', 'test', 'sub_LcA',      timestamptz '2026-03-02 12:00:00+00', repeat('2', 64)),
  ('b2000000-0000-0000-0000-000000000003', 'evt_LcPaid1',     'invoice.paid',                  'test', 'in_LcPaid1',   timestamptz '2026-03-02 13:00:00+00', repeat('3', 64)),
  ('b2000000-0000-0000-0000-000000000004', 'evt_LcRenew2',    'customer.subscription.updated', 'test', 'sub_LcA',      timestamptz '2026-04-02 12:00:00+00', repeat('4', 64)),
  ('b2000000-0000-0000-0000-000000000005', 'evt_LcPaid2',     'invoice.payment_succeeded',     'test', 'in_LcPaid2',   timestamptz '2026-04-02 13:00:00+00', repeat('5', 64)),
  ('b2000000-0000-0000-0000-000000000006', 'evt_LcRenew3',    'customer.subscription.updated', 'test', 'sub_LcA',      timestamptz '2026-05-02 12:00:00+00', repeat('6', 64)),
  ('b2000000-0000-0000-0000-000000000007', 'evt_LcPaid3',     'invoice.paid',                  'test', 'in_LcPaid3',   timestamptz '2026-05-02 13:00:00+00', repeat('7', 64)),
  ('b2000000-0000-0000-0000-000000000008', 'evt_LcPaid4',     'invoice.paid',                  'test', 'in_LcPaid4',   timestamptz '2026-06-02 13:00:00+00', repeat('8', 64)),
  ('b2000000-0000-0000-0000-000000000009', 'evt_LcRenew4Late','customer.subscription.updated', 'test', 'sub_LcA',      timestamptz '2026-06-02 12:00:00+00', repeat('9', 64)),
  ('b2000000-0000-0000-0000-000000000010', 'evt_LcPaid4Dup',  'invoice.paid',                  'test', 'in_LcPaid4',   timestamptz '2026-06-02 13:00:00+00', repeat('a', 64)),
  ('b2000000-0000-0000-0000-000000000011', 'evt_LcReplayOld', 'customer.subscription.updated', 'test', 'sub_LcA',      timestamptz '2026-03-02 12:00:00+00', repeat('b', 64)),
  ('b2000000-0000-0000-0000-000000000012', 'evt_LcCancelEnd', 'customer.subscription.updated', 'test', 'sub_LcA',      transaction_timestamp() + interval '1 minute', repeat('c', 64)),
  ('b2000000-0000-0000-0000-000000000013', 'evt_LcResume',    'customer.subscription.updated', 'test', 'sub_LcA',      transaction_timestamp() + interval '2 minutes', repeat('d', 64)),
  ('b2000000-0000-0000-0000-000000000014', 'evt_LcFail6',     'invoice.payment_failed',        'test', 'in_LcFail6',   transaction_timestamp() + interval '3 minutes', repeat('e', 64)),
  ('b2000000-0000-0000-0000-000000000015', 'evt_LcFail6Retry','invoice.payment_failed',        'test', 'in_LcFail6',   transaction_timestamp() + interval '4 minutes', repeat('f', 64)),
  ('b2000000-0000-0000-0000-000000000016', 'evt_LcRecover',   'invoice.paid',                  'test', 'in_LcPaid6',   transaction_timestamp() + interval '5 minutes', repeat('0', 64)),
  ('b2000000-0000-0000-0000-000000000017', 'evt_LcDeleted',   'customer.subscription.deleted', 'test', 'sub_LcA',      transaction_timestamp() + interval '6 minutes', repeat('1', 63) || '2'),
  ('b2000000-0000-0000-0000-000000000021', 'evt_LcBOld',      'customer.subscription.updated', 'test', 'sub_LcOld',    timestamptz '2026-05-01 12:00:00+00', repeat('2', 63) || '3'),
  ('b2000000-0000-0000-0000-000000000022', 'evt_LcBOldLate',  'customer.subscription.deleted', 'test', 'sub_LcOld',    transaction_timestamp() + interval '7 minutes', repeat('3', 63) || '4'),
  ('b2000000-0000-0000-0000-000000000023', 'evt_LcBThird',    'customer.subscription.created', 'test', 'sub_LcThird',  transaction_timestamp() + interval '8 minutes', repeat('4', 63) || '5');

set local role service_role;

-- Convenience: one call shape for the webhook-sourced synchronizer.
create or replace function pg_temp.sync_webhook(
  p_event uuid, p_type text, p_owner uuid, p_customer text, p_sub text, p_status text,
  p_start timestamptz, p_end timestamptz, p_cancel boolean, p_canceled timestamptz, p_ended timestamptz,
  p_trial_start timestamptz, p_trial_end timestamptz, p_observed timestamptz
) returns text language sql as $$
  select public.synchronize_consumer_billing_subscription(
    'webhook', p_event, p_type, p_owner, 'test', p_customer, p_sub, 'price_LcMonthly', p_status,
    p_start, p_end, p_cancel, p_canceled, p_ended, p_trial_start, p_trial_end, null, null, p_observed, 7, false);
$$;

-- ---------------------------------------------------------------------------
-- Trial -> payment 1 -> payment 2 -> payment 3 -> payment 4
-- ---------------------------------------------------------------------------
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000001'), 'trial event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000001', 'checkout.session.completed', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'trialing',
    timestamptz '2026-03-01 12:00:00+00', timestamptz '2026-03-02 12:00:00+00', false, null, null,
    timestamptz '2026-03-01 12:00:00+00', timestamptz '2026-03-02 12:00:00+00', timestamptz '2026-03-01 12:00:00+00'),
  'trial-active', 'trial grants access');
select is((select last_synchronization_source from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), 'webhook', 'webhook path records its source');
select isnt((select last_synchronized_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), null::timestamptz, 'synchronization timestamp recorded');

select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000002'), 'trial-to-active event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000002', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-03-02 12:00:00+00', timestamptz '2026-04-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-03-02 12:00:00+00'),
  'subscription-active', 'trial converts to the first paid period with no access gap');
select is((select current_period_ends_at from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), timestamptz '2026-04-02 12:00:00+00', 'entitlement carries the first paid boundary');

select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000003'), 'payment 1 claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000003', 'invoice.paid', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-03-02 12:00:00+00', timestamptz '2026-04-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-03-02 13:00:00+00'),
  'subscription-active', 'payment 1 keeps access');
select is((select first_paid_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-03-02 13:00:00+00', 'first payment retained');

select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000004'), 'renewal 2 claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000004', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-04-02 12:00:00+00', timestamptz '2026-05-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-04-02 12:00:00+00'),
  'subscription-active', 'SECOND SUCCESSFUL RECURRING RENEWAL KEEPS SUBSCRIBER ACCESS');
select is((select current_period_end from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-05-02 12:00:00+00', 'renewal 2 advances the local period end');
select is((select current_period_ends_at from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), timestamptz '2026-05-02 12:00:00+00', 'renewal 2 advances the entitlement boundary');

select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000005'), 'payment 2 (payment_succeeded alias) claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000005', 'invoice.paid', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-04-02 12:00:00+00', timestamptz '2026-05-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-04-02 13:00:00+00'),
  'subscription-active', 'payment 2 keeps access');
select is((select last_paid_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-04-02 13:00:00+00', 'payment 2 advances last paid');
select is((select first_paid_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-03-02 13:00:00+00', 'first payment never moves');

select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000006'), 'renewal 3 claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000006', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-05-02 12:00:00+00', timestamptz '2026-06-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-05-02 12:00:00+00'),
  'subscription-active', 'third renewal keeps access');
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000007'), 'payment 3 claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000007', 'invoice.paid', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-05-02 12:00:00+00', timestamptz '2026-06-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-05-02 13:00:00+00'),
  'subscription-active', 'payment 3 keeps access');
select is((select current_period_ends_at from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), timestamptz '2026-06-02 12:00:00+00', 'period 3 boundary projected');

-- Renewal 4 arrives out of order: the paid invoice first, the period update later.
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000008'), 'payment 4 claimed before its period update');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000008', 'invoice.paid', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-06-02 12:00:00+00', timestamptz '2026-07-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-06-02 13:00:00+00'),
  'subscription-active', 'fourth renewal keeps access when invoice.paid arrives first');
select is((select current_period_end from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-07-02 12:00:00+00', 'period 4 written from the authoritative snapshot carried by the invoice event');
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000009'), 'late period-update event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000009', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-06-02 12:00:00+00', timestamptz '2026-07-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-06-02 12:00:00+00'),
  'stale_ignored', 'an older snapshot delivered late is ignored');
select is((select current_period_end from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-07-02 12:00:00+00', 'out-of-order delivery converges on the same period');
select is((select processing_state from public.billing_webhook_events where id = 'b2000000-0000-0000-0000-000000000009'), 'ignored', 'the late event is recorded as ignored');

-- Duplicate delivery of the same renewal (different event id, same content).
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000010'), 'duplicate renewal delivery claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000010', 'invoice.paid', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-06-02 12:00:00+00', timestamptz '2026-07-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-06-02 13:00:00+00'),
  'subscription-active', 'duplicate delivery is idempotent');
select is((select count(*) from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), 1::bigint, 'duplicate delivery creates no duplicate subscription row');
select is((select count(*) from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), 1::bigint, 'duplicate delivery creates no duplicate entitlement');
select is((select last_paid_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-06-02 13:00:00+00', 'duplicate delivery does not move payment evidence');

-- A signed but very old event replayed later cannot roll the period back.
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000011'), 'old replayed event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000011', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-03-02 12:00:00+00', timestamptz '2026-04-02 12:00:00+00', false, null, null, null, null, timestamptz '2026-03-02 12:00:00+00'),
  'stale_ignored', 'an old valid event cannot regress the period');
select is((select current_period_end from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-07-02 12:00:00+00', 'period end unchanged after old replay');

-- ---------------------------------------------------------------------------
-- The owner's defect: renewal 5 was charged but no event ever landed. The local
-- boundary (2026-07-02) is in the past. Reconciliation re-reads Stripe and
-- repairs the record with no webhook receipt at all.
-- ---------------------------------------------------------------------------
select is(
  public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA', 'sub_LcA', 'price_LcMonthly', 'active',
    timestamptz '2026-07-02 12:00:00+00', timestamptz '2026-08-02 12:00:00+00', false, null, null, null, null,
    'in_LcPaid5', timestamptz '2026-07-02 13:00:00+00', transaction_timestamp(), 7, false),
  'subscription-active', 'stale local ended + Stripe active reconciles to active');
select is((select current_period_end from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-08-02 12:00:00+00', 'reconciliation advances the local period');
select is((select current_period_ends_at from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), timestamptz '2026-08-02 12:00:00+00', 'reconciliation advances the entitlement boundary');
select is((select last_synchronization_source from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), 'reconciliation', 'reconciliation records its source');
select is((select last_paid_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-07-02 13:00:00+00', 'provider paid evidence is retained by reconciliation');
select is((select latest_invoice_id from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), 'in_LcPaid5', 'latest invoice reference retained');
select throws_ok(
  $$select public.synchronize_consumer_billing_subscription('reconciliation', 'b2000000-0000-0000-0000-000000000001', null, 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA', 'sub_LcA', 'price_LcMonthly', 'active', timestamptz '2026-07-02 12:00:00+00', timestamptz '2026-08-02 12:00:00+00', false, null, null, null, null, null, null, transaction_timestamp(), 7, false)$$,
  'P0001', 'Reconciliation cannot carry a webhook receipt', 'reconciliation and webhook bookkeeping cannot be mixed');

-- Cancel at period end keeps access through the paid boundary; resuming restores renewal.
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000012'), 'cancel-at-period-end event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000012', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-07-02 12:00:00+00', timestamptz '2026-08-02 12:00:00+00', true, transaction_timestamp(), null, null, null, transaction_timestamp() + interval '1 minute'),
  'subscription-canceled-through-period-end', 'cancel_at_period_end keeps access until the boundary');
select is((select current_period_ends_at from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), timestamptz '2026-08-02 12:00:00+00', 'cancellation does not shorten the paid boundary');
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000013'), 'resume event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000013', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-07-02 12:00:00+00', timestamptz '2026-08-02 12:00:00+00', false, null, null, null, null, transaction_timestamp() + interval '2 minutes'),
  'subscription-active', 'resuming renewal restores the active projection');

-- Renewal 6 fails: grace once, non-extending, then recovery.
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000014'), 'renewal failure claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000014', 'invoice.payment_failed', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'past_due',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, null, null, transaction_timestamp() + interval '3 minutes'),
  'subscription-grace-period', 'a failed renewal after prior payment enters grace');
select is((select renewal_grace_ends_at - last_payment_failed_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), interval '7 days', 'grace is exactly the configured seven days');
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000015'), 'retry failure claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000015', 'invoice.payment_failed', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'past_due',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, null, null, transaction_timestamp() + interval '4 minutes'),
  'subscription-grace-period', 'retry failure stays in grace');
select is((select last_payment_failed_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), transaction_timestamp() + interval '3 minutes', 'retries never extend the grace boundary');
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000016'), 'recovery claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000016', 'invoice.paid', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'active',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, null, null, transaction_timestamp() + interval '5 minutes'),
  'subscription-active', 'payment recovery restores access automatically');
select is((select renewal_grace_ends_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), null::timestamptz, 'recovery clears grace evidence');

-- past_due discovered by reconciliation with no failure event seen.
select is(
  public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA', 'sub_LcA', 'price_LcMonthly', 'past_due',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, null, null, null, null,
    transaction_timestamp() + interval '6 minutes', 7, false),
  'subscription-grace-period', 'a renewal failure discovered by reconciliation starts grace at first observation');
select is((select renewal_grace_ends_at - last_payment_failed_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), interval '7 days', 'reconciliation-discovered grace is the same seven days');

-- Locked-but-recoverable statuses are payment attention, never "ended".
select is(
  public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA', 'sub_LcA', 'price_LcMonthly', 'unpaid',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, null, null, null, null,
    transaction_timestamp() + interval '6 minutes', 7, false),
  'subscription-past-due', 'unpaid is locked but recoverable, not ended');
select is(
  public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA', 'sub_LcA', 'price_LcMonthly', 'active',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, null, null, null, transaction_timestamp() + interval '6 minutes',
    transaction_timestamp() + interval '6 minutes', 7, false),
  'subscription-active', 'active after unpaid restores access');

-- Unknown provider status is refused, never coerced into "ended".
select throws_ok(
  $$select public.synchronize_consumer_billing_subscription('reconciliation', null, null, 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA', 'sub_LcA', 'price_LcMonthly', 'brand_new_status', timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, null, null, null, null, transaction_timestamp() + interval '6 minutes', 7, false)$$,
  'P0001', 'Unknown subscription status', 'unknown status raises instead of revoking');
select is((select entitlement_state from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), 'subscription-active', 'unknown status leaves the last known entitlement untouched');

-- A trial of another shape is reviewed, not projected.
select is(
  public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, 'a0000000-0000-0000-0000-000000000031', 'test', 'cus_LifecycleA', 'sub_LcA', 'price_LcMonthly', 'trialing',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, null, null, timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-08-05 12:00:00+00', null, null,
    transaction_timestamp() + interval '6 minutes', 7, false),
  'trial_shape_conflict', 'a non-24-hour trial is refused for review');
select is((select entitlement_state from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), 'subscription-active', 'refused trial shape leaves the entitlement untouched');

-- Genuine end: the provider says canceled, access stops honestly.
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000017'), 'deletion event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000017', 'customer.subscription.deleted', 'a0000000-0000-0000-0000-000000000031', 'cus_LifecycleA', 'sub_LcA', 'canceled',
    timestamptz '2026-08-02 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', false, timestamptz '2026-08-20 12:00:00+00', timestamptz '2026-09-02 12:00:00+00', null, null, transaction_timestamp() + interval '6 minutes'),
  'subscription-expired', 'a provider-confirmed end removes access');
select is((select current_period_ends_at from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000031'), timestamptz '2026-09-02 12:00:00+00', 'expired entitlement records the provider end timestamp');
select is((select ended_at from public.billing_subscriptions where stripe_subscription_id = 'sub_LcA'), timestamptz '2026-09-02 12:00:00+00', 'provider end timestamp retained');

-- ---------------------------------------------------------------------------
-- Old canceled + new active for one customer: the current subscription wins.
-- ---------------------------------------------------------------------------
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000021'), 'old subscription event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000021', 'customer.subscription.updated', 'a0000000-0000-0000-0000-000000000032', 'cus_LifecycleB', 'sub_LcOld', 'active',
    timestamptz '2026-05-01 12:00:00+00', timestamptz '2026-06-01 12:00:00+00', false, null, null, null, null, timestamptz '2026-05-01 12:00:00+00'),
  'subscription-active', 'old subscription starts active');
-- Its cancellation event was never received. Stripe now reports it canceled
-- and a new subscription active. The caller synchronizes terminal first.
select is(
  public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, 'a0000000-0000-0000-0000-000000000032', 'test', 'cus_LifecycleB', 'sub_LcOld', 'price_LcMonthly', 'canceled',
    timestamptz '2026-05-01 12:00:00+00', timestamptz '2026-06-01 12:00:00+00', false, timestamptz '2026-05-20 12:00:00+00', timestamptz '2026-06-01 12:00:00+00', null, null, null, null,
    transaction_timestamp(), 7, false),
  'subscription-expired', 'the historical subscription is closed by reconciliation');
select is(
  public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, 'a0000000-0000-0000-0000-000000000032', 'test', 'cus_LifecycleB', 'sub_LcNew', 'price_LcMonthly', 'active',
    timestamptz '2026-08-15 12:00:00+00', timestamptz '2026-09-15 12:00:00+00', false, null, null, null, null, null, null,
    transaction_timestamp(), 7, false),
  'subscription-active', 'old canceled + new active resolves to the new active subscription');
select is((select current_period_ends_at from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000032'), timestamptz '2026-09-15 12:00:00+00', 'entitlement follows the new subscription');
-- A late final event for the OLD subscription must not override the new one.
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000022'), 'late old-subscription deletion claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000022', 'customer.subscription.deleted', 'a0000000-0000-0000-0000-000000000032', 'cus_LifecycleB', 'sub_LcOld', 'canceled',
    timestamptz '2026-05-01 12:00:00+00', timestamptz '2026-06-01 12:00:00+00', false, timestamptz '2026-05-20 12:00:00+00', timestamptz '2026-06-01 12:00:00+00', null, null, transaction_timestamp() + interval '7 minutes'),
  'superseded_ignored', 'a historical subscription ending cannot override the current entitlement');
select is((select entitlement_state from public.consumer_game_entitlements where user_id = 'a0000000-0000-0000-0000-000000000032'), 'subscription-active', 'new subscription entitlement survives the late old event');
select is((select processing_state from public.billing_webhook_events where id = 'b2000000-0000-0000-0000-000000000022'), 'processed', 'the superseded event is still acknowledged as processed');
-- Two live subscriptions at the provider is a human decision.
select ok(public.claim_billing_webhook_event('b2000000-0000-0000-0000-000000000023'), 'third subscription event claimed');
select is(
  pg_temp.sync_webhook('b2000000-0000-0000-0000-000000000023', 'customer.subscription.created', 'a0000000-0000-0000-0000-000000000032', 'cus_LifecycleB', 'sub_LcThird', 'active',
    timestamptz '2026-08-20 12:00:00+00', timestamptz '2026-09-20 12:00:00+00', false, null, null, null, null, transaction_timestamp() + interval '8 minutes'),
  'conflicting_current_subscription', 'a second live subscription is refused, not chosen');
select is((select processing_state || ':' || failure_class from public.billing_webhook_events where id = 'b2000000-0000-0000-0000-000000000023'), 'manual_review:conflicting_current_subscription', 'the conflict is recorded for review');
select is((select count(*) from public.billing_subscriptions where owner_consumer_id = 'a0000000-0000-0000-0000-000000000032' and subscription_status not in ('canceled', 'incomplete_expired')), 1::bigint, 'exactly one current subscription row per customer');

-- ---------------------------------------------------------------------------
-- Throttle and compatibility surfaces.
-- ---------------------------------------------------------------------------
select ok(public.mark_consumer_billing_reconciliation_attempt('a0000000-0000-0000-0000-000000000031', 'test', 300), 'first reconciliation attempt is claimed');
select ok(not public.mark_consumer_billing_reconciliation_attempt('a0000000-0000-0000-0000-000000000031', 'test', 300), 'a second attempt inside the interval is throttled');
select ok(public.mark_consumer_billing_reconciliation_attempt('a0000000-0000-0000-0000-000000000031', 'test', 0), 'a zero interval always claims (forced sync)');
select ok(not public.mark_consumer_billing_reconciliation_attempt('a0000000-0000-0000-0000-000000000099', 'test', 0), 'unknown customers cannot claim');
select lives_ok(
  $$insert into public.billing_webhook_events (stripe_event_id, event_type, stripe_environment, stripe_object_id, event_created_at, payload_sha256) values ('evt_LcAlias', 'invoice.payment_succeeded', 'test', 'in_LcAlias', transaction_timestamp(), repeat('5', 63) || '6')$$,
  'invoice.payment_succeeded receipts are accepted');
reset role;

-- Browser roles gain nothing from the new surface.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-000000000032","role":"authenticated"}', true);
select throws_ok(
  $$select public.synchronize_consumer_billing_subscription('reconciliation', null, null, 'a0000000-0000-0000-0000-000000000032', 'test', 'cus_LifecycleB', 'sub_LcNew', 'price_LcMonthly', 'active', timestamptz '2026-08-15 12:00:00+00', timestamptz '2027-09-15 12:00:00+00', false, null, null, null, null, null, null, transaction_timestamp(), 7, false)$$,
  '42501', null, 'a browser session cannot synchronize or extend its own subscription');
select throws_ok(
  $$select public.mark_consumer_billing_reconciliation_attempt('a0000000-0000-0000-0000-000000000032', 'test', 0)$$,
  '42501', null, 'a browser session cannot touch the reconciliation throttle');
reset role;

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
