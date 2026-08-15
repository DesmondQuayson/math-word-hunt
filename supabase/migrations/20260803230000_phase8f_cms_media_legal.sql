-- Phase 8F: structured CMS, versioned legal copy, and private media with
-- explicitly validated public derivatives. No browser role owns content state.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
  ('cms-media','cms-media',false,20971520,array['image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg','audio/wav','application/pdf']::text[]),
  ('cms-media-quarantine','cms-media-quarantine',false,20971520,array['application/octet-stream']::text[]);

create policy cms_media_buckets_hide_from_browser on storage.buckets as restrictive for select to anon,authenticated
using(id not in ('cms-media','cms-media-quarantine'));
create policy cms_media_objects_hide_select on storage.objects as restrictive for select to anon,authenticated
using(bucket_id not in ('cms-media','cms-media-quarantine'));
create policy cms_media_objects_hide_insert on storage.objects as restrictive for insert to anon,authenticated
with check(bucket_id not in ('cms-media','cms-media-quarantine'));
create policy cms_media_objects_hide_update on storage.objects as restrictive for update to anon,authenticated
using(bucket_id not in ('cms-media','cms-media-quarantine')) with check(bucket_id not in ('cms-media','cms-media-quarantine'));
create policy cms_media_objects_hide_delete on storage.objects as restrictive for delete to anon,authenticated
using(bucket_id not in ('cms-media','cms-media-quarantine'));

create or replace function private.valid_cms_content(p_key text,p_content jsonb,p_seo jsonb)
returns boolean language sql immutable set search_path='' as $$
  select p_key in ('homepage','featured-games','featured-homework','featured-quizzes','announcements','faq','help','support','pricing-copy','map-prep','navigation','footer','terms','privacy','cancellation','refunds')
    and pg_catalog.jsonb_typeof(p_content)='object' and pg_catalog.octet_length(p_content::text)<=65536
    and pg_catalog.jsonb_typeof(p_content->'blocks')='array' and pg_catalog.jsonb_array_length(p_content->'blocks')<=50
    and not p_content::text ~* '<\s*/?|javascript\s*:|data\s*:\s*text/html|on(click|load|error)\s*=|\beval\s*\(|\bnew\s+function\b'
    and not exists(select 1 from pg_catalog.jsonb_array_elements(p_content->'blocks') b
      where b->>'type' not in ('hero','section','feature-list','announcement','faq-list','link-list','external-link','legal-section'))
    and (p_key<>'map-prep' or not exists(select 1 from pg_catalog.jsonb_array_elements(p_content->'blocks') b
      where b->>'type'='external-link' and coalesce(b->>'href','') !~ '^https://'))
    and pg_catalog.jsonb_typeof(p_seo)='object' and pg_catalog.octet_length(p_seo::text)<=4096
    and not p_seo::text ~* '<\s*/?|javascript\s*:';
$$;
revoke all on function private.valid_cms_content(text,jsonb,jsonb) from public,anon,authenticated,service_role;

create table public.cms_documents(
  id uuid primary key default gen_random_uuid(),
  document_key text not null unique check(document_key in ('homepage','featured-games','featured-homework','featured-quizzes','announcements','faq','help','support','pricing-copy','map-prep','navigation','footer','terms','privacy','cancellation','refunds')),
  document_kind text not null check(document_kind in ('page','collection','configuration','legal')),
  publication_state text not null default 'draft' check(publication_state in ('draft','ready_for_review','published','archived')),
  current_version_number integer not null default 1 check(current_version_number>0),
  published_version_number integer check(published_version_number is null or published_version_number>0),
  lock_version bigint not null default 1 check(lock_version>0),
  created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), published_at timestamptz, archived_at timestamptz,
  check(publication_state<>'published' or published_version_number is not null)
);
alter table public.cms_documents add constraint cms_documents_id_key_unique unique(id,document_key);

