-- Owner-authorized CrossCalc V2 public release. The application deployment is
-- version-gated, so this single catalog transaction is the public cutover.
-- Production preflight identity: f457a0db-98bb-4401-8584-c8ba5cd93c98.

create or replace function public.rollback_game_catalog_entry(
  p_actor_admin_id uuid,p_catalog_entry_id uuid,p_target_version_id uuid,p_expected_lock_version bigint
)
returns bigint language plpgsql security definer set search_path=''
as $$ declare current_row public.game_catalog_entries%rowtype; target_row public.game_catalog_entry_versions%rowtype; next_lock bigint; begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.game_catalog_entries where id=p_catalog_entry_id for update;
  select * into target_row from public.game_catalog_entry_versions where id=p_target_version_id and catalog_entry_id=p_catalog_entry_id;
  if current_row.id is null or target_row.id is null or current_row.lock_version<>p_expected_lock_version or current_row.status='archived' then
    raise exception 'Game catalog rollback unavailable';
  end if;
  if current_row.launch_type='hosted_package' then raise exception 'Hosted package rollback uses package history'; end if;
  if target_row.snapshot->>'launch_type'<>current_row.launch_type then raise exception 'Game launch type cannot change'; end if;
  if current_row.launch_type='canonical' and target_row.snapshot->>'canonical_route'<>'/play' then raise exception 'Canonical route is protected'; end if;
  if current_row.launch_type='external_https' and not private.valid_external_game_destination(
      target_row.snapshot->>'external_url',target_row.snapshot->>'external_allowed_host') then raise exception 'Historical destination is no longer allowed'; end if;
  next_lock:=current_row.lock_version+1;
  update public.game_catalog_entries set
    slug=target_row.snapshot->>'slug',title=target_row.snapshot->>'title',description=target_row.snapshot->>'description',
    external_url=case when current_row.launch_type='external_https' then target_row.snapshot->>'external_url' else current_row.external_url end,
    external_allowed_host=case when current_row.launch_type='external_https' then target_row.snapshot->>'external_allowed_host' else current_row.external_allowed_host end,
    thumbnail_reference=target_row.snapshot->>'thumbnail_reference',
    recommended_grade_min=nullif(target_row.snapshot->>'recommended_grade_min','')::smallint,
    recommended_grade_max=nullif(target_row.snapshot->>'recommended_grade_max','')::smallint,
    skills=array(select jsonb_array_elements_text(target_row.snapshot->'skills')),
    topics=array(select jsonb_array_elements_text(target_row.snapshot->'topics')),
    tags=array(select jsonb_array_elements_text(target_row.snapshot->'tags')),
    difficulty=target_row.snapshot->>'difficulty',display_order=(target_row.snapshot->>'display_order')::smallint,
    version=target_row.snapshot->>'version',
    publication_metadata=publication_metadata||jsonb_build_object('rollback_from_version_id',p_target_version_id,'rolled_back_at',statement_timestamp()),
    rollback_metadata=rollback_metadata||jsonb_build_object('source_version_id',p_target_version_id),lock_version=next_lock
    where id=p_catalog_entry_id;
  perform private.record_game_catalog_version(p_catalog_entry_id,p_actor_admin_id,p_target_version_id);
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.rollback',p_catalog_entry_id::text,
    jsonb_build_object('source_version_id',p_target_version_id),null,'phase10-admin-product-model');
  return next_lock;
end $$;
revoke all on function public.rollback_game_catalog_entry(uuid,uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.rollback_game_catalog_entry(uuid,uuid,uuid,bigint) to service_role;

do $release$
declare
  entry_row public.game_catalog_entries%rowtype;
  entry_count bigint;
  actor_id uuid;
  prior_version_id uuid;
begin
  select count(*) into entry_count from public.game_catalog_entries where stable_key='crosscalc';
  if entry_count<>1 then raise exception 'CrossCalc release requires exactly one catalog identity'; end if;

  select * into entry_row from public.game_catalog_entries where stable_key='crosscalc' for update;
  if entry_row.slug<>'crosscalc' or entry_row.launch_type<>'internal' or
     entry_row.status not in ('draft','published') or entry_row.version<>'0.1.0' or
     entry_row.thumbnail_reference<>'builtin:crosscalc' then
    raise exception 'CrossCalc release preflight drift detected';
  end if;

  select id into actor_id from public.admin_users
    where role='owner' and revoked_at is null order by created_at limit 1;

  select id into prior_version_id from public.game_catalog_entry_versions
    where catalog_entry_id=entry_row.id and snapshot->>'version'='0.1.0'
    order by version_number desc limit 1;
  if prior_version_id is null then raise exception 'CrossCalc V1 rollback snapshot unavailable'; end if;

  update public.game_catalog_entries set
    description='Players place available whole-number tiles into a connected network of equations so every horizontal and vertical equation becomes correct.',
    thumbnail_reference='builtin:crosscalc-v2',
    version='0.2.0',
    publication_metadata=publication_metadata||jsonb_build_object(
      'implementation_version','0.2.0',
      'result_contract','crosscalc-result/2',
      'storage_namespace','mathnexa.crosscalc.v2',
      'approved_standalone_source','9d27dbc21fce043569fae89ab5b4434ae2d0bac0',
      'approved_integration_source','20032dfc47e2aa210af38742a21edfa60851cd26',
      'released_at',statement_timestamp(),
      'release_state','published'
    ),
    rollback_metadata=rollback_metadata||jsonb_build_object(
      'strategy','catalog version rollback',
      'v1_version_id',prior_version_id,
      'v1_version','0.1.0',
      'v1_thumbnail_reference','builtin:crosscalc',
      'v1_deployment_id','dpl_HBobCoxsXhZnyBevzau8s533v12i'
    ),
    lock_version=lock_version+1
    where id=entry_row.id;

  perform private.record_game_catalog_version(entry_row.id,actor_id,prior_version_id);
  if actor_id is not null then
    perform public.record_admin_audit_event(actor_id,'admin.game.release',entry_row.id::text,
      jsonb_build_object('from_version','0.1.0','to_version','0.2.0','runtime','crosscalc-v2','result_contract','crosscalc-result/2'),
      null,'migration:20260816050000_crosscalc_v2_public_release');
  end if;
end
$release$;
