-- Phase 9B: one server-owned MathNexa capability, standalone games, and
-- explicit lesson/topic resource hierarchy. This migration is forward-only,
-- additive, and preserves all existing billing, Auth, owner, MFA, consent,
-- content, package, and taxonomy records.

alter table public.consumer_game_entitlements
  add column capability_key text not null default 'MATHNEXA_ALL_ACCESS';
alter table public.consumer_game_entitlements
  add constraint consumer_game_entitlements_capability_key_check
  check (capability_key = 'MATHNEXA_ALL_ACCESS');

create table public.game_external_allowed_hosts (
  hostname text primary key check (
    hostname = lower(hostname) and char_length(hostname) between 4 and 253 and
    hostname ~ '^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$'
  ),
  enabled boolean not null default false,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (updated_at >= created_at)
);

create or replace function private.valid_external_game_destination(p_url text, p_host text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_url is not null and p_host is not null
    and p_url = btrim(p_url) and octet_length(p_url) between 12 and 2048
    and p_host = lower(p_host)
    and p_url ~ '^https://[^/?#:@\\[:space:]]+(?:[/?#][^[:space:]\\]*)?$'
    and p_url !~* '%(00|09|0a|0d|2f|3a|40|5c)'
    and substring(p_url from '^https://([^/?#:]+)') = p_host
    and exists(select 1 from public.game_external_allowed_hosts where hostname = p_host and enabled);
$$;
revoke all on function private.valid_external_game_destination(text,text) from public,anon,authenticated,service_role;

create table public.game_catalog_entries (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid references public.content_resources(id) on delete restrict,
  package_id uuid references public.game_packages(id) on delete restrict,
  stable_key text not null unique check (stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(stable_key) <= 96),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) <= 96),
  title text not null check (title = btrim(title) and char_length(title) between 1 and 160),
  description text not null check (description = btrim(description) and char_length(description) between 1 and 4000),
  launch_type text not null check (launch_type in ('canonical','hosted_package','external_https')),
  canonical_route text,
  external_url text,
  external_allowed_host text references public.game_external_allowed_hosts(hostname) on update cascade on delete restrict,
  thumbnail_reference text not null check (thumbnail_reference = btrim(thumbnail_reference) and char_length(thumbnail_reference) between 1 and 512),
  preview_media jsonb not null default '[]'::jsonb check (jsonb_typeof(preview_media) = 'array' and octet_length(preview_media::text) <= 32768),
  recommended_grade_min smallint check (recommended_grade_min between 1 and 12),
  recommended_grade_max smallint check (recommended_grade_max between 1 and 12),
  skills text[] not null default '{}'::text[] check (cardinality(skills) <= 20 and skills = private.normalize_content_tags(skills)),
  topics text[] not null default '{}'::text[] check (cardinality(topics) <= 20 and topics = private.normalize_content_tags(topics)),
  tags text[] not null default '{}'::text[] check (cardinality(tags) <= 20 and tags = private.normalize_content_tags(tags)),
  difficulty text not null default 'core' check (difficulty in ('support','core','challenge','adaptive')),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  display_order smallint not null check (display_order between 1 and 32767),
  version text not null check (version = btrim(version) and char_length(version) between 1 and 64),
  publication_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(publication_metadata) = 'object' and octet_length(publication_metadata::text) <= 16384),
  rollback_metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(rollback_metadata) = 'object' and octet_length(rollback_metadata::text) <= 16384),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  check (updated_at >= created_at),
  check (recommended_grade_min is null or recommended_grade_max is null or recommended_grade_max >= recommended_grade_min),
  check (
    (launch_type = 'canonical' and canonical_route = '/play' and package_id is null and resource_id is null and external_url is null and external_allowed_host is null) or
    (launch_type = 'hosted_package' and canonical_route is null and package_id is not null and resource_id is not null and external_url is null and external_allowed_host is null) or
    (launch_type = 'external_https' and canonical_route is null and package_id is null and resource_id is null and external_url is not null and external_allowed_host is not null)
  )
);
create unique index game_catalog_entries_display_order_published_idx
  on public.game_catalog_entries(display_order) where status = 'published';
