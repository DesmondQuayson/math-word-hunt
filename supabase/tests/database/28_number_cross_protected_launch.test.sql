begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select ok(not has_function_privilege('authenticated','public.transition_game_catalog_entry(uuid,uuid,bigint,text)','EXECUTE'),
  'browser identities cannot change game publication or maintenance state');
select ok(has_function_privilege('service_role','public.transition_game_catalog_entry(uuid,uuid,bigint,text)','EXECUTE'),
  'the existing service adapter retains bounded catalog transitions');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
('ac000000-0000-4000-8000-000000000001','authenticated','authenticated','number-cross-owner@example.invalid',crypt('AdminPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values
('ac100000-0000-4000-8000-000000000001','ac000000-0000-4000-8000-000000000001','owner',true);

select public.create_external_game_catalog_entry(
  'ac100000-0000-4000-8000-000000000001','number-cross-external-backup','Number Cross external backup','Protected arithmetic puzzle backup.',
  'https://number-cross.vercel.app','number-cross.vercel.app','builtin:number-cross',3::smallint,9::smallint,
  array['addition','multiplication','number-sense','logical-reasoning','problem-solving','mental-math'],
  array['arithmetic','number-operations','logic-puzzles'],
  array['number-cross','math-puzzle','addition','multiplication','reasoning','brain-game','practice'],
  'mixed',30::smallint
) as number_cross_id \gset

select results_eq(
  $$select stable_key,launch_type,external_url,external_allowed_host,status from public.game_catalog_entries where stable_key='number-cross-external-backup'$$,
  $$values ('number-cross-external-backup'::text,'external_https'::text,'https://number-cross.vercel.app'::text,'number-cross.vercel.app'::text,'draft'::text)$$,
  'the protected external backup remains available as a trusted HTTPS Draft'
);
select lives_ok(
  $$select public.transition_game_catalog_entry('ac100000-0000-4000-8000-000000000001',(select id from public.game_catalog_entries where stable_key='number-cross-external-backup'),1,'published')$$,
  'the reviewed external backup can publish through the existing Admin transition'
);
select lives_ok(
  $$select public.transition_game_catalog_entry('ac100000-0000-4000-8000-000000000001',(select id from public.game_catalog_entries where stable_key='number-cross-external-backup'),2,'maintenance')$$,
  'the published external backup can enter maintenance without changing its destination'
);
select results_eq(
  $$select status,external_url,external_allowed_host from public.game_catalog_entries where stable_key='number-cross-external-backup'$$,
  $$values ('maintenance'::text,'https://number-cross.vercel.app'::text,'number-cross.vercel.app'::text)$$,
  'maintenance preserves the exact trusted destination'
);
select lives_ok(
  $$select public.transition_game_catalog_entry('ac100000-0000-4000-8000-000000000001',(select id from public.game_catalog_entries where stable_key='number-cross-external-backup'),3,'published')$$,
  'the maintenance backup can resume after the existing verified-health gate'
);
select throws_ok(
  $$select public.transition_game_catalog_entry('ac100000-0000-4000-8000-000000000001',(select id from public.game_catalog_entries where stable_key='number-cross-external-backup'),4,'draft')$$,
  'P0001','Invalid game publication transition','published games cannot be moved backward to Draft'
);
select is(
  (select count(*)::bigint from public.admin_audit_log where target=(select id::text from public.game_catalog_entries where stable_key='number-cross-external-backup') and action='admin.game.maintenance'),
  1::bigint,'maintenance transition is audited exactly once'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
