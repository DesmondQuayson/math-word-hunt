-- Phase 10: align owner authoring with the Phase 9B product model without
-- changing customer billing, entitlements, Auth identities, MFA factors, or
-- existing content. Every new browser privilege remains denied by forced RLS.

create table if not exists public.admin_mfa_challenges (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references public.admin_users(id) on delete restrict,
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  requester_ip inet,
  requester_user_agent text check (requester_user_agent is null or char_length(requester_user_agent) <= 512),
  check (expires_at > created_at),
  check (consumed_at is null or consumed_at >= created_at),
  check (revoked_at is null or revoked_at >= created_at)
);
create index if not exists admin_mfa_challenges_active_idx
  on public.admin_mfa_challenges(admin_user_id,expires_at)
  where consumed_at is null and revoked_at is null;
alter table public.admin_mfa_challenges enable row level security;
alter table public.admin_mfa_challenges force row level security;
revoke all on table public.admin_mfa_challenges from public,anon,authenticated,service_role;
grant select on table public.admin_mfa_challenges to service_role;

create or replace function public.start_admin_mfa_challenge(
  p_admin_user_id uuid,p_token_hash text,p_expires_at timestamptz,p_ip text,p_user_agent text
)
returns uuid language plpgsql security definer set search_path=''
as $$ declare created_id uuid; begin
  perform id from public.admin_users where id=p_admin_user_id and role='owner' and revoked_at is null;
  if not found then raise exception 'Active owner required'; end if;
  if p_token_hash !~ '^[a-f0-9]{64}$' or p_expires_at<=statement_timestamp() or p_expires_at>statement_timestamp()+interval '10 minutes' or
      (p_user_agent is not null and char_length(p_user_agent)>512) then raise exception 'Invalid MFA challenge'; end if;
  update public.admin_mfa_challenges set revoked_at=statement_timestamp()
    where admin_user_id=p_admin_user_id and consumed_at is null and revoked_at is null;
  insert into public.admin_mfa_challenges(admin_user_id,token_hash,expires_at,requester_ip,requester_user_agent)
    values(p_admin_user_id,p_token_hash,p_expires_at,case when p_ip is null then null else p_ip::inet end,p_user_agent)
    returning id into created_id;
  return created_id;
end $$;

create or replace function public.consume_admin_mfa_challenge(p_token_hash text)
returns boolean language plpgsql security definer set search_path=''
as $$ declare changed_id uuid; begin
  if p_token_hash !~ '^[a-f0-9]{64}$' then return false; end if;
  update public.admin_mfa_challenges set consumed_at=statement_timestamp()
    where token_hash=p_token_hash and consumed_at is null and revoked_at is null and expires_at>statement_timestamp()
    returning id into changed_id;
  return changed_id is not null;
end $$;
revoke all on function public.start_admin_mfa_challenge(uuid,text,timestamptz,text,text) from public,anon,authenticated;
revoke all on function public.consume_admin_mfa_challenge(text) from public,anon,authenticated;
grant execute on function public.start_admin_mfa_challenge(uuid,text,timestamptz,text,text) to service_role;
grant execute on function public.consume_admin_mfa_challenge(text) to service_role;

alter table public.game_catalog_entries
  add column if not exists lock_version bigint not null default 1 check (lock_version >= 1);

create table if not exists public.game_catalog_entry_versions (
  id uuid primary key default gen_random_uuid(),
  catalog_entry_id uuid not null references public.game_catalog_entries(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and octet_length(snapshot::text) <= 65536),
  source_version_id uuid references public.game_catalog_entry_versions(id) on delete restrict,
  created_by uuid references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  unique(catalog_entry_id,version_number)
);
alter table public.game_catalog_entry_versions enable row level security;
alter table public.game_catalog_entry_versions force row level security;
revoke all on table public.game_catalog_entry_versions from public,anon,authenticated,service_role;
grant select on table public.game_catalog_entry_versions to service_role;

