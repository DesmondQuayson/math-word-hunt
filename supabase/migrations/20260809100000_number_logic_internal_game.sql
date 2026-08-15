-- Add the source-controlled Number Logic runtime to the existing trusted
-- internal-game catalog. It intentionally remains Draft for owner Preview.

do $migration$
declare
  number_logic_id uuid;
  existing_slug_conflict bigint;
begin
  select count(*) into existing_slug_conflict
  from public.game_catalog_entries
  where slug='number-logic' and stable_key<>'number-logic';

  if existing_slug_conflict<>0 then
    raise exception 'Number Logic slug belongs to another catalog identity';
  end if;

  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    'number-logic','number-logic','Number Logic',
    'Challenge your reasoning across six number-placement puzzles. Solve Lines of 3, U Sums, Magic H, Equal Sums, Square Sums, and Product Square while building mathematical reasoning, number sense, and problem-solving skills.',
    'internal','builtin:number-logic',3,9,
    array['addition','logical-reasoning','mental-math','multiplication','number-sense','problem-solving'],
    array['arithmetic','logic-puzzles','number-operations'],
    array['addition','brain-game','math-puzzle','multiplication','number-logic','number-placement','reasoning'],
    'mixed','draft',31,'0.1.0',
    jsonb_build_object(
      'internal_registry_key','number-logic',
      'internal_route','/games/number-logic/play',
      'implementation_version','0.1.0',
      'source_commit','025fe1e33bbbb36a41d1d3bd34a54d31d0bb08cf',
      'migrated_at',statement_timestamp()
    ),
    jsonb_build_object(
      'strategy','catalog version rollback',
      'standalone_release_commit','025fe1e33bbbb36a41d1d3bd34a54d31d0bb08cf'
    )
  )
  on conflict(stable_key) do update set
    resource_id=null,
    package_id=null,
    slug='number-logic',
    title='Number Logic',
    description=excluded.description,
    launch_type='internal',
    canonical_route=null,
    external_url=null,
    external_allowed_host=null,
    thumbnail_reference='builtin:number-logic',
    recommended_grade_min=3,
    recommended_grade_max=9,
    skills=excluded.skills,
    topics=excluded.topics,
    tags=excluded.tags,
    difficulty='mixed',
    status='draft',
    display_order=31,
    version='0.1.0',
    publication_metadata=public.game_catalog_entries.publication_metadata || excluded.publication_metadata,
    rollback_metadata=public.game_catalog_entries.rollback_metadata || excluded.rollback_metadata,
    lock_version=public.game_catalog_entries.lock_version+1
  returning id into number_logic_id;

  perform private.record_game_catalog_version(number_logic_id,null,null);
end
$migration$;
