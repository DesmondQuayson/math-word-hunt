begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'legacy-preview'
\ir ../helpers/select-identity-model.psql

insert into public.billing_webhook_events (id, stripe_event_id, event_type, stripe_environment, event_created_at, payload_sha256) values
  ('51000000-0000-0000-0000-000000000001', 'evt_ClaimOne', 'invoice.paid', 'test', now(), repeat('a', 64));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"50000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000001')$$, '42501', null, 'browser cannot claim billing events');
select throws_ok($$select public.finish_billing_webhook_event('51000000-0000-0000-0000-000000000001', 'processed')$$, '42501', null, 'browser cannot finish billing events');
reset role;

set local role service_role;
select ok(public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000001'), 'service claims a received event');
select isnt(public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000001'), true, 'concurrent claim is denied while lease is active');
select results_eq($$select processing_state, attempt_count from public.billing_webhook_events where id = '51000000-0000-0000-0000-000000000001'$$, $$values ('processing'::text, 1)$$, 'first processing attempt is tracked');
select lives_ok($$select public.finish_billing_webhook_event('51000000-0000-0000-0000-000000000001', 'retryable_failure', 'provider_unavailable')$$, 'retryable infrastructure failure is recorded');
select ok(public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000001'), 'retryable event can be reclaimed');
select results_eq($$select attempt_count from public.billing_webhook_events where id = '51000000-0000-0000-0000-000000000001'$$, $$values (2)$$, 'retry increments safe attempt count');
select lives_ok($$select public.finish_billing_webhook_event('51000000-0000-0000-0000-000000000001', 'processed', null, true)$$, 'processed replay is recorded');
select results_eq($$select processing_state, replay_count from public.billing_webhook_events where id = '51000000-0000-0000-0000-000000000001'$$, $$values ('processed'::text, 1)$$, 'processed state and replay count persist');
select isnt(public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000001'), true, 'processed event cannot be reclaimed');
reset role;

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('50000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'billing-ops@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing Ops"}'::jsonb);
insert into public.billing_customers (id, owner_teacher_id, stripe_environment, stripe_customer_id) values
  ('52000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'test', 'cus_BillingOps');
insert into public.billing_subscriptions (id, owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id, product_key, plan_key, stripe_price_id, subscription_status, current_period_start, current_period_end, latest_authoritative_event_created_at) values
  ('53000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'test', 'sub_BillingOps', 'math-vocabulary-hunt', 'teacher-pro-monthly', 'price_BillingOps', 'active', now(), now() + interval '30 days', now());
select throws_ok($$update public.billing_subscriptions set latest_authoritative_event_created_at = now() - interval '1 day' where id = '53000000-0000-0000-0000-000000000001'$$, 'P0001', 'Stale billing projection rejected', 'stale event cannot roll projection backward');

insert into public.billing_webhook_events (id, stripe_event_id, event_type, stripe_environment, stripe_object_id, event_created_at, payload_sha256) values
  ('51000000-0000-0000-0000-000000000002', 'evt_ProjectActive', 'customer.subscription.updated', 'test', 'sub_BillingOps', now() + interval '1 minute', repeat('b', 64));
set local role service_role;
select ok(public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000002'), 'active projection event is claimed');
select results_eq(
  $$select public.apply_billing_subscription_projection('51000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001', 'test', 'cus_BillingOps', 'sub_BillingOps', 'teacher-pro-monthly', 'price_BillingOps', 'active', now(), now() + interval '30 days', false, null, now() + interval '1 minute', true)$$,
  $$values ('active'::text)$$, 'verified active projection grants eligible state'
);
select results_eq($$select count(*)::bigint from public.product_entitlements where teacher_user_id = '50000000-0000-0000-0000-000000000001' and source = 'subscription' and status = 'active'$$, $$values (3::bigint)$$, 'three approved Pro feature entitlements carry subscription provenance');
reset role;

update public.teacher_profiles set account_status = 'suspended' where user_id = '50000000-0000-0000-0000-000000000001';
insert into public.billing_webhook_events (id, stripe_event_id, event_type, stripe_environment, stripe_object_id, event_created_at, payload_sha256) values
  ('51000000-0000-0000-0000-000000000003', 'evt_ProjectSuspended', 'customer.subscription.updated', 'test', 'sub_BillingOps', now() + interval '2 minutes', repeat('c', 64));
set local role service_role;
select ok(public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000003'), 'suspension projection event is claimed');
select results_eq(
  $$select public.apply_billing_subscription_projection('51000000-0000-0000-0000-000000000003', '50000000-0000-0000-0000-000000000001', 'test', 'cus_BillingOps', 'sub_BillingOps', 'teacher-pro-monthly', 'price_BillingOps', 'active', now(), now() + interval '30 days', false, null, now() + interval '2 minutes', true)$$,
  $$values ('denied'::text)$$, 'account suspension overrides verified active billing'
);
select results_eq($$select count(*)::bigint from public.product_entitlements where teacher_user_id = '50000000-0000-0000-0000-000000000001' and status = 'active'$$, $$values (0::bigint)$$, 'suspension revokes derived entitlement without deleting billing records');
select throws_ok(
  $$insert into public.billing_subscriptions (owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id, product_key, plan_key, stripe_price_id, subscription_status, current_period_start, current_period_end, latest_authoritative_event_created_at) values ('50000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000001', 'test', 'sub_DuplicateOps', 'math-vocabulary-hunt', 'teacher-pro-annual', 'price_DuplicateOps', 'active', now(), now() + interval '1 year', now())$$,
  '23505', null, 'database denies a second current subscription for one owner and environment'
);
select throws_ok($$delete from public.billing_subscriptions where id = '53000000-0000-0000-0000-000000000001'$$, '42501', null, 'service role has no billing deletion grant');
reset role;

update public.teacher_profiles set account_status = 'deletion_requested' where user_id = '50000000-0000-0000-0000-000000000001';
insert into public.billing_webhook_events (id, stripe_event_id, event_type, stripe_environment, stripe_object_id, event_created_at, payload_sha256) values
  ('51000000-0000-0000-0000-000000000004', 'evt_ProjectDeletion', 'customer.subscription.updated', 'test', 'sub_BillingOps', now() + interval '3 minutes', repeat('d', 64));
set local role service_role;
select ok(public.claim_billing_webhook_event('51000000-0000-0000-0000-000000000004'), 'deletion-request projection event is claimed');
select results_eq(
  $$select public.apply_billing_subscription_projection('51000000-0000-0000-0000-000000000004', '50000000-0000-0000-0000-000000000001', 'test', 'cus_BillingOps', 'sub_BillingOps', 'teacher-pro-monthly', 'price_BillingOps', 'active', now(), now() + interval '30 days', false, null, now() + interval '3 minutes', true)$$,
  $$values ('denied'::text)$$, 'deletion request overrides verified active billing'
);
select results_eq($$select count(*)::bigint from public.product_entitlements where teacher_user_id = '50000000-0000-0000-0000-000000000001' and status = 'active'$$, $$values (0::bigint)$$, 'deletion request keeps subscription entitlements revoked');
reset role;

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
