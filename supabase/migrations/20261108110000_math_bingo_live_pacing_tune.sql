-- Math Bingo Live winner pacing, scheduler tune (after 20261108100000):
-- 1. Urgency: within five calls of the next gate, while nobody is one away
--    (a class of three, say), the scheduler weighs progress toward 4/5 and
--    3/5 far above the coverage mixture, so the gate opens on a real chance.
-- 2. Gate open, nobody one away and no class makes anyone one away: the
--    class that builds the most 3/5 lines is called (instead of the closed-gate
--    scoring), so the opportunity follows within a call or two.
-- Everything else in the function is the 20261108100000 text, unchanged.
-- Rollback: supabase/rollback/math_bingo_live_pacing.sql drops the scheduler
-- whatever its version (it restores the v1.2.37 next-question function).

create or replace function private.bingo_schedule(p_room public.bingo_rooms)
returns public.bingo_rooms language plpgsql set search_path=''
as $$
declare
  r public.bingo_rooms := p_room;
  v_call integer := p_room.question_number + 1;
  v_pacing jsonb := p_room.pacing;
  v_cap integer := (p_room.settings->>'winners')::integer;
  v_spacing integer := (p_room.pacing->>'spacing')::integer;
  v_gate boolean;
  v_pending public.bingo_participants;
  v_mask integer; v_type text; v_cells jsonb; v_placement integer;
  v_events jsonb := p_room.events; v_seq bigint := p_room.event_seq; v_winners jsonb := p_room.winners; v_count integer := p_room.winner_count;
  v_final boolean := false;
  v_active integer; v_one_away integer; v_one_away_cap integer; v_limited integer;
  v_cands jsonb; c jsonb;
  v_cat text; v_score numeric; v_best jsonb := null; v_best_score numeric := null;
  v_cov jsonb; v_deficit numeric; v_calls integer;
  v_q public.bingo_room_questions;
  v_kind text; v_stuck boolean := false; v_mode_open boolean := false;
  v_safe boolean; v_fresh boolean; v_urgent boolean;
  seconds integer := (p_room.settings->>'questionSeconds')::integer;
  v_log jsonb;
