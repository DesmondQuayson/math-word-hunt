-- Phase 8E: validated, private game package versions. Uploaded code is never
-- executed by the server and browser roles receive no storage or mutation authority.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('game-packages','game-packages',false,20971520,null),
  ('game-package-quarantine','game-package-quarantine',false,26214400,array['application/zip','application/octet-stream']::text[]);

create policy game_package_buckets_hide_from_browser on storage.buckets as restrictive for select to anon,authenticated
  using(id not in ('game-packages','game-package-quarantine'));
create policy game_package_objects_server_only_select on storage.objects as restrictive for select to anon,authenticated
  using(bucket_id not in ('game-packages','game-package-quarantine'));
create policy game_package_objects_server_only_insert on storage.objects as restrictive for insert to anon,authenticated
  with check(bucket_id not in ('game-packages','game-package-quarantine'));
create policy game_package_objects_server_only_update on storage.objects as restrictive for update to anon,authenticated
  using(bucket_id not in ('game-packages','game-package-quarantine')) with check(bucket_id not in ('game-packages','game-package-quarantine'));
create policy game_package_objects_server_only_delete on storage.objects as restrictive for delete to anon,authenticated
  using(bucket_id not in ('game-packages','game-package-quarantine'));

create table public.game_packages(
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.content_resources(id) on delete restrict,
  resource_version_number integer not null,
  game_id text not null check(game_id~'^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(game_id)<=64),
  package_version text not null check(package_version~'^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$'),
  package_schema_version text not null check(package_schema_version='1.0'),
  minimum_runtime_version text not null check(minimum_runtime_version~'^(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})\.(0|[1-9][0-9]{0,3})$'),
  entry_file text not null check(entry_file~'^game/[A-Za-z0-9][A-Za-z0-9._/-]*\.html$' and entry_file not like '%..%'),
  thumbnail_file text not null check(thumbnail_file='thumbnail.png'),
  manifest jsonb not null check(jsonb_typeof(manifest)='object' and octet_length(manifest::text)<=65536),
  metadata jsonb not null check(jsonb_typeof(metadata)='object' and octet_length(metadata::text)<=16384),
  archive_sha256 text not null check(archive_sha256~'^[a-f0-9]{64}$'),
  compressed_size bigint not null check(compressed_size between 22 and 26214400),
  expanded_size bigint not null check(expanded_size between 1 and 78643200),
  publication_state text not null default 'draft' check(publication_state in ('draft','validating','ready_for_review','published','archived')),
  source_package_id uuid references public.game_packages(id) on delete restrict,
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  foreign key(resource_id,resource_version_number) references public.content_resource_versions(resource_id,version_number) on delete restrict,
  unique(resource_id,resource_version_number),
  check((publication_state='published')=(published_at is not null)),
  check((publication_state='archived')=(archived_at is not null))
);
create index game_packages_game_version_idx on public.game_packages(game_id,created_at desc);
create unique index game_packages_import_version_idx on public.game_packages(game_id,package_version) where source_package_id is null;

create table public.game_package_assets(
  id uuid primary key default gen_random_uuid(),
  package_id uuid not null references public.game_packages(id) on delete restrict,
  asset_path text not null check(asset_path~'^[A-Za-z0-9][A-Za-z0-9._/-]*$' and asset_path not like '%..%' and asset_path not like '%\\%'),
  object_path text not null check(object_path like 'games/%' and private.valid_content_object_path(object_path)),
  mime_type text not null check(mime_type in ('text/html','text/css','text/javascript','application/json','image/png','image/jpeg','image/webp','image/gif','audio/mpeg','audio/ogg','audio/wav','audio/mp4','font/woff','font/woff2')),
  byte_size bigint not null check(byte_size between 1 and 20971520),
  sha256 text not null check(sha256~'^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique(package_id,asset_path)
);
create index game_package_assets_object_idx on public.game_package_assets(object_path);

create table public.game_package_quarantine_events(
  id uuid primary key default gen_random_uuid(),
  normalized_filename text not null check(normalized_filename~'^[a-z0-9]+(?:-[a-z0-9]+)*\.zip$'),
  archive_sha256 text not null check(archive_sha256~'^[a-f0-9]{64}$'),
  compressed_size bigint not null check(compressed_size between 1 and 26214400),
  object_path text check(object_path is null or (object_path like 'quarantine/games/%' and private.valid_content_object_path(object_path))),
  findings jsonb not null check(jsonb_typeof(findings)='array' and octet_length(findings::text)<=16384),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.game_launch_events(
  id uuid primary key default gen_random_uuid(),
  consumer_user_id uuid references auth.users(id) on delete set null,
  resource_id uuid not null references public.content_resources(id) on delete restrict,
  package_id uuid not null references public.game_packages(id) on delete restrict,
  entitlement_state text not null check(entitlement_state in ('trial-active','subscription-active','subscription-grace-period','subscription-canceled-through-period-end')),
  launched_at timestamptz not null default now()
);
create index game_launch_events_created_idx on public.game_launch_events(launched_at desc);

alter table public.game_packages enable row level security; alter table public.game_packages force row level security;
alter table public.game_package_assets enable row level security; alter table public.game_package_assets force row level security;
alter table public.game_package_quarantine_events enable row level security; alter table public.game_package_quarantine_events force row level security;
alter table public.game_launch_events enable row level security; alter table public.game_launch_events force row level security;
revoke all on table public.game_packages,public.game_package_assets,public.game_package_quarantine_events,public.game_launch_events from public,anon,authenticated,service_role;
grant select on table public.game_packages,public.game_package_assets,public.game_package_quarantine_events,public.game_launch_events to service_role;

create or replace function private.game_version_parts(value text) returns integer[] language sql immutable strict set search_path=''
as $$ select pg_catalog.string_to_array(value,'.')::integer[] $$;
revoke all on function private.game_version_parts(text) from public,anon,authenticated,service_role;

create or replace function public.register_game_package(
  p_actor_admin_id uuid,p_resource_id uuid,p_resource_version_number integer,p_game_id text,p_package_version text,
  p_package_schema_version text,p_minimum_runtime_version text,p_entry_file text,p_thumbnail_file text,
  p_manifest jsonb,p_metadata jsonb,p_archive_sha256 text,p_compressed_size bigint,p_expanded_size bigint,p_assets jsonb
) returns uuid language plpgsql security definer set search_path=''
as $$
declare resource_row public.content_resources%rowtype; created_package_id uuid; asset jsonb;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into resource_row from public.content_resources where id=p_resource_id for update;
  if not found or resource_row.resource_type<>'game' or resource_row.current_version_number<>p_resource_version_number or resource_row.publication_state<>'draft' then raise exception 'Current draft game resource required'; end if;
  if exists(select 1 from public.game_packages where game_id=p_game_id and resource_id<>p_resource_id) then raise exception 'Stable game identity belongs to another resource'; end if;
  if exists(select 1 from public.game_packages p where p.game_id=p_game_id and p.source_package_id is null and private.game_version_parts(p.package_version)>=private.game_version_parts(p_package_version)) then raise exception 'Package version must increase'; end if;
  if jsonb_typeof(p_assets)<>'array' or jsonb_array_length(p_assets)<3 or jsonb_array_length(p_assets)>255 then raise exception 'Bounded asset inventory required'; end if;
  insert into public.game_packages(resource_id,resource_version_number,game_id,package_version,package_schema_version,minimum_runtime_version,entry_file,thumbnail_file,manifest,metadata,archive_sha256,compressed_size,expanded_size,created_by)
    values(p_resource_id,p_resource_version_number,p_game_id,p_package_version,p_package_schema_version,p_minimum_runtime_version,p_entry_file,p_thumbnail_file,p_manifest,p_metadata,p_archive_sha256,p_compressed_size,p_expanded_size,p_actor_admin_id)
    returning id into created_package_id;
  for asset in select value from jsonb_array_elements(p_assets) loop
    if jsonb_typeof(asset)<>'object' or not (asset ?& array['path','object_path','mime_type','byte_size','sha256']) or (select count(*) from jsonb_object_keys(asset))<>5 then raise exception 'Exact asset evidence required'; end if;
    insert into public.game_package_assets(package_id,asset_path,object_path,mime_type,byte_size,sha256) values(created_package_id,asset->>'path',asset->>'object_path',asset->>'mime_type',(asset->>'byte_size')::bigint,asset->>'sha256');
  end loop;
  if not exists(select 1 from public.game_package_assets a where a.package_id=created_package_id and a.asset_path=p_entry_file) or not exists(select 1 from public.game_package_assets a where a.package_id=created_package_id and a.asset_path=p_thumbnail_file) then raise exception 'Entry and thumbnail assets required'; end if;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.package.imported',p_resource_id::text,jsonb_build_object('package_id',created_package_id,'game_id',p_game_id,'version',p_package_version,'asset_count',jsonb_array_length(p_assets),'archive_sha256',p_archive_sha256),null,'phase8e-package-service');
  return created_package_id;
end; $$;

create or replace function public.record_game_package_quarantine(p_actor_admin_id uuid,p_normalized_filename text,p_archive_sha256 text,p_compressed_size bigint,p_object_path text,p_findings jsonb)
returns uuid language plpgsql security definer set search_path=''
as $$ declare created_id uuid; begin
  perform private.assert_content_admin(p_actor_admin_id);
  insert into public.game_package_quarantine_events(normalized_filename,archive_sha256,compressed_size,object_path,findings,created_by)
    values(p_normalized_filename,p_archive_sha256,p_compressed_size,p_object_path,p_findings,p_actor_admin_id) returning id into created_id;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.package.quarantined',created_id::text,jsonb_build_object('archive_sha256',p_archive_sha256,'findings',p_findings),null,'phase8e-package-service');
  return created_id;
end; $$;

create or replace function private.require_game_package_before_publish() returns trigger language plpgsql set search_path=''
as $$ declare kind text; begin
  if new.publication_state='published' and old.publication_state<>'published' then
    select resource_type into kind from public.content_resources where id=new.resource_id;
    if kind='game' and not exists(select 1 from public.game_packages p where p.resource_id=new.resource_id and p.resource_version_number=new.version_number and p.publication_state='ready_for_review' and exists(select 1 from public.game_package_assets a where a.package_id=p.id and a.asset_path=p.entry_file)) then raise exception 'Reviewed game package required before publication'; end if;
  end if; return new;
end; $$;
revoke all on function private.require_game_package_before_publish() from public,anon,authenticated,service_role;
create trigger content_resource_version_require_game before update of publication_state on public.content_resource_versions for each row execute function private.require_game_package_before_publish();

create or replace function public.transition_game_package(p_actor_admin_id uuid,p_package_id uuid,p_expected_lock_version bigint,p_publication_state text)
returns bigint language plpgsql security definer set search_path=''
as $$ declare package_row public.game_packages%rowtype; next_lock bigint; begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into package_row from public.game_packages where id=p_package_id for update;
  if not found or not ((package_row.publication_state='draft' and p_publication_state='validating') or (package_row.publication_state='validating' and p_publication_state='ready_for_review') or (package_row.publication_state='ready_for_review' and p_publication_state='published')) then raise exception 'Invalid package transition'; end if;
  next_lock:=public.transition_content_resource(p_actor_admin_id,package_row.resource_id,package_row.resource_version_number,p_expected_lock_version,p_publication_state);
  update public.game_packages set publication_state=p_publication_state,published_at=case when p_publication_state='published' then statement_timestamp() end where id=p_package_id;
  perform public.record_admin_audit_event(p_actor_admin_id,case when p_publication_state='published' then 'admin.game.package.published' else 'admin.game.package.validated' end,package_row.resource_id::text,jsonb_build_object('package_id',p_package_id,'state',p_publication_state),null,'phase8e-package-service');
  return next_lock;
end; $$;

create or replace function public.archive_game_package(p_actor_admin_id uuid,p_package_id uuid,p_expected_lock_version bigint)
returns bigint language plpgsql security definer set search_path=''
as $$ declare package_row public.game_packages%rowtype; next_lock bigint; begin
  perform private.assert_content_admin(p_actor_admin_id); select * into package_row from public.game_packages where id=p_package_id for update;
  if not found or package_row.publication_state='archived' then raise exception 'Active package required'; end if;
  next_lock:=public.archive_content_resource(p_actor_admin_id,package_row.resource_id,p_expected_lock_version);
  update public.game_packages set publication_state='archived',published_at=null,archived_at=statement_timestamp() where id=p_package_id;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.package.archived',package_row.resource_id::text,jsonb_build_object('package_id',p_package_id),null,'phase8e-package-service'); return next_lock;
end; $$;

create or replace function public.rollback_game_package(p_actor_admin_id uuid,p_target_package_id uuid,p_expected_lock_version bigint)
returns uuid language plpgsql security definer set search_path=''
as $$ declare target public.game_packages%rowtype; new_version integer; created_id uuid; begin
  perform private.assert_content_admin(p_actor_admin_id); select * into target from public.game_packages where id=p_target_package_id and publication_state='published';
  if not found then raise exception 'Published package rollback target required'; end if;
  new_version:=public.rollback_content_resource(p_actor_admin_id,target.resource_id,target.resource_version_number,p_expected_lock_version);
  insert into public.game_packages(resource_id,resource_version_number,game_id,package_version,package_schema_version,minimum_runtime_version,entry_file,thumbnail_file,manifest,metadata,archive_sha256,compressed_size,expanded_size,publication_state,source_package_id,created_by,published_at)
    values(target.resource_id,new_version,target.game_id,target.package_version,target.package_schema_version,target.minimum_runtime_version,target.entry_file,target.thumbnail_file,target.manifest,target.metadata,target.archive_sha256,target.compressed_size,target.expanded_size,'published',target.id,p_actor_admin_id,statement_timestamp()) returning id into created_id;
  insert into public.game_package_assets(package_id,asset_path,object_path,mime_type,byte_size,sha256) select created_id,asset_path,object_path,mime_type,byte_size,sha256 from public.game_package_assets where package_id=target.id;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.game.package.rolled_back',target.resource_id::text,jsonb_build_object('source_package_id',target.id,'package_id',created_id,'resource_version',new_version),null,'phase8e-package-service'); return created_id;
end; $$;

create or replace function public.record_game_package_launch(p_consumer_user_id uuid,p_package_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$ declare account_row public.consumer_accounts%rowtype; entitlement_row public.consumer_game_entitlements%rowtype; package_row public.game_packages%rowtype; resource_row public.content_resources%rowtype; allowed boolean:=false; begin
  select * into account_row from public.consumer_accounts where user_id=p_consumer_user_id and account_status='active';
  select * into entitlement_row from public.consumer_game_entitlements where user_id=p_consumer_user_id;
  select * into package_row from public.game_packages where id=p_package_id and publication_state='published';
  if account_row.user_id is null or entitlement_row.user_id is null or package_row.id is null then return false; end if;
  select * into resource_row from public.content_resources where id=package_row.resource_id and publication_state='published' and published_version_number=package_row.resource_version_number;
  if resource_row.id is null then return false; end if;
  allowed:=(entitlement_row.entitlement_state='trial-active' and entitlement_row.trial_ends_at>statement_timestamp()) or (entitlement_row.entitlement_state in ('subscription-active','subscription-canceled-through-period-end') and entitlement_row.current_period_ends_at>statement_timestamp()) or (entitlement_row.entitlement_state='subscription-grace-period' and entitlement_row.grace_ends_at>statement_timestamp());
  if not allowed then return false; end if;
  insert into public.game_launch_events(consumer_user_id,resource_id,package_id,entitlement_state) values(p_consumer_user_id,package_row.resource_id,package_row.id,entitlement_row.entitlement_state); return true;
end; $$;

revoke all on function public.register_game_package(uuid,uuid,integer,text,text,text,text,text,text,jsonb,jsonb,text,bigint,bigint,jsonb) from public,anon,authenticated;
revoke all on function public.record_game_package_quarantine(uuid,text,text,bigint,text,jsonb) from public,anon,authenticated;
revoke all on function public.transition_game_package(uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.archive_game_package(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.rollback_game_package(uuid,uuid,bigint) from public,anon,authenticated;
revoke all on function public.record_game_package_launch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_game_package(uuid,uuid,integer,text,text,text,text,text,text,jsonb,jsonb,text,bigint,bigint,jsonb) to service_role;
grant execute on function public.record_game_package_quarantine(uuid,text,text,bigint,text,jsonb) to service_role;
grant execute on function public.transition_game_package(uuid,uuid,bigint,text) to service_role;
grant execute on function public.archive_game_package(uuid,uuid,bigint) to service_role;
grant execute on function public.rollback_game_package(uuid,uuid,bigint) to service_role;
grant execute on function public.record_game_package_launch(uuid,uuid) to service_role;

comment on table public.game_packages is 'Immutable package-version metadata; extracted assets stay private and server delivered.';
comment on table public.game_package_quarantine_events is 'Fail-closed import evidence. Rejected archives are never executed.';
