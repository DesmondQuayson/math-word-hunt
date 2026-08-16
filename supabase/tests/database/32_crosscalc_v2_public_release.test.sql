begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select results_eq(
  $$select count(*)::bigint from public.game_catalog_entries where stable_key='crosscalc' or slug='crosscalc'$$,
  $$values (1::bigint)$$,
  'CrossCalc remains one catalog identity'
);

select results_eq(
  $$select slug,title,launch_type,status,version,thumbnail_reference
    from public.game_catalog_entries where stable_key='crosscalc'$$,
  $$values ('crosscalc'::text,'CrossCalc'::text,'internal'::text,'draft'::text,'0.2.0'::text,'builtin:crosscalc-v2'::text)$$,
  'the local catalog fixture advances in place to the V2 release metadata'
);

select results_eq(
  $$select description,publication_metadata->>'result_contract',publication_metadata->>'storage_namespace',publication_metadata->>'release_state'
    from public.game_catalog_entries where stable_key='crosscalc'$$,
  $$values (
    'Players place available whole-number tiles into a connected network of equations so every horizontal and vertical equation becomes correct.'::text,
    'crosscalc-result/2'::text,'mathnexa.crosscalc.v2'::text,'published'::text
  )$$,
  'the V2 description and provenance are exact'
);

select ok(
  (select count(*) from public.game_catalog_entry_versions
    where catalog_entry_id=(select id from public.game_catalog_entries where stable_key='crosscalc')
      and snapshot->>'version'='0.1.0') >= 1,
  'the append-only history preserves a V1 rollback snapshot'
);

select ok(
  (select count(*) from public.game_catalog_entry_versions
    where catalog_entry_id=(select id from public.game_catalog_entries where stable_key='crosscalc')
      and snapshot->>'version'='0.2.0') = 1,
  'the append-only history records the V2 release snapshot once'
);

select ok(
  pg_get_functiondef('public.rollback_game_catalog_entry(uuid,uuid,uuid,bigint)'::regprocedure)
    like '%version=target_row.snapshot->>''version''%',
  'catalog rollback restores the historical runtime version gate'
);

select ok(not has_function_privilege('authenticated','public.rollback_game_catalog_entry(uuid,uuid,uuid,bigint)','EXECUTE'),
  'browser identities cannot invoke catalog rollback');

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