create table public.cms_document_versions(
  document_id uuid not null, document_key text not null,
  version_number integer not null check(version_number>0),
  publication_state text not null check(publication_state in ('draft','ready_for_review','published','archived')),
  content jsonb not null, seo_metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(), reviewed_at timestamptz, published_at timestamptz,
  primary key(document_id,version_number),
  foreign key(document_id,document_key) references public.cms_documents(id,document_key) on delete restrict,
  check(private.valid_cms_content(document_key,content,seo_metadata))
);

create table public.cms_media_assets(
  id uuid primary key default gen_random_uuid(), media_key text not null unique check(media_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  media_kind text not null check(media_kind in ('image','icon','logo','thumbnail','preview-image','audio','downloadable-pdf')),
  publication_state text not null default 'draft' check(publication_state in ('draft','ready_for_review','published','archived')),
  current_version_number integer not null default 1 check(current_version_number>0), published_version_number integer,
  lock_version bigint not null default 1 check(lock_version>0), created_by uuid not null references public.admin_users(id) on delete restrict,
  updated_by uuid not null references public.admin_users(id) on delete restrict, created_at timestamptz not null default now(),updated_at timestamptz not null default now(),archived_at timestamptz
);

create table public.cms_media_versions(
  media_asset_id uuid not null references public.cms_media_assets(id) on delete restrict,version_number integer not null check(version_number>0),
  original_filename text not null check(original_filename=btrim(original_filename) and char_length(original_filename) between 1 and 255),
  bucket_id text not null check(bucket_id in ('cms-media','cms-media-quarantine')),
  original_path text not null unique check(original_path ~ '^(originals|quarantine)/[0-9a-f-]{36}/v[0-9]+/[a-zA-Z0-9._/-]+$'),
  derivative_path text unique check(derivative_path is null or derivative_path ~ '^derivatives/[0-9a-f-]{36}/v[0-9]+/[a-zA-Z0-9._/-]+$'),
  mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','audio/mpeg','audio/ogg','audio/wav','application/pdf','application/octet-stream')),
  derivative_mime_type text check(derivative_mime_type is null or derivative_mime_type in ('image/webp','audio/mpeg','audio/ogg','audio/wav','application/pdf')),
  byte_size bigint not null check(byte_size between 16 and 20971520),sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  width integer check(width is null or width between 1 and 8192),height integer check(height is null or height between 1 and 8192),
  alt_text text not null default '' check(char_length(alt_text)<=500),caption text not null default '' check(char_length(caption)<=1000),
  attribution text not null default '' check(char_length(attribution)<=1000),license text not null default '' check(char_length(license)<=200),
  validation_state text not null check(validation_state in ('accepted','quarantined','archived')),
  validation_report jsonb not null default '{}'::jsonb check(jsonb_typeof(validation_report)='object' and octet_length(validation_report::text)<=8192),
  created_by uuid not null references public.admin_users(id) on delete restrict,created_at timestamptz not null default now(),
  primary key(media_asset_id,version_number),
  check((validation_state='accepted' and bucket_id='cms-media' and derivative_path is not null) or (validation_state='quarantined' and bucket_id='cms-media-quarantine' and derivative_path is null) or validation_state='archived'),
  check(mime_type not like 'image/%' or (width is not null and height is not null and alt_text<>''))
);
create unique index cms_media_accepted_sha_idx on public.cms_media_versions(sha256) where validation_state='accepted';

create table public.cms_media_usage(
  media_asset_id uuid not null references public.cms_media_assets(id) on delete restrict,
  document_id uuid not null, document_version_number integer not null,
  created_at timestamptz not null default now(),primary key(media_asset_id,document_id,document_version_number),
  foreign key(document_id,document_version_number) references public.cms_document_versions(document_id,version_number) on delete restrict
);

create or replace function private.protect_published_cms_version() returns trigger language plpgsql set search_path='' as $$
begin if old.publication_state='published' then raise exception 'Published CMS history is immutable'; end if; return new; end;$$;
revoke all on function private.protect_published_cms_version() from public,anon,authenticated,service_role;
create trigger cms_published_versions_immutable before update or delete on public.cms_document_versions for each row execute function private.protect_published_cms_version();

alter table public.cms_documents enable row level security; alter table public.cms_documents force row level security;
alter table public.cms_document_versions enable row level security; alter table public.cms_document_versions force row level security;
alter table public.cms_media_assets enable row level security; alter table public.cms_media_assets force row level security;
alter table public.cms_media_versions enable row level security; alter table public.cms_media_versions force row level security;
alter table public.cms_media_usage enable row level security; alter table public.cms_media_usage force row level security;
revoke all on table public.cms_documents,public.cms_document_versions,public.cms_media_assets,public.cms_media_versions,public.cms_media_usage from public,anon,authenticated,service_role;
grant select on table public.cms_documents,public.cms_document_versions,public.cms_media_assets,public.cms_media_versions,public.cms_media_usage to service_role;

create or replace function public.create_cms_document(p_actor_admin_id uuid,p_document_key text,p_document_kind text,p_content jsonb,p_seo_metadata jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid; expected_kind text;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  expected_kind:=case when p_document_key in ('terms','privacy','cancellation','refunds') then 'legal' when p_document_key in ('featured-games','featured-homework','featured-quizzes','announcements','faq') then 'collection' when p_document_key in ('map-prep','navigation','footer') then 'configuration' else 'page' end;
  if p_document_kind<>expected_kind or not private.valid_cms_content(p_document_key,p_content,p_seo_metadata) then raise exception 'Invalid structured CMS document'; end if;
  insert into public.cms_documents(document_key,document_kind,created_by,updated_by) values(p_document_key,p_document_kind,p_actor_admin_id,p_actor_admin_id) returning id into created_id;
  insert into public.cms_document_versions(document_id,document_key,version_number,publication_state,content,seo_metadata,created_by) values(created_id,p_document_key,1,'draft',p_content,p_seo_metadata,p_actor_admin_id);
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.cms.created',created_id::text,jsonb_build_object('key',p_document_key,'version',1),null,'phase8f-cms-service'); return created_id;
end;$$;

create or replace function public.revise_cms_document(p_actor_admin_id uuid,p_document_id uuid,p_expected_lock_version bigint,p_content jsonb,p_seo_metadata jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare current_row public.cms_documents%rowtype; next_version integer;
begin perform private.assert_content_admin(p_actor_admin_id); select * into current_row from public.cms_documents where id=p_document_id for update;
  if not found or current_row.lock_version<>p_expected_lock_version or current_row.publication_state='archived' or not private.valid_cms_content(current_row.document_key,p_content,p_seo_metadata) then raise exception 'CMS revision rejected'; end if;
  next_version:=current_row.current_version_number+1;
  insert into public.cms_document_versions(document_id,document_key,version_number,publication_state,content,seo_metadata,created_by) values(p_document_id,current_row.document_key,next_version,'draft',p_content,p_seo_metadata,p_actor_admin_id);
  update public.cms_documents set current_version_number=next_version,publication_state='draft',lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp() where id=p_document_id;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.cms.revised',p_document_id::text,jsonb_build_object('version',next_version),null,'phase8f-cms-service'); return next_version;
end;$$;

create or replace function public.transition_cms_document(p_actor_admin_id uuid,p_document_id uuid,p_version_number integer,p_expected_lock_version bigint,p_target_state text)
returns bigint language plpgsql security definer set search_path='' as $$
declare current_row public.cms_documents%rowtype; version_row public.cms_document_versions%rowtype; next_lock bigint; media_text text;
begin perform private.assert_content_admin(p_actor_admin_id); select * into current_row from public.cms_documents where id=p_document_id for update;
  select * into version_row from public.cms_document_versions where document_id=p_document_id and version_number=p_version_number for update;
  if current_row.id is null or version_row.document_id is null or current_row.lock_version<>p_expected_lock_version or current_row.current_version_number<>p_version_number then raise exception 'CMS version conflict'; end if;
  if not ((current_row.publication_state='draft' and p_target_state='ready_for_review') or (current_row.publication_state='ready_for_review' and p_target_state in ('draft','published')) or (current_row.publication_state='published' and p_target_state='archived')) then raise exception 'Invalid CMS transition'; end if;
  if p_target_state='published' then
    for media_text in select jsonb_path_query(version_row.content,'lax $.blocks[*].mediaId') #>> '{}' loop
      perform id from public.cms_media_assets where id=media_text::uuid and publication_state='published'; if not found then raise exception 'Referenced published media required'; end if;
      insert into public.cms_media_usage(media_asset_id,document_id,document_version_number) values(media_text::uuid,p_document_id,p_version_number) on conflict do nothing;
    end loop;
  end if;
  if version_row.publication_state<>'published' then
    update public.cms_document_versions set publication_state=p_target_state,reviewed_at=case when p_target_state='ready_for_review' then statement_timestamp() else reviewed_at end,published_at=case when p_target_state='published' then statement_timestamp() else published_at end where document_id=p_document_id and version_number=p_version_number;
  end if;
  next_lock:=current_row.lock_version+1; update public.cms_documents set publication_state=p_target_state,published_version_number=case when p_target_state='published' then p_version_number when p_target_state='archived' then null else published_version_number end,lock_version=next_lock,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),published_at=case when p_target_state='published' then statement_timestamp() else published_at end,archived_at=case when p_target_state='archived' then statement_timestamp() else null end where id=p_document_id;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.cms.'||replace(p_target_state,'ready_for_review','submitted'),p_document_id::text,jsonb_build_object('version',p_version_number,'legal',current_row.document_kind='legal'),null,'phase8f-cms-service'); return next_lock;
end;$$;

create or replace function public.rollback_cms_document(p_actor_admin_id uuid,p_document_id uuid,p_prior_version integer,p_expected_lock_version bigint)
returns integer language plpgsql security definer set search_path='' as $$
declare current_row public.cms_documents%rowtype; prior_row public.cms_document_versions%rowtype; next_version integer;
begin perform private.assert_content_admin(p_actor_admin_id); select * into current_row from public.cms_documents where id=p_document_id for update;
  select * into prior_row from public.cms_document_versions where document_id=p_document_id and version_number=p_prior_version and publication_state='published';
  if current_row.id is null or prior_row.document_id is null or current_row.lock_version<>p_expected_lock_version then raise exception 'Published rollback source required'; end if;
  next_version:=current_row.current_version_number+1; insert into public.cms_document_versions(document_id,document_key,version_number,publication_state,content,seo_metadata,created_by,reviewed_at,published_at) values(p_document_id,current_row.document_key,next_version,'published',prior_row.content,prior_row.seo_metadata,p_actor_admin_id,statement_timestamp(),statement_timestamp());
  update public.cms_documents set current_version_number=next_version,published_version_number=next_version,publication_state='published',lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),published_at=statement_timestamp() where id=p_document_id;
  insert into public.cms_media_usage select media_asset_id,p_document_id,next_version,statement_timestamp() from public.cms_media_usage where document_id=p_document_id and document_version_number=p_prior_version;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.cms.rolled_back',p_document_id::text,jsonb_build_object('source_version',p_prior_version,'new_version',next_version),null,'phase8f-cms-service'); return next_version;
end;$$;

create or replace function public.register_cms_media(p_actor_admin_id uuid,p_media_key text,p_media_kind text,p_original_filename text,p_bucket_id text,p_original_path text,p_derivative_path text,p_mime_type text,p_derivative_mime_type text,p_byte_size bigint,p_sha256 text,p_width integer,p_height integer,p_alt_text text,p_caption text,p_attribution text,p_license text,p_validation_state text,p_validation_report jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare created_id uuid;
begin perform private.assert_content_admin(p_actor_admin_id);
  if p_validation_state not in ('accepted','quarantined') or (p_validation_state='accepted' and p_media_kind in ('image','icon','logo','thumbnail','preview-image') and (nullif(btrim(p_alt_text),'') is null or p_width is null or p_height is null)) then raise exception 'Media validation evidence required'; end if;
  if p_validation_state='accepted' and exists(select 1 from public.cms_media_versions where sha256=p_sha256 and validation_state='accepted') then raise exception 'Duplicate media detected'; end if;
  insert into public.cms_media_assets(media_key,media_kind,created_by,updated_by) values(p_media_key,p_media_kind,p_actor_admin_id,p_actor_admin_id) returning id into created_id;
  insert into public.cms_media_versions values(created_id,1,p_original_filename,p_bucket_id,p_original_path,p_derivative_path,p_mime_type,p_derivative_mime_type,p_byte_size,p_sha256,p_width,p_height,btrim(p_alt_text),btrim(p_caption),btrim(p_attribution),btrim(p_license),p_validation_state,coalesce(p_validation_report,'{}'),p_actor_admin_id,statement_timestamp());
  perform public.record_admin_audit_event(p_actor_admin_id,case when p_validation_state='accepted' then 'admin.media.uploaded' else 'admin.media.quarantined' end,created_id::text,jsonb_build_object('kind',p_media_kind,'sha256',p_sha256),null,'phase8f-media-service'); return created_id;
end;$$;

create or replace function public.transition_cms_media(p_actor_admin_id uuid,p_media_asset_id uuid,p_expected_lock_version bigint,p_target_state text)
returns bigint language plpgsql security definer set search_path='' as $$
declare current_row public.cms_media_assets%rowtype; version_row public.cms_media_versions%rowtype;
begin perform private.assert_content_admin(p_actor_admin_id); select * into current_row from public.cms_media_assets where id=p_media_asset_id for update;
  select * into version_row from public.cms_media_versions where media_asset_id=p_media_asset_id and version_number=current_row.current_version_number;
  if current_row.id is null or current_row.lock_version<>p_expected_lock_version or version_row.validation_state<>'accepted' then raise exception 'Accepted media version required'; end if;
  if not ((current_row.publication_state='draft' and p_target_state='ready_for_review') or (current_row.publication_state='ready_for_review' and p_target_state in ('draft','published'))) then raise exception 'Invalid media transition'; end if;
  update public.cms_media_assets set publication_state=p_target_state,published_version_number=case when p_target_state='published' then current_version_number else null end,lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp() where id=p_media_asset_id;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.media.'||replace(p_target_state,'ready_for_review','submitted'),p_media_asset_id::text,jsonb_build_object('version',current_row.current_version_number),null,'phase8f-media-service'); return current_row.lock_version+1;
end;$$;

create or replace function public.revise_cms_media(p_actor_admin_id uuid,p_media_asset_id uuid,p_expected_lock_version bigint,p_original_filename text,p_bucket_id text,p_original_path text,p_derivative_path text,p_mime_type text,p_derivative_mime_type text,p_byte_size bigint,p_sha256 text,p_width integer,p_height integer,p_alt_text text,p_caption text,p_attribution text,p_license text,p_validation_state text,p_validation_report jsonb)
returns integer language plpgsql security definer set search_path='' as $$
declare current_row public.cms_media_assets%rowtype; next_version integer;
begin perform private.assert_content_admin(p_actor_admin_id); select * into current_row from public.cms_media_assets where id=p_media_asset_id for update;
  if current_row.id is null or current_row.lock_version<>p_expected_lock_version or current_row.publication_state='archived' then raise exception 'Media version conflict'; end if;
  if p_validation_state not in ('accepted','quarantined') or (p_validation_state='accepted' and current_row.media_kind in ('image','icon','logo','thumbnail','preview-image') and (nullif(btrim(p_alt_text),'') is null or p_width is null or p_height is null)) then raise exception 'Media validation evidence required'; end if;
  if p_validation_state='accepted' and exists(select 1 from public.cms_media_versions where sha256=p_sha256 and validation_state='accepted' and media_asset_id<>p_media_asset_id) then raise exception 'Duplicate media detected'; end if;
  next_version:=current_row.current_version_number+1;
  insert into public.cms_media_versions values(p_media_asset_id,next_version,p_original_filename,p_bucket_id,p_original_path,p_derivative_path,p_mime_type,p_derivative_mime_type,p_byte_size,p_sha256,p_width,p_height,btrim(p_alt_text),btrim(p_caption),btrim(p_attribution),btrim(p_license),p_validation_state,coalesce(p_validation_report,'{}'),p_actor_admin_id,statement_timestamp());
  update public.cms_media_assets set current_version_number=next_version,publication_state='draft',lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp() where id=p_media_asset_id;
  perform public.record_admin_audit_event(p_actor_admin_id,case when p_validation_state='accepted' then 'admin.media.revised' else 'admin.media.quarantined' end,p_media_asset_id::text,jsonb_build_object('version',next_version,'sha256',p_sha256),null,'phase8f-media-service'); return next_version;
end;$$;

create or replace function public.archive_cms_media(p_actor_admin_id uuid,p_media_asset_id uuid,p_expected_lock_version bigint)
returns boolean language plpgsql security definer set search_path='' as $$
begin perform private.assert_content_admin(p_actor_admin_id); perform id from public.cms_media_assets where id=p_media_asset_id and lock_version=p_expected_lock_version for update;
  if not found then raise exception 'Media version conflict'; end if; if exists(select 1 from public.cms_media_usage where media_asset_id=p_media_asset_id) then raise exception 'Media is in use'; end if;
  update public.cms_media_assets set publication_state='archived',published_version_number=null,lock_version=lock_version+1,updated_by=p_actor_admin_id,updated_at=statement_timestamp(),archived_at=statement_timestamp() where id=p_media_asset_id;
  perform public.record_admin_audit_event(p_actor_admin_id,'admin.media.archived',p_media_asset_id::text,'{}',null,'phase8f-media-service'); return true;
end;$$;

revoke all on function public.create_cms_document(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.revise_cms_document(uuid,uuid,bigint,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.transition_cms_document(uuid,uuid,integer,bigint,text) from public,anon,authenticated;
revoke all on function public.rollback_cms_document(uuid,uuid,integer,bigint) from public,anon,authenticated;
revoke all on function public.register_cms_media(uuid,text,text,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.transition_cms_media(uuid,uuid,bigint,text) from public,anon,authenticated;
revoke all on function public.revise_cms_media(uuid,uuid,bigint,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.archive_cms_media(uuid,uuid,bigint) from public,anon,authenticated;
grant execute on function public.create_cms_document(uuid,text,text,jsonb,jsonb) to service_role;
grant execute on function public.revise_cms_document(uuid,uuid,bigint,jsonb,jsonb) to service_role;
grant execute on function public.transition_cms_document(uuid,uuid,integer,bigint,text) to service_role;
grant execute on function public.rollback_cms_document(uuid,uuid,integer,bigint) to service_role;
grant execute on function public.register_cms_media(uuid,text,text,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.transition_cms_media(uuid,uuid,bigint,text) to service_role;
grant execute on function public.revise_cms_media(uuid,uuid,bigint,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb) to service_role;
grant execute on function public.archive_cms_media(uuid,uuid,bigint) to service_role;

comment on table public.cms_document_versions is 'Structured, allowlisted CMS and legal content. Published versions are immutable.';
comment on table public.cms_media_versions is 'Private originals and reviewed derivatives; browser roles have no storage authority.';
