begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('60000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'free-class@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Free Class"}'::jsonb),
  ('60000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'free-activity@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Free Activity"}'::jsonb),
  ('60000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'pro@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Pro Teacher"}'::jsonb),
  ('60000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'other@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Other Teacher"}'::jsonb),
  ('60000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'suspended-limit@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Suspended"}'::jsonb),
  ('60000000-0000-0000-0000-000000000006', 'authenticated', 'authenticated', 'deletion-limit@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Deletion"}'::jsonb),
  ('60000000-0000-0000-0000-000000000007', 'authenticated', 'authenticated', 'expired@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Expired Pro"}'::jsonb);

update public.teacher_profiles set account_status = 'suspended' where user_id = '60000000-0000-0000-0000-000000000005';
update public.teacher_profiles set account_status = 'deletion_requested' where user_id = '60000000-0000-0000-0000-000000000006';

insert into public.teacher_classes (id, owner_teacher_id, class_name, grade_level) values
  ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000004', 'Other Teacher Class', '7');

insert into public.billing_customers (id, owner_teacher_id, stripe_environment, stripe_customer_id) values
  ('62000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', 'test', 'cus_Phase3Pro'),
  ('62000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000007', 'test', 'cus_Phase3Expired');
insert into public.billing_subscriptions (
  id, owner_teacher_id, billing_customer_id, stripe_environment, stripe_subscription_id,
  product_key, plan_key, stripe_price_id, subscription_status, current_period_start,
  current_period_end, latest_authoritative_event_created_at
) values
  ('63000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000001', 'test', 'sub_Phase3Pro', 'math-vocabulary-hunt', 'teacher-pro-monthly', 'price_Phase3Monthly', 'active', now() - interval '1 day', now() + interval '30 days', now()),
  ('63000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000007', '62000000-0000-0000-0000-000000000002', 'test', 'sub_Phase3Expired', 'math-vocabulary-hunt', 'teacher-pro-annual', 'price_Phase3Annual', 'active', now() - interval '60 days', now() - interval '1 day', now());
insert into public.product_entitlements (
  teacher_user_id, product_key, scope, feature_key, status, source, source_reference,
  billing_subscription_id, starts_at, expires_at
) values
  ('60000000-0000-0000-0000-000000000003', 'math-vocabulary-hunt', 'feature', 'classroom-tools', 'active', 'subscription', 'sub_Phase3Pro', '63000000-0000-0000-0000-000000000001', now() - interval '1 day', now() + interval '30 days'),
  ('60000000-0000-0000-0000-000000000007', 'math-vocabulary-hunt', 'feature', 'classroom-tools', 'active', 'subscription', 'sub_Phase3Expired', '63000000-0000-0000-0000-000000000002', now() - interval '60 days', now() - interval '1 day');

insert into public.teacher_classes (owner_teacher_id, class_name, grade_level)
select '60000000-0000-0000-0000-000000000003', 'Pro class ' || value, '7' from generate_series(1, 24) value;
insert into public.teacher_activities (
  owner_teacher_id, grade_level, topic_key, lesson_key, game_mode_key,
  time_limit_minutes, team_count, combine_mode_enabled
)
select '60000000-0000-0000-0000-000000000003', '7', 'g7-probability', 'g7-7-3', 'team-hunt', 15, 4, false
from generate_series(1, 99);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.create_teacher_class('61100000-0000-0000-0000-000000000001', 'Free class one', '6', null)$$, 'Free teacher can create first active class');
select lives_ok($$select public.create_teacher_class('61100000-0000-0000-0000-000000000002', 'Free class two', '6', null)$$, 'Free teacher can create second active class');
select throws_ok($$select public.create_teacher_class('61100000-0000-0000-0000-000000000003', 'Free class three', '6', null)$$, 'P0001', 'capability_limit_reached:class.create', 'Free class limit is enforced');
select results_eq($$select plan_key, active_class_count, active_class_limit from public.get_teacher_capability_usage()$$, $$values ('free'::text, 2, 2)$$, 'Free usage is server-derived');
update public.teacher_classes set status = 'archived' where id = '61100000-0000-0000-0000-000000000001';
select lives_ok($$select public.create_teacher_class('61100000-0000-0000-0000-000000000003', 'Capacity restored', '6', null)$$, 'Archiving releases Free class capacity');
select throws_ok($$insert into public.teacher_classes (owner_teacher_id, class_name) values ('60000000-0000-0000-0000-000000000001', 'Direct bypass')$$, '42501', null, 'Direct browser class insert is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000002","role":"authenticated"}', true);
select lives_ok($$select public.create_teacher_activity('61200000-0000-0000-0000-000000000001', null, '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 10, 2, false)$$, 'Free teacher creates first activity');
select lives_ok($$select public.create_teacher_activity('61200000-0000-0000-0000-000000000002', null, '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 10, 2, false)$$, 'Free teacher creates second activity');
select lives_ok($$select public.create_teacher_activity('61200000-0000-0000-0000-000000000003', null, '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 10, 2, false)$$, 'Free teacher creates third activity');
select throws_ok($$select public.create_teacher_activity('61200000-0000-0000-0000-000000000004', null, '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 10, 2, false)$$, 'P0001', 'capability_limit_reached:activity.create', 'Free activity limit is enforced');
select results_eq($$select plan_key, active_activity_count, active_activity_limit from public.get_teacher_capability_usage()$$, $$values ('free'::text, 3, 3)$$, 'Free activity usage is server-derived');
update public.teacher_activities set status = 'archived' where id = '61200000-0000-0000-0000-000000000001';
select lives_ok($$select public.create_teacher_activity('61200000-0000-0000-0000-000000000004', null, '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 10, 2, false)$$, 'Archiving releases Free activity capacity');
select throws_ok($$insert into public.teacher_activities (owner_teacher_id, grade_level, topic_key, lesson_key, game_mode_key, time_limit_minutes, team_count) values ('60000000-0000-0000-0000-000000000002', '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 10, 2)$$, '42501', null, 'Direct browser activity insert is denied');
select throws_ok($$select public.create_teacher_activity('61200000-0000-0000-0000-000000000005', '61000000-0000-0000-0000-000000000001', '7', 'g7-probability', 'g7-7-3', 'team-hunt', 10, 2, false)$$, '42501', 'Owned active class required', 'Cross-owner class attachment is denied');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq($$select plan_key, active_class_count, active_class_limit, active_activity_count, active_activity_limit from public.get_teacher_capability_usage()$$, $$values ('teacher-pro-monthly'::text, 24, 25, 99, 100)$$, 'Verified Pro uses expanded limits');
select lives_ok($$select public.create_teacher_class('61300000-0000-0000-0000-000000000001', 'Pro class 25', '7', null)$$, 'Pro teacher can create class 25');
select throws_ok($$select public.create_teacher_class('61300000-0000-0000-0000-000000000002', 'Pro class 26', '7', null)$$, 'P0001', 'capability_limit_reached:class.create', 'Pro class limit is enforced');
select lives_ok($$select public.create_teacher_activity('61400000-0000-0000-0000-000000000001', null, '7', 'g7-probability', 'g7-7-3', 'team-hunt', 15, 4, false)$$, 'Pro teacher can create activity 100');
select throws_ok($$select public.create_teacher_activity('61400000-0000-0000-0000-000000000002', null, '7', 'g7-probability', 'g7-7-3', 'team-hunt', 15, 4, false)$$, 'P0001', 'capability_limit_reached:activity.create', 'Pro activity limit is enforced');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.create_teacher_class(uuid,text,text,text)'::regprocedure)) > 0, 'Class creation serializes concurrent limit decisions');
select ok(position('pg_advisory_xact_lock' in pg_get_functiondef('public.create_teacher_activity(uuid,uuid,text,text,text,text,integer,integer,boolean)'::regprocedure)) > 0, 'Activity creation serializes concurrent limit decisions');
select throws_ok($$update public.product_entitlements set status = 'active'$$, '42501', null, 'Browser cannot mutate entitlements');
reset role;

update private.product_capability_policy set emergency_pro_deny = true where product_key = 'math-vocabulary-hunt';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq($$select plan_key, active_class_limit, active_activity_limit from public.get_teacher_capability_usage()$$, $$values ('free'::text, 2, 3)$$, 'Emergency deny falls verified Pro back to Free limits');
reset role;
update private.product_capability_policy set emergency_pro_deny = false, billing_environment = 'live' where product_key = 'math-vocabulary-hunt';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq($$select plan_key from public.get_teacher_capability_usage()$$, $$values ('free'::text)$$, 'Billing environment mismatch denies Pro');
reset role;
update private.product_capability_policy set billing_environment = 'test' where product_key = 'math-vocabulary-hunt';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000007","role":"authenticated"}', true);
select results_eq($$select plan_key, active_class_limit from public.get_teacher_capability_usage()$$, $$values ('free'::text, 2)$$, 'Expired entitlement falls back to Free without deleting data');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000005","role":"authenticated"}', true);
select throws_ok($$select public.create_teacher_class('61500000-0000-0000-0000-000000000001', 'Suspended denied', '8', null)$$, '42501', 'Active teacher account required', 'Suspended account cannot create');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"60000000-0000-0000-0000-000000000006","role":"authenticated"}', true);
select throws_ok($$select public.create_teacher_activity('61600000-0000-0000-0000-000000000001', null, '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 10, 2, false)$$, '42501', 'Active teacher account required', 'Deletion-requested account cannot create');
reset role;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select throws_ok($$select public.get_teacher_capability_usage()$$, '42501', null, 'Anonymous usage read is denied');
select throws_ok($$select public.create_teacher_class('61700000-0000-0000-0000-000000000001', 'Anonymous denied', null, null)$$, '42501', null, 'Anonymous class creation is denied');
reset role;

select throws_ok(
  $$insert into public.product_entitlements (teacher_user_id, product_key, scope, feature_key, status, source, starts_at, expires_at) values ('60000000-0000-0000-0000-000000000001', 'math-vocabulary-hunt', 'feature', 'forged-capability', 'active', 'manual', now(), now() + interval '1 day')$$,
  '23514', null, 'Malformed entitlement cannot enter authoritative storage'
);

select * from finish();
rollback;