begin
  -- A. Gate open and a line waiting: confirm the earliest completed line (one per gate).
  v_gate := (v_cap = 0 or v_count < v_cap) and v_call >= (v_pacing->>'nextEligibleCall')::integer;
  if v_gate then
    select * into v_pending from public.bingo_participants p
      where p.room_id=r.id and p.status='active' and not p.has_won and p.pending_line is not null and p.game_number=r.game_number
      order by p.pending_seq, p.id limit 1;
    if v_pending.id is not null then
      select l.mask, l.line_type into v_mask, v_type from private.bingo_lines(r.settings->'patterns') l where l.line_id=v_pending.pending_line;
      if v_mask is not null and (v_pending.marks & v_mask) = v_mask then
        v_count := v_count + 1;
        v_placement := v_count;
        select jsonb_agg(v_pending.board->i order by i) into v_cells from generate_series(0,24) i where ((v_mask >> i) & 1) = 1;
        v_winners := v_winners || jsonb_build_array(jsonb_build_object(
          'id',v_pending.id,'name',v_pending.display_name,'emoji',v_pending.emoji,'placement',v_placement,'line',v_pending.pending_line,'lineType',v_type,'mask',v_mask,'cells',v_cells,
          'question',v_call,'completedAt',v_pending.pending_question));
        v_seq := v_seq + 1;
        v_events := private.bingo_event(v_events, v_seq, jsonb_build_object(
          'type','bingo','name',v_pending.display_name,'emoji',v_pending.emoji,'participant',v_pending.id,'placement',v_placement,'line',v_pending.pending_line,'lineType',v_type,'cap',v_cap));
        update public.bingo_participants set has_won=true, placement=v_placement, win_line=pending_line, pending_line=null, pending_question=null, pending_seq=null, version=version+1
          where id=v_pending.id;
        v_pacing := v_pacing || jsonb_build_object('lastWinnerCall',v_call,'nextEligibleCall',v_call + v_spacing);
        v_final := (v_cap > 0 and v_count >= v_cap)
          or (v_cap = 0 and not exists (select 1 from public.bingo_participants o where o.room_id=r.id and o.status='active' and not o.has_won));
        update public.bingo_rooms set events=v_events, event_seq=v_seq, winners=v_winners, winner_count=v_count, pacing=v_pacing,
          leaderboard=private.bingo_leaderboard(r.id),
          phase=case when v_final then 'WINNER_REVEAL' else phase end,
          phase_started_at=case when v_final then statement_timestamp() else phase_started_at end,
          phase_deadline=case when v_final then statement_timestamp()+interval '5 seconds' else phase_deadline end,
          completed_reason=case when v_final then (case when v_cap > 0 then 'winners' else 'everyone' end) else completed_reason end,
          version=version+1, updated_at=statement_timestamp()
          where id=r.id returning * into r;
        if v_final then return r; end if;
        v_gate := false;
      else
        update public.bingo_participants set pending_line=null, pending_question=null, pending_seq=null, version=version+1 where id=v_pending.id;
      end if;
    end if;
  end if;

  -- B. Every class still callable, with what calling it would do to the live cards.
  select count(*) into v_active from public.bingo_participants p
    where p.room_id=r.id and p.status='active' and not p.has_won and p.pending_line is null and p.board is not null and p.game_number=r.game_number;
  v_limited := greatest(2, ceil(v_active * 0.3)::integer);
  v_one_away_cap := greatest(2, ceil(v_active * 0.15)::integer);
  with players as materialized (
    select p.id, p.board, p.marks from public.bingo_participants p
    where p.room_id=r.id and p.status='active' and not p.has_won and p.pending_line is null and p.board is not null and p.game_number=r.game_number
  ), cells as materialized (
    select pl.id as pid, pl.marks, (x.i - 1)::integer as idx, private.bingo_cell_class(r.settings, x.e) as cls
    from players pl, jsonb_array_elements(pl.board) with ordinality x(e, i)
    where not (x.e ? 'free')
  ), line_state as materialized (
    select ce.pid, l.line_id,
      count(*) filter (where ((ce.marks >> ce.idx) & 1) = 0) as open_count,
      array_agg(ce.cls) filter (where ((ce.marks >> ce.idx) & 1) = 0) as open_classes
    from cells ce join private.bingo_lines(r.settings->'patterns') l on ((l.mask >> ce.idx) & 1) = 1
    group by ce.pid, l.line_id
  ), opens as materialized (
    select distinct pid, cls from cells where ((marks >> idx) & 1) = 0
  ), remaining as materialized (
    select u.c, count(*) as remaining from public.bingo_room_questions u where u.room_id=r.id and u.called_at_question is null group by u.c
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'class', rm.c, 'remaining', rm.remaining,
      'matchers', (select count(*) from opens o where o.cls=rm.c),
      'completers', (select count(distinct ls.pid) from line_state ls where ls.open_count=1 and ls.open_classes[1]=rm.c),
      'newfour', (select count(distinct ls.pid) from line_state ls where ls.open_count=2 and rm.c = any(ls.open_classes)),
      'newthree', (select count(distinct ls.pid) from line_state ls where ls.open_count=3 and rm.c = any(ls.open_classes)),
      'called', (select count(*) from public.bingo_room_questions u where u.room_id=r.id and u.c=rm.c and u.called_at_question is not null),
      'hash', md5(r.game_seed || ':' || v_call::text || ':' || rm.c)
    )), '[]'::jsonb),
    (select count(distinct ls.pid) from line_state ls where ls.open_count=1)
    into v_cands, v_one_away
  from remaining rm;

  if jsonb_array_length(v_cands) = 0 then
    update public.bingo_rooms set phase='GAME_COMPLETE', phase_started_at=statement_timestamp(), phase_deadline=null,
      completed_reason=coalesce(completed_reason,'deck'), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
    return r;
  end if;

  -- C. Choose a class.
  v_cov := coalesce(v_pacing->'coverage', '{}'::jsonb);
  v_calls := r.question_number;
  v_safe := exists (select 1 from jsonb_array_elements(v_cands) e where (e->>'completers')::integer = 0);
  if v_gate then
    -- Opportunity: the class that gives the fewest players (at least one) a real chance.
    for c in select e from jsonb_array_elements(v_cands) e where (e->>'completers')::integer >= 1
      order by (e->>'completers')::integer, (e->>'matchers')::integer, e->>'hash' limit 1 loop
      v_best := c; v_mode_open := true;
    end loop;
    if v_best is null then
      -- Nobody is one away: bring one player (as few as possible) to one away.
      for c in select e from jsonb_array_elements(v_cands) e where (e->>'newfour')::integer >= 1
        order by (e->>'newfour')::integer, e->>'hash' limit 1 loop
        v_best := c; v_mode_open := true;
      end loop;
    end if;
    if v_best is null then
      -- Nobody is even two away: build the fullest lines (3/5) so the next calls can.
      for c in select e from jsonb_array_elements(v_cands) e where (e->>'newthree')::integer >= 1
        order by (e->>'newthree')::integer desc, (e->>'matchers')::integer, e->>'hash' limit 1 loop
        v_best := c; v_mode_open := true;
      end loop;
    end if;
  end if;
  if v_best is null then
    -- Before the first gate only EARLY classes are called (every line holds a
    -- late cell, so no line can finish); after it, any class that completes
    -- nothing while a gate is closed. A class already asked this game (a second
    -- question with the same answer) is a dead call for everyone who marked it,
    -- so it is only asked again when no fresh class fits.
    if v_call < (v_pacing->>'firstWinCall')::integer then
      v_safe := exists (select 1 from jsonb_array_elements(v_cands) e where (e->>'completers')::integer = 0 and not (v_pacing->'late' ? (e->>'class')));
    end if;
    if not v_safe then v_stuck := true; end if;
    -- Urgency: within five calls of the next gate with nobody one away (a small
    -- class, or everyone one away already won), progress toward 4/5 and 3/5
    -- outweighs the coverage mixture, so the gate opens on a real opportunity.
    v_urgent := v_one_away = 0 and v_call >= (v_pacing->>'nextEligibleCall')::integer - 5;
    v_fresh := exists (select 1 from jsonb_array_elements(v_cands) e where (e->>'called')::integer = 0
      and (not v_safe or (e->>'completers')::integer = 0)
      and (v_call >= (v_pacing->>'firstWinCall')::integer or not v_safe or not (v_pacing->'late' ? (e->>'class'))));
    for c in select e from jsonb_array_elements(v_cands) e loop
      if v_fresh and (c->>'called')::integer > 0 then continue; end if;
      if v_call < (v_pacing->>'firstWinCall')::integer and v_safe and (v_pacing->'late' ? (c->>'class')) then continue; end if;
      if not v_safe and (c->>'completers')::integer > (select min((x->>'completers')::integer) from jsonb_array_elements(v_cands) x) then continue; end if;
      if v_safe and (c->>'completers')::integer > 0 then continue; end if;
      v_cat := case when (c->>'matchers')::integer = 0 then 'zero' when (c->>'matchers')::integer = 1 then 'single'
        when (c->>'matchers')::integer <= v_limited then 'limited' else 'broad' end;
      v_deficit := (case v_cat when 'zero' then 0.10 when 'single' then 0.15 when 'limited' then 0.35 else 0.40 end) * (v_calls + 1)
        - coalesce((v_cov->>v_cat)::numeric, 0);
      v_score := v_deficit * 10
        + case when v_urgent then 8 * (c->>'newfour')::numeric when v_one_away < v_one_away_cap then 2 * (c->>'newfour')::numeric else -4 * (c->>'newfour')::numeric end
        + case when v_urgent then 3 else 1 end * (c->>'newthree')::numeric
        + 0.05 * (c->>'matchers')::numeric
        + ('x' || left(c->>'hash', 6))::bit(24)::integer / 16777216.0;
      if v_best_score is null or v_score > v_best_score then v_best := c; v_best_score := v_score; end if;
    end loop;
  end if;
  if v_best is null then
    select e into v_best from jsonb_array_elements(v_cands) e order by e->>'hash' limit 1;
  end if;

  -- D. One unasked question of that class, by the seeded order; it is called now.
  select * into v_q from public.bingo_room_questions u
    where u.room_id=r.id and u.c=(v_best->>'class') and u.called_at_question is null
    order by md5(r.game_seed || ':q:' || u.q) limit 1;
  update public.bingo_room_questions set called_at_question=v_call where room_id=r.id and q=v_q.q;
  v_kind := case when (v_best->>'matchers')::integer = 0 then 'zero' when (v_best->>'matchers')::integer = 1 then 'single'
    when (v_best->>'matchers')::integer <= v_limited then 'limited' else 'broad' end;
  v_cov := v_cov || jsonb_build_object(v_kind, coalesce((v_cov->>v_kind)::integer, 0) + 1);
  v_log := coalesce(v_pacing->'calls', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
    'n',v_call,'c',v_q.c,'k',v_kind,'m',(v_best->>'matchers')::integer,'w',(v_best->>'completers')::integer,'f',(v_best->>'newfour')::integer,'o',v_mode_open,'s',v_stuck,'a',v_one_away));
  if jsonb_array_length(v_log) > 400 then v_log := (select jsonb_agg(e) from (select e from jsonb_array_elements(v_log) e offset 1) s); end if;
  v_pacing := v_pacing || jsonb_build_object('coverage',v_cov,'calls',v_log,'stuck',coalesce((v_pacing->>'stuck')::integer,0) + case when v_stuck then 1 else 0 end);

  update public.bingo_rooms set
    deck=coalesce(deck,'[]'::jsonb) || jsonb_build_array(jsonb_build_object('q',v_q.q,'t',v_q.t,'s',v_q.s,'k',v_q.k,'n',v_q.n,'d',v_q.d)),
    pacing=v_pacing,
    phase='QUESTION_ACTIVE', question_number=question_number+1,
    question_started_at=statement_timestamp(), phase_started_at=statement_timestamp(),
    phase_deadline=case when seconds=0 then null else statement_timestamp()+make_interval(secs => seconds) end,
    version=version+1, updated_at=statement_timestamp()
    where id=r.id returning * into r;
  return r;
end
$$;
revoke all on function private.bingo_schedule(public.bingo_rooms) from public,anon,authenticated;