create or replace function private.game_catalog_snapshot(p_row public.game_catalog_entries)
returns jsonb language sql immutable set search_path=''
as $$ select jsonb_build_object(
  'stable_key',p_row.stable_key,'slug',p_row.slug,'title',p_row.title,'description',p_row.description,
  'launch_type',p_row.launch_type,'canonical_route',p_row.canonical_route,'external_url',p_row.external_url,
  'external_allowed_host',p_row.external_allowed_host,'thumbnail_reference',p_row.thumbnail_reference,
  'recommended_grade_min',p_row.recommended_grade_min,'recommended_grade_max',p_row.recommended_grade_max,
  'skills',to_jsonb(p_row.skills),'topics',to_jsonb(p_row.topics),'tags',to_jsonb(p_row.tags),
  'difficulty',p_row.difficulty,'status',p_row.status,'display_order',p_row.display_order,
  'version',p_row.version,'publication_metadata',p_row.publication_metadata,'rollback_metadata',p_row.rollback_metadata
) $$;
revoke all on function private.game_catalog_snapshot(public.game_catalog_entries) from public,anon,authenticated,service_role;

insert into public.game_catalog_entry_versions(catalog_entry_id,version_number,snapshot,created_by)
select id,1,private.game_catalog_snapshot(e),null from public.game_catalog_entries e
on conflict(catalog_entry_id,version_number) do nothing;

create or replace function private.reject_game_catalog_version_mutation()
returns trigger language plpgsql set search_path=''
as $$ begin raise exception 'Game catalog versions are append-only'; end $$;
revoke all on function private.reject_game_catalog_version_mutation() from public,anon,authenticated,service_role;
drop trigger if exists game_catalog_entry_versions_immutable on public.game_catalog_entry_versions;
create trigger game_catalog_entry_versions_immutable before update or delete on public.game_catalog_entry_versions
for each row execute function private.reject_game_catalog_version_mutation();

create or replace function private.record_game_catalog_version(
  p_catalog_entry_id uuid,p_actor_admin_id uuid,p_source_version_id uuid default null
)
returns integer language plpgsql security definer set search_path=''
as $$ declare entry_row public.game_catalog_entries%rowtype; next_version integer; begin
  select * into entry_row from public.game_catalog_entries where id=p_catalog_entry_id;
  if entry_row.id is null then raise exception 'Game catalog entry unavailable'; end if;
  select coalesce(max(version_number),0)+1 into next_version
    from public.game_catalog_entry_versions where catalog_entry_id=p_catalog_entry_id;
  insert into public.game_catalog_entry_versions(catalog_entry_id,version_number,snapshot,source_version_id,created_by)
    values(p_catalog_entry_id,next_version,private.game_catalog_snapshot(entry_row),p_source_version_id,p_actor_admin_id);
  return next_version;
end $$;
revoke all on function private.record_game_catalog_version(uuid,uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.create_external_game_catalog_entry(
  p_actor_admin_id uuid,p_slug text,p_title text,p_description text,p_external_url text,p_allowed_host text,
  p_thumbnail_reference text,p_recommended_grade_min smallint,p_recommended_grade_max smallint,
  p_skills text[],p_topics text[],p_tags text[],p_difficulty text,p_display_order smallint
)
returns uuid language plpgsql security definer set search_path=''
as $$ declare created_id uuid; begin
  perform private.assert_content_admin(p_actor_admin_id);
  insert into public.game_external_allowed_hosts(hostname,enabled)
    values(lower(p_allowed_host),true)
    on conflict(hostname) do update set enabled=true,updated_at=statement_timestamp();
  if not private.valid_external_game_destination(p_external_url,lower(p_allowed_host)) then
    raise exception 'Unsafe external game destination';
  end if;
  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,external_url,external_allowed_host,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    p_slug,p_slug,p_title,p_description,'external_https',p_external_url,lower(p_allowed_host),p_thumbnail_reference,
    p_recommended_grade_min,p_recommended_grade_max,private.normalize_content_tags(p_skills),
    private.normalize_content_tags(p_topics),private.normalize_content_tags(p_tags),p_difficulty,'draft',p_display_order,'1.0.0',
    jsonb_build_object('health_status','verified','verified_at',statement_timestamp()),
    jsonb_build_object('strategy','catalog version rollback')
  ) returning id into created_id;
  perform private.record_game_catalog_version(created_id,p_actor_admin_id,null);
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.create',created_id::text,
    jsonb_build_object('launch_type','external_https','host',lower(p_allowed_host)),null,'phase10-admin-product-model');
  return created_id;
