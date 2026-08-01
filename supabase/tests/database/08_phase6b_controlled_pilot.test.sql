begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'legacy-preview'
\ir ../helpers/select-identity-model.psql

insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('80000000-0000-0000-0000-000000000001','authenticated','authenticated','phase6b-owner@example.invalid',crypt('TeacherPass123',gen_salt('bf')),now(),'{"display_name":"Controlled Teacher","school_or_organization_label":"Forged School"}'),
 ('80000000-0000-0000-0000-000000000002','authenticated','authenticated','phase6b-other@example.invalid',crypt('TeacherPass123',gen_salt('bf')),now(),'{"display_name":"Other Teacher"}');

select results_eq(
  $$select display_name, school_or_organization_label from public.teacher_profiles where user_id='80000000-0000-0000-0000-000000000001'$$,
  $$values ('Controlled Teacher'::text, null::text)$$,
  'forged signup organization metadata is not persisted'
);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"80000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok(
  $$update public.teacher_profiles set display_name='Controlled Teacher Updated' where user_id='80000000-0000-0000-0000-000000000001'$$,
  'teacher can still update the permitted display name'
);
select throws_ok(
  $$update public.teacher_profiles set school_or_organization_label='Forged District' where user_id='80000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'authenticated organization-label update is denied'
);
select is_empty(
  $$select * from public.teacher_profiles where user_id='80000000-0000-0000-0000-000000000002'$$,
  'organization restriction does not weaken reciprocal profile isolation'
);
select throws_ok(
  $$update public.teacher_profiles set account_status='active' where user_id='80000000-0000-0000-0000-000000000001'$$,
  '42501', null, 'organization restriction does not weaken account-status authority'
);
reset role;

set local role service_role;
select throws_ok(
  $$update public.teacher_profiles set school_or_organization_label='Forged Institution' where user_id='80000000-0000-0000-0000-000000000001'$$,
  '42501', 'organization_labels_prohibited_during_controlled_pilot', 'database trigger denies elevated organization-label changes'
);
reset role;

select results_eq(
  $$select school_or_organization_label from public.teacher_profiles where user_id='80000000-0000-0000-0000-000000000001'$$,
  $$values (null::text)$$,
  'denied writes leave the organization label empty'
);
select has_trigger('public','teacher_profiles','teacher_profiles_reject_controlled_pilot_organization_label','organization-label denial trigger exists');
select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
