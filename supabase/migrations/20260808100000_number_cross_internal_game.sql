-- Register trusted, source-controlled MathNexa games without permitting browser
-- identities or Super Admin forms to provide code or module paths. Number Cross
-- is migrated in place and remains Draft until a later owner Publish action.

do $migration$
declare constraint_row record;
begin
  for constraint_row in
    select conname
    from pg_constraint
    where conrelid = 'public.game_catalog_entries'::regclass
      and contype = 'c'
      and position('launch_type' in pg_get_constraintdef(oid)) > 0
  loop
    execute format('alter table public.game_catalog_entries drop constraint %I', constraint_row.conname);
  end loop;
end
$migration$;

alter table public.game_catalog_entries
  add constraint game_catalog_entries_launch_type_check
  check (launch_type in ('canonical','hosted_package','external_https','internal'));

alter table public.game_catalog_entries
  add constraint game_catalog_entries_launch_shape_check
  check (
    (launch_type = 'canonical' and canonical_route = '/play' and package_id is null and resource_id is null and external_url is null and external_allowed_host is null) or
    (launch_type = 'hosted_package' and canonical_route is null and package_id is not null and resource_id is not null and external_url is null and external_allowed_host is null) or
    (launch_type = 'external_https' and canonical_route is null and package_id is null and resource_id is null and external_url is not null and external_allowed_host is not null) or
    (launch_type = 'internal' and canonical_route is null and package_id is null and resource_id is null and external_url is null and external_allowed_host is null)
  );

create or replace function private.game_catalog_destination(p_row public.game_catalog_entries)
returns text language sql immutable set search_path=''
as $$
  select case p_row.launch_type
    when 'canonical' then p_row.canonical_route
    when 'hosted_package' then p_row.package_id::text
    when 'internal' then p_row.stable_key
    else p_row.external_url
  end
$$;

create or replace function private.validate_game_catalog_entry()
returns trigger language plpgsql set search_path=''
as $$
declare package_row public.game_packages%rowtype;
begin
  if new.launch_type = 'external_https' and not private.valid_external_game_destination(new.external_url,new.external_allowed_host) then
    raise exception 'Unsafe external game destination';
  end if;
  if new.launch_type = 'hosted_package' then
    select * into package_row from public.game_packages where id=new.package_id;
    if package_row.id is null or package_row.resource_id<>new.resource_id or
      (new.status='published' and package_row.publication_state<>'published') then
      raise exception 'Invalid hosted game package';
    end if;
  end if;
  if new.launch_type = 'internal' and (
    new.publication_metadata->>'internal_registry_key' is distinct from new.stable_key or
    new.publication_metadata->>'internal_route' is null or
    new.publication_metadata->>'implementation_version' is null
  ) then
    raise exception 'Trusted internal game registration required';
  end if;
  new.updated_at:=statement_timestamp();
  return new;
end;
$$;
revoke all on function private.validate_game_catalog_entry() from public,anon,authenticated,service_role;

do $migration$
declare number_cross_id uuid; existing_slug_conflict bigint;
begin
  select count(*) into existing_slug_conflict from public.game_catalog_entries
    where slug='number-cross' and stable_key<>'number-cross';
  if existing_slug_conflict<>0 then
    raise exception 'Number Cross slug belongs to another catalog identity';
  end if;

  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    'number-cross','number-cross','Number Cross',
    'Cross out numbers until every row and column reaches its target. Practice addition, multiplication, number sense, and logical reasoning through increasingly challenging puzzles.',
    'internal','builtin:number-cross',3,9,
    array['addition','logical-reasoning','mental-math','multiplication','number-sense','problem-solving'],
    array['arithmetic','logic-puzzles','number-operations'],
    array['addition','brain-game','math-puzzle','multiplication','number-cross','practice','reasoning'],
    'mixed','draft',30,'1.0.0',
    jsonb_build_object(
      'internal_registry_key','number-cross',
      'internal_route','/games/number-cross/play',
      'implementation_version','1.0.0',
      'source_commit','4737f5437ec3f04485abf312361d986d1b5e1a94',
      'migrated_at',statement_timestamp()
    ),
    jsonb_build_object(
      'strategy','catalog version rollback',
      'external_backup_origin','https://number-cross.vercel.app'
    )
  )
  on conflict(stable_key) do update set
    resource_id=null,
    package_id=null,
    slug='number-cross',
    title='Number Cross',
    description=excluded.description,
    launch_type='internal',
    canonical_route=null,
    external_url=null,
    external_allowed_host=null,
    thumbnail_reference='builtin:number-cross',
    recommended_grade_min=3,
    recommended_grade_max=9,
    skills=excluded.skills,
    topics=excluded.topics,
    tags=excluded.tags,
    difficulty='mixed',
    status='draft',
    display_order=30,
    version='1.0.0',
    publication_metadata=public.game_catalog_entries.publication_metadata || excluded.publication_metadata,
    rollback_metadata=public.game_catalog_entries.rollback_metadata || excluded.rollback_metadata,
    lock_version=public.game_catalog_entries.lock_version+1
  returning id into number_cross_id;

  perform private.record_game_catalog_version(number_cross_id,null,null);
end
$migration$;

