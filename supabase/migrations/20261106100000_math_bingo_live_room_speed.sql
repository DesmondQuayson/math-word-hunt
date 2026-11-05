-- Math Bingo Live — room speed for large classes (follow-up to v1.2.35).
--
-- Measured on staging with 50 students (v1.2.35): poll p95 1.4–1.6 s, tap
-- p95 2.2–2.6 s, host p95 3.1–3.6 s, against ≤1.0 / 1.5 / 1.5 s at 30. Cause:
-- every correct tap took the ROOM row lock (FOR UPDATE), recomputed the
-- stored leaderboard, rewrote the wide room row and bumped the room version.
-- So taps queued behind each other, the waits held database connections that
-- the polls needed too, and nearly every poll found a new room version and got
-- a full reply instead of the short "unchanged" one.
--
-- This migration keeps every rule and only changes where the work happens:
--
--  1. A tap that cannot change anything the whole room sees — a wrong answer,
--     or a correct mark that neither completes a winning line nor makes the
--     player "one away" for the first time — updates only that player's own
--     row, with an optimistic check on the row version (any concurrent change
--     to the player, including Play Again, Change Settings or a removal,
--     sends the tap down the original locked path, which re-validates it).
--     No room lock, no room write, no room version bump. Refusals that are
--     final for the question (already won, invalid cell, the Free Space cell,
--     already marked, mark used, out of attempts) are answered without a lock.
--  2. A tap that wins, makes a player one away (a broadcast), or uses the Free
--     Space (a broadcast) keeps the original path: room lock first, then the
--     player, so winner placements stay strictly ordered and the cap exact.
--  3. The leaderboard in every reply is computed when the reply is built, so
--     it is always current even though ordinary taps no longer write it.
--     (The stored column is still written by the locked paths; nothing reads
--     it for replies any more.)
--  4. The host's "unchanged" check also compares a progress number (the sum
--     of the active players' row versions), so the teacher's standings still
--     update on every tap. The three-argument bingo_host_state used by the
--     v1.2.35 application never answers "unchanged" (it cannot see progress),
--     so that build stays correct between this migration and the new deploy.
--
-- Timing is unchanged: an ordinary tap is checked against the room as it was
-- when the tap arrived (the question, its deadline on the server clock, the
-- pause state), exactly the moment the old code checked after waiting for the
-- lock. Additive and backward compatible: no table changes; the v1.2.35
-- application works on top of it. Rollback: supabase/rollback/math_bingo_live_room_speed.sql.

-- 1. Replies carry a live leaderboard ----------------------------------------
create or replace function private.bingo_core(p_room public.bingo_rooms, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'result',p_result,
    'code',p_room.code,
    'status',case when p_room.status='open' and p_room.expires_at <= statement_timestamp() then 'expired' else p_room.status end,
    'phase',p_room.phase,
    'pausedPhase',p_room.paused_phase,
    'pausedRemainingMs',p_room.paused_remaining_ms,
    'gameNumber',p_room.game_number,
    'settings',p_room.settings,
    'questionNumber',p_room.question_number,
    'deckLength',coalesce(jsonb_array_length(p_room.deck),0),
    'questionStartedAt',private.bingo_ms(p_room.question_started_at),
    'phaseStartedAt',private.bingo_ms(p_room.phase_started_at),
    'phaseDeadline',private.bingo_ms(p_room.phase_deadline),
    'winners',p_room.winners,
    'winnerCount',p_room.winner_count,
    'events',p_room.events,
    'eventSeq',p_room.event_seq,
    'leaderboard',private.bingo_leaderboard(p_room.id),
    'completedReason',p_room.completed_reason,
    'joinLocked',p_room.join_locked,
    'version',p_room.version,
    'expiresAt',private.bingo_ms(p_room.expires_at),
    'serverNow',private.bingo_ms(statement_timestamp()),
    'playerCount',(select count(*) from public.bingo_participants p where p.room_id=p_room.id and p.status='active'),
    'called',case when p_room.deck is null or p_room.question_number=0 then '[]'::jsonb else
      (select coalesce(jsonb_agg(d.e order by d.i), '[]'::jsonb) from jsonb_array_elements(p_room.deck) with ordinality d(e,i) where d.i <= p_room.question_number) end
  )
$$;
revoke all on function private.bingo_core(public.bingo_rooms,text) from public,anon,authenticated;

