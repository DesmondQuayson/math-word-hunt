-- Phase 8D rollback refuses to remove download evidence or published file metadata.
do $$
begin
  if exists(select 1 from public.resource_download_events) or exists(
    select 1 from public.resource_files where validation_state='accepted'
  ) then raise exception 'Refusing Phase 8D rollback: resource evidence exists'; end if;
end;
$$;
drop function if exists public.record_resource_download(uuid,uuid);
drop function if exists public.register_resource_file(uuid,uuid,integer,text,text,text,text,text,text,bigint,text,text,jsonb,uuid);
drop trigger if exists content_resource_version_require_pdf on public.content_resource_versions;
drop function if exists private.require_pdf_before_publish();
drop table if exists public.resource_download_events;
drop table if exists public.resource_files;
drop policy if exists resource_objects_server_only_delete on storage.objects;
drop policy if exists resource_objects_server_only_update on storage.objects;
drop policy if exists resource_objects_server_only_insert on storage.objects;
drop policy if exists resource_objects_server_only_select on storage.objects;
drop policy if exists resource_buckets_hide_from_browser on storage.buckets;
delete from storage.buckets where id in ('resource-files','resource-quarantine');
