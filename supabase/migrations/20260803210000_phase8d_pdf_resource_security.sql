-- Phase 8D: private PDF assets, fail-closed validation evidence, and
-- entitlement-controlled download auditing. Browser roles have no storage or
-- metadata authority; every mutation is a bounded owner/MFA server operation.

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
  ('resource-files','resource-files',false,20971520,array['application/pdf','image/jpeg','image/png','image/webp']::text[]),
  ('resource-quarantine','resource-quarantine',false,20971520,array['application/pdf','application/octet-stream']::text[]);

create policy resource_buckets_hide_from_browser
on storage.buckets as restrictive for select to anon, authenticated
using (id not in ('resource-files','resource-quarantine'));

create policy resource_objects_server_only_select
on storage.objects as restrictive for select to anon, authenticated
using (bucket_id not in ('resource-files','resource-quarantine'));
create policy resource_objects_server_only_insert
on storage.objects as restrictive for insert to anon, authenticated
with check (bucket_id not in ('resource-files','resource-quarantine'));
create policy resource_objects_server_only_update
on storage.objects as restrictive for update to anon, authenticated
using (bucket_id not in ('resource-files','resource-quarantine'))
with check (bucket_id not in ('resource-files','resource-quarantine'));
create policy resource_objects_server_only_delete
on storage.objects as restrictive for delete to anon, authenticated
using (bucket_id not in ('resource-files','resource-quarantine'));

create table public.resource_files (
  id uuid primary key default gen_random_uuid(),
  resource_id uuid not null references public.content_resources(id) on delete restrict,
  resource_version_number integer not null,
  file_role text not null check (file_role in ('primary_pdf','answer_key_pdf','thumbnail','preview_image')),
  original_filename text not null check (original_filename=btrim(original_filename) and char_length(original_filename) between 1 and 255),
  normalized_filename text not null check (normalized_filename ~ '^[a-z0-9]+(?:-[a-z0-9]+)*\.(pdf|png|jpg|jpeg|webp)$'),
  bucket_id text not null check (bucket_id in ('resource-files','resource-quarantine')),
  object_path text not null unique check (private.valid_content_object_path(object_path)),
  mime_type text not null check (mime_type in ('application/pdf','image/jpeg','image/png','image/webp','application/octet-stream')),
  byte_size bigint not null check (byte_size between 16 and 20971520),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  validation_state text not null check (validation_state in ('accepted','quarantined','archived')),
  validation_report jsonb not null default '{}'::jsonb check (jsonb_typeof(validation_report)='object' and octet_length(validation_report::text)<=8192),
  replaces_file_id uuid references public.resource_files(id) on delete restrict,
  created_by uuid not null references public.admin_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  quarantined_at timestamptz,
  archived_at timestamptz,
  foreign key (resource_id,resource_version_number)
    references public.content_resource_versions(resource_id,version_number) on delete restrict,
  check ((validation_state='accepted')=(accepted_at is not null)),
  check ((validation_state='quarantined')=(quarantined_at is not null)),
  check ((validation_state='archived')=(archived_at is not null)),
  check (
    (validation_state='accepted' and bucket_id='resource-files' and object_path like 'resources/%') or
    (validation_state='quarantined' and bucket_id='resource-quarantine' and object_path like 'quarantine/%') or
    validation_state='archived'
  )
);
create unique index resource_files_one_active_role_idx
  on public.resource_files(resource_id,resource_version_number,file_role)
  where validation_state='accepted' and file_role<>'preview_image';
create index resource_files_checksum_idx on public.resource_files(sha256,validation_state);

create table public.resource_download_events (
  id uuid primary key default gen_random_uuid(),
  consumer_user_id uuid references auth.users(id) on delete set null,
  resource_id uuid not null references public.content_resources(id) on delete restrict,
  resource_file_id uuid not null references public.resource_files(id) on delete restrict,
  entitlement_state text not null check (entitlement_state in (
    'trial-active','subscription-active','subscription-grace-period','subscription-canceled-through-period-end'
  )),
  downloaded_at timestamptz not null default now()
);
create index resource_download_events_resource_created_idx on public.resource_download_events(resource_id,downloaded_at desc);
create index resource_download_events_user_created_idx on public.resource_download_events(consumer_user_id,downloaded_at desc);

alter table public.resource_files enable row level security;
alter table public.resource_files force row level security;
alter table public.resource_download_events enable row level security;
alter table public.resource_download_events force row level security;
revoke all on table public.resource_files from public,anon,authenticated,service_role;
revoke all on table public.resource_download_events from public,anon,authenticated,service_role;
grant select on table public.resource_files,public.resource_download_events to service_role;

create or replace function private.require_pdf_before_publish()
returns trigger
language plpgsql
set search_path=''
as $$
declare resource_kind text; expected_role text;
begin
  if new.publication_state='published' and old.publication_state<>'published' then
    select resource_type into resource_kind from public.content_resources where id=new.resource_id;
    if resource_kind in ('homework_pdf','homework_answer_key','quiz_pdf','quiz_answer_key') then
      expected_role:=case when resource_kind in ('homework_answer_key','quiz_answer_key') then 'answer_key_pdf' else 'primary_pdf' end;
      perform id from public.resource_files where resource_id=new.resource_id
        and resource_version_number=new.version_number and file_role=expected_role and validation_state='accepted';
      if not found then raise exception 'Accepted PDF required before publication'; end if;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.require_pdf_before_publish() from public,anon,authenticated,service_role;