-- 4. Host progress -------------------------------------------------------------
-- Every change to a player's game state bumps that player's row version, and
-- every change to who is in the room bumps the room version, so the pair
-- (room version, progress) changes whenever anything on the host screen does
-- (presence travels in the "unchanged" reply itself).
create or replace function private.bingo_progress(p_room_id uuid)
returns bigint language sql stable set search_path=''
as $$
  select coalesce(sum(p.version),0)::bigint from public.bingo_participants p where p.room_id=p_room_id and p.status='active'
$$;
revoke all on function private.bingo_progress(uuid) from public,anon,authenticated;

create or replace function private.bingo_host_view(p_room public.bingo_rooms, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select private.bingo_core(p_room, p_result) || jsonb_build_object(
    'progress',private.bingo_progress(p_room.id),
    'players',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.display_name,
        'connected',p.seen_at > statement_timestamp() - interval '12 seconds',
        'hasWon',p.has_won,'placement',p.placement,'best',p.best_count,'bestType',p.best_type,'correct',p.correct_count
      ) order by p.joined_at, p.id), '[]'::jsonb)
      from public.bingo_participants p where p.room_id=p_room.id and p.status='active')
  )
$$;
revoke all on function private.bingo_host_view(public.bingo_rooms,text) from public,anon,authenticated;

create or replace function public.bingo_host_state(p_owner_hash text, p_token_hash text, p_since_version bigint, p_since_progress bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  v_progress bigint;
begin
  select * into r from public.bingo_rooms where host_token_hash=p_token_hash and host_owner_hash=p_owner_hash;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  if r.status='open' and r.phase_deadline is not null and r.phase_deadline <= statement_timestamp() then
    select * into r from public.bingo_rooms where id=r.id for update;
    r := private.bingo_advance(r);
  end if;
  if p_since_version is not null and p_since_progress is not null and p_since_version=r.version and r.status='open' then
    v_progress := private.bingo_progress(r.id);
    if p_since_progress=v_progress then
      return jsonb_build_object('result','unchanged','version',r.version,'progress',v_progress,'serverNow',private.bingo_ms(statement_timestamp()),
        'players',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'connected',p.seen_at > statement_timestamp() - interval '12 seconds') order by p.joined_at, p.id), '[]'::jsonb)
          from public.bingo_participants p where p.room_id=r.id and p.status='active'));
    end if;
  end if;
  return private.bingo_host_view(r,'ok');
end
$$;
revoke all on function public.bingo_host_state(text,text,bigint,bigint) from public,anon,authenticated;
grant execute on function public.bingo_host_state(text,text,bigint,bigint) to service_role;

-- The v1.2.35 signature: same reply, but never "unchanged" (it cannot see progress).
create or replace function public.bingo_host_state(p_owner_hash text, p_token_hash text, p_since_version bigint)
returns jsonb language sql security definer set search_path=''
as $$ select public.bingo_host_state(p_owner_hash, p_token_hash, null::bigint, null::bigint) $$;

