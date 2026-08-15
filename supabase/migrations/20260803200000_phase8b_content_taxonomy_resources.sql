-- Phase 8B: owner-managed Grade -> Topic -> Lesson -> Resource taxonomy.
-- No curriculum rows are seeded. Browser roles receive no direct table or RPC
-- authority; reviewed server operations are the only write boundary.

create or replace function private.normalize_content_tags(p_tags text[])
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when pg_catalog.cardinality(coalesce(p_tags, '{}'::text[])) > 20
      or exists (
        select 1
        from pg_catalog.unnest(coalesce(p_tags, '{}'::text[])) as value
        where pg_catalog.lower(pg_catalog.btrim(value)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
          or pg_catalog.char_length(pg_catalog.lower(pg_catalog.btrim(value))) not between 1 and 48
      )
    then null
    else coalesce((
      select pg_catalog.array_agg(distinct normalized order by normalized)
      from (
        select pg_catalog.lower(pg_catalog.btrim(value)) as normalized
        from pg_catalog.unnest(coalesce(p_tags, '{}'::text[])) as value
      ) tags
    ), '{}'::text[])
  end;
$$;
revoke all on function private.normalize_content_tags(text[]) from public, anon, authenticated, service_role;

create or replace function private.valid_content_manifest(p_resource_type text, p_manifest jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  external_url text;
  url_authority text;
begin
  if p_manifest is null or pg_catalog.jsonb_typeof(p_manifest) <> 'object'
     or pg_catalog.octet_length(p_manifest::text) > 16384 then
    return false;
  end if;
  external_url := p_manifest ->> 'external_url';
  if p_resource_type = 'map_prep_link' then
    url_authority := pg_catalog.split_part(external_url, '/', 3);
    return external_url ~ '^https://[A-Za-z0-9]'
      and pg_catalog.strpos(url_authority, '@') = 0
      and not (p_manifest ?| array['html','script','package','file_path','storage_path']);
  end if;
  return not (p_manifest ? 'external_url');
end;
$$;
revoke all on function private.valid_content_manifest(text, jsonb) from public, anon, authenticated, service_role;

create or replace function private.valid_content_object_path(p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is null or (
    pg_catalog.char_length(p_path) between 1 and 512
    and p_path ~ '^[a-z0-9][a-z0-9/_.-]*$'
    and pg_catalog.strpos(p_path, '..') = 0
    and pg_catalog.strpos(p_path, '\\') = 0
  );
$$;
revoke all on function private.valid_content_object_path(text) from public, anon, authenticated, service_role;

create table public.content_grades (
  id uuid primary key default gen_random_uuid(),
  grade_number smallint not null unique check (grade_number between 1 and 9),
  title text not null check (title = btrim(title) and char_length(title) between 1 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 96),
  sort_order smallint not null unique check (sort_order between 1 and 32767),
  publication_state text not null default 'draft' check (publication_state in ('draft','validating','ready_for_review','published','archived')),
  lock_version bigint not null default 1 check (lock_version >= 1),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (updated_at >= created_at),
  check ((publication_state = 'archived') = (archived_at is not null))
);

create table public.content_topics (
  id uuid primary key default gen_random_uuid(),
  grade_id uuid not null references public.content_grades(id) on delete restrict,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 96),
  sort_order smallint not null check (sort_order between 1 and 32767),
  publication_state text not null default 'draft' check (publication_state in ('draft','validating','ready_for_review','published','archived')),
  lock_version bigint not null default 1 check (lock_version >= 1),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (grade_id, slug),
  unique (grade_id, sort_order),
  check (updated_at >= created_at),
  check ((publication_state = 'archived') = (archived_at is not null))
);

create table public.content_lessons (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.content_topics(id) on delete restrict,
  title text not null check (title = btrim(title) and char_length(title) between 1 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 96),
  sort_order smallint not null check (sort_order between 1 and 32767),
  publication_state text not null default 'draft' check (publication_state in ('draft','validating','ready_for_review','published','archived')),
  lock_version bigint not null default 1 check (lock_version >= 1),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  unique (topic_id, slug),
  unique (topic_id, sort_order),
  check (updated_at >= created_at),
  check ((publication_state = 'archived') = (archived_at is not null))
);

create table public.content_resources (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in (
    'game','homework_pdf','homework_answer_key','quiz_pdf','quiz_answer_key',
    'preview_image','thumbnail','map_prep_link'
  )),
  publication_state text not null default 'draft' check (publication_state in ('draft','validating','ready_for_review','published','archived')),
  current_version_number integer not null default 1 check (current_version_number >= 1),
  published_version_number integer check (published_version_number is null or published_version_number between 1 and current_version_number),
  lock_version bigint not null default 1 check (lock_version >= 1),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  check (updated_at >= created_at),
  check ((publication_state = 'archived') = (archived_at is not null))
);

create table public.content_resource_versions (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.content_resources(id) on delete restrict,
  version_number integer not null check (version_number >= 1),
  publication_state text not null default 'draft' check (publication_state in ('draft','validating','ready_for_review','published','archived')),
  title text not null check (title = btrim(title) and char_length(title) between 1 and 160),
  description text not null default '' check (description = btrim(description) and char_length(description) <= 4000),
  thumbnail_path text check (private.valid_content_object_path(thumbnail_path)),
  tags text[] not null default '{}'::text[] check (
    cardinality(tags) <= 20 and tags = private.normalize_content_tags(tags)
  ),
  content_manifest jsonb not null default '{}'::jsonb,
  source_version_id uuid references public.content_resource_versions(id) on delete restrict,
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_by uuid references public.admin_users(id) on delete restrict,
  published_at timestamptz,
  unique (resource_id, version_number),
  check ((publication_state = 'published') = (published_by is not null and published_at is not null))
);

create table public.lesson_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.content_lessons(id) on delete restrict,
  resource_id uuid not null references public.content_resources(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 96),
  sort_order smallint not null check (sort_order between 1 and 32767),
  lock_version bigint not null default 1 check (lock_version >= 1),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lesson_id, resource_id),
  unique (lesson_id, slug),
  unique (lesson_id, sort_order),
  check (updated_at >= created_at)
);