end $$;

create or replace function public.update_game_catalog_entry(
  p_actor_admin_id uuid,p_catalog_entry_id uuid,p_expected_lock_version bigint,
  p_slug text,p_title text,p_description text,p_thumbnail_reference text,
  p_recommended_grade_min smallint,p_recommended_grade_max smallint,p_skills text[],p_topics text[],p_tags text[],
  p_difficulty text,p_display_order smallint,p_external_url text default null,p_allowed_host text default null
)
returns bigint language plpgsql security definer set search_path=''
as $$ declare current_row public.game_catalog_entries%rowtype; next_lock bigint; begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.game_catalog_entries where id=p_catalog_entry_id for update;
  if current_row.id is null or current_row.lock_version<>p_expected_lock_version then raise exception 'Game catalog version conflict'; end if;
  if current_row.status='archived' then raise exception 'Archived game cannot be edited'; end if;
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
    jsonb_build_object('launch_type',current_row.launch_type,'lock_version',next_lock),null,'phase10-admin-product-model');
  return next_lock;
end $$;

create or replace function public.transition_game_catalog_entry(
  p_actor_admin_id uuid,p_catalog_entry_id uuid,p_expected_lock_version bigint,p_status text
)
returns bigint language plpgsql security definer set search_path=''
as $$ declare current_row public.game_catalog_entries%rowtype; next_lock bigint; begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.game_catalog_entries where id=p_catalog_entry_id for update;
  if current_row.id is null or current_row.lock_version<>p_expected_lock_version then raise exception 'Game catalog version conflict'; end if;
  if current_row.launch_type='hosted_package' then raise exception 'Hosted package state is managed by package publication'; end if;
  if current_row.launch_type='canonical' then raise exception 'Canonical game publication is protected'; end if;
  if not ((current_row.status='draft' and p_status in ('published','archived')) or
          (current_row.status='published' and p_status='archived')) then raise exception 'Invalid game publication transition'; end if;
  if p_status='published' and (current_row.publication_metadata->>'health_status')<>'verified' then
    raise exception 'Verified external destination required';
  end if;
  next_lock:=current_row.lock_version+1;
  update public.game_catalog_entries set status=p_status,lock_version=next_lock,
    publication_metadata=publication_metadata||jsonb_build_object('status_changed_at',statement_timestamp(),'status_changed_by',p_actor_admin_id)
    where id=p_catalog_entry_id;
  perform private.record_game_catalog_version(p_catalog_entry_id,p_actor_admin_id,null);
  perform public.record_admin_audit_event(p_actor_admin_id,
    case when p_status='published' then 'admin.game.publish' else 'admin.game.archive' end,
    p_catalog_entry_id::text,jsonb_build_object('status',p_status),null,'phase10-admin-product-model');
  return next_lock;
end $$;

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
    publication_metadata=publication_metadata||jsonb_build_object('rollback_from_version_id',p_target_version_id,'rolled_back_at',statement_timestamp()),
    rollback_metadata=rollback_metadata||jsonb_build_object('source_version_id',p_target_version_id),lock_version=next_lock
    where id=p_catalog_entry_id;
  perform private.record_game_catalog_version(p_catalog_entry_id,p_actor_admin_id,p_target_version_id);
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.rollback',p_catalog_entry_id::text,
    jsonb_build_object('source_version_id',p_target_version_id),null,'phase10-admin-product-model');
  return next_lock;
end $$;

create or replace function public.create_global_game_resource(
  p_actor_admin_id uuid,p_title text,p_description text,p_tags text[],p_content_manifest jsonb
)
returns uuid language plpgsql security definer set search_path=''
as $$ declare created_id uuid; begin
  perform private.assert_content_admin(p_actor_admin_id);
  insert into public.content_resources(resource_type,resource_scope,scope_status,created_by,updated_by)
    values('game','global','current',p_actor_admin_id,p_actor_admin_id) returning id into created_id;
  insert into public.content_resource_versions(resource_id,version_number,title,description,thumbnail_path,tags,content_manifest,created_by)
    values(created_id,1,p_title,p_description,null,private.normalize_content_tags(p_tags),p_content_manifest,p_actor_admin_id);
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.create',created_id,
    jsonb_build_object('kind','resource','resource_type','game','resource_scope','global','version',1));
  return created_id;
