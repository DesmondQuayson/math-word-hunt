begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'legacy-preview'
\ir ../helpers/select-identity-model.psql

select has_table('public', 'billing_customers', 'billing customers projection exists');
select has_table('public', 'billing_subscriptions', 'billing subscriptions projection exists');
select has_table('public', 'billing_webhook_events', 'webhook receipt ledger exists');
select has_column('public', 'product_entitlements', 'billing_subscription_id', 'subscription entitlements have a relational source');
select hasnt_column('public', 'billing_customers', 'email', 'customer projection does not duplicate mutable email');
select hasnt_column('public', 'billing_customers', 'payment_method', 'customer projection stores no payment method');
select hasnt_column('public', 'billing_webhook_events', 'payload', 'webhook ledger stores no raw payload');
select has_index('public', 'billing_customers', 'billing_customers_owner_teacher_id_stripe_environment_key', 'one customer mapping per owner and environment');
select has_index('public', 'billing_subscriptions', 'billing_subscriptions_one_current_per_owner', 'one current subscription per owner and environment');
select has_index('public', 'product_entitlements', 'product_entitlements_billing_subscription_idx', 'subscription entitlement lookup is indexed');

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('30000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'billing-schema-a@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing A"}'::jsonb),
  ('30000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'billing-schema-b@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing B"}'::jsonb),
  ('30000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'billing-schema-c@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing C"}'::jsonb);

insert into public.billing_customers (id, owner_teacher_id, stripe_environment, stripe_customer_id) values
  ('31000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'test', 'cus_Phase2ATeacherA'),
  ('31000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000002', 'test', 'cus_Phase2ATeacherB');

select throws_ok(
  $$insert into public.billing_customers (owner_teacher_id, stripe_environment, stripe_customer_id) values ('30000000-0000-0000-0000-000000000001', 'test', 'cus_DuplicateOwner')$$,
  '23505', null, 'duplicate owner mapping is rejected'
);
select throws_ok(
  $$insert into public.billing_customers (owner_teacher_id, stripe_environment, stripe_customer_id) values ('30000000-0000-0000-0000-000000000003', 'test', 'cus_Phase2ATeacherA')$$,
  '23505', null, 'a provider customer id cannot be reused within one environment'
);

insert into public.billing_subscriptions (
  id, owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id,
  product_key, plan_key, stripe_price_id, subscription_status,
  current_period_start, current_period_end, latest_authoritative_event_created_at
) values (
  '32000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'test', 'sub_Phase2ATeacherA', 'math-vocabulary-hunt', 'teacher-pro-monthly',
  'price_Phase2AMonthly', 'active', now() - interval '1 day', now() + interval '29 days', now()
);

select throws_ok(
  $$insert into public.billing_subscriptions (owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id, product_key, plan_key, stripe_price_id, subscription_status, latest_authoritative_event_created_at) values ('30000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', 'live', 'sub_MismatchedEnvironment', 'math-vocabulary-hunt', 'teacher-pro-annual', 'price_Phase2AAnnual', 'incomplete', now())$$,
  '23503', null, 'subscription environment must match its customer mapping'
);
select throws_ok(
  $$insert into public.billing_subscriptions (owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id, product_key, plan_key, stripe_price_id, subscription_status, latest_authoritative_event_created_at) values ('30000000-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'test', 'sub_DuplicateCurrent', 'math-vocabulary-hunt', 'teacher-pro-annual', 'price_Phase2AAnnual', 'incomplete', now())$$,
  '23505', null, 'second current subscription for one owner is rejected'
);
select throws_ok(
  $$update public.billing_subscriptions set owner_teacher_id = '30000000-0000-0000-0000-000000000002' where id = '32000000-0000-0000-0000-000000000001'$$,
  '23503', null, 'subscription cannot be reassigned away from its customer owner'
);

insert into public.product_entitlements (
  teacher_user_id, product_key, scope, feature_key, status, source,
  billing_subscription_id, starts_at, expires_at
) values (
  '30000000-0000-0000-0000-000000000001', 'math-vocabulary-hunt', 'feature',
  'complete-library', 'active', 'subscription', '32000000-0000-0000-0000-000000000001',
  now(), now() + interval '29 days'
);
select throws_ok(
  $$insert into public.product_entitlements (teacher_user_id, product_key, scope, feature_key, status, source, starts_at) values ('30000000-0000-0000-0000-000000000002', 'math-vocabulary-hunt', 'feature', 'complete-library', 'active', 'subscription', now())$$,
  '23514', null, 'subscription entitlement requires its relational source'
);

insert into public.billing_webhook_events (
  stripe_event_id, event_type, stripe_environment, stripe_object_id,
  event_created_at, payload_sha256
) values (
  'evt_Phase2AOne', 'customer.subscription.updated', 'test', 'sub_Phase2ATeacherA',
  now(), repeat('a', 64)
);
select throws_ok(
  $$insert into public.billing_webhook_events (stripe_event_id, event_type, stripe_environment, event_created_at, payload_sha256) values ('evt_Phase2AOne', 'customer.subscription.updated', 'test', now(), repeat('b', 64))$$,
  '23505', null, 'duplicate webhook delivery is idempotently rejected'
);
select throws_ok(
  $$insert into public.billing_webhook_events (stripe_event_id, event_type, stripe_environment, event_created_at, payload_sha256) values ('evt_Unknown', 'charge.dispute.created', 'test', now(), repeat('c', 64))$$,
  '23514', null, 'events outside the owned allowlist are rejected'
);
select throws_ok(
  $$insert into public.billing_webhook_events (stripe_event_id, event_type, stripe_environment, event_created_at, payload_sha256) values ('evt_LiveMarker', 'invoice.paid', 'production', now(), repeat('d', 64))$$,
  '23514', null, 'unknown environment is rejected'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
