begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_column('public', 'billing_customers', 'owner_consumer_id', 'billing customers support isolated consumer ownership');
select has_column('public', 'billing_subscriptions', 'owner_consumer_id', 'subscriptions support isolated consumer ownership');
select has_column('public', 'billing_subscriptions', 'first_paid_at', 'first successful payment is retained');
select has_column('public', 'billing_subscriptions', 'renewal_grace_ends_at', 'renewal grace has an authoritative boundary');
select has_column('public', 'consumer_game_entitlements', 'grace_ends_at', 'consumer access stores a server-owned grace boundary');
select has_index('public', 'billing_subscriptions', 'billing_subscriptions_one_current_per_consumer', 'one current subscription is enforced per consumer');
select has_function('public', 'claim_consumer_trial_redemption', array['uuid','text','timestamp with time zone'], 'one-time trial claim RPC exists');
select has_function(
  'public',
  'apply_consumer_billing_projection',
  array[
    'uuid','text','uuid','text','text','text','text','text',
    'timestamp with time zone','timestamp with time zone','boolean',
    'timestamp with time zone','timestamp with time zone',
    'timestamp with time zone','timestamp with time zone','integer','boolean'
  ],
  'authoritative consumer billing projection RPC exists'
);

set local role service_role;
select lives_ok(
  $$select public.set_platform_identity_model('consumer-v1')$$,
  'isolated Production rehearsal uses the consumer identity model'
);
reset role;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values
  ('a0000000-0000-0000-0000-000000000001','authenticated','authenticated','phase7c-a@example.invalid',crypt('ConsumerPass123',gen_salt('bf')),now(),'{}'),
  ('a0000000-0000-0000-0000-000000000002','authenticated','authenticated','phase7c-b@example.invalid',crypt('ConsumerPass123',gen_salt('bf')),now(),'{"role":"teacher","school":"forged"}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $$select public.claim_consumer_trial_redemption('a0000000-0000-0000-0000-000000000001',repeat('a',64),now())$$,
  '42501', null, 'browser cannot claim or replay a trial'
);
select throws_ok(
  $$select * from public.billing_customers$$,
  '42501', null, 'browser cannot inspect billing customer mappings'
);
select throws_ok(
  $$select * from public.billing_subscriptions$$,
  '42501', null, 'browser cannot inspect or forge subscription projections'
);
reset role;

set local role service_role;
select results_eq(
  $$select public.claim_consumer_trial_redemption('a0000000-0000-0000-0000-000000000001',repeat('a',64),transaction_timestamp())$$,
  $$values ('claimed'::text)$$,
  'service claims the one introductory trial'
);
select results_eq(
  $$select public.claim_consumer_trial_redemption('a0000000-0000-0000-0000-000000000001',repeat('a',64),transaction_timestamp())$$,
  $$values ('already_claimed'::text)$$,
  'an idempotent retry for the same Setup Checkout is safe'
);
select results_eq(
  $$select public.claim_consumer_trial_redemption('a0000000-0000-0000-0000-000000000001',repeat('b',64),transaction_timestamp())$$,
  $$values ('trial_ineligible'::text)$$,
  'a different Checkout cannot receive a second trial'
);
reset role;

