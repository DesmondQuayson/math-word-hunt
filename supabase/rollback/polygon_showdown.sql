-- Removes Polygon Showdown from a database: run only with the owner's approval.
--
-- This deletes every Polygon Coin balance, ledger line, purchase, avatar and
-- Solo run. To withdraw the game while keeping players' progress, set the
-- catalog entry to 'archived' instead and do not run this file.
--
-- The catalog entry is archived rather than deleted, because catalog versions
-- and audit rows reference it.
begin;

update public.game_catalog_entries set status='archived', lock_version=lock_version+1 where stable_key='polygon-showdown';

drop trigger if exists bingo_rooms_live_code_guard on public.bingo_rooms;
drop function if exists private.live_room_code_guard();
drop function if exists public.live_room_game_for_code(text);

drop function if exists public.polygon_leave(text);
drop function if exists public.polygon_player_commit(text,integer,jsonb,integer);
drop function if exists public.polygon_player_load(text);
drop function if exists public.polygon_join_room(text,text,text,text,text,uuid);
drop function if exists public.polygon_host_command(text,text,text,jsonb);
drop function if exists public.polygon_host_resume(text,text,text);
drop function if exists public.polygon_create_room(text,text,text,text,uuid,text,text,integer,text,jsonb);
drop function if exists private.polygon_refresh(public.polygon_rooms);
drop function if exists private.polygon_finalize(uuid);
drop function if exists private.polygon_participant_view(public.polygon_participants);
drop function if exists private.polygon_room_core(public.polygon_rooms,text);
drop function if exists private.polygon_standings(uuid);
drop function if exists private.polygon_phase(public.polygon_rooms);
drop function if exists private.polygon_cleanup();
drop function if exists public.polygon_avatar_save(uuid,jsonb,text,text);
drop function if exists public.polygon_purchase(uuid,text,text);
drop function if exists public.polygon_solo_commit(uuid,uuid,integer,integer,jsonb,integer,boolean,text[],boolean);
drop function if exists public.polygon_solo_load(uuid,uuid,integer);
drop function if exists public.polygon_solo_open(uuid);
drop function if exists public.polygon_solo_start(uuid,text,jsonb,boolean);
drop function if exists private.polygon_end_run(public.polygon_solo_runs);
drop function if exists private.polygon_run_view(public.polygon_solo_runs,text);
drop function if exists public.polygon_bootstrap(uuid);
drop function if exists private.polygon_grant_achievements(uuid,text[]);
drop function if exists private.polygon_bank_run(public.polygon_solo_runs);
drop function if exists private.polygon_credit(uuid,text,integer,text,jsonb);

drop table if exists public.polygon_participants;
drop table if exists public.polygon_rooms;
drop table if exists public.polygon_solo_runs;
drop table if exists public.polygon_profiles;
drop table if exists public.polygon_inventory;
drop table if exists public.polygon_ledger;
drop table if exists public.polygon_wallets;
drop table if exists public.polygon_shop_items;

drop function if exists private.polygon_state_valid(jsonb);
drop function if exists private.polygon_ms(timestamptz);

commit;
