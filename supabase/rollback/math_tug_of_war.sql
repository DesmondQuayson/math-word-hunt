-- Rollback / repair for 20260927100000_math_tug_of_war.sql and
-- 20260928100000_math_tug_of_war_seven_pulls.sql (Math Tug of War V1).
--
-- ORDER: roll the APPLICATION back first (promote the previous production
-- deployment). Builds without the game drop an unregistered internal catalog
-- key, so the card disappears with the app rollback alone and the database can
-- stay as it is. Nothing here needs to run for an application rollback.
--
-- Step 1 (preferred, non-destructive): withdraw the card but keep its history.
update public.game_catalog_entries
set status = 'archived', lock_version = lock_version + 1
where stable_key = 'math-tug-of-war' and status = 'published';
select private.record_game_catalog_version(id, null, null)
from public.game_catalog_entries where stable_key = 'math-tug-of-war';

-- Step 2 (only if the online store itself must go; rooms are ephemeral game
-- state that expires within hours — no account, subscription or progress data):
-- drop function if exists public.tug_leave_room(text, text);
-- drop function if exists public.tug_request_rematch(text, text, integer);
-- drop function if exists public.tug_submit_answer(text, text, integer, integer, boolean);
-- drop function if exists public.tug_room_state(text, text);
-- drop function if exists public.tug_join_room(text, text, text, text);
-- drop function if exists public.tug_create_room(text, text, text, text, text, text);
-- drop function if exists private.tug_locate(text, text);
-- drop function if exists private.tug_room_view(public.tug_rooms, text, text);
-- drop function if exists private.tug_presence(timestamptz);
-- drop table if exists public.tug_join_failures;
-- drop table if exists public.tug_rooms;
-- delete from supabase_migrations.schema_migrations where version in ('20260927100000', '20260928100000');
--
-- Step 3 (only to re-run a fixed 20260928100000 alone): restore the ±5 bound
-- by re-applying the tug_submit_answer body and constraint from
-- 20260927100000, then delete only that history row.