create or replace function private.validate_content_resource_version()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  resource_kind text;
begin
  select resource_type into resource_kind from public.content_resources where id = new.resource_id;
  if resource_kind is null or not private.valid_content_manifest(resource_kind, new.content_manifest) then
    raise exception 'Invalid content resource manifest';
  end if;
  return new;
end;
$$;
revoke all on function private.validate_content_resource_version() from public, anon, authenticated, service_role;
create trigger content_resource_version_validate
before insert or update on public.content_resource_versions
for each row execute function private.validate_content_resource_version();

create or replace function private.protect_published_content_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.publication_state = 'published' then
    raise exception 'Published content versions are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;
revoke all on function private.protect_published_content_version() from public, anon, authenticated, service_role;
create trigger content_resource_version_immutable
before update or delete on public.content_resource_versions
for each row execute function private.protect_published_content_version();

create or replace function private.protect_published_content_resource()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.published_version_number is not null then
    raise exception 'Published content resources cannot be hard deleted';
  end if;
  return old;
end;
$$;
revoke all on function private.protect_published_content_resource() from public, anon, authenticated, service_role;
create trigger content_resource_no_published_delete
before delete on public.content_resources
for each row execute function private.protect_published_content_resource();

create index content_topics_grade_order_idx on public.content_topics(grade_id, sort_order);
create index content_lessons_topic_order_idx on public.content_lessons(topic_id, sort_order);
create index content_assignments_lesson_order_idx on public.lesson_resource_assignments(lesson_id, sort_order);
create index content_resources_publication_idx on public.content_resources(publication_state, resource_type);
create index content_versions_resource_created_idx on public.content_resource_versions(resource_id, version_number desc);
create index content_versions_published_idx on public.content_resource_versions(resource_id, published_at desc) where publication_state = 'published';

alter table public.content_grades enable row level security;
alter table public.content_grades force row level security;
alter table public.content_topics enable row level security;
alter table public.content_topics force row level security;
alter table public.content_lessons enable row level security;
alter table public.content_lessons force row level security;
alter table public.content_resources enable row level security;
alter table public.content_resources force row level security;
alter table public.content_resource_versions enable row level security;
alter table public.content_resource_versions force row level security;
alter table public.lesson_resource_assignments enable row level security;
alter table public.lesson_resource_assignments force row level security;