end $$;

create or replace function public.create_topic_content_resource(
  p_actor_admin_id uuid,p_topic_id uuid,p_resource_type text,p_slug text,p_sort_order smallint,
  p_title text,p_description text,p_thumbnail_path text,p_tags text[],p_content_manifest jsonb
)
returns uuid language plpgsql security definer set search_path=''
as $$ declare created_id uuid; begin
  perform private.assert_content_admin(p_actor_admin_id);
  if p_resource_type not in ('quiz_pdf','quiz_answer_key') then raise exception 'Topic scope supports Quiz resources only'; end if;
  perform id from public.content_topics where id=p_topic_id and publication_state<>'archived';
  if not found then raise exception 'Active topic required'; end if;
  insert into public.content_resources(resource_type,resource_scope,scope_status,created_by,updated_by)
    values(p_resource_type,'topic','current',p_actor_admin_id,p_actor_admin_id) returning id into created_id;
  insert into public.content_resource_versions(resource_id,version_number,title,description,thumbnail_path,tags,content_manifest,created_by)
    values(created_id,1,p_title,p_description,p_thumbnail_path,private.normalize_content_tags(p_tags),p_content_manifest,p_actor_admin_id);
  insert into public.topic_resource_assignments(topic_id,resource_id,slug,sort_order,created_by,updated_by)
    values(p_topic_id,created_id,p_slug,p_sort_order,p_actor_admin_id,p_actor_admin_id);
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.create',created_id,
    jsonb_build_object('kind','resource','resource_type',p_resource_type,'topic_id',p_topic_id,'version',1));
  return created_id;
end $$;

create or replace function public.revise_scoped_content_resource(
  p_actor_admin_id uuid,p_resource_id uuid,p_expected_lock_version bigint,p_expected_assignment_lock_version bigint,
  p_title text,p_description text,p_thumbnail_path text,p_tags text[],p_content_manifest jsonb,p_slug text,p_sort_order smallint
)
returns integer language plpgsql security definer set search_path=''
as $$ declare resource_row public.content_resources%rowtype; next_version integer; assignment_lock bigint; source_version_id_value uuid; begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into resource_row from public.content_resources where id=p_resource_id for update;
  if resource_row.id is null or resource_row.lock_version<>p_expected_lock_version then raise exception 'Content version conflict'; end if;
  if resource_row.publication_state='archived' then raise exception 'Archived resource cannot be revised'; end if;
  select coalesce(source_version_id,id) into source_version_id_value from public.content_resource_versions
    where resource_id=p_resource_id and version_number=resource_row.current_version_number;
  if source_version_id_value is null then raise exception 'Current resource version unavailable'; end if;
  next_version:=resource_row.current_version_number+1;
  insert into public.content_resource_versions(
    resource_id,version_number,title,description,thumbnail_path,tags,content_manifest,source_version_id,created_by
  ) values(
    p_resource_id,next_version,p_title,p_description,p_thumbnail_path,private.normalize_content_tags(p_tags),
    p_content_manifest,source_version_id_value,p_actor_admin_id
  );
  update public.content_resources set current_version_number=next_version,publication_state='draft',
    lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),archived_at=null
    where id=p_resource_id;
  if resource_row.resource_scope='topic' then
    select lock_version into assignment_lock from public.topic_resource_assignments where resource_id=p_resource_id for update;
    if assignment_lock is null or assignment_lock<>p_expected_assignment_lock_version then raise exception 'Assignment version conflict'; end if;
    update public.topic_resource_assignments set slug=p_slug,sort_order=p_sort_order,lock_version=lock_version+1,
      updated_by=p_actor_admin_id,updated_at=statement_timestamp() where resource_id=p_resource_id;
  else
    select lock_version into assignment_lock from public.lesson_resource_assignments where resource_id=p_resource_id for update;
    if assignment_lock is null or assignment_lock<>p_expected_assignment_lock_version then raise exception 'Assignment version conflict'; end if;
    update public.lesson_resource_assignments set slug=p_slug,sort_order=p_sort_order,lock_version=lock_version+1,
      updated_by=p_actor_admin_id,updated_at=statement_timestamp() where resource_id=p_resource_id;
  end if;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.assignment.update',p_resource_id,
    jsonb_build_object('slug',p_slug,'sort_order',p_sort_order,'version',next_version));
  return next_version;
