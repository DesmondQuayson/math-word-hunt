-- Math Bingo Live — pacing SIMULATION harness (LOCAL TEST DATABASES ONLY; never a migration).
--
-- bingo_sim_play drives one complete paced match through the REAL room
-- functions (bingo_host_command, bingo_mark, bingo_free_space, bingo_schedule
-- via the host's Next), with seeded student models, and returns the facts the
-- pacing contract is judged on: the call of every winner, how many players
-- stood at 2/5, 3/5, 4/5 after each call, every call's coverage (how many
-- cards could use it), any line completed while a gate was closed, and so on.
-- scripts/math-bingo-live-pacing-simulation.mjs creates the rooms, deals the
-- cards with the engine, calls this, and aggregates thousands of matches.
--
-- Student model (per player, seeded by p_seed and the player's index):
--   accuracy  — chance a student solves a question they could mark (1, 0.8, 0.6)
--   attention — chance a student is present for a call at all (missed questions)
--   free      — "early" (first live question), "late" (first time it would make
--               a line 4/5, else call 10+), "never"
--   choice    — among matching cells, the one that most improves their best line
--               (the e2e helpers' behaviour), seeded ties.
create or replace function public.bingo_sim_play(p_owner_hash text, p_token_hash text, p_players jsonb, p_seed text, p_max_calls integer default 120)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  v_call integer := 0;
  v_cmd jsonb;
  pl jsonb;
  v_index integer;
  me public.bingo_participants;
  v_answer jsonb;
  v_rng numeric;
  v_cell integer;
  v_best_cell integer;
  v_best_gain integer;
  v_gain integer;
  v_line record;
  v_count integer;
  v_lines record;
  v_first integer;
  v_spacing integer;
  v_winner_calls jsonb := '[]'::jsonb;
  v_timeline jsonb := '[]'::jsonb;
  v_violations jsonb := '[]'::jsonb;
  v_pending_total integer := 0;
  v_four integer; v_three integer; v_two integer;
  v_prev_winners integer := 0;
  v_use_free boolean;
  v_marks_before integer;
  v_res jsonb;
  v_opportunity_first integer := null;
  v_gate_open_calls integer := 0;
  v_calls_log jsonb;
  v_seat_wins jsonb := '{}'::jsonb;
  v_completed_now integer;
  v_zero_match_streak integer := 0;
  v_longest_zero_streak integer := 0;
  v_matched boolean;
begin
  select * into r from public.bingo_rooms where host_token_hash=p_token_hash and host_owner_hash=p_owner_hash;
  if r.id is null then return jsonb_build_object('error','room-not-found'); end if;
  if r.pacing is null then return jsonb_build_object('error','room-not-paced'); end if;
  v_first := (r.pacing->>'firstWinCall')::integer;
  v_spacing := (r.pacing->>'spacing')::integer;

  -- Out of the countdown.
  v_cmd := public.bingo_host_command(p_owner_hash, p_token_hash, 'next', jsonb_build_object('phase','COUNTDOWN','question',0));
  loop
    select * into r from public.bingo_rooms where id=r.id;
    exit when r.phase <> 'QUESTION_ACTIVE' or r.question_number > p_max_calls;
    v_call := r.question_number;
    v_answer := r.deck->(v_call-1);
    v_matched := false;

    -- Every student acts on this call, in a seeded order.
    for pl in select e from jsonb_array_elements(p_players) e order by md5(p_seed || ':order:' || v_call::text || ':' || (e->>'index')) loop
      v_index := (pl->>'index')::integer;
      select * into me from public.bingo_participants where token_hash = pl->>'token';
      continue when me.id is null or me.has_won or me.board is null or me.game_number <> r.game_number;
      -- Present for this call?
      v_rng := ('x' || left(md5(p_seed || ':attend:' || v_call::text || ':' || v_index::text), 6))::bit(24)::integer / 16777216.0;
      continue when v_rng > (pl->>'attention')::numeric;
      -- Free Space: early players use it on the first live question; late players when it makes a line 4/5 (or from call 10).
      if r.settings->'freeSpace'='true' and not me.free_used and ((me.marks >> 12) & 1) = 0 then
        v_use_free := case pl->>'free'
          when 'early' then true
          when 'late' then (v_call >= 10 or exists (select 1 from private.bingo_lines(r.settings->'patterns') l
            where ((l.mask >> 12) & 1) = 1 and bit_count((me.marks & l.mask)::bit(25)) = 3))
          else false end;
        if v_use_free then
          v_res := public.bingo_free_space(me.token_hash, r.game_number, v_call);
          select * into me from public.bingo_participants where id=me.id;
          select * into r from public.bingo_rooms where id=r.id;
        end if;
      end if;
      exit when r.phase <> 'QUESTION_ACTIVE';
      -- The matching, unmarked cell that most improves the best enabled line.
      v_best_cell := null; v_best_gain := -1;
      for v_cell in 0..24 loop
        continue when (me.board->v_cell) ? 'free' or ((me.marks >> v_cell) & 1) = 1;
        continue when not private.bingo_matches(r.settings, v_answer, me.board->v_cell);
        v_gain := 0;
        for v_line in select * from private.bingo_lines(r.settings->'patterns') loop
          if ((v_line.mask >> v_cell) & 1) = 1 then
            v_count := bit_count(((me.marks | (1 << v_cell)) & v_line.mask)::bit(25))::integer;
            if v_count > v_gain then v_gain := v_count; end if;
          end if;
        end loop;
        -- Seeded tie-break among equal gains.
        v_gain := v_gain * 1000 + (('x' || left(md5(p_seed || ':cell:' || v_call::text || ':' || v_index::text || ':' || v_cell::text), 4))::bit(16)::integer % 1000);
        if v_gain > v_best_gain then v_best_gain := v_gain; v_best_cell := v_cell; end if;
      end loop;
      if v_best_cell is not null then
        v_matched := true;
        -- Solves it?
        v_rng := ('x' || left(md5(p_seed || ':solve:' || v_call::text || ':' || v_index::text), 6))::bit(24)::integer / 16777216.0;
        if v_rng <= (pl->>'accuracy')::numeric then
          v_res := public.bingo_mark(me.token_hash, r.game_number, v_call, v_best_cell);
          if v_res->>'result' not in ('correct','already-won','not-active','stale') then
            v_violations := v_violations || jsonb_build_object('call',v_call,'kind','unexpected-mark-result','result',v_res->>'result','player',v_index);
          end if;
          select * into r from public.bingo_rooms where id=r.id;
        end if;
      end if;
      exit when r.phase <> 'QUESTION_ACTIVE';
    end loop;

    -- Facts after this call.
    select * into r from public.bingo_rooms where id=r.id;
    select count(*) filter (where best_count=4), count(*) filter (where best_count=3), count(*) filter (where best_count=2)
      into v_four, v_three, v_two
      from public.bingo_participants p where p.room_id=r.id and p.status='active' and not p.has_won;
    -- Any enabled line completed on a card that is not an official winner = pending (a gate was closed).
    select count(*) into v_completed_now from public.bingo_participants p
      where p.room_id=r.id and p.status='active' and not p.has_won and p.pending_line is not null and p.pending_question = v_call;
    v_pending_total := v_pending_total + v_completed_now;
    if v_completed_now > 0 and v_call < v_first then
      v_violations := v_violations || jsonb_build_object('call',v_call,'kind','line-completed-before-first-gate','players',v_completed_now);
    end if;
    -- New official winners this call.
    if r.winner_count > v_prev_winners then
      for v_lines in select w from jsonb_array_elements(r.winners) w where (w->>'placement')::integer > v_prev_winners loop
        v_winner_calls := v_winner_calls || to_jsonb(v_call);
        if v_call < v_first then v_violations := v_violations || jsonb_build_object('call',v_call,'kind','winner-before-first-gate'); end if;
        if jsonb_array_length(v_winner_calls) >= 2 and v_call - (v_winner_calls->(jsonb_array_length(v_winner_calls)-2))::integer < v_spacing then
          v_violations := v_violations || jsonb_build_object('call',v_call,'kind','winner-gap-short','gap',v_call - (v_winner_calls->(jsonb_array_length(v_winner_calls)-2))::integer);
        end if;
        -- Which seat won (join order index), for the fairness audit.
        select px->>'index' into v_index from jsonb_array_elements(p_players) px join public.bingo_participants p on p.token_hash = px->>'token' where p.id = (v_lines.w->>'id')::uuid;
        v_seat_wins := v_seat_wins || jsonb_build_object(coalesce(v_index::text,'?'), coalesce((v_seat_wins->>(v_index::text))::integer,0)+1);
      end loop;
      v_prev_winners := r.winner_count;
    end if;
    if not v_matched then v_zero_match_streak := v_zero_match_streak + 1; else v_zero_match_streak := 0; end if;
    if v_zero_match_streak > v_longest_zero_streak then v_longest_zero_streak := v_zero_match_streak; end if;
    v_timeline := v_timeline || jsonb_build_object('n',v_call,'four',v_four,'three',v_three,'two',v_two,'winners',r.winner_count,
      'gate',(r.pacing->>'nextEligibleCall')::integer,'matched',v_matched);

    exit when r.phase <> 'QUESTION_ACTIVE';
    -- Reveal, then the next call (the scheduler runs inside).
    v_cmd := public.bingo_host_command(p_owner_hash, p_token_hash, 'next', jsonb_build_object('phase','QUESTION_ACTIVE','question',v_call));
    select * into r from public.bingo_rooms where id=r.id;
    exit when r.phase <> 'ANSWER_REVEAL';
    v_cmd := public.bingo_host_command(p_owner_hash, p_token_hash, 'next', jsonb_build_object('phase','ANSWER_REVEAL','question',v_call));
  end loop;

  select * into r from public.bingo_rooms where id=r.id;
  v_calls_log := coalesce(r.pacing->'calls','[]'::jsonb);
  -- The first call at which some player held a line one away whose last cell was callable while the gate was open.
  select min((e->>'n')::integer) into v_opportunity_first from jsonb_array_elements(v_calls_log) e where (e->>'o')::boolean and (e->>'w')::integer >= 1;
  select count(*) into v_gate_open_calls from jsonb_array_elements(v_calls_log) e where (e->>'o')::boolean;
  return jsonb_build_object(
    'calls', r.question_number,
    'phase', r.phase,
    'completedReason', r.completed_reason,
    'winnerCalls', v_winner_calls,
    'winners', r.winner_count,
    'pending', v_pending_total,
    'violations', v_violations,
    'timeline', v_timeline,
    'coverage', r.pacing->'coverage',
    'stuck', (r.pacing->>'stuck')::integer,
    'firstOpportunityCall', v_opportunity_first,
    'gateOpenCalls', v_gate_open_calls,
    'uniqueQuestions', (select count(distinct e->>'q') from jsonb_array_elements(r.deck) e),
    'calledQuestions', jsonb_array_length(r.deck),
    'seatWins', v_seat_wins,
    'longestZeroMatchStreak', v_longest_zero_streak,
    'callLog', v_calls_log
  );
end
$$;
revoke all on function public.bingo_sim_play(text,text,jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.bingo_sim_play(text,text,jsonb,text,integer) to service_role;