revoke all on table public.content_grades from public, anon, authenticated, service_role;
revoke all on table public.content_topics from public, anon, authenticated, service_role;
revoke all on table public.content_lessons from public, anon, authenticated, service_role;
revoke all on table public.content_resources from public, anon, authenticated, service_role;
revoke all on table public.content_resource_versions from public, anon, authenticated, service_role;
revoke all on table public.lesson_resource_assignments from public, anon, authenticated, service_role;
grant select on table public.content_grades, public.content_topics, public.content_lessons,
  public.content_resources, public.content_resource_versions, public.lesson_resource_assignments to service_role;

create or replace function private.assert_content_admin(p_actor_admin_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform id from public.admin_users
    where id = p_actor_admin_id and role = 'owner' and revoked_at is null and mfa_enrolled;
  if not found then raise exception 'Active MFA-enrolled owner required'; end if;
end;
$$;
revoke all on function private.assert_content_admin(uuid) from public, anon, authenticated, service_role;

create or replace function private.content_state_transition_allowed(p_from text, p_to text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_from = p_to or
    (p_from = 'draft' and p_to in ('validating','archived')) or
    (p_from = 'validating' and p_to in ('draft','ready_for_review','archived')) or
    (p_from = 'ready_for_review' and p_to in ('draft','published','archived')) or
    (p_from = 'published' and p_to = 'archived');
$$;
revoke all on function private.content_state_transition_allowed(text, text) from public, anon, authenticated, service_role;

create or replace function private.audit_content_mutation(
  p_actor_admin_id uuid, p_action text, p_target uuid, p_metadata jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.record_admin_audit_event(
    p_actor_admin_id, p_action, p_target::text, coalesce(p_metadata, '{}'::jsonb), null, 'phase8b-content-service'
  );
end;
$$;
revoke all on function private.audit_content_mutation(uuid, text, uuid, jsonb) from public, anon, authenticated, service_role;

create or replace function public.create_content_grade(
  p_actor_admin_id uuid, p_grade_number smallint, p_title text, p_slug text, p_sort_order smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  insert into public.content_grades(grade_number,title,slug,sort_order,created_by,updated_by)
    values(p_grade_number,p_title,p_slug,p_sort_order,p_actor_admin_id,p_actor_admin_id)
    returning id into created_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.create',created_id,
    pg_catalog.jsonb_build_object('kind','grade','grade_number',p_grade_number));
  return created_id;
end;
$$;

create or replace function public.create_content_topic(
  p_actor_admin_id uuid, p_grade_id uuid, p_title text, p_slug text, p_sort_order smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  perform id from public.content_grades where id=p_grade_id and publication_state<>'archived';
  if not found then raise exception 'Active grade required'; end if;
  insert into public.content_topics(grade_id,title,slug,sort_order,created_by,updated_by)
    values(p_grade_id,p_title,p_slug,p_sort_order,p_actor_admin_id,p_actor_admin_id)
    returning id into created_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.create',created_id,
    pg_catalog.jsonb_build_object('kind','topic','grade_id',p_grade_id));
  return created_id;
end;
$$;

create or replace function public.create_content_lesson(
  p_actor_admin_id uuid, p_topic_id uuid, p_title text, p_slug text, p_sort_order smallint
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  perform id from public.content_topics where id=p_topic_id and publication_state<>'archived';
  if not found then raise exception 'Active topic required'; end if;
  insert into public.content_lessons(topic_id,title,slug,sort_order,created_by,updated_by)
    values(p_topic_id,p_title,p_slug,p_sort_order,p_actor_admin_id,p_actor_admin_id)
    returning id into created_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.create',created_id,
    pg_catalog.jsonb_build_object('kind','lesson','topic_id',p_topic_id));
  return created_id;
end;
$$;

create or replace function public.update_content_grade(
  p_actor_admin_id uuid, p_grade_id uuid, p_expected_lock_version bigint,
  p_title text, p_slug text, p_sort_order smallint, p_publication_state text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare current_row public.content_grades%rowtype; next_lock bigint;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.content_grades where id=p_grade_id for update;
  if not found or current_row.lock_version<>p_expected_lock_version then raise exception 'Content version conflict'; end if;
  if not private.content_state_transition_allowed(current_row.publication_state,p_publication_state) then raise exception 'Invalid publication transition'; end if;
  next_lock:=current_row.lock_version+1;
  update public.content_grades set title=p_title,slug=p_slug,sort_order=p_sort_order,
    publication_state=p_publication_state,lock_version=next_lock,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),
    archived_at=case when p_publication_state='archived' then statement_timestamp() else null end
    where id=p_grade_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.update',p_grade_id,
    pg_catalog.jsonb_build_object('kind','grade','lock_version',next_lock,'state',p_publication_state));
  return next_lock;
end;
$$;

create or replace function public.update_content_topic(
  p_actor_admin_id uuid, p_topic_id uuid, p_expected_lock_version bigint,
  p_title text, p_slug text, p_sort_order smallint, p_publication_state text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare current_row public.content_topics%rowtype; next_lock bigint;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.content_topics where id=p_topic_id for update;
  if not found or current_row.lock_version<>p_expected_lock_version then raise exception 'Content version conflict'; end if;
  if not private.content_state_transition_allowed(current_row.publication_state,p_publication_state) then raise exception 'Invalid publication transition'; end if;
  next_lock:=current_row.lock_version+1;
  update public.content_topics set title=p_title,slug=p_slug,sort_order=p_sort_order,
    publication_state=p_publication_state,lock_version=next_lock,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),
    archived_at=case when p_publication_state='archived' then statement_timestamp() else null end
    where id=p_topic_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.update',p_topic_id,
    pg_catalog.jsonb_build_object('kind','topic','lock_version',next_lock,'state',p_publication_state));
  return next_lock;
end;
$$;

create or replace function public.update_content_lesson(
  p_actor_admin_id uuid, p_lesson_id uuid, p_expected_lock_version bigint,
  p_title text, p_slug text, p_sort_order smallint, p_publication_state text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare current_row public.content_lessons%rowtype; next_lock bigint;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.content_lessons where id=p_lesson_id for update;
  if not found or current_row.lock_version<>p_expected_lock_version then raise exception 'Content version conflict'; end if;
  if not private.content_state_transition_allowed(current_row.publication_state,p_publication_state) then raise exception 'Invalid publication transition'; end if;
  next_lock:=current_row.lock_version+1;
  update public.content_lessons set title=p_title,slug=p_slug,sort_order=p_sort_order,
    publication_state=p_publication_state,lock_version=next_lock,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),
    archived_at=case when p_publication_state='archived' then statement_timestamp() else null end
    where id=p_lesson_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.update',p_lesson_id,
    pg_catalog.jsonb_build_object('kind','lesson','lock_version',next_lock,'state',p_publication_state));
  return next_lock;
