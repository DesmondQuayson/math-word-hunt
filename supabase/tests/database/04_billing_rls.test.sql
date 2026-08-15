begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'legacy-preview'
\ir ../helpers/select-identity-model.psql

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('40000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'billing-rls-a@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing RLS A"}'::jsonb),
  ('40000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'billing-rls-b@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing RLS B"}'::jsonb),
  ('40000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'billing-rls-suspended@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing Suspended"}'::jsonb),
  ('40000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'billing-rls-deletion@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing Deletion"}'::jsonb),
  ('40000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'billing-rls-missing@example.invalid', crypt('BillingPass123', gen_salt('bf')), now(), '{"display_name":"Billing Missing"}'::jsonb);
update public.teacher_profiles set account_status = 'suspended' where user_id = '40000000-0000-0000-0000-000000000003';
update public.teacher_profiles set account_status = 'deletion_requested' where user_id = '40000000-0000-0000-0000-000000000004';
delete from public.teacher_profiles where user_id = '40000000-0000-0000-0000-000000000005';

insert into public.billing_customers (id, owner_teacher_id, stripe_environment, stripe_customer_id) values
  ('41000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', 'test', 'cus_RlsTeacherA'),
  ('41000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', 'test', 'cus_RlsTeacherB'),
  ('41000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', 'test', 'cus_RlsSuspended'),
  ('41000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', 'test', 'cus_RlsDeletion');
insert into public.billing_subscriptions (
  id, owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id,
  product_key, plan_key, stripe_price_id, subscription_status,
  current_period_start, current_period_end, latest_authoritative_event_created_at
) values
  ('42000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'test', 'sub_RlsA', 'math-vocabulary-hunt', 'teacher-pro-monthly', 'price_RlsMonthly', 'active', now() - interval '1 day', now() + interval '29 days', now()),
  ('42000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', 'test', 'sub_RlsB', 'math-vocabulary-hunt', 'teacher-pro-monthly', 'price_RlsMonthly', 'active', now() - interval '1 day', now() + interval '29 days', now()),
  ('42000000-0000-0000-0000-000000000003', '40000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000003', 'test', 'sub_RlsSuspended', 'math-vocabulary-hunt', 'teacher-pro-monthly', 'price_RlsMonthly', 'active', now() - interval '1 day', now() + interval '29 days', now()),
  ('42000000-0000-0000-0000-000000000004', '40000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000004', 'test', 'sub_RlsDeletion', 'math-vocabulary-hunt', 'teacher-pro-monthly', 'price_RlsMonthly', 'active', now() - interval '1 day', now() + interval '29 days', now());
insert into public.product_entitlements (teacher_user_id, product_key, scope, feature_key, status, source, billing_subscription_id, starts_at, expires_at) values
  ('40000000-0000-0000-0000-000000000001', 'math-vocabulary-hunt', 'feature', 'complete-library', 'active', 'subscription', '42000000-0000-0000-0000-000000000001', now(), now() + interval '29 days'),
  ('40000000-0000-0000-0000-000000000003', 'math-vocabulary-hunt', 'feature', 'complete-library', 'active', 'subscription', '42000000-0000-0000-0000-000000000003', now(), now() + interval '29 days'),
  ('40000000-0000-0000-0000-000000000004', 'math-vocabulary-hunt', 'feature', 'complete-library', 'active', 'subscription', '42000000-0000-0000-0000-000000000004', now(), now() + interval '29 days');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'anonymous customer reads are denied');
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'anonymous subscription reads are denied');
select throws_ok($$select * from public.billing_webhook_events$$, '42501', null, 'anonymous webhook reads are denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'teacher direct customer reads are denied');
select throws_ok($$select * from public.billing_subscriptions$$, '42501', null, 'teacher direct subscription reads are denied');
select throws_ok($$select * from public.billing_webhook_events$$, '42501', null, 'teacher raw webhook reads are denied');
select throws_ok($$insert into public.billing_customers (owner_teacher_id, stripe_environment, stripe_customer_id) values ('40000000-0000-0000-0000-000000000001', 'test', 'cus_Injected')$$, '42501', null, 'browser customer creation is denied');
select throws_ok($$update public.billing_customers set owner_teacher_id = '40000000-0000-0000-0000-000000000002' where id = '41000000-0000-0000-0000-000000000001'$$, '42501', null, 'browser customer reassignment is denied');
select throws_ok($$delete from public.billing_customers where id = '41000000-0000-0000-0000-000000000001'$$, '42501', null, 'browser customer deletion is denied');
select throws_ok($$insert into public.billing_subscriptions (owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id, product_key, plan_key, stripe_price_id, subscription_status, latest_authoritative_event_created_at) values ('40000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'test', 'sub_Injected', 'math-vocabulary-hunt', 'teacher-pro-monthly', 'price_Injected', 'incomplete', now())$$, '42501', null, 'browser subscription creation is denied');
select throws_ok($$update public.product_entitlements set status = 'active' where teacher_user_id = '40000000-0000-0000-0000-000000000002'$$, '42501', null, 'browser entitlement mutation is denied');
select results_eq($$select count(*)::bigint from public.product_entitlements$$, $$values (1::bigint)$$, 'active teacher sees only own derived entitlement');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq($$select count(*)::bigint from public.product_entitlements$$, $$values (0::bigint)$$, 'suspension overrides paid entitlement');
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'suspended teacher billing management path denies');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq($$select count(*)::bigint from public.product_entitlements$$, $$values (0::bigint)$$, 'deletion request overrides paid entitlement');
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'deletion-requested teacher billing management path denies');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"40000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok($$select * from public.billing_customers$$, '42501', null, 'missing-profile billing access denies');
reset role;

set local role service_role;
select lives_ok(
  $$insert into public.billing_webhook_events (stripe_event_id, event_type, stripe_environment, event_created_at, payload_sha256) values ('evt_ServiceOnly', 'invoice.paid', 'test', now(), repeat('e', 64))$$,
  'service role can register an allowlisted webhook receipt'
);
select throws_ok(
  $$delete from public.billing_webhook_events where stripe_event_id = 'evt_ServiceOnly'$$,
  '42501', null, 'service reconciliation role cannot delete billing evidence'
);
reset role;

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