end $$;

-- Revisions intentionally reuse immutable accepted files through source_version_id.
-- Publication still requires an accepted PDF; it may reside on the linked source version.
create or replace function private.require_pdf_before_publish()
returns trigger language plpgsql set search_path=''
as $$ declare resource_kind text; expected_role text; file_version integer; begin
  if new.publication_state='published' and old.publication_state<>'published' then
    select resource_type into resource_kind from public.content_resources where id=new.resource_id;
    if resource_kind in ('homework_pdf','homework_answer_key','quiz_pdf','quiz_answer_key') then
      expected_role:=case when resource_kind in ('homework_answer_key','quiz_answer_key') then 'answer_key_pdf' else 'primary_pdf' end;
      file_version:=new.version_number;
      if new.source_version_id is not null then
        select version_number into file_version from public.content_resource_versions where id=new.source_version_id;
      end if;
      perform id from public.resource_files where resource_id=new.resource_id
        and resource_version_number=file_version and file_role=expected_role and validation_state='accepted';
      if not found then raise exception 'Accepted PDF required before publication'; end if;
    end if;
  end if;
  return new;
end $$;
revoke all on function private.require_pdf_before_publish() from public,anon,authenticated,service_role;

create or replace function private.validate_topic_resource_assignment()
returns trigger language plpgsql set search_path=''
as $$ declare resource_row public.content_resources%rowtype; begin
  select * into resource_row from public.content_resources where id=new.resource_id;
  if resource_row.resource_type not in ('quiz_pdf','quiz_answer_key') or not (
    (resource_row.resource_scope='topic' and resource_row.scope_status='current') or
    (resource_row.resource_scope='lesson' and resource_row.scope_status='legacy')
  ) then raise exception 'Topic assignments require a Quiz resource'; end if;
  new.updated_at:=statement_timestamp();return new;
end $$;

create or replace function public.convert_legacy_quiz_to_topic_scope(
  p_actor_admin_id uuid,p_resource_id uuid,p_topic_id uuid,p_slug text,p_sort_order smallint
)
returns boolean language plpgsql security definer set search_path=''
as $$ declare resource_row public.content_resources%rowtype; lesson_topic uuid; begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into resource_row from public.content_resources where id=p_resource_id for update;
  if resource_row.resource_type not in ('quiz_pdf','quiz_answer_key') or resource_row.resource_scope<>'lesson' or resource_row.scope_status<>'legacy' then
    raise exception 'Legacy lesson-scoped Quiz required';
  end if;
  select l.topic_id into lesson_topic from public.lesson_resource_assignments a
    join public.content_lessons l on l.id=a.lesson_id where a.resource_id=p_resource_id;
  if lesson_topic is null or lesson_topic<>p_topic_id then raise exception 'Quiz must remain in its inherited topic'; end if;
  insert into public.topic_resource_assignments(topic_id,resource_id,slug,sort_order,created_by,updated_by)
    values(p_topic_id,p_resource_id,p_slug,p_sort_order,p_actor_admin_id,p_actor_admin_id);
  update public.content_resources set resource_scope='topic',scope_status='current',lock_version=lock_version+1,
    updated_by=p_actor_admin_id,updated_at=statement_timestamp() where id=p_resource_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.quiz.convert-topic-scope',p_resource_id,
    jsonb_build_object('topic_id',p_topic_id,'legacy_lesson_assignment_preserved',true));
  return true;
end $$;