create index game_catalog_entries_status_order_idx on public.game_catalog_entries(status,display_order,title);

create table public.game_catalog_destination_audit (
  id uuid primary key default gen_random_uuid(),
  catalog_entry_id uuid not null references public.game_catalog_entries(id) on delete restrict,
  change_kind text not null check (change_kind in ('created','destination_changed','publication_changed')),
  previous_destination_sha256 text check (previous_destination_sha256 is null or previous_destination_sha256 ~ '^[a-f0-9]{64}$'),
  next_destination_sha256 text check (next_destination_sha256 is null or next_destination_sha256 ~ '^[a-f0-9]{64}$'),
  recorded_at timestamptz not null default statement_timestamp()
);

create or replace function private.game_catalog_destination(p_row public.game_catalog_entries)
returns text language sql immutable set search_path=''
as $$ select case p_row.launch_type when 'canonical' then p_row.canonical_route when 'hosted_package' then p_row.package_id::text else p_row.external_url end $$;

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
  new.updated_at:=statement_timestamp();
  return new;
end;
$$;
revoke all on function private.validate_game_catalog_entry() from public,anon,authenticated,service_role;
create trigger game_catalog_entries_validate before insert or update on public.game_catalog_entries
for each row execute function private.validate_game_catalog_entry();

create or replace function private.audit_game_catalog_destination()
returns trigger language plpgsql security definer set search_path=''
as $$
declare old_value text; new_value text; kind text;
begin
  old_value:=case when tg_op='INSERT' then null else private.game_catalog_destination(old) end;
  new_value:=private.game_catalog_destination(new);
  kind:=case when tg_op='INSERT' then 'created' when old_value is distinct from new_value then 'destination_changed' else 'publication_changed' end;
  if tg_op='INSERT' or old_value is distinct from new_value or old.status is distinct from new.status then
    insert into public.game_catalog_destination_audit(catalog_entry_id,change_kind,previous_destination_sha256,next_destination_sha256)
    values(new.id,kind,
      case when old_value is null then null else encode(extensions.digest(old_value,'sha256'),'hex') end,
      case when new_value is null then null else encode(extensions.digest(new_value,'sha256'),'hex') end);
  end if;
  return new;
end;
$$;
revoke all on function private.audit_game_catalog_destination() from public,anon,authenticated,service_role;
create trigger game_catalog_entries_audit after insert or update on public.game_catalog_entries
for each row execute function private.audit_game_catalog_destination();

create or replace function private.reject_game_catalog_audit_mutation()
returns trigger language plpgsql set search_path='' as $$ begin raise exception 'Game catalog destination audit is append-only'; end $$;
revoke all on function private.reject_game_catalog_audit_mutation() from public,anon,authenticated,service_role;
create trigger game_catalog_destination_audit_reject_mutation before update or delete on public.game_catalog_destination_audit
for each row execute function private.reject_game_catalog_audit_mutation();

create or replace function private.sync_published_game_catalog_entry()
returns trigger language plpgsql security definer set search_path=''
as $$
declare version_row public.content_resource_versions%rowtype;
begin
  if new.publication_state='published' then
    select * into version_row from public.content_resource_versions
      where resource_id=new.resource_id and version_number=new.resource_version_number and publication_state='published';
    if version_row.id is null then raise exception 'Published package requires a published resource version'; end if;
    insert into public.game_catalog_entries(
      resource_id,package_id,stable_key,slug,title,description,launch_type,thumbnail_reference,
      skills,topics,tags,difficulty,status,display_order,version,publication_metadata,rollback_metadata
    ) values(
      new.resource_id,new.id,new.game_id,new.game_id,version_row.title,
      case when version_row.description='' then 'Owner-reviewed standalone MathNexa game.' else version_row.description end,
      'hosted_package','package:thumbnail.png',version_row.tags,'{}'::text[],version_row.tags,'core','published',
      coalesce((select max(display_order)+1 from public.game_catalog_entries where status='published'),2),
      new.package_version,jsonb_build_object('package_id',new.id,'published_at',new.published_at),
      jsonb_build_object('source_package_id',new.source_package_id)
    ) on conflict(stable_key) do update set
      resource_id=excluded.resource_id,package_id=excluded.package_id,title=excluded.title,description=excluded.description,
      launch_type='hosted_package',canonical_route=null,external_url=null,external_allowed_host=null,
      thumbnail_reference=excluded.thumbnail_reference,skills=excluded.skills,tags=excluded.tags,status='published',
      version=excluded.version,publication_metadata=excluded.publication_metadata,rollback_metadata=excluded.rollback_metadata
    where public.game_catalog_entries.launch_type='hosted_package';
  elsif new.publication_state='archived' then
    update public.game_catalog_entries set status='archived'
      where launch_type='hosted_package' and package_id=new.id;
  end if;
  return new;