end;
$$;

create or replace function public.create_content_resource(
  p_actor_admin_id uuid, p_lesson_id uuid, p_resource_type text, p_slug text, p_sort_order smallint,
  p_title text, p_description text, p_thumbnail_path text, p_tags text[], p_content_manifest jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare created_id uuid;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  perform id from public.content_lessons where id=p_lesson_id and publication_state<>'archived';
  if not found then raise exception 'Active lesson required'; end if;
  insert into public.content_resources(resource_type,created_by,updated_by)
    values(p_resource_type,p_actor_admin_id,p_actor_admin_id) returning id into created_id;
  insert into public.content_resource_versions(
    resource_id,version_number,title,description,thumbnail_path,tags,content_manifest,created_by
  ) values(
    created_id,1,p_title,p_description,p_thumbnail_path,private.normalize_content_tags(p_tags),p_content_manifest,p_actor_admin_id
  );
  insert into public.lesson_resource_assignments(
    lesson_id,resource_id,slug,sort_order,created_by,updated_by
  ) values(p_lesson_id,created_id,p_slug,p_sort_order,p_actor_admin_id,p_actor_admin_id);
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.create',created_id,
    pg_catalog.jsonb_build_object('kind','resource','resource_type',p_resource_type,'lesson_id',p_lesson_id,'version',1));
  return created_id;
end;
$$;

create or replace function public.revise_content_resource(
  p_actor_admin_id uuid, p_resource_id uuid, p_expected_lock_version bigint,
  p_title text, p_description text, p_thumbnail_path text, p_tags text[], p_content_manifest jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare current_row public.content_resources%rowtype; next_version integer;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.content_resources where id=p_resource_id for update;
  if not found or current_row.lock_version<>p_expected_lock_version then raise exception 'Content version conflict'; end if;
  if current_row.publication_state='archived' then raise exception 'Archived resource cannot be revised'; end if;
  next_version:=current_row.current_version_number+1;
  insert into public.content_resource_versions(
    resource_id,version_number,title,description,thumbnail_path,tags,content_manifest,created_by
  ) values(
    p_resource_id,next_version,p_title,p_description,p_thumbnail_path,private.normalize_content_tags(p_tags),p_content_manifest,p_actor_admin_id
  );
  update public.content_resources set current_version_number=next_version,publication_state='draft',
    lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),archived_at=null
    where id=p_resource_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.update',p_resource_id,
    pg_catalog.jsonb_build_object('kind','resource','version',next_version,'previous_version',current_row.current_version_number));
  return next_version;