-- 1 + 2. Taps --------------------------------------------------------------------
create or replace function public.bingo_mark(p_token_hash text, p_game integer, p_question integer, p_cell integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  r public.bingo_rooms;
  me public.bingo_participants;
  attempts_now integer;
  correct boolean;
  v_marks integer;
  v_line record;
  v_count integer;
  v_best integer := 0;
  v_best_type text := null;
  v_wins boolean := false;
begin
  -- Unlocked path: the room and the player as they were when the tap arrived.
  select * into located from private.bingo_locate_player(p_token_hash);
  me := located.me; r := located.r;
  if me.id is not null and r.id is not null and me.status='active' and r.status='open'
     and r.expires_at > statement_timestamp()
     and r.game_number=p_game and r.question_number=p_question and r.phase='QUESTION_ACTIVE'
     and (r.phase_deadline is null or r.phase_deadline > statement_timestamp())
     and me.board is not null and me.game_number=r.game_number then
    -- Final refusals for this question, in the locked path's order.
    if me.has_won then return private.bingo_player_view(r,me,'already-won'); end if;
    if p_cell is null or p_cell < 0 or p_cell > 24 then return private.bingo_player_view(r,me,'invalid-cell'); end if;
    if r.settings->'freeSpace'='true' and p_cell=12 then return private.bingo_player_view(r,me,'use-free-space'); end if;
    if ((me.marks >> p_cell) & 1)=1 then return private.bingo_player_view(r,me,'already-marked'); end if;
    if me.mark_question=p_question then return private.bingo_player_view(r,me,'mark-used'); end if;
    attempts_now := case when me.attempt_question=p_question then me.attempts else 0 end;
    if attempts_now >= 2 then return private.bingo_player_view(r,me,'out-of-attempts'); end if;

    correct := private.bingo_matches(r.settings, r.deck->(p_question-1), me.board->p_cell);
    if not correct then
      update public.bingo_participants set attempt_question=p_question, attempts=attempts_now+1, version=version+1
        where id=me.id and version=me.version and status='active' and game_number=p_game
        returning * into me;
      if found then return private.bingo_player_view(r,me,'incorrect'); end if;
    else
      v_marks := me.marks | (1 << p_cell);
      for v_line in select * from private.bingo_lines(r.settings->'patterns') loop
        v_count := bit_count((v_marks & v_line.mask)::bit(25))::integer;
        if v_count > v_best then v_best := v_count; v_best_type := v_line.line_type; end if;
        if (v_marks & v_line.mask) = v_line.mask then v_wins := true; end if;
      end loop;
      -- A Bingo or a first "one away" is broadcast: those take the locked path.
      if not v_wins and not (v_best = 4 and not me.one_away) then
        update public.bingo_participants set
          marks=v_marks, mark_question=p_question, correct_count=correct_count+1,
          response_ms=response_ms + greatest(0, floor(extract(epoch from (statement_timestamp() - r.question_started_at))*1000)::bigint),
          best_count=v_best, best_type=v_best_type, version=version+1
          where id=me.id and version=me.version and status='active' and game_number=p_game
          returning * into me;
        if found then return private.bingo_player_view(r,me,'correct'); end if;
      end if;
    end if;
  end if;

  -- Locked path (unchanged from v1.2.35): room row first, then the player.
  select * into located from private.bingo_lock_player(p_token_hash);
  me := located.me; r := located.r;
  if me.id is null or r.id is null then return jsonb_build_object('result','not-found'); end if;
  if me.status<>'active' then return jsonb_build_object('result','removed'); end if;
  if r.status<>'open' then return jsonb_build_object('result','closed'); end if;
  if r.expires_at <= statement_timestamp() then return jsonb_build_object('result','expired'); end if;
  r := private.bingo_advance(r);
  if r.game_number<>p_game then return private.bingo_player_view(r,me,'stale'); end if;
  if r.phase='PAUSED' then return private.bingo_player_view(r,me,'paused'); end if;
  if r.phase<>'QUESTION_ACTIVE' then return private.bingo_player_view(r,me,'not-active'); end if;
  if r.question_number<>p_question then return private.bingo_player_view(r,me,'stale'); end if;
  if r.phase_deadline is not null and statement_timestamp() > r.phase_deadline then return private.bingo_player_view(r,me,'too-late'); end if;
  if me.board is null or me.game_number<>r.game_number then return private.bingo_player_view(r,me,'no-card'); end if;
  if me.has_won then return private.bingo_player_view(r,me,'already-won'); end if;
  if p_cell is null or p_cell < 0 or p_cell > 24 then return private.bingo_player_view(r,me,'invalid-cell'); end if;
  if r.settings->'freeSpace'='true' and p_cell=12 then return private.bingo_player_view(r,me,'use-free-space'); end if;
  if ((me.marks >> p_cell) & 1)=1 then return private.bingo_player_view(r,me,'already-marked'); end if;
  if me.mark_question=p_question then return private.bingo_player_view(r,me,'mark-used'); end if;
  attempts_now := case when me.attempt_question=p_question then me.attempts else 0 end;
  if attempts_now >= 2 then return private.bingo_player_view(r,me,'out-of-attempts'); end if;

  correct := private.bingo_matches(r.settings, r.deck->(p_question-1), me.board->p_cell);
  if not correct then
    update public.bingo_participants set attempt_question=p_question, attempts=attempts_now+1, version=version+1
      where id=me.id returning * into me;
    return private.bingo_player_view(r,me,'incorrect');
  end if;

  update public.bingo_participants set
    marks=marks | (1 << p_cell), mark_question=p_question, correct_count=correct_count+1,
    response_ms=response_ms + greatest(0, floor(extract(epoch from (statement_timestamp() - r.question_started_at))*1000)::bigint),
    version=version+1
    where id=me.id returning * into me;
  r := private.bingo_apply_progress(r, me, false);
  select * into me from public.bingo_participants where id=me.id;
  return private.bingo_player_view(r,me,'correct');
end
$$;