end;
$$;
revoke all on function private.sync_published_game_catalog_entry() from public,anon,authenticated,service_role;
create trigger game_packages_sync_catalog after insert or update of publication_state on public.game_packages
for each row execute function private.sync_published_game_catalog_entry();

insert into public.game_catalog_entries(
  id,stable_key,slug,title,description,launch_type,canonical_route,thumbnail_reference,
  recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
  publication_metadata,rollback_metadata
) values(
  '9b000000-0000-4000-8000-000000000001','math-vocabulary-hunt','math-vocabulary-hunt','Math Vocabulary Hunt',
  'Lead a fast, collaborative vocabulary round with the preserved MathNexa classroom game.',
  'canonical','/play','builtin:math-vocabulary-hunt',5,8,
  array['math vocabulary','collaboration'],array['cross-curricular review'],array['classroom','whole group'],
  'core','published',1,'7.0.0',
  jsonb_build_object('owner','migration','canonical_hash_contract','protected'),
  jsonb_build_object('strategy','repository rollback')
) on conflict(stable_key) do update set
  slug=excluded.slug,title=excluded.title,description=excluded.description,launch_type='canonical',
  resource_id=null,package_id=null,canonical_route='/play',external_url=null,external_allowed_host=null,
  thumbnail_reference=excluded.thumbnail_reference,recommended_grade_min=excluded.recommended_grade_min,
  recommended_grade_max=excluded.recommended_grade_max,skills=excluded.skills,topics=excluded.topics,tags=excluded.tags,
  difficulty=excluded.difficulty,status='published',display_order=1,version=excluded.version,
  publication_metadata=excluded.publication_metadata,rollback_metadata=excluded.rollback_metadata;

create or replace function public.reconcile_canonical_game_catalog_entry()
returns boolean language plpgsql security definer set search_path=''
as $$ begin
  insert into public.game_catalog_entries(
    id,stable_key,slug,title,description,launch_type,canonical_route,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    '9b000000-0000-4000-8000-000000000001','math-vocabulary-hunt','math-vocabulary-hunt','Math Vocabulary Hunt',
    'Lead a fast, collaborative vocabulary round with the preserved MathNexa classroom game.',
    'canonical','/play','builtin:math-vocabulary-hunt',5,8,
    array['math vocabulary','collaboration'],array['cross-curricular review'],array['classroom','whole group'],
    'core','published',1,'7.0.0',jsonb_build_object('owner','migration','canonical_hash_contract','protected'),
    jsonb_build_object('strategy','repository rollback')
  ) on conflict(stable_key) do update set
    slug=excluded.slug,title=excluded.title,description=excluded.description,launch_type='canonical',
    resource_id=null,package_id=null,canonical_route='/play',external_url=null,external_allowed_host=null,
    thumbnail_reference=excluded.thumbnail_reference,recommended_grade_min=excluded.recommended_grade_min,
    recommended_grade_max=excluded.recommended_grade_max,skills=excluded.skills,topics=excluded.topics,tags=excluded.tags,
    difficulty=excluded.difficulty,status='published',display_order=1,version=excluded.version,
    publication_metadata=excluded.publication_metadata,rollback_metadata=excluded.rollback_metadata;
  return exists(select 1 from public.game_catalog_entries where stable_key='math-vocabulary-hunt' and launch_type='canonical' and canonical_route='/play' and status='published');
