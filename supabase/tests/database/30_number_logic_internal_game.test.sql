begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select results_eq(
  $$select count(*)::bigint from public.game_catalog_entries where stable_key='number-logic' or slug='number-logic'$$,
  $$values (1::bigint)$$,
  'exactly one Number Logic catalog identity exists'
);

select results_eq(
  $$select stable_key,slug,title,launch_type,status,version,resource_id,package_id,canonical_route,external_url,external_allowed_host
    from public.game_catalog_entries where stable_key='number-logic'$$,
  $$values ('number-logic'::text,'number-logic'::text,'Number Logic'::text,'internal'::text,'draft'::text,'0.1.0'::text,
    null::uuid,null::uuid,null::text,null::text,null::text)$$,
  'Number Logic is one destination-free Internal Draft at version 0.1.0'
);

select results_eq(
  $$select description,thumbnail_reference,recommended_grade_min,recommended_grade_max,difficulty,display_order
    from public.game_catalog_entries where stable_key='number-logic'$$,
  $$values (
    'Challenge your reasoning across six number-placement puzzles. Solve Lines of 3, U Sums, Magic H, Equal Sums, Square Sums, and Product Square while building mathematical reasoning, number sense, and problem-solving skills.'::text,
    'builtin:number-logic'::text,3::smallint,9::smallint,'mixed'::text,31::smallint
  )$$,
  'approved Number Logic catalog metadata is exact'
);

select results_eq(
  $$select skills,topics,tags from public.game_catalog_entries where stable_key='number-logic'$$,
  $$values (
    array['addition','logical-reasoning','mental-math','multiplication','number-sense','problem-solving']::text[],
    array['arithmetic','logic-puzzles','number-operations']::text[],
    array['addition','brain-game','math-puzzle','multiplication','number-logic','number-placement','reasoning']::text[]
  )$$,
  'six-mode skills, topics, and tags are exact'
);

select results_eq(
  $$select publication_metadata->>'internal_registry_key',publication_metadata->>'internal_route',
      publication_metadata->>'implementation_version',publication_metadata->>'source_commit'
    from public.game_catalog_entries where stable_key='number-logic'$$,
  $$values ('number-logic'::text,'/games/number-logic/play'::text,'0.1.0'::text,
    '025fe1e33bbbb36a41d1d3bd34a54d31d0bb08cf'::text)$$,
  'trusted source registration evidence is complete'
);

select ok(
  (select count(*) from public.game_catalog_entry_versions
    where catalog_entry_id=(select id from public.game_catalog_entries where stable_key='number-logic')) >= 1,
  'the append-only catalog history records the Number Logic Draft'
);

select ok(not has_function_privilege('authenticated','public.transition_game_catalog_entry(uuid,uuid,bigint,text)','EXECUTE'),
  'browser identities cannot publish Number Logic');

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
