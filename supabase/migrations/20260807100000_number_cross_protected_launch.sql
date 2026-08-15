-- Protected external-game launch support. This migration adds a reversible
-- maintenance state to the existing catalog workflow. Authorization tokens
-- and signing secrets remain server-only and are never stored in Postgres.

alter table public.game_catalog_entries
  drop constraint if exists game_catalog_entries_status_check;
alter table public.game_catalog_entries
  add constraint game_catalog_entries_status_check
  check (status in ('draft','maintenance','published','archived'));

alter table public.game_catalog_entries
  drop constraint if exists game_catalog_entries_difficulty_check;
alter table public.game_catalog_entries
  add constraint game_catalog_entries_difficulty_check
  check (difficulty in ('support','core','challenge','adaptive','mixed'));

create or replace function public.transition_game_catalog_entry(
  p_actor_admin_id uuid,p_catalog_entry_id uuid,p_expected_lock_version bigint,p_status text
)
returns bigint language plpgsql security definer set search_path=''
as $$ declare current_row public.game_catalog_entries%rowtype; next_lock bigint; begin
  perform private.assert_content_admin(p_actor_admin_id);
  select * into current_row from public.game_catalog_entries where id=p_catalog_entry_id for update;
  if current_row.id is null or current_row.lock_version<>p_expected_lock_version then
    raise exception 'Game catalog version conflict';
  end if;
  if current_row.launch_type='hosted_package' then
    raise exception 'Hosted package state is managed by package publication';
  end if;
  if current_row.launch_type='canonical' then
    raise exception 'Canonical game publication is protected';
  end if;
  if not (
    (current_row.status='draft' and p_status in ('published','archived')) or
    (current_row.status='published' and p_status in ('maintenance','archived')) or
    (current_row.status='maintenance' and p_status in ('published','archived'))
  ) then
    raise exception 'Invalid game publication transition';
  end if;
  if p_status='published' and (current_row.publication_metadata->>'health_status')<>'verified' then
    raise exception 'Verified external destination required';
  end if;
  next_lock:=current_row.lock_version+1;
  update public.game_catalog_entries set status=p_status,lock_version=next_lock,
    publication_metadata=publication_metadata||jsonb_build_object(
      'status_changed_at',statement_timestamp(),'status_changed_by',p_actor_admin_id
    )
    where id=p_catalog_entry_id;
  perform private.record_game_catalog_version(p_catalog_entry_id,p_actor_admin_id,null);
  perform public.record_admin_audit_event(
    p_actor_admin_id,
    case p_status
      when 'published' then 'admin.game.publish'
      when 'maintenance' then 'admin.game.maintenance'
      else 'admin.game.archive'
    end,
    p_catalog_entry_id::text,jsonb_build_object('status',p_status),null,'number-cross-protected-launch'
  );
  return next_lock;
end $$;

revoke all on function public.transition_game_catalog_entry(uuid,uuid,bigint,text) from public,anon,authenticated;
grant execute on function public.transition_game_catalog_entry(uuid,uuid,bigint,text) to service_role;