end $$;
revoke all on function public.reconcile_canonical_game_catalog_entry() from public,anon,authenticated;
grant execute on function public.reconcile_canonical_game_catalog_entry() to service_role;

-- Existing published packages become standalone catalog items. Historical
-- lesson assignments remain untouched as optional discovery metadata.
insert into public.game_catalog_entries(
  resource_id,package_id,stable_key,slug,title,description,launch_type,thumbnail_reference,
  skills,topics,tags,difficulty,status,display_order,version,publication_metadata,rollback_metadata
)
select p.resource_id,p.id,p.game_id,p.game_id,v.title,
  case when v.description='' then 'Owner-reviewed standalone MathNexa game.' else v.description end,
  'hosted_package','package:thumbnail.png',v.tags,'{}'::text[],v.tags,'core','published',
  row_number() over(order by v.title,p.id)::smallint+1,p.package_version,
  jsonb_build_object('package_id',p.id,'published_at',p.published_at),jsonb_build_object('source_package_id',p.source_package_id)
from public.game_packages p
join public.content_resource_versions v on v.resource_id=p.resource_id and v.version_number=p.resource_version_number
where p.publication_state='published' and v.publication_state='published' and p.game_id<>'math-vocabulary-hunt'
on conflict(stable_key) do nothing;

alter table public.content_resources
  add column resource_scope text,
  add column scope_status text;
update public.content_resources set
  resource_scope=case
    when resource_type in ('game','map_prep_link') then 'global'
    when resource_type in ('quiz_pdf','quiz_answer_key') then 'lesson'
    else 'lesson'
  end,
  scope_status=case when resource_type in ('quiz_pdf','quiz_answer_key') then 'legacy' else 'current' end;
alter table public.content_resources
  alter column resource_scope set default 'lesson',
  alter column resource_scope set not null,
  alter column scope_status set default 'current',
  alter column scope_status set not null,
  add constraint content_resources_scope_check check (resource_scope in ('global','topic','lesson')),
  add constraint content_resources_scope_status_check check (scope_status in ('current','legacy')),
  add constraint content_resources_type_scope_check check (
    (resource_type in ('game','map_prep_link') and resource_scope='global' and scope_status='current') or
    (resource_type in ('homework_pdf','homework_answer_key') and resource_scope='lesson' and scope_status='current') or
    (resource_type in ('quiz_pdf','quiz_answer_key') and ((resource_scope='topic' and scope_status='current') or (resource_scope='lesson' and scope_status='legacy'))) or
    (resource_type in ('preview_image','thumbnail') and resource_scope in ('global','topic','lesson'))
  );

create or replace function private.normalize_content_resource_scope()
returns trigger language plpgsql set search_path=''
as $$ begin
  if new.resource_type in ('game','map_prep_link') then new.resource_scope:='global';new.scope_status:='current'; end if;
  if new.resource_type in ('homework_pdf','homework_answer_key') then new.resource_scope:='lesson';new.scope_status:='current'; end if;
  if new.resource_type in ('quiz_pdf','quiz_answer_key') and new.resource_scope='lesson' then new.scope_status:='legacy'; end if;
  return new;
end $$;
revoke all on function private.normalize_content_resource_scope() from public,anon,authenticated,service_role;
create trigger content_resources_normalize_scope before insert or update of resource_type,resource_scope,scope_status on public.content_resources
for each row execute function private.normalize_content_resource_scope();

create table public.topic_resource_assignments (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.content_topics(id) on delete restrict,
  resource_id uuid not null references public.content_resources(id) on delete restrict,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug)<=96),
  sort_order smallint not null check (sort_order between 1 and 32767),
  lock_version bigint not null default 1 check (lock_version>=1),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique(topic_id,resource_id),unique(topic_id,slug),unique(topic_id,sort_order),
  check(updated_at>=created_at)
);