create or replace function public.update_game_catalog_entry(
  p_actor_admin_id uuid,p_catalog_entry_id uuid,p_expected_lock_version bigint,
  p_slug text,p_title text,p_description text,p_thumbnail_reference text,
  p_recommended_grade_min smallint,p_recommended_grade_max smallint,p_skills text[],p_topics text[],p_tags text[],
  p_difficulty text,p_display_order smallint,p_external_url text default null,p_allowed_host text default null
)
returns bigint language plpgsql security definer set search_path=''
as $$
declare current_row public.game_catalog_entries%rowtype; next_lock bigint;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.game_catalog_entries where id=p_catalog_entry_id for update;
  if current_row.id is null or current_row.lock_version<>p_expected_lock_version then raise exception 'Game catalog version conflict'; end if;
  if current_row.status='archived' then raise exception 'Archived game cannot be edited'; end if;
  if current_row.launch_type='internal' and p_slug<>current_row.stable_key then raise exception 'Internal game identity cannot change'; end if;
  if current_row.launch_type='external_https' then
    insert into public.game_external_allowed_hosts(hostname,enabled) values(lower(p_allowed_host),true)
      on conflict(hostname) do update set enabled=true,updated_at=statement_timestamp();
    if not private.valid_external_game_destination(p_external_url,lower(p_allowed_host)) then raise exception 'Unsafe external game destination'; end if;
  elsif p_external_url is not null or p_allowed_host is not null then
    raise exception 'Protected game destination cannot be replaced';
  end if;
  next_lock:=current_row.lock_version+1;
  update public.game_catalog_entries set
    slug=p_slug,title=p_title,description=p_description,thumbnail_reference=p_thumbnail_reference,
    recommended_grade_min=p_recommended_grade_min,recommended_grade_max=p_recommended_grade_max,
    skills=private.normalize_content_tags(p_skills),topics=private.normalize_content_tags(p_topics),
    tags=private.normalize_content_tags(p_tags),difficulty=p_difficulty,display_order=p_display_order,
    external_url=case when current_row.launch_type='external_https' then p_external_url else current_row.external_url end,
    external_allowed_host=case when current_row.launch_type='external_https' then lower(p_allowed_host) else current_row.external_allowed_host end,
    publication_metadata=case when current_row.launch_type='external_https'
      then current_row.publication_metadata||jsonb_build_object('health_status','verified','verified_at',statement_timestamp())
      else current_row.publication_metadata end,
    lock_version=next_lock
    where id=p_catalog_entry_id;
  perform private.record_game_catalog_version(p_catalog_entry_id,p_actor_admin_id,null);
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.update',p_catalog_entry_id::text,
    jsonb_build_object('launch_type',current_row.launch_type,'lock_version',next_lock),null,'internal-game-catalog');
  return next_lock;
end;
$$;

create or replace function public.transition_game_catalog_entry(
  p_actor_admin_id uuid,p_catalog_entry_id uuid,p_expected_lock_version bigint,p_status text
)
returns bigint language plpgsql security definer set search_path=''
as $$
declare current_row public.game_catalog_entries%rowtype; next_lock bigint;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.game_catalog_entries where id=p_catalog_entry_id for update;
  if current_row.id is null or current_row.lock_version<>p_expected_lock_version then raise exception 'Game catalog version conflict'; end if;
  if current_row.launch_type='hosted_package' then raise exception 'Hosted package state is managed by package publication'; end if;
  if current_row.launch_type='canonical' then raise exception 'Canonical game publication is protected'; end if;
  if not (
    (current_row.status='draft' and p_status in ('published','archived')) or
    (current_row.status='published' and p_status in ('maintenance','archived')) or
    (current_row.status='maintenance' and p_status in ('published','archived'))
  ) then raise exception 'Invalid game publication transition'; end if;
  if p_status='published' and current_row.launch_type='external_https' and
    (current_row.publication_metadata->>'health_status')<>'verified' then
    raise exception 'Verified external destination required';
  end if;
  if p_status='published' and current_row.launch_type='internal' and (
    current_row.publication_metadata->>'internal_registry_key' is distinct from current_row.stable_key or
    current_row.publication_metadata->>'internal_route' is null or
    current_row.publication_metadata->>'implementation_version' is null
  ) then raise exception 'Registered internal implementation required'; end if;
  next_lock:=current_row.lock_version+1;
  update public.game_catalog_entries set status=p_status,lock_version=next_lock,
    publication_metadata=publication_metadata||jsonb_build_object(
      'status_changed_at',statement_timestamp(),'status_changed_by',p_actor_admin_id
    )
    where id=p_catalog_entry_id;
  perform private.record_game_catalog_version(p_catalog_entry_id,p_actor_admin_id,null);
  perform public.record_admin_audit_event(
    p_actor_admin_id,
    case p_status when 'published' then 'admin.game.publish' when 'maintenance' then 'admin.game.maintenance' else 'admin.game.archive' end,
    p_catalog_entry_id::text,jsonb_build_object('status',p_status,'launch_type',current_row.launch_type),null,'internal-game-catalog'
  );
  return next_lock;
end;
$$;

revoke all on function public.update_game_catalog_entry(uuid,uuid,bigint,text,text,text,text,smallint,smallint,text[],text[],text[],text,smallint,text,text) from public,anon,authenticated;
revoke all on function public.transition_game_catalog_entry(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.update_game_catalog_entry(uuid,uuid,bigint,text,text,text,text,smallint,smallint,text[],text[],text[],text,smallint,text,text) to service_role;
grant execute on function public.transition_game_catalog_entry(uuid,uuid,bigint,text) to service_role;

comment on table public.game_catalog_entries is 'Catalog for canonical, trusted internal, sandboxed package, and approved HTTPS MathNexa games.';
comment on table public.game_catalog_entry_versions is 'Append-only owner authoring history for canonical, trusted internal, and approved HTTPS game metadata.';