end;
$$;

create or replace function public.transition_content_resource(
  p_actor_admin_id uuid, p_resource_id uuid, p_version_number integer,
  p_expected_lock_version bigint, p_publication_state text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare resource_row public.content_resources%rowtype; version_row public.content_resource_versions%rowtype; next_lock bigint; audit_action text;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into resource_row from public.content_resources where id=p_resource_id for update;
  if not found or resource_row.lock_version<>p_expected_lock_version or resource_row.current_version_number<>p_version_number then
    raise exception 'Content version conflict';
  end if;
  select * into version_row from public.content_resource_versions
    where resource_id=p_resource_id and version_number=p_version_number for update;
  if not found or not private.content_state_transition_allowed(version_row.publication_state,p_publication_state) then
    raise exception 'Invalid publication transition';
  end if;
  if version_row.publication_state='published' then raise exception 'Published content versions are immutable'; end if;
  update public.content_resource_versions set publication_state=p_publication_state,
    published_by=case when p_publication_state='published' then p_actor_admin_id else null end,
    published_at=case when p_publication_state='published' then statement_timestamp() else null end
    where id=version_row.id;
  next_lock:=resource_row.lock_version+1;
  update public.content_resources set publication_state=p_publication_state,
    published_version_number=case when p_publication_state='published' then p_version_number else published_version_number end,
    lock_version=next_lock,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),
    archived_at=case when p_publication_state='archived' then statement_timestamp() else null end
    where id=p_resource_id;
  audit_action:=case when p_publication_state='published' then 'admin.content.publish' when p_publication_state='archived' then 'admin.content.archive' else 'admin.content.update' end;
  perform private.audit_content_mutation(p_actor_admin_id,audit_action,p_resource_id,
    pg_catalog.jsonb_build_object('kind','resource','version',p_version_number,'state',p_publication_state,'lock_version',next_lock));
  return next_lock;
end;
$$;

create or replace function public.update_lesson_resource_assignment(
  p_actor_admin_id uuid, p_assignment_id uuid, p_expected_lock_version bigint,
  p_slug text, p_sort_order smallint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare assignment_row public.lesson_resource_assignments%rowtype; next_lock bigint;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into assignment_row from public.lesson_resource_assignments where id=p_assignment_id for update;
  if not found or assignment_row.lock_version<>p_expected_lock_version then raise exception 'Content version conflict'; end if;
  next_lock:=assignment_row.lock_version+1;
  update public.lesson_resource_assignments set slug=p_slug,sort_order=p_sort_order,
    lock_version=next_lock,updated_by=p_actor_admin_id,updated_at=statement_timestamp()
    where id=p_assignment_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.update',assignment_row.resource_id,
    pg_catalog.jsonb_build_object('kind','assignment','assignment_id',p_assignment_id,'lock_version',next_lock));
  return next_lock;
end;
$$;

create or replace function public.rollback_content_resource(
  p_actor_admin_id uuid, p_resource_id uuid, p_target_version_number integer, p_expected_lock_version bigint
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare resource_row public.content_resources%rowtype; target_row public.content_resource_versions%rowtype; next_version integer;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into resource_row from public.content_resources where id=p_resource_id for update;
  if not found or resource_row.lock_version<>p_expected_lock_version or resource_row.publication_state='archived' then
    raise exception 'Content version conflict';
  end if;
  select * into target_row from public.content_resource_versions
    where resource_id=p_resource_id and version_number=p_target_version_number and publication_state='published';
  if not found then raise exception 'Published rollback target required'; end if;
  next_version:=resource_row.current_version_number+1;
  insert into public.content_resource_versions(
    resource_id,version_number,publication_state,title,description,thumbnail_path,tags,content_manifest,
    source_version_id,created_by,published_by,published_at
  ) values(
    p_resource_id,next_version,'published',target_row.title,target_row.description,target_row.thumbnail_path,
    target_row.tags,target_row.content_manifest,target_row.id,p_actor_admin_id,p_actor_admin_id,statement_timestamp()
  );
  update public.content_resources set current_version_number=next_version,published_version_number=next_version,
    publication_state='published',lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp()
    where id=p_resource_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.rollback',p_resource_id,
    pg_catalog.jsonb_build_object('kind','resource','target_version',p_target_version_number,'published_version',next_version));
  return next_version;