create or replace function private.validate_published_resource_hierarchy()
returns trigger language plpgsql set search_path=''
as $$ declare topic_id_value uuid; begin
  if new.publication_state<>'published' then return new; end if;
  if new.resource_type in ('homework_pdf','homework_answer_key') and not exists(
    select 1 from public.lesson_resource_assignments where resource_id=new.id) then
    raise exception 'Published Homework requires a lesson assignment';
  end if;
  if new.resource_type in ('quiz_pdf','quiz_answer_key') and new.resource_scope='topic' and not exists(
    select 1 from public.topic_resource_assignments where resource_id=new.id) then
    raise exception 'Published current Quiz requires a topic assignment';
  end if;
  if new.resource_type='quiz_pdf' and new.resource_scope='topic' then
    select topic_id into topic_id_value from public.topic_resource_assignments where resource_id=new.id;
    if exists(select 1 from public.topic_resource_assignments a join public.content_resources r on r.id=a.resource_id
      where a.topic_id=topic_id_value and r.id<>new.id and r.resource_type='quiz_pdf' and
        r.resource_scope='topic' and r.scope_status='current' and r.publication_state='published') then
      raise exception 'Only one current published Quiz is allowed per Topic';
    end if;
  end if;
  return new;
end $$;

create or replace function private.protect_referenced_taxonomy_archive()
returns trigger language plpgsql set search_path=''
as $$ begin
  if old.publication_state<>'archived' and new.publication_state='archived' then
    if tg_table_name='content_grades' and exists(select 1 from public.content_topics where grade_id=old.id and publication_state<>'archived') then
      raise exception 'Archive Topics before archiving this Grade';
    elsif tg_table_name='content_topics' and (
      exists(select 1 from public.content_lessons where topic_id=old.id and publication_state<>'archived') or
      exists(select 1 from public.topic_resource_assignments where topic_id=old.id)
    ) then raise exception 'Referenced Topic cannot be archived';
    elsif tg_table_name='content_lessons' and exists(select 1 from public.lesson_resource_assignments where lesson_id=old.id) then
      raise exception 'Referenced Lesson cannot be archived';
    end if;
  end if;
  return new;
end $$;
revoke all on function private.protect_referenced_taxonomy_archive() from public,anon,authenticated,service_role;
drop trigger if exists content_grades_archive_protection on public.content_grades;
create trigger content_grades_archive_protection before update of publication_state on public.content_grades
for each row execute function private.protect_referenced_taxonomy_archive();
drop trigger if exists content_topics_archive_protection on public.content_topics;
create trigger content_topics_archive_protection before update of publication_state on public.content_topics
for each row execute function private.protect_referenced_taxonomy_archive();
drop trigger if exists content_lessons_archive_protection on public.content_lessons;
create trigger content_lessons_archive_protection before update of publication_state on public.content_lessons
for each row execute function private.protect_referenced_taxonomy_archive();