create trigger content_resource_version_require_pdf
before update of publication_state on public.content_resource_versions
for each row execute function private.require_pdf_before_publish();

create or replace function public.register_resource_file(
  p_actor_admin_id uuid,p_resource_id uuid,p_resource_version_number integer,p_file_role text,
  p_original_filename text,p_normalized_filename text,p_bucket_id text,p_object_path text,
  p_mime_type text,p_byte_size bigint,p_sha256 text,p_validation_state text,p_validation_report jsonb,
  p_replaces_file_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare resource_row public.content_resources%rowtype; created_id uuid; action_name text;
begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into resource_row from public.content_resources where id=p_resource_id for update;
  if not found or resource_row.publication_state='archived' or resource_row.current_version_number<>p_resource_version_number then
    raise exception 'Current active resource version required';
  end if;
  if p_validation_state not in ('accepted','quarantined') then raise exception 'Final validation decision required'; end if;
  if p_file_role in ('primary_pdf','answer_key_pdf') and p_mime_type not in ('application/pdf','application/octet-stream') then
    raise exception 'PDF MIME evidence required';
  end if;
  if p_validation_state='accepted' and exists(
    select 1 from public.resource_files where sha256=p_sha256 and validation_state='accepted'
      and resource_id<>p_resource_id
  ) then raise exception 'Duplicate accepted file detected'; end if;
  if p_replaces_file_id is not null then
    perform id from public.resource_files where id=p_replaces_file_id and resource_id=p_resource_id and validation_state='accepted';
    if not found then raise exception 'Owned active replacement target required'; end if;
    update public.resource_files set validation_state='archived',accepted_at=null,archived_at=statement_timestamp()
      where id=p_replaces_file_id;
  end if;
  insert into public.resource_files(
    resource_id,resource_version_number,file_role,original_filename,normalized_filename,bucket_id,object_path,
    mime_type,byte_size,sha256,validation_state,validation_report,replaces_file_id,created_by,accepted_at,quarantined_at
  ) values(
    p_resource_id,p_resource_version_number,p_file_role,btrim(p_original_filename),p_normalized_filename,p_bucket_id,p_object_path,
    p_mime_type,p_byte_size,p_sha256,p_validation_state,coalesce(p_validation_report,'{}'::jsonb),p_replaces_file_id,p_actor_admin_id,
    case when p_validation_state='accepted' then statement_timestamp() end,
    case when p_validation_state='quarantined' then statement_timestamp() end
  ) returning id into created_id;
  action_name:=case when p_validation_state='quarantined' then 'admin.resource.quarantined'
    when p_replaces_file_id is not null then 'admin.resource.replaced' else 'admin.resource.uploaded' end;
  perform public.record_admin_audit_event(p_actor_admin_id,action_name,p_resource_id::text,
    jsonb_build_object('file_id',created_id,'file_role',p_file_role,'validation_state',p_validation_state,'sha256',p_sha256),
    null,'phase8d-resource-service');
  return created_id;
end;
$$;

create or replace function public.record_resource_download(p_consumer_user_id uuid,p_resource_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare account_row public.consumer_accounts%rowtype; entitlement_row public.consumer_game_entitlements%rowtype;
  file_row public.resource_files%rowtype; resource_row public.content_resources%rowtype; allowed boolean:=false;
begin
  select * into account_row from public.consumer_accounts where user_id=p_consumer_user_id and account_status='active';
  select * into entitlement_row from public.consumer_game_entitlements where user_id=p_consumer_user_id;
  select * into file_row from public.resource_files where id=p_resource_file_id and validation_state='accepted';
  if account_row.user_id is null or entitlement_row.user_id is null or file_row.id is null then return false; end if;
  select * into resource_row from public.content_resources where id=file_row.resource_id and publication_state='published'
    and published_version_number=file_row.resource_version_number;
  if resource_row.id is null then return false; end if;
  allowed:=
    (entitlement_row.entitlement_state='trial-active' and entitlement_row.trial_ends_at>statement_timestamp()) or
    (entitlement_row.entitlement_state in ('subscription-active','subscription-canceled-through-period-end') and entitlement_row.current_period_ends_at>statement_timestamp()) or
    (entitlement_row.entitlement_state='subscription-grace-period' and entitlement_row.grace_ends_at>statement_timestamp());
  if not allowed then return false; end if;
  insert into public.resource_download_events(consumer_user_id,resource_id,resource_file_id,entitlement_state)
    values(p_consumer_user_id,file_row.resource_id,file_row.id,entitlement_row.entitlement_state);
  perform public.record_admin_audit_event(null,'content.resource.downloaded',file_row.resource_id::text,
    jsonb_build_object('file_role',file_row.file_role,'entitlement_state',entitlement_row.entitlement_state),null,'phase8d-download-service');
  return true;
end;
$$;

revoke all on function public.register_resource_file(uuid,uuid,integer,text,text,text,text,text,text,bigint,text,text,jsonb,uuid) from public,anon,authenticated;
revoke all on function public.record_resource_download(uuid,uuid) from public,anon,authenticated;
grant execute on function public.register_resource_file(uuid,uuid,integer,text,text,text,text,text,text,bigint,text,text,jsonb,uuid) to service_role;
grant execute on function public.record_resource_download(uuid,uuid) to service_role;

comment on table public.resource_files is 'Private validated or quarantined resource objects. No browser role has direct access.';
comment on table public.resource_download_events is 'Minimal adult-account download evidence; no student or learning-history data.';
