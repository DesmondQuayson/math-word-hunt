-- Phase 8 content operations activation. A published rollback version points
-- to immutable source metadata; authorize the source version's already-
-- validated private file without copying or exposing its Storage object.
create or replace function public.record_resource_download(p_consumer_user_id uuid,p_resource_file_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  account_row public.consumer_accounts%rowtype;
  entitlement_row public.consumer_game_entitlements%rowtype;
  file_row public.resource_files%rowtype;
  resource_row public.content_resources%rowtype;
  published_row public.content_resource_versions%rowtype;
  source_row public.content_resource_versions%rowtype;
  allowed boolean:=false;
  allowed_file_version integer;
begin
  select * into account_row from public.consumer_accounts where user_id=p_consumer_user_id and account_status='active';
  select * into entitlement_row from public.consumer_game_entitlements where user_id=p_consumer_user_id;
  select * into file_row from public.resource_files where id=p_resource_file_id and validation_state='accepted';
  if account_row.user_id is null or entitlement_row.user_id is null or file_row.id is null then return false; end if;
  select * into resource_row from public.content_resources where id=file_row.resource_id and publication_state='published';
  if resource_row.id is null or resource_row.published_version_number is null then return false; end if;
  select * into published_row from public.content_resource_versions
    where resource_id=resource_row.id and version_number=resource_row.published_version_number and publication_state='published';
  if published_row.id is null then return false; end if;
  allowed_file_version:=published_row.version_number;
  if published_row.source_version_id is not null then
    select * into source_row from public.content_resource_versions where id=published_row.source_version_id and resource_id=resource_row.id and publication_state='published';
    if source_row.id is null then return false; end if;
    allowed_file_version:=source_row.version_number;
  end if;
  if file_row.resource_version_number<>allowed_file_version then return false; end if;
  allowed:=(entitlement_row.entitlement_state='trial-active' and entitlement_row.trial_ends_at>statement_timestamp()) or
    (entitlement_row.entitlement_state in ('subscription-active','subscription-canceled-through-period-end') and entitlement_row.current_period_ends_at>statement_timestamp()) or
    (entitlement_row.entitlement_state='subscription-grace-period' and entitlement_row.grace_ends_at>statement_timestamp());
  if not allowed then return false; end if;
  insert into public.resource_download_events(consumer_user_id,resource_id,resource_file_id,entitlement_state)
    values(p_consumer_user_id,file_row.resource_id,file_row.id,entitlement_row.entitlement_state);
  perform public.record_admin_audit_event(null,'content.resource.downloaded',file_row.resource_id::text,
    jsonb_build_object('file_role',file_row.file_role,'entitlement_state',entitlement_row.entitlement_state,'published_version',published_row.version_number,'file_version',allowed_file_version),null,'phase8d-download-service');
  return true;
end;
$$;

revoke all on function public.record_resource_download(uuid,uuid) from public,anon,authenticated;
grant execute on function public.record_resource_download(uuid,uuid) to service_role;

comment on function public.record_resource_download(uuid,uuid) is
  'Server-only entitlement check for current published files, including immutable source files selected by an additive published rollback.';