insert into public.billing_customers (
  id, owner_consumer_id, stripe_environment, stripe_customer_id
) values (
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'test', 'cus_Phase7CConsumerA'
);
select throws_ok(
  $$insert into public.billing_customers (owner_teacher_id,owner_consumer_id,stripe_environment,stripe_customer_id) values ('a0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','test','cus_Phase7CBothOwners')$$,
  '23514', null, 'a billing record cannot mix legacy and consumer ownership'
);

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000001',
  'evt_Phase7CTrial', 'checkout.session.completed', 'test',
  'cs_Phase7CSetup', transaction_timestamp(), repeat('1',64)
);
set local role service_role;
select ok(
  public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000001'),
  'signed Setup Checkout event receives one processing lease'
);
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000001','checkout.session.completed',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','trialing',
    transaction_timestamp(),transaction_timestamp()+interval '24 hours',
    false,null,transaction_timestamp(),transaction_timestamp()+interval '24 hours',
    transaction_timestamp(),7,false
  )$$,
  $$values ('trial-active'::text)$$,
  'successful Setup Checkout activates an exact 24-hour server-timed trial'
);
select results_eq(
  $$select trial_ends_at-trial_started_at from public.consumer_game_entitlements where user_id='a0000000-0000-0000-0000-000000000001'$$,
  $$values (interval '24 hours')$$,
  'trial duration is exactly 24 hours'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000010',
  'evt_Phase7CTrialCancel', 'customer.subscription.updated', 'test',
  'sub_Phase7CConsumerA', transaction_timestamp()+interval '30 seconds', repeat('a',64)
);
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000010'), 'trial cancellation event is claimed');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000010','customer.subscription.updated',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','trialing',
    transaction_timestamp(),transaction_timestamp()+interval '24 hours',
    true,null,transaction_timestamp(),transaction_timestamp()+interval '24 hours',
    transaction_timestamp()+interval '30 seconds',7,false
  )$$,
  $$values ('trial-active'::text)$$,
  'canceling during trial preserves access only through the original trial end'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000002',
  'evt_Phase7CInitialFailure', 'invoice.payment_failed', 'test',
  'in_Phase7CInitialFailure', transaction_timestamp()+interval '1 minute', repeat('2',64)
);
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000002'), 'initial failure event is claimed');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000002','invoice.payment_failed',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','past_due',
    transaction_timestamp(),transaction_timestamp()+interval '1 month',
    false,null,null,null,transaction_timestamp()+interval '1 minute',7,false
  )$$,
  $$values ('subscription-past-due'::text)$$,
  'failed initial post-trial payment grants no paid access'
);
select is(
  (select renewal_grace_ends_at from public.billing_subscriptions where stripe_subscription_id='sub_Phase7CConsumerA'),
  null::timestamptz,
  'initial payment failure cannot manufacture renewal grace'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000003',
  'evt_Phase7CPaid', 'invoice.paid', 'test',
  'in_Phase7CPaid', transaction_timestamp()+interval '2 minutes', repeat('3',64)
);
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000003'), 'successful payment event is claimed');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000003','invoice.paid',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','active',
    transaction_timestamp(),transaction_timestamp()+interval '1 month',
    false,null,null,null,transaction_timestamp()+interval '2 minutes',7,false
  )$$,
  $$values ('subscription-active'::text)$$,
  'successful first charge unlocks the paid monthly period'
);
select isnt(
  (select first_paid_at from public.billing_subscriptions where stripe_subscription_id='sub_Phase7CConsumerA'),
  null::timestamptz,
  'first successful payment is retained for renewal classification'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values
  ('a2000000-0000-0000-0000-000000000004','evt_Phase7CRenewalFailure','invoice.payment_failed','test','in_Phase7CRenewalFailure',transaction_timestamp()+interval '3 minutes',repeat('4',64)),
  ('a2000000-0000-0000-0000-000000000005','evt_Phase7CRetryFailure','invoice.payment_failed','test','in_Phase7CRetryFailure',transaction_timestamp()+interval '4 minutes',repeat('5',64));
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000004'), 'renewal failure event is claimed');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000004','invoice.payment_failed',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','past_due',
    transaction_timestamp(),transaction_timestamp()+interval '1 month',
    false,null,null,null,transaction_timestamp()+interval '3 minutes',7,false
  )$$,
  $$values ('subscription-grace-period'::text)$$,
  'failed renewal receives the configured seven-day grace period'
);
select results_eq(
  $$select renewal_grace_ends_at-last_payment_failed_at from public.billing_subscriptions where stripe_subscription_id='sub_Phase7CConsumerA'$$,
  $$values (interval '7 days')$$,
  'renewal grace is exactly seven days from the first failed attempt'
);
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000005'), 'retry failure event is claimed');
select lives_ok(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000005','invoice.payment_failed',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','past_due',
    transaction_timestamp(),transaction_timestamp()+interval '1 month',
    false,null,null,null,transaction_timestamp()+interval '4 minutes',7,false
  )$$,
  'provider retries do not fail projection'
);
select results_eq(
  $$select renewal_grace_ends_at-last_payment_failed_at from public.billing_subscriptions where stripe_subscription_id='sub_Phase7CConsumerA'$$,
  $$values (interval '7 days')$$,
  'repeated failures cannot extend the original grace boundary'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000006',
  'evt_Phase7CRecovery', 'invoice.paid', 'test',
  'in_Phase7CRecovery', transaction_timestamp()+interval '5 minutes', repeat('6',64)
);
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000006'), 'payment recovery event is claimed');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000006','invoice.paid',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','active',
    transaction_timestamp(),transaction_timestamp()+interval '1 month',
    false,null,null,null,transaction_timestamp()+interval '5 minutes',7,false
  )$$,
  $$values ('subscription-active'::text)$$,
  'payment recovery restores paid access'
);
select is(
  (select renewal_grace_ends_at from public.billing_subscriptions where stripe_subscription_id='sub_Phase7CConsumerA'),
  null::timestamptz,
  'payment recovery clears grace evidence'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000007',
  'evt_Phase7CCancelAtEnd', 'customer.subscription.updated', 'test',
  'sub_Phase7CConsumerA', transaction_timestamp()+interval '6 minutes', repeat('7',64)
);
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000007'), 'period-end cancellation event is claimed');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000007','customer.subscription.updated',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','active',
    transaction_timestamp(),transaction_timestamp()+interval '1 month',
    true,null,null,null,transaction_timestamp()+interval '6 minutes',7,false
  )$$,
  $$values ('subscription-canceled-through-period-end'::text)$$,
  'period-end cancellation preserves access through the paid boundary'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000008',
  'evt_Phase7CStale', 'customer.subscription.updated', 'test',
  'sub_Phase7CConsumerA', transaction_timestamp()+interval '5 minutes', repeat('8',64)
);
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000008'), 'out-of-order event is claimable for explicit rejection');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000008','customer.subscription.updated',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','active',
    transaction_timestamp(),transaction_timestamp()+interval '2 months',
    false,null,null,null,transaction_timestamp()+interval '5 minutes',7,false
  )$$,
  $$values ('stale_ignored'::text)$$,
  'out-of-order webhook cannot roll billing or access forward'
);
select results_eq(
  $$select entitlement_state from public.consumer_game_entitlements where user_id='a0000000-0000-0000-0000-000000000001'$$,
  $$values ('subscription-canceled-through-period-end'::text)$$,
  'stale event leaves the latest server-owned entitlement unchanged'
);
reset role;