end;
$$;

create or replace function public.archive_content_resource(
  p_actor_admin_id uuid, p_resource_id uuid, p_expected_lock_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare resource_row public.content_resources%rowtype; next_lock bigint;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into resource_row from public.content_resources where id=p_resource_id for update;
  if not found or resource_row.lock_version<>p_expected_lock_version or resource_row.publication_state='archived' then
    raise exception 'Content version conflict';
  end if;
  next_lock:=resource_row.lock_version+1;
  update public.content_resources set publication_state='archived',archived_at=statement_timestamp(),
    lock_version=next_lock,updated_by=p_actor_admin_id,updated_at=statement_timestamp()
    where id=p_resource_id;
  perform private.audit_content_mutation(p_actor_admin_id,'admin.content.archive',p_resource_id,
    pg_catalog.jsonb_build_object('kind','resource','lock_version',next_lock));
  return next_lock;
end;
$$;

revoke all on function public.create_content_grade(uuid,smallint,text,text,smallint) from public,anon,authenticated;
revoke all on function public.create_content_topic(uuid,uuid,text,text,smallint) from public,anon,authenticated;
revoke all on function public.create_content_lesson(uuid,uuid,text,text,smallint) from public,anon,authenticated;
revoke all on function public.update_content_grade(uuid,uuid,bigint,text,text,smallint,text) from public,anon,authenticated;
revoke all on function public.update_content_topic(uuid,uuid,bigint,text,text,smallint,text) from public,anon,authenticated;
revoke all on function public.update_content_lesson(uuid,uuid,bigint,text,text,smallint,text) from public,anon,authenticated;
revoke all on function public.create_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb) from public,anon,authenticated;
revoke all on function public.revise_content_resource(uuid,uuid,bigint,text,text,text,text[],jsonb) from public,anon,authenticated;
revoke all on function public.transition_content_resource(uuid,uuid,integer,bigint,text) from public,anon,authenticated;
revoke all on function public.update_lesson_resource_assignment(uuid,uuid,bigint,text,smallint) from public,anon,authenticated;
revoke all on function public.rollback_content_resource(uuid,uuid,integer,bigint) from public,anon,authenticated;
revoke all on function public.archive_content_resource(uuid,uuid,bigint) from public,anon,authenticated;

grant execute on function public.create_content_grade(uuid,smallint,text,text,smallint) to service_role;
grant execute on function public.create_content_topic(uuid,uuid,text,text,smallint) to service_role;
grant execute on function public.create_content_lesson(uuid,uuid,text,text,smallint) to service_role;
grant execute on function public.update_content_grade(uuid,uuid,bigint,text,text,smallint,text) to service_role;
grant execute on function public.update_content_topic(uuid,uuid,bigint,text,text,smallint,text) to service_role;
grant execute on function public.update_content_lesson(uuid,uuid,bigint,text,text,smallint,text) to service_role;
grant execute on function public.create_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb) to service_role;
grant execute on function public.revise_content_resource(uuid,uuid,bigint,text,text,text,text[],jsonb) to service_role;
grant execute on function public.transition_content_resource(uuid,uuid,integer,bigint,text) to service_role;
grant execute on function public.update_lesson_resource_assignment(uuid,uuid,bigint,text,smallint) to service_role;
grant execute on function public.rollback_content_resource(uuid,uuid,integer,bigint) to service_role;
grant execute on function public.archive_content_resource(uuid,uuid,bigint) to service_role;

comment on table public.content_grades is 'Phase 8B owner-managed Grades 1-9 taxonomy; migration intentionally seeds no curriculum.';
comment on table public.content_resource_versions is 'Immutable-after-publication resource history; rollback creates a new published version.';
comment on table public.lesson_resource_assignments is 'Stable Grade/Topic/Lesson resource placement, slug, and deterministic order.';
