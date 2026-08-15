-- Register the verified same-origin CrossCalc runtime as Draft for owner Preview.
do $migration$
declare
  crosscalc_id uuid;
  existing_slug_conflict bigint;
begin
  select count(*) into existing_slug_conflict from public.game_catalog_entries where slug='crosscalc' and stable_key<>'crosscalc';
  if existing_slug_conflict<>0 then raise exception 'CrossCalc slug belongs to another catalog identity'; end if;

  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    'crosscalc','crosscalc','CrossCalc',
    'Connect whole-number equation answers through shared digits across Addition, Subtraction, Multiplication, Division, and Mixed Operations.',
    'internal','builtin:crosscalc',3,9,
    array['addition','arithmetic-reasoning','division','mental-math','multiplication','problem-solving','subtraction'],
    array['arithmetic','logic-puzzles','number-operations','whole-numbers'],
    array['arithmetic-crossword','crosscalc','math-puzzle','reasoning'],
    'mixed','draft',32,'0.1.0',
    jsonb_build_object(
      'internal_registry_key','crosscalc',
      'internal_route','/games/crosscalc/play',
      'implementation_version','0.1.0',
      'source_commit','0befe8e',
      'migrated_at',statement_timestamp()
    ),
    jsonb_build_object('strategy','catalog version rollback','standalone_release_commit','0befe8e')
  )
  on conflict(stable_key) do update set
    resource_id=null,
    package_id=null,
    slug='crosscalc',
    title='CrossCalc',
    description=excluded.description,
    launch_type='internal',
    canonical_route=null,
    external_url=null,
    external_allowed_host=null,
    thumbnail_reference='builtin:crosscalc',
    recommended_grade_min=3,
    recommended_grade_max=9,
    skills=excluded.skills,
    topics=excluded.topics,
    tags=excluded.tags,
    difficulty='mixed',
    status='draft',
    display_order=32,
    version='0.1.0',
    publication_metadata=public.game_catalog_entries.publication_metadata || excluded.publication_metadata,
    rollback_metadata=public.game_catalog_entries.rollback_metadata || excluded.rollback_metadata,
    lock_version=public.game_catalog_entries.lock_version+1
  returning id into crosscalc_id;

  perform private.record_game_catalog_version(crosscalc_id,null,null);
end
$migration$;