create or replace function private.validate_topic_resource_assignment()
returns trigger language plpgsql set search_path=''
as $$ declare resource_row public.content_resources%rowtype; begin
  select * into resource_row from public.content_resources where id=new.resource_id;
  if resource_row.resource_type not in ('quiz_pdf','quiz_answer_key') or resource_row.resource_scope<>'topic' or resource_row.scope_status<>'current' then
    raise exception 'Topic assignments require a current topic-scoped quiz resource';
  end if;
  new.updated_at:=statement_timestamp();return new;
end $$;
revoke all on function private.validate_topic_resource_assignment() from public,anon,authenticated,service_role;
create trigger topic_resource_assignments_validate before insert or update on public.topic_resource_assignments
for each row execute function private.validate_topic_resource_assignment();

create or replace function private.validate_published_resource_hierarchy()
returns trigger language plpgsql set search_path=''
as $$ begin
  if new.publication_state<>'published' then return new; end if;
  if new.resource_type in ('homework_pdf','homework_answer_key') and not exists(select 1 from public.lesson_resource_assignments where resource_id=new.id) then
    raise exception 'Published Homework requires a lesson assignment';
  end if;
  if new.resource_type in ('quiz_pdf','quiz_answer_key') and new.resource_scope='topic' and not exists(select 1 from public.topic_resource_assignments where resource_id=new.id) then
    raise exception 'Published current Quiz requires a topic assignment';
  end if;
  return new;
end $$;
revoke all on function private.validate_published_resource_hierarchy() from public,anon,authenticated,service_role;
create trigger content_resources_validate_published_scope before insert or update of publication_state,resource_scope,scope_status on public.content_resources
for each row execute function private.validate_published_resource_hierarchy();

create view public.legacy_lesson_quiz_report with (security_invoker=true) as
select r.id as resource_id,r.resource_type,r.publication_state,r.created_at,a.lesson_id,a.slug
from public.content_resources r join public.lesson_resource_assignments a on a.resource_id=r.id
where r.resource_type in ('quiz_pdf','quiz_answer_key') and r.resource_scope='lesson' and r.scope_status='legacy';

alter table public.game_external_allowed_hosts enable row level security;
alter table public.game_external_allowed_hosts force row level security;
alter table public.game_catalog_entries enable row level security;
alter table public.game_catalog_entries force row level security;
alter table public.game_catalog_destination_audit enable row level security;
alter table public.game_catalog_destination_audit force row level security;
alter table public.topic_resource_assignments enable row level security;
alter table public.topic_resource_assignments force row level security;
revoke all on table public.game_external_allowed_hosts,public.game_catalog_entries,public.game_catalog_destination_audit,public.topic_resource_assignments from public,anon,authenticated,service_role;
revoke all on public.legacy_lesson_quiz_report from public,anon,authenticated,service_role;
grant select,insert,update on table public.game_external_allowed_hosts,public.game_catalog_entries,public.topic_resource_assignments to service_role;
grant select on table public.game_catalog_destination_audit to service_role;
grant select on public.legacy_lesson_quiz_report to service_role;

