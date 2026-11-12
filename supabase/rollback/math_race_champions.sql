-- Removes Math Race Champions from a database: run only with the owner's approval.
--
-- This deletes every Race Dollar balance, ledger line, owned car, stage record
-- and race. To withdraw the game while keeping players' progress, set the
-- catalog entry to 'archived' instead and do not run this file.
--
-- The catalog entry is archived rather than deleted, because catalog versions
-- and audit rows reference it.
--
-- The room-code guard and the code lookup are SHARED with Math Bingo Live and
-- Polygon Showdown. They are put back exactly as Polygon Showdown's migration
-- (20261109100000) left them, not dropped, so those two games keep one code
-- space between them. Run this file BEFORE supabase/rollback/polygon_showdown.sql
-- if both games are ever removed.
begin;

update public.game_catalog_entries set status='archived', lock_version=lock_version+1 where stable_key='math-race-champions';

-- Open race rooms close first, so their codes stop resolving.
update public.race_rooms set status='closed' where status='open';

drop trigger if exists race_rooms_live_code_guard on public.race_rooms;
drop trigger if exists polygon_rooms_live_code_guard on public.polygon_rooms;

create or replace function private.live_room_code_guard()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.status='open' then
    perform pg_advisory_xact_lock(hashtext('live-room-code:'||new.code));
    if exists (select 1 from public.polygon_rooms p where p.code=new.code and p.status='open') then
      raise unique_violation using message='This room code belongs to another live game.';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.live_room_code_guard() from public,anon,authenticated;

create or replace function public.live_room_game_for_code(p_code text)
returns text language sql stable security definer set search_path=''
as $$
  select case
    when exists (select 1 from public.polygon_rooms p where p.code=p_code and p.status='open' and p.expires_at > statement_timestamp()) then 'polygon_showdown'
    when exists (select 1 from public.bingo_rooms b where b.code=p_code and b.status='open' and b.expires_at > statement_timestamp()) then 'math_bingo_live'
    else null
  end
$$;
revoke all on function public.live_room_game_for_code(text) from public,anon,authenticated;
grant execute on function public.live_room_game_for_code(text) to service_role;

drop function if exists public.race_leave(text);
drop function if exists public.race_player_commit(text,integer,jsonb);
drop function if exists public.race_player_load(text);
drop function if exists public.race_join_room(text,text,text,text,text,text,uuid,jsonb);
drop function if exists public.race_host_command(text,text,text,jsonb);
drop function if exists public.race_host_resume(text,text,text);
drop function if exists public.race_create_room(text,text,text,text,uuid,text,text,text,jsonb,text,jsonb);
drop function if exists private.race_refresh(public.race_rooms);
drop function if exists private.race_finalize(uuid);
drop function if exists private.race_participant_view(public.race_participants);
drop function if exists private.race_room_core(public.race_rooms,text);
drop function if exists private.race_standings(uuid);
drop function if exists private.race_phase(public.race_rooms);
drop function if exists private.race_cleanup();
drop function if exists public.race_equip(uuid,text);
drop function if exists public.race_purchase(uuid,text,text);
drop function if exists public.race_run_finish(uuid,uuid,integer,jsonb,boolean,integer,integer,text[],jsonb);
drop function if exists public.race_run_commit(uuid,uuid,integer,jsonb);
drop function if exists public.race_run_load(uuid,uuid);
drop function if exists public.race_run_start(uuid,integer,jsonb,text,text,jsonb,integer);
drop function if exists public.race_bootstrap(uuid);
drop function if exists private.race_unlocked(uuid);
drop function if exists private.race_grant_achievements(uuid,text[]);
drop function if exists private.race_credit(uuid,text,integer,text,integer,jsonb);

drop table if exists public.race_participants;
drop table if exists public.race_rooms;
drop table if exists public.race_runs;
drop table if exists public.race_stage_progress;
drop table if exists public.race_profiles;
drop table if exists public.race_garage;
drop table if exists public.race_ledger;
drop table if exists public.race_wallets;
drop table if exists public.race_achievements;
drop table if exists public.race_cars;

drop function if exists private.race_stage_reward(integer);
drop function if exists private.race_settings_valid(jsonb);
drop function if exists private.race_state_valid(jsonb);
drop function if exists private.race_ms(timestamptz);

commit;
