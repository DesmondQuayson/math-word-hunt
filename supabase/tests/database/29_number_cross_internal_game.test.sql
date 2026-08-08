begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select results_eq(
  $$select count(*)::bigint from public.game_catalog_entries where stable_key='number-cross' or slug='number-cross'$$,
  $$values (1::bigint)$$,
  'exactly one Number Cross catalog identity exists'
);

select results_eq(
  $$select stable_key,slug,launch_type,status,resource_id,package_id,canonical_route,external_url,external_allowed_host
    from public.game_catalog_entries where stable_key='number-cross'$$,
  $$values ('number-cross'::text,'number-cross'::text,'internal'::text,'draft'::text,null::uuid,null::uuid,null::text,null::text,null::text)$$,
  'Number Cross is normalized to one destination-free Internal Draft'
);

select results_eq(
  $$select title,description,thumbnail_reference,recommended_grade_min,recommended_grade_max,difficulty,display_order,version
    from public.game_catalog_entries where stable_key='number-cross'$$,
  $$values (
    'Number Cross'::text,
    'Cross out numbers until every row and column reaches its target. Practice addition, multiplication, number sense, and logical reasoning through increasingly challenging puzzles.'::text,
    'builtin:number-cross'::text,3::smallint,9::smallint,'mixed'::text,30::smallint,'1.0.0'::text
  )$$,
  'approved Number Cross catalog metadata is exact'
);

select results_eq(
  $$select skills,topics,tags from public.game_catalog_entries where stable_key='number-cross'$$,
  $$values (
    array['addition','logical-reasoning','mental-math','multiplication','number-sense','problem-solving']::text[],
    array['arithmetic','logic-puzzles','number-operations']::text[],
    array['addition','brain-game','math-puzzle','multiplication','number-cross','practice','reasoning']::text[]
  )$$,
  'skills, topics, and tags remain normalized'
);

select results_eq(
  $$select publication_metadata->>'internal_registry_key',publication_metadata->>'internal_route',publication_metadata->>'implementation_version',publication_metadata->>'source_commit'
    from public.game_catalog_entries where stable_key='number-cross'$$,
  $$values ('number-cross'::text,'/games/number-cross/play'::text,'1.0.0'::text,'4737f5437ec3f04485abf312361d986d1b5e1a94'::text)$$,
  'trusted source registration evidence is complete'
);

select ok(
  (select count(*) from public.game_catalog_entry_versions where catalog_entry_id=(select id from public.game_catalog_entries where stable_key='number-cross')) >= 1,
  'the existing catalog version history is retained and extended'
);

select results_eq(
  $$select snapshot->>'launch_type',snapshot->>'status'
    from public.game_catalog_entry_versions
    where catalog_entry_id=(select id from public.game_catalog_entries where stable_key='number-cross')
    order by version_number desc limit 1$$,
  $$values ('internal'::text,'draft'::text)$$,
  'the newest append-only snapshot records the Internal Draft'
);

select ok(not has_function_privilege('authenticated','public.transition_game_catalog_entry(uuid,uuid,bigint,text)','EXECUTE'),
  'browser identities cannot publish internal games');
select ok(has_function_privilege('service_role','public.transition_game_catalog_entry(uuid,uuid,bigint,text)','EXECUTE'),
  'the bounded server adapter retains publication authority');

select throws_ok(
  $$insert into public.game_catalog_entries(
      stable_key,slug,title,description,launch_type,thumbnail_reference,difficulty,status,display_order,version,publication_metadata
    ) values('unregistered-native','unregistered-native','Unregistered','Unregistered internal code.','internal','builtin:game-card','core','draft',31,'1.0.0','{}')$$,
  'P0001','Trusted internal game registration required',
  'an internal row without trusted registration evidence fails closed'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
('ad000000-0000-4000-8000-000000000001','authenticated','authenticated','native-owner@example.invalid',crypt('AdminPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values
('ad100000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001','owner',true);

select id as number_cross_id,lock_version as number_cross_lock
from public.game_catalog_entries where stable_key='number-cross' \gset

select lives_ok(
  format(
    'select public.transition_game_catalog_entry(%L::uuid,%L::uuid,%s::bigint,%L)',
    'ad100000-0000-4000-8000-000000000001',:'number_cross_id',:'number_cross_lock','published'
  ),
  'the registered Internal Draft publishes without an external health check'
);

select results_eq(
  $$select e.status,v.snapshot->>'status',v.snapshot->>'launch_type'
    from public.game_catalog_entries e
    join lateral (
      select snapshot from public.game_catalog_entry_versions where catalog_entry_id=e.id order by version_number desc limit 1
    ) v on true where e.stable_key='number-cross'$$,
  $$values ('published'::text,'published'::text,'internal'::text)$$,
  'publication changes the catalog and append-only version atomically'
);

select id as number_cross_id,lock_version as number_cross_lock
from public.game_catalog_entries where stable_key='number-cross' \gset

select lives_ok(
  format(
    'select public.transition_game_catalog_entry(%L::uuid,%L::uuid,%s::bigint,%L)',
    'ad100000-0000-4000-8000-000000000001',:'number_cross_id',:'number_cross_lock','maintenance'
  ),
  'published Internal games retain the generic maintenance transition'
);

select results_eq(
  $$select launch_type,status,external_url from public.game_catalog_entries where stable_key='number-cross'$$,
  $$values ('internal'::text,'maintenance'::text,null::text)$$,
  'maintenance cannot restore or invent an external destination'
);

select is(
  (select count(*)::bigint from public.admin_audit_log
    where target=:'number_cross_id' and action in ('admin.game.publish','admin.game.maintenance')),
  2::bigint,
  'Internal publication and maintenance are audited exactly once each'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
