-- Manual Phase 8A rollback. Run only after disabling MVH_ADMIN_ENABLED and
-- confirming no admin operation is active. Existing consumer/billing objects
-- are deliberately not referenced.

do $$
begin
  if exists (select 1 from storage.objects where bucket_id = 'admin-assets') then
    raise exception 'Refusing Phase 8A rollback: admin-assets is not empty';
  end if;
end;
$$;

drop policy if exists admin_assets_server_only_delete on storage.objects;
drop policy if exists admin_assets_server_only_update on storage.objects;
drop policy if exists admin_assets_server_only_insert on storage.objects;
drop policy if exists admin_assets_server_only_select on storage.objects;
drop policy if exists admin_assets_hide_bucket_from_browser on storage.buckets;
delete from storage.buckets where id = 'admin-assets';

drop function if exists public.revoke_admin_access(uuid, text, text, text);
drop function if exists public.end_admin_session(text, text, text, text);
drop function if exists public.start_admin_session(uuid, text, timestamptz, text, text);
drop function if exists public.mark_admin_mfa_enrolled(uuid);
drop function if exists public.clear_admin_auth_rate_limit(text, text);
drop function if exists public.consume_admin_auth_rate_limit(text, text, integer, integer, integer);
drop function if exists public.record_admin_audit_event(uuid, text, text, jsonb, text, text);

drop table if exists public.admin_auth_rate_limits;
drop table if exists public.admin_audit_log;
drop table if exists public.admin_sessions;
drop table if exists public.admin_users;
drop function if exists private.protect_admin_identity_boundary();
drop function if exists private.reject_admin_audit_mutation();
