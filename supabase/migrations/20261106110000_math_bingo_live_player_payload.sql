-- Math Bingo Live — smaller student replies (follow-up to 20261106100000).
--
-- Staging Server-Timing at 50 students: a reply with news took ~270 ms longer
-- than an "unchanged" one although the database built it in a few ms, so the
-- size of the reply matters on the way through the API layer. A student's
-- reply carried the whole class leaderboard (up to 60 rows) and the game's
-- seed and answer pool on every poll, but the application server keeps only
-- the top five rows plus the student's own row, and uses the seed and pool
-- only to deal a card when one is needed. Now the database sends just that:
--   * leaderboard: ranks 1–5 plus this student's row (same order and fields);
--   * seed and pool: only when needsBoard is true (null otherwise).
-- The host view is unchanged. Nothing else changes; additive and compatible
-- with the v1.2.35 application (it reads the same fields the same way).
-- Rollback: supabase/rollback/math_bingo_live_room_speed.sql (restores the
-- v1.2.35 bingo_player_view too).

create or replace function private.bingo_player_view(p_room public.bingo_rooms, p_me public.bingo_participants, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select (private.bingo_core(p_room, p_result) - 'leaderboard') || jsonb_build_object(
    'leaderboard',(select coalesce(jsonb_agg(e order by (e->>'rank')::integer), '[]'::jsonb)
      from jsonb_array_elements(private.bingo_leaderboard(p_room.id)) e
      where (e->>'rank')::integer <= 5 or e->>'id' = p_me.id::text),
    'me',jsonb_build_object(
      'id',p_me.id,'name',p_me.display_name,'status',p_me.status,'gameNumber',p_me.game_number,
      'board',case when p_me.game_number=p_room.game_number then p_me.board else null end,
      'marks',p_me.marks,'freeUsed',p_me.free_used,'markQuestion',p_me.mark_question,
      'attemptQuestion',p_me.attempt_question,'attempts',p_me.attempts,'correct',p_me.correct_count,
      'hasWon',p_me.has_won,'placement',p_me.placement,'winLine',p_me.win_line,
      'best',p_me.best_count,'bestType',p_me.best_type,'version',p_me.version
    ),
    'needsBoard',n.needs,
    'seed',case when n.needs then p_room.game_seed else null end,
    'pool',case when n.needs then p_room.pool else null end
  )
  from (select (p_me.status='active' and p_room.status='open' and p_room.game_number>0 and p_room.pool is not null
      and p_room.phase not in ('LOBBY','GAME_COMPLETE') and (p_me.board is null or p_me.game_number<>p_room.game_number)) as needs) n
$$;
revoke all on function private.bingo_player_view(public.bingo_rooms,public.bingo_participants,text) from public,anon,authenticated;