-- Reconcile hosted packages into the standalone catalog using package metadata,
-- never a curriculum parent. Existing package/history rows remain untouched.
create or replace function private.sync_published_game_catalog_entry()
returns trigger language plpgsql security definer set search_path=''
as $$
declare version_row public.content_resource_versions%rowtype; manifest jsonb; catalog_id uuid;
begin
  if new.publication_state='published' then
    select * into version_row from public.content_resource_versions
      where resource_id=new.resource_id and version_number=new.resource_version_number and publication_state='published';
    if version_row.id is null then raise exception 'Published package requires a published resource version'; end if;
    manifest:=coalesce(version_row.content_manifest,'{}'::jsonb);
    insert into public.game_catalog_entries(
      resource_id,package_id,stable_key,slug,title,description,launch_type,thumbnail_reference,
      recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
      publication_metadata,rollback_metadata
    ) values(
      new.resource_id,new.id,new.game_id,new.game_id,version_row.title,
      case when version_row.description='' then 'Owner-reviewed standalone MathNexa game.' else version_row.description end,
      'hosted_package','package:thumbnail.png',nullif(manifest->>'recommended_grade_min','')::smallint,
      nullif(manifest->>'recommended_grade_max','')::smallint,
      array(select jsonb_array_elements_text(coalesce(manifest->'skills','[]'::jsonb))),
      array(select jsonb_array_elements_text(coalesce(manifest->'topics','[]'::jsonb))),version_row.tags,
      coalesce(nullif(manifest->>'difficulty',''),'core'),'published',
      coalesce(nullif(manifest->>'display_order','')::smallint,(select max(display_order)+1 from public.game_catalog_entries where status='published'),2),
      new.package_version,jsonb_build_object('package_id',new.id,'published_at',new.published_at),
      jsonb_build_object('source_package_id',new.source_package_id)
    ) on conflict(stable_key) do update set
      resource_id=excluded.resource_id,package_id=excluded.package_id,title=excluded.title,description=excluded.description,
      launch_type='hosted_package',canonical_route=null,external_url=null,external_allowed_host=null,
      thumbnail_reference=excluded.thumbnail_reference,recommended_grade_min=excluded.recommended_grade_min,
      recommended_grade_max=excluded.recommended_grade_max,skills=excluded.skills,topics=excluded.topics,tags=excluded.tags,
      difficulty=excluded.difficulty,status='published',display_order=excluded.display_order,version=excluded.version,
      publication_metadata=excluded.publication_metadata,rollback_metadata=excluded.rollback_metadata,
      lock_version=public.game_catalog_entries.lock_version+1
    where public.game_catalog_entries.launch_type='hosted_package'
    returning id into catalog_id;
    if catalog_id is not null then perform private.record_game_catalog_version(catalog_id,new.created_by,null); end if;
  elsif new.publication_state='archived' then
    update public.game_catalog_entries set status='archived',lock_version=lock_version+1
      where launch_type='hosted_package' and package_id=new.id;
  end if;
  return new;
end $$;
revoke all on function private.sync_published_game_catalog_entry() from public,anon,authenticated,service_role;

revoke all on function public.create_external_game_catalog_entry(uuid,text,text,text,text,text,text,smallint,smallint,text[],text[],text[],text,smallint) from public,anon,authenticated;
revoke all on function public.update_game_catalog_entry(uuid,uuid,bigint,text,text,text,text,smallint,smallint,text[],text[],text[],text,smallint,text,text) from public,anon,authenticated;
revoke all on function public.transition_game_catalog_entry(uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.rollback_game_catalog_entry(uuid,uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.create_global_game_resource(uuid,text,text,text[],jsonb) from public,anon,authenticated;
revoke all on function public.create_topic_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb) from public,anon,authenticated;
revoke all on function public.revise_scoped_content_resource(uuid,uuid,bigint,bigint,text,text,text,text[],jsonb,text,smallint) from public,anon,authenticated;
revoke all on function public.convert_legacy_quiz_to_topic_scope(uuid,uuid,uuid,text,smallint) from public,anon,authenticated;
grant execute on function public.create_external_game_catalog_entry(uuid,text,text,text,text,text,text,smallint,smallint,text[],text[],text[],text,smallint) to service_role;
grant execute on function public.update_game_catalog_entry(uuid,uuid,bigint,text,text,text,text,smallint,smallint,text[],text[],text[],text,smallint,text,text) to service_role;
grant execute on function public.transition_game_catalog_entry(uuid,uuid,bigint,text) to service_role;
grant execute on function public.rollback_game_catalog_entry(uuid,uuid,uuid,bigint) to service_role;
grant execute on function public.create_global_game_resource(uuid,text,text,text[],jsonb) to service_role;
grant execute on function public.create_topic_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb) to service_role;
grant execute on function public.revise_scoped_content_resource(uuid,uuid,bigint,bigint,text,text,text,text[],jsonb,text,smallint) to service_role;
grant execute on function public.convert_legacy_quiz_to_topic_scope(uuid,uuid,uuid,text,smallint) to service_role;

comment on table public.admin_mfa_challenges is 'Short-lived server-owned proof that the owner completed a fresh first factor before Admin MFA.';
comment on function public.consume_admin_mfa_challenge(text) is 'Atomically consumes one unexpired owner first-factor challenge; replay returns false.';
comment on table public.game_catalog_entry_versions is 'Append-only owner authoring history for canonical and approved HTTPS game catalog metadata.';
comment on function public.create_topic_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb) is 'Phase 10 Topic-level Quiz creation; Lesson is intentionally absent.';