-- Existing asset-delivery RPCs now require the exact all-access capability in
-- addition to their established server-time and publication checks.
create or replace function public.record_game_package_launch(p_consumer_user_id uuid,p_package_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$ declare account_row public.consumer_accounts%rowtype; entitlement_row public.consumer_game_entitlements%rowtype; package_row public.game_packages%rowtype; resource_row public.content_resources%rowtype; allowed boolean:=false; begin
  select * into account_row from public.consumer_accounts where user_id=p_consumer_user_id and account_status='active';
  select * into entitlement_row from public.consumer_game_entitlements where user_id=p_consumer_user_id and capability_key='MATHNEXA_ALL_ACCESS';
  select * into package_row from public.game_packages where id=p_package_id and publication_state='published';
  if account_row.user_id is null or entitlement_row.user_id is null or package_row.id is null then return false; end if;
  select * into resource_row from public.content_resources where id=package_row.resource_id and publication_state='published' and published_version_number=package_row.resource_version_number;
  if resource_row.id is null then return false; end if;
  allowed:=(entitlement_row.entitlement_state='trial-active' and entitlement_row.trial_ends_at>statement_timestamp()) or (entitlement_row.entitlement_state in ('subscription-active','subscription-canceled-through-period-end') and entitlement_row.current_period_ends_at>statement_timestamp()) or (entitlement_row.entitlement_state='subscription-grace-period' and entitlement_row.grace_ends_at>statement_timestamp());
  if not allowed then return false; end if;
  insert into public.game_launch_events(consumer_user_id,resource_id,package_id,entitlement_state) values(p_consumer_user_id,package_row.resource_id,package_row.id,entitlement_row.entitlement_state); return true;
end $$;

create or replace function public.record_resource_download(p_consumer_user_id uuid,p_resource_file_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare account_row public.consumer_accounts%rowtype;entitlement_row public.consumer_game_entitlements%rowtype;file_row public.resource_files%rowtype;resource_row public.content_resources%rowtype;published_row public.content_resource_versions%rowtype;source_row public.content_resource_versions%rowtype;allowed boolean:=false;allowed_file_version integer;
begin
  select * into account_row from public.consumer_accounts where user_id=p_consumer_user_id and account_status='active';
  select * into entitlement_row from public.consumer_game_entitlements where user_id=p_consumer_user_id and capability_key='MATHNEXA_ALL_ACCESS';
  select * into file_row from public.resource_files where id=p_resource_file_id and validation_state='accepted';
  if account_row.user_id is null or entitlement_row.user_id is null or file_row.id is null then return false; end if;
  select * into resource_row from public.content_resources where id=file_row.resource_id and publication_state='published';
  if resource_row.id is null or resource_row.published_version_number is null then return false; end if;
  select * into published_row from public.content_resource_versions where resource_id=resource_row.id and version_number=resource_row.published_version_number and publication_state='published';
  if published_row.id is null then return false; end if;allowed_file_version:=published_row.version_number;
  if published_row.source_version_id is not null then select * into source_row from public.content_resource_versions where id=published_row.source_version_id and resource_id=resource_row.id and publication_state='published';if source_row.id is null then return false;end if;allowed_file_version:=source_row.version_number;end if;
  if file_row.resource_version_number<>allowed_file_version then return false; end if;
  allowed:=(entitlement_row.entitlement_state='trial-active' and entitlement_row.trial_ends_at>statement_timestamp()) or (entitlement_row.entitlement_state in ('subscription-active','subscription-canceled-through-period-end') and entitlement_row.current_period_ends_at>statement_timestamp()) or (entitlement_row.entitlement_state='subscription-grace-period' and entitlement_row.grace_ends_at>statement_timestamp());
  if not allowed then return false; end if;
  insert into public.resource_download_events(consumer_user_id,resource_id,resource_file_id,entitlement_state) values(p_consumer_user_id,file_row.resource_id,file_row.id,entitlement_row.entitlement_state);
  perform public.record_admin_audit_event(null,'content.resource.downloaded',file_row.resource_id::text,jsonb_build_object('file_role',file_row.file_role,'entitlement_state',entitlement_row.entitlement_state,'published_version',published_row.version_number,'file_version',allowed_file_version),null,'phase8d-download-service');return true;
end $$;

revoke all on function public.record_game_package_launch(uuid,uuid),public.record_resource_download(uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_game_package_launch(uuid,uuid),public.record_resource_download(uuid,uuid) to service_role;

comment on column public.consumer_game_entitlements.capability_key is 'Exact server-owned capability shared by Games, MAP Prep, Homework, and Quizzes.';
comment on table public.game_catalog_entries is 'Standalone game products; curriculum taxonomy is optional discovery metadata, never a launch parent.';
comment on table public.topic_resource_assignments is 'Current Quiz hierarchy: Grade is inherited from Topic and Lesson is not required.';
comment on view public.legacy_lesson_quiz_report is 'Deterministic owner-only report of preserved lesson-scoped Quiz records awaiting explicit migration review.';
comment on function public.reconcile_canonical_game_catalog_entry() is 'Idempotent service-only repair for the migration-owned canonical game row.';

notify pgrst, 'reload schema';
