-- Math Race Champions V1 — DRAFT / OWNER REVIEW. Catalog registration only.
--
-- Registers the game in the trusted catalog as DRAFT. Draft entries are never
-- listed and the game's routes refuse to serve a draft outside an explicit
-- owner preview, so applying this migration publishes nothing. The wallet,
-- car shop, stage progress and Online Race rooms are added by
-- 20261112110000_math_race_champions.sql.

do $migration$
declare
  entry_id uuid;
  existing_slug_conflict bigint;
  next_order smallint;
begin
  select count(*) into existing_slug_conflict
  from public.game_catalog_entries
  where slug='math-race-champions' and stable_key<>'math-race-champions';
  if existing_slug_conflict<>0 then
    raise exception 'Math Race Champions slug belongs to another catalog identity';
  end if;

  select coalesce(
    (select display_order from public.game_catalog_entries where stable_key='math-race-champions'),
    (select max(display_order)+1 from public.game_catalog_entries),
    1
  ) into next_order;

  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    'math-race-champions','math-race-champions','Math Race Champions',
    'Race through mathematics challenges, compete on the classroom Smart Board, unlock 3D cars, and challenge friends online.',
    'internal','builtin:math-race-champions',3,8,
    -- Catalog arrays are stored normalised: lower case, de-duplicated, sorted.
    array['decimal-to-percentage','evaluating-powers','missing-addend','missing-divisor','missing-multiplier','missing-subtrahend','percentage-to-decimal'],
    array['algebra-foundations','arithmetic','decimals','exponents','percentages'],
    array['algebra-foundations','arithmetic','classroom-game','decimals','exponents','free-game','live-multiplayer','math','multiplayer','percentages','racing','smart-board'],
    'mixed','draft',next_order,'1.0.0',
    jsonb_build_object(
      'internal_registry_key','math-race-champions',
      'internal_route','/games/math-race-champions/play',
      'join_route','/join',
      'category','Mathematics',
      'implementation_version','1.0.0',
      'access','free for signed-in accounts; Online Race guests join with a room code and display name only',
      'release_state','draft-owner-review'
    ),
    jsonb_build_object('strategy','keep draft; to withdraw after release set status to archived (routes then refuse new rooms and races)')
  )
  on conflict(stable_key) do update set
    resource_id=null,
    package_id=null,
    slug='math-race-champions',
    title='Math Race Champions',
    description=excluded.description,
    launch_type='internal',
    canonical_route=null,
    external_url=null,
    external_allowed_host=null,
    thumbnail_reference='builtin:math-race-champions',
    recommended_grade_min=3,
    recommended_grade_max=8,
    skills=excluded.skills,
    topics=excluded.topics,
    tags=excluded.tags,
    difficulty='mixed',
    status='draft',
    display_order=next_order,
    version='1.0.0',
    publication_metadata=public.game_catalog_entries.publication_metadata || excluded.publication_metadata,
    rollback_metadata=public.game_catalog_entries.rollback_metadata || excluded.rollback_metadata,
    lock_version=public.game_catalog_entries.lock_version+1
  returning id into entry_id;

  perform private.record_game_catalog_version(entry_id,null,null);
end
$migration$;
