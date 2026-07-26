begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select has_table('public', 'teacher_profiles', 'teacher_profiles exists');
select has_table('public', 'products', 'products exists');
select has_table('public', 'product_entitlements', 'product_entitlements exists');
select has_table('public', 'teacher_classes', 'teacher_classes exists');
select has_table('public', 'teacher_activities', 'teacher_activities exists');
select has_table('public', 'account_deletion_requests', 'account_deletion_requests exists');

select col_is_pk('public', 'teacher_profiles', 'user_id', 'profile user_id is primary key');
select col_is_pk('public', 'products', 'id', 'product id is primary key');
select col_is_pk('public', 'product_entitlements', 'id', 'entitlement id is primary key');
select col_is_pk('public', 'teacher_classes', 'id', 'class id is primary key');
select col_is_pk('public', 'teacher_activities', 'id', 'activity id is primary key');
select col_is_pk('public', 'account_deletion_requests', 'id', 'deletion request id is primary key');

select has_column('public', 'teacher_profiles', 'display_name', 'profile display_name exists');
select has_column('public', 'teacher_profiles', 'school_or_organization_label', 'profile school label exists');
select has_column('public', 'teacher_profiles', 'account_status', 'profile account status exists');
select has_column('public', 'teacher_classes', 'archived_at', 'class archive timestamp exists');
select has_column('public', 'teacher_activities', 'combine_mode_enabled', 'activity Combine Mode exists');
select has_column('public', 'account_deletion_requests', 'resolution_code', 'safe resolution code exists');
select hasnt_column('public', 'teacher_profiles', 'role', 'profile has no browser-settable role');
select hasnt_column('public', 'teacher_profiles', 'premium', 'profile has no premium flag');
select hasnt_table('public', 'students', 'no students table exists');
select hasnt_table('public', 'subscriptions', 'no subscriptions table exists');
select hasnt_table('public', 'reports', 'no reports table exists');

select has_index('public', 'product_entitlements', 'product_entitlements_unique_scope', 'entitlement scope is unique');
select has_index('public', 'teacher_classes', 'teacher_classes_owner_status_idx', 'class owner/status index exists');
select has_index('public', 'teacher_activities', 'teacher_activities_owner_status_idx', 'activity owner/status index exists');
select has_index('public', 'account_deletion_requests', 'account_deletion_requests_one_open_idx', 'one-open-request index exists');

select results_eq(
  $$select count(*)::bigint from public.products where product_key = 'math-vocabulary-hunt' and is_active$$,
  $$values (1::bigint)$$,
  'safe product seed exists'
);
select results_eq(
  $$select count(*)::bigint from public.product_entitlements$$,
  $$values (0::bigint)$$,
  'seed grants no entitlement'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  '10000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'phase1d-profile@example.invalid',
  crypt('SchemaPass123', gen_salt('bf')),
  now(),
  '{"display_name":"Schema Teacher","school_or_organization_label":"Example School","role":"platform-admin","account_status":"suspended","premium":true}'::jsonb
);

select results_eq(
  $$select display_name, school_or_organization_label, account_status from public.teacher_profiles where user_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values ('Schema Teacher'::text, 'Example School'::text, 'active'::text)$$,
  'signup provisions only safe profile fields and hard-codes active status'
);
select results_eq(
  $$select count(*)::bigint from public.teacher_profiles where user_id = '10000000-0000-0000-0000-000000000001'$$,
  $$values (1::bigint)$$,
  'profile provisioning creates exactly one profile'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  '10000000-0000-0000-0000-000000000002',
  'authenticated',
  'authenticated',
  'phase1d-malformed@example.invalid',
  crypt('SchemaPass123', gen_salt('bf')),
  now(),
  jsonb_build_object('display_name', repeat('x', 81), 'school_or_organization_label', repeat('y', 121))
);
select results_eq(
  $$select display_name, school_or_organization_label from public.teacher_profiles where user_id = '10000000-0000-0000-0000-000000000002'$$,
  $$values ('Teacher'::text, null::text)$$,
  'malformed optional metadata receives safe deterministic defaults'
);

select throws_ok(
  $$insert into public.teacher_classes (owner_teacher_id, class_name, grade_level) values ('10000000-0000-0000-0000-000000000001', 'x', '6')$$,
  '23514',
  null,
  'invalid short class name is rejected'
);
select throws_ok(
  $$insert into public.teacher_activities (owner_teacher_id, grade_level, topic_key, lesson_key, game_mode_key, time_limit_minutes, team_count) values ('10000000-0000-0000-0000-000000000001', '6', 'unknown', 'g6-3-6', 'team-hunt', 10, 2)$$,
  '23514',
  null,
  'unknown curriculum topic is rejected'
);
select throws_ok(
  $$insert into public.teacher_activities (owner_teacher_id, grade_level, topic_key, lesson_key, game_mode_key, time_limit_minutes, team_count) values ('10000000-0000-0000-0000-000000000001', '6', 'g6-expressions', 'g6-3-6', 'unapproved-mode', 10, 2)$$,
  '23514',
  null,
  'unapproved game mode is rejected'
);

select * from finish();
rollback;
