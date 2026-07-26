begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('20000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'teacher-a@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Teacher A"}'::jsonb),
  ('20000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'teacher-b@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Teacher B"}'::jsonb),
  ('20000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'teacher-suspended@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Suspended Teacher"}'::jsonb),
  ('20000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'teacher-missing@example.invalid', crypt('TeacherPass123', gen_salt('bf')), now(), '{"display_name":"Missing Profile"}'::jsonb);

update public.teacher_profiles set account_status = 'suspended'
where user_id = '20000000-0000-0000-0000-000000000003';
delete from public.teacher_profiles where user_id = '20000000-0000-0000-0000-000000000004';

insert into public.teacher_classes (id, owner_teacher_id, class_name, grade_level) values
  ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Teacher A Class', '6'),
  ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Teacher B Class', '7'),
  ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'Suspended Class', '8');

insert into public.teacher_activities (
  id, owner_teacher_id, class_id, grade_level, topic_key, lesson_key,
  game_mode_key, time_limit_minutes, team_count, combine_mode_enabled
) values
  ('22000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 15, 4, false),
  ('22000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000002', '7', 'g7-probability', 'g7-7-3', 'team-hunt', 20, 5, false);

insert into public.product_entitlements (
  id, teacher_user_id, product_key, scope, feature_key, status, source, starts_at
) values (
  '23000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'math-vocabulary-hunt',
  'product',
  null,
  'active',
  'manual',
  now()
);

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select results_eq($$select count(*)::bigint from public.products$$, $$values (1::bigint)$$, 'anonymous users can read the safe active product');
select throws_ok($$select * from public.teacher_profiles$$, '42501', null, 'anonymous users cannot read profiles');
select throws_ok($$select * from public.teacher_classes$$, '42501', null, 'anonymous users cannot read classes');
select throws_ok($$select * from public.product_entitlements$$, '42501', null, 'anonymous users cannot enumerate entitlements');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000001","role":"authenticated"}', true);
select results_eq($$select count(*)::bigint from public.teacher_profiles$$, $$values (1::bigint)$$, 'teacher A reads only own profile');
select results_eq($$select count(*)::bigint from public.teacher_classes$$, $$values (1::bigint)$$, 'teacher A reads only own class');
select results_eq($$select count(*)::bigint from public.teacher_activities$$, $$values (1::bigint)$$, 'teacher A reads only own activity');
select results_eq($$select count(*)::bigint from public.product_entitlements$$, $$values (1::bigint)$$, 'teacher A reads only own entitlement');
select lives_ok(
  $$insert into public.teacher_classes (owner_teacher_id, class_name, grade_level) values ('20000000-0000-0000-0000-000000000001', 'Teacher A New Class', '6')$$,
  'active teacher can create own class'
);
select results_eq(
  $$with changed as (update public.teacher_classes set class_name = 'Forbidden' where id = '21000000-0000-0000-0000-000000000002' returning 1) select count(*)::bigint from changed$$,
  $$values (0::bigint)$$,
  'cross-teacher class update affects no rows'
);
select throws_ok(
  $$insert into public.teacher_classes (owner_teacher_id, class_name) values ('20000000-0000-0000-0000-000000000002', 'Cross Account Class')$$,
  '42501',
  null,
  'cross-teacher class insert is denied'
);
select throws_ok(
  $$update public.teacher_classes set owner_teacher_id = '20000000-0000-0000-0000-000000000002' where id = '21000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'class ownership reassignment is denied'
);
select throws_ok(
  $$delete from public.teacher_classes where id = '21000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'permanent class deletion is denied'
);
select throws_ok(
  $$insert into public.teacher_activities (owner_teacher_id, class_id, grade_level, topic_key, lesson_key, game_mode_key, time_limit_minutes, team_count) values ('20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000002', '7', 'g7-probability', 'g7-7-3', 'team-hunt', 15, 4)$$,
  '42501',
  null,
  'activity cannot reference another teacher class'
);
select lives_ok(
  $$insert into public.teacher_activities (owner_teacher_id, class_id, grade_level, topic_key, lesson_key, game_mode_key, time_limit_minutes, team_count) values ('20000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', '6', 'g6-expressions', 'g6-3-6', 'team-hunt', 15, 4)$$,
  'teacher can create activity for own class'
);
select throws_ok($$update public.products set display_name = 'Changed'$$, '42501', null, 'ordinary teacher cannot write products');
select throws_ok(
  $$insert into public.product_entitlements (teacher_user_id, product_key, scope, status, source, starts_at) values ('20000000-0000-0000-0000-000000000001', 'math-vocabulary-hunt', 'product', 'active', 'manual', now())$$,
  '42501',
  null,
  'ordinary teacher cannot grant entitlements'
);
select throws_ok(
  $$update public.teacher_profiles set account_status = 'suspended' where user_id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'teacher cannot manipulate account status'
);
select lives_ok(
  $$update public.teacher_profiles set display_name = 'Teacher A Updated' where user_id = '20000000-0000-0000-0000-000000000001'$$,
  'teacher can update approved profile field'
);
select lives_ok(
  $$insert into public.account_deletion_requests (owner_teacher_id) values ('20000000-0000-0000-0000-000000000001')$$,
  'active teacher can request deletion'
);
select results_eq($$select account_status from public.teacher_profiles$$, $$values ('deletion_requested'::text)$$, 'deletion request changes status server-side');
select results_eq($$select count(*)::bigint from public.teacher_classes$$, $$values (0::bigint)$$, 'deletion-requested teacher loses protected class reads');
select results_eq($$select count(*)::bigint from public.account_deletion_requests$$, $$values (1::bigint)$$, 'deletion-requested teacher can view own request');
select throws_ok(
  $$insert into public.teacher_classes (owner_teacher_id, class_name) values ('20000000-0000-0000-0000-000000000001', 'Denied After Request')$$,
  '42501',
  null,
  'deletion-requested teacher cannot create classes'
);
select throws_ok(
  $$update public.account_deletion_requests set status = 'resolved', resolved_at = now() where owner_teacher_id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  null,
  'teacher cannot resolve deletion request'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000003","role":"authenticated"}', true);
select results_eq($$select account_status from public.teacher_profiles$$, $$values ('suspended'::text)$$, 'suspended teacher can see safe account status');
select results_eq($$select count(*)::bigint from public.teacher_classes$$, $$values (0::bigint)$$, 'suspended teacher cannot read protected classes');
select throws_ok(
  $$insert into public.teacher_classes (owner_teacher_id, class_name) values ('20000000-0000-0000-0000-000000000003', 'Denied Suspended Class')$$,
  '42501',
  null,
  'suspended teacher cannot create classes'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"20000000-0000-0000-0000-000000000004","role":"authenticated"}', true);
select results_eq($$select count(*)::bigint from public.teacher_profiles$$, $$values (0::bigint)$$, 'missing profile remains missing');
select throws_ok(
  $$insert into public.teacher_classes (owner_teacher_id, class_name) values ('20000000-0000-0000-0000-000000000004', 'Denied Missing Profile')$$,
  '42501',
  null,
  'missing profile fails closed'
);
reset role;

select * from finish();
rollback;