insert into public.billing_webhook_events (
  id, stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'a2000000-0000-0000-0000-000000000009',
  'evt_Phase7CDelete', 'customer.subscription.deleted', 'test',
  'sub_Phase7CConsumerA', transaction_timestamp()+interval '7 minutes', repeat('9',64)
);
set local role service_role;
select ok(public.claim_billing_webhook_event('a2000000-0000-0000-0000-000000000009'), 'subscription deletion event is claimed');
select results_eq(
  $$select public.apply_consumer_billing_projection(
    'a2000000-0000-0000-0000-000000000009','customer.subscription.deleted',
    'a0000000-0000-0000-0000-000000000001','test','cus_Phase7CConsumerA',
    'sub_Phase7CConsumerA','price_Phase7CMonthly','canceled',
    transaction_timestamp(),transaction_timestamp()+interval '7 minutes',
    false,transaction_timestamp()+interval '7 minutes',null,null,
    transaction_timestamp()+interval '7 minutes',7,false
  )$$,
  $$values ('subscription-expired'::text)$$,
  'subscription deletion removes gameplay access'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"a0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is_empty(
  $$select * from public.consumer_game_entitlements$$,
  'account B cannot read account A billing entitlement'
);
select throws_ok(
  $$update public.consumer_game_entitlements set entitlement_state='subscription-active',current_period_ends_at=now()+interval '1 year' where user_id='a0000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'browser state cannot forge or extend game access'
);
reset role;

select * from finish();
rollback;
