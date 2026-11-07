-- Math Bingo Live — winner pacing (follow-up to 20261107100000; staging / owner review).
--
-- Observed in a classroom: students reached Bingo too early and many stood at
-- 4/5 together, ranked 3rd, 4th, 5th with nothing between them. This migration
-- makes the game's pace a server rule and its standings honest:
--
--  1. The room holds a QUESTION UNIVERSE (bingo_room_questions): every unique
--     question of the mode and level with its canonical identity (q) and its
--     answer class (c). Nothing is called twice; the Called history is the deck
--     column, appended one call at a time.
--  2. Every call is CHOSEN HERE when it is made (private.bingo_schedule), from
--     the cards' current marks, under the room lock:
--       * before call `firstWinCall` (15) only EARLY classes are called, and
--         every enabled line of every card holds a LATE cell (checked when the
--         card is stored), so no line can finish whatever the students do —
--         the Free Space centre is treated as already marked;
--       * while a winner gate is closed (after a confirmed winner, for
--         `spacing` = 10 calls) the scheduler calls only classes that cannot
--         complete any player's line; a class on no card is always such a call;
--       * while a gate is open it prefers a class that gives one player (then
--         as few as possible) a real chance; it never awards a Bingo itself.
--     Ties between candidate classes are broken by md5(game seed, call, class),
--     so the choice is deterministic and unpredictable from the browser.
--  3. A completed enabled line becomes an OFFICIAL Bingo only when the gate is
--     open (private.bingo_apply_progress): placement, announcement, next gate
--     at call + 10. A line completed while the gate is closed (two students on
--     the same call; the first server-confirmed mark wins the slot) is kept on
--     the player's row as PENDING (pending_line) and is confirmed, one per
--     gate, when the next gate opens — never announced as a Bingo before.
--  4. Standings rank non-winners by best enabled line, then by how many lines
--     stand at that progress, then by correct marks; equal players share a
--     rank (`tied`). Response time and join order no longer order anyone.
--
-- Rooms started by the previous application (no `pacing`) keep the old
-- behaviour: the deck fixed at Start, no gates. Additive: new table, new
-- nullable columns, new Start; the earlier Start functions are untouched.
-- Rollback: supabase/rollback/math_bingo_live_pacing.sql.

-- 1. Schema ---------------------------------------------------------------------------------------
alter table public.bingo_rooms add column if not exists pacing jsonb;
alter table public.bingo_rooms drop constraint if exists bingo_rooms_pacing_check;
alter table public.bingo_rooms add constraint bingo_rooms_pacing_check check (pacing is null or jsonb_typeof(pacing)='object');

-- The deck is now the Called history: empty at Start, one entry per call.
do $migration$
declare
  v_name text;
begin
  for v_name in
    select conname from pg_constraint
    where conrelid='public.bingo_rooms'::regclass and contype='c'
      and (pg_get_constraintdef(oid) like '%deck%' or pg_get_constraintdef(oid) like '%pool%')
  loop
    execute format('alter table public.bingo_rooms drop constraint %I', v_name);
  end loop;
end
$migration$;
alter table public.bingo_rooms add constraint bingo_rooms_pool_check
  check (pool is null or (jsonb_typeof(pool)='array' and jsonb_array_length(pool) between 24 and 25));
alter table public.bingo_rooms add constraint bingo_rooms_deck_check
  check (deck is null or (jsonb_typeof(deck)='array' and jsonb_array_length(deck) between 0 and 400));
alter table public.bingo_rooms add constraint bingo_rooms_game_state_check
  check (game_number = 0 or phase in ('LOBBY','GAME_COMPLETE') or (deck is not null and game_seed is not null));

alter table public.bingo_participants add column if not exists best_lines smallint not null default 0;
alter table public.bingo_participants add column if not exists pending_line text;
alter table public.bingo_participants add column if not exists pending_question integer;
alter table public.bingo_participants add column if not exists pending_seq bigint;
alter table public.bingo_participants drop constraint if exists bingo_participants_best_lines_check;
alter table public.bingo_participants add constraint bingo_participants_best_lines_check check (best_lines between 0 and 12);

create table if not exists public.bingo_room_questions (
  room_id uuid not null references public.bingo_rooms(id) on delete cascade,
  q text not null check (q ~ '^(addition|subtraction|multiplication|division|fraction):[0-9]{1,4}:[0-9]{1,4}$'),
  c text not null check (c ~ '^[0-9]{1,4}/[1-9][0-9]{0,3}$'),
  t text not null check (char_length(t) between 1 and 40),
  s text not null check (char_length(s) between 1 and 80),
  k text not null check (k in ('arithmetic','fraction')),
  n integer not null check (n between 0 and 9999),
  d integer not null check (d between 1 and 999),
  called_at_question integer check (called_at_question is null or called_at_question >= 1),
  primary key (room_id, q)
);
create index if not exists bingo_room_questions_open_idx on public.bingo_room_questions(room_id, c) where called_at_question is null;
alter table public.bingo_room_questions enable row level security;
alter table public.bingo_room_questions force row level security;
revoke all on table public.bingo_room_questions from public,anon,authenticated;
grant select,insert,update,delete on table public.bingo_room_questions to service_role;

-- 2. Helpers ----------------------------------------------------------------------------------------
-- The answer class of a card cell or a question: "12/1", the written fraction,
-- or the reduced fraction when Equivalent Fractions is on. Integer arithmetic only.
create or replace function private.bingo_cell_class(p_settings jsonb, p_cell jsonb)
returns text language plpgsql immutable set search_path=''
as $$
declare
  n integer; d integer; g integer;
begin
  if p_cell is null or p_cell ? 'free' or jsonb_typeof(p_cell->'n')<>'number' or jsonb_typeof(p_cell->'d')<>'number' then return null; end if;
  n := (p_cell->>'n')::integer; d := (p_cell->>'d')::integer;
  if d < 1 or n < 0 then return null; end if;
  if p_settings->>'mode'='fractions' and p_settings->'equivalentFractions'='true' then
    g := greatest(1, gcd(n, d));
    return (n/g)::text || '/' || (d/g)::text;
  end if;
  return n::text || '/' || d::text;
end
$$;
revoke all on function private.bingo_cell_class(jsonb,jsonb) from public,anon,authenticated;

-- One universe entry: identity, text, answer and class agree (same rules as bingo_deck_valid).
create or replace function private.bingo_question_valid(e jsonb, p_settings jsonb)
returns boolean language plpgsql immutable set search_path=''
as $$
declare
  parts text[]; op text; a numeric; b numeric; sym text; expected numeric;
  mode text := p_settings->>'mode';
begin
  if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'q') is distinct from 'string' or jsonb_typeof(e->'t') is distinct from 'string'
     or jsonb_typeof(e->'s') is distinct from 'string' or jsonb_typeof(e->'c') is distinct from 'string'
     or jsonb_typeof(e->'n') is distinct from 'number' or jsonb_typeof(e->'d') is distinct from 'number'
     or (e->>'n') !~ '^[0-9]{1,4}$' or (e->>'d') !~ '^[1-9][0-9]{0,2}$' then
    return false;
  end if;
  if e->>'c' is distinct from private.bingo_cell_class(p_settings, jsonb_build_object('n',(e->>'n')::integer,'d',(e->>'d')::integer)) then return false; end if;
  if (e->>'q') ~ '^(addition|subtraction|multiplication|division):[0-9]{1,4}:[0-9]{1,4}$' then
    parts := string_to_array(e->>'q', ':');
    op := parts[1]; a := parts[2]::numeric; b := parts[3]::numeric;
    if e->>'k' is distinct from 'arithmetic' or (e->>'d') <> '1' then return false; end if;
    if mode = 'fractions' or (mode <> 'mixed' and mode <> op) then return false; end if;
    sym := case op when 'addition' then '+' when 'subtraction' then '−' when 'multiplication' then '×' else '÷' end;
    if op in ('addition','multiplication') then
      if a > b then return false; end if;
      if (e->>'t') <> (a::text||' '||sym||' '||b::text) and (e->>'t') <> (b::text||' '||sym||' '||a::text) then return false; end if;
    elsif (e->>'t') <> (a::text||' '||sym||' '||b::text) then
      return false;
    end if;
    expected := case op
      when 'addition' then a + b
      when 'subtraction' then a - b
      when 'multiplication' then a * b
      else case when b = 0 or mod(a, b) <> 0 then null else a / b end end;
    if expected is null or expected < 0 or (e->>'n')::numeric <> expected then return false; end if;
    return true;
  elsif (e->>'q') ~ '^fraction:[0-9]{1,3}:[1-9][0-9]{0,2}$' then
    parts := string_to_array(e->>'q', ':');
    return mode = 'fractions' and e->>'k' = 'fraction' and (e->>'n') = parts[2] and (e->>'d') = parts[3]
      and (e->>'t') = (parts[2]||'/'||parts[3]) and parts[2]::integer < parts[3]::integer and parts[2]::integer >= 1;
  end if;
  return false;
end
$$;
revoke all on function private.bingo_question_valid(jsonb,jsonb) from public,anon,authenticated;

create or replace function private.bingo_pacing_valid(p jsonb)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(jsonb_typeof(p)='object'
    and jsonb_typeof(p->'firstWinCall')='number' and (p->>'firstWinCall')::numeric between 1 and 60
    and jsonb_typeof(p->'spacing')='number' and (p->>'spacing')::numeric between 1 and 60
    and jsonb_typeof(p->'buffer')='number' and (p->>'buffer')::numeric between 0 and 60
    and jsonb_typeof(p->'maxWinners')='number' and (p->>'maxWinners')::numeric between 0 and 60
    and jsonb_typeof(p->'late')='array' and jsonb_array_length(p->'late') between 1 and 40
    and jsonb_typeof(p->'reserve')='array', false)
$$;
revoke all on function private.bingo_pacing_valid(jsonb) from public,anon,authenticated;

-- A card for a paced game: 25 cells, the Free Space where the settings say,
-- every value still callable in this room, every enabled line with a LATE
-- cell, and no line repeating a class more often than it has questions left.
create or replace function private.bingo_paced_board_valid(p_board jsonb, p_settings jsonb, p_late jsonb, p_room_id uuid)
returns boolean language plpgsql stable set search_path=''
as $$
declare
  free_on boolean := p_settings->'freeSpace'='true';
  v_line record;
  v_late integer;
  v_over integer;
begin
  if p_board is null or jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board)<>25 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_board) e where jsonb_typeof(e) is distinct from 'object') then return false; end if;
  if free_on and (p_board->12 is distinct from '{"free":true}'::jsonb
      or (select count(*) from jsonb_array_elements(p_board) e where e ? 'free')<>1) then
    return false;
  end if;
  if not free_on and exists (select 1 from jsonb_array_elements(p_board) e where e ? 'free') then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_board) e where not (e ? 'free')
      and (jsonb_typeof(e->'n') is distinct from 'number' or jsonb_typeof(e->'d') is distinct from 'number'
        or (e->>'n') !~ '^[0-9]{1,4}$' or (e->>'d') !~ '^[1-9][0-9]{0,2}$')) then
    return false;
  end if;
  -- Every value is callable: its class still has an unasked question here.
  if exists (select 1 from jsonb_array_elements(p_board) e where not (e ? 'free')
      and not exists (select 1 from public.bingo_room_questions u where u.room_id=p_room_id and u.c=private.bingo_cell_class(p_settings, e) and u.called_at_question is null)) then
    return false;
  end if;
  for v_line in select * from private.bingo_lines(p_settings->'patterns') loop
    select count(*) into v_late
      from jsonb_array_elements(p_board) with ordinality x(e, i)
      where ((v_line.mask >> (x.i-1)::integer) & 1) = 1 and not (x.e ? 'free')
        and p_late ? private.bingo_cell_class(p_settings, x.e);
    if v_late = 0 then return false; end if;
    select count(*) into v_over from (
      select private.bingo_cell_class(p_settings, x.e) as cls, count(*) as copies
      from jsonb_array_elements(p_board) with ordinality x(e, i)
      where ((v_line.mask >> (x.i-1)::integer) & 1) = 1 and not (x.e ? 'free')
      group by 1) s
      where s.copies > (select count(*) from public.bingo_room_questions u where u.room_id=p_room_id and u.c=s.cls and u.called_at_question is null);
    if v_over > 0 then return false; end if;
  end loop;
  return true;
end
$$;
revoke all on function private.bingo_paced_board_valid(jsonb,jsonb,jsonb,uuid) from public,anon,authenticated;

-- 3. Standings with ties ------------------------------------------------------------------------
-- Winners by placement; a completed line waiting for its gate next; then best
-- enabled-line progress, lines at that progress, correct marks. Equal players
-- share a competition rank and are marked tied. Nothing else orders anyone.
create or replace function private.bingo_leaderboard(p_room_id uuid)
returns jsonb language sql stable set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.display_name,'emoji',s.emoji,'rank',s.rnk,'tied',s.ties > 1,'order',s.ord,'won',s.has_won,'placement',s.placement,
      'best',s.best_count,'type',s.best_type,'bestLines',s.best_lines,'pending',s.pending_line is not null,'correct',s.correct_count,'line',s.win_line
    ) order by s.rnk, s.ord), '[]'::jsonb)
  from (
    select p.*,
      rank() over (order by p.has_won desc, p.placement asc nulls last, (p.pending_line is not null) desc, p.best_count desc, p.best_lines desc, p.correct_count desc) as rnk,
      count(*) over (partition by p.has_won, p.placement, (p.pending_line is not null), p.best_count, p.best_lines, p.correct_count) as ties,
      row_number() over (order by p.has_won desc, p.placement asc nulls last, (p.pending_line is not null) desc, p.best_count desc, p.best_lines desc, p.correct_count desc, p.joined_at asc, p.id asc) as ord
    from public.bingo_participants p
    where p.room_id=p_room_id and p.status='active'
  ) s
$$;
revoke all on function private.bingo_leaderboard(uuid) from public,anon,authenticated;

-- 4. Views ------------------------------------------------------------------------------------------
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
    'deckLength',case when p_room.pacing is null then coalesce(jsonb_array_length(p_room.deck),0)
      else p_room.question_number + (select count(*) from public.bingo_room_questions u where u.room_id=p_room.id and u.called_at_question is null) end,
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
    'pacing',case when p_room.pacing is null then null else jsonb_build_object(
      'firstWinCall',p_room.pacing->'firstWinCall','spacing',p_room.pacing->'spacing','nextEligibleCall',p_room.pacing->'nextEligibleCall',
      'lastWinnerCall',p_room.pacing->'lastWinnerCall','maxWinners',p_room.pacing->'maxWinners','scaled',coalesce(p_room.pacing->'scaled','false'::jsonb)) end,
    'called',case when p_room.deck is null or p_room.question_number=0 then '[]'::jsonb else
      (select coalesce(jsonb_agg(d.e order by d.i), '[]'::jsonb) from jsonb_array_elements(p_room.deck) with ordinality d(e,i) where d.i <= p_room.question_number) end
  )
$$;
revoke all on function private.bingo_core(public.bingo_rooms,text) from public,anon,authenticated;

create or replace function private.bingo_player_view(p_room public.bingo_rooms, p_me public.bingo_participants, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select (private.bingo_core(p_room, p_result) - 'leaderboard') || jsonb_build_object(
    -- The first five rows in display order (ties share a rank; the order
    -- within a tie is only for a stable list) plus this student's own row.
    'leaderboard',(select coalesce(jsonb_agg(e order by (e->>'order')::integer), '[]'::jsonb)
      from jsonb_array_elements(private.bingo_leaderboard(p_room.id)) e
      where (e->>'order')::integer <= 5 or e->>'id' = p_me.id::text),
    'me',jsonb_build_object(
      'id',p_me.id,'name',p_me.display_name,'emoji',p_me.emoji,'status',p_me.status,'gameNumber',p_me.game_number,
      'board',case when p_me.game_number=p_room.game_number then p_me.board else null end,
      'marks',p_me.marks,'freeUsed',p_me.free_used,'markQuestion',p_me.mark_question,
      'attemptQuestion',p_me.attempt_question,'attempts',p_me.attempts,'correct',p_me.correct_count,
      'hasWon',p_me.has_won,'placement',p_me.placement,'winLine',p_me.win_line,
      'pendingLine',p_me.pending_line,
      'best',p_me.best_count,'bestType',p_me.best_type,'bestLines',p_me.best_lines,'version',p_me.version
    ),
    'needsBoard',n.needs,
    'seed',case when n.needs then p_room.game_seed else null end,
    'pool',case when n.needs and p_room.pacing is null then p_room.pool else null end,
    'late',case when n.needs and p_room.pacing is not null then p_room.pacing->'late' else null end,
    'callable',case when n.needs and p_room.pacing is not null then
      (select coalesce(jsonb_agg(jsonb_build_object('c',x.c,'n',x.n) order by x.c), '[]'::jsonb)
       from (select u.c, count(*)::integer as n from public.bingo_room_questions u where u.room_id=p_room.id and u.called_at_question is null group by u.c) x)
      else null end
  )
  from (select (p_me.status='active' and p_room.status='open' and p_room.game_number>0 and (p_room.pool is not null or p_room.pacing is not null)
      and p_room.phase not in ('LOBBY','GAME_COMPLETE') and (p_me.board is null or p_me.game_number<>p_room.game_number)) as needs) n
$$;
revoke all on function private.bingo_player_view(public.bingo_rooms,public.bingo_participants,text) from public,anon,authenticated;

create or replace function private.bingo_host_view(p_room public.bingo_rooms, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select private.bingo_core(p_room, p_result) || jsonb_build_object(
    'progress',private.bingo_progress(p_room.id),
    'players',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.display_name,'emoji',p.emoji,
        'connected',p.seen_at > statement_timestamp() - interval '12 seconds',
        'hasWon',p.has_won,'placement',p.placement,'best',p.best_count,'bestType',p.best_type,'bestLines',p.best_lines,
        'pending',p.pending_line is not null,'correct',p.correct_count
      ) order by p.joined_at, p.id), '[]'::jsonb)
      from public.bingo_participants p where p.room_id=p_room.id and p.status='active')
  )
$$;
revoke all on function private.bingo_host_view(public.bingo_rooms,text) from public,anon,authenticated;

-- 5. Progress: best line, lines at that progress, one away, Bingo under the gate ------------------
create or replace function private.bingo_apply_progress(p_room public.bingo_rooms, p_me public.bingo_participants, p_used_free boolean)
returns public.bingo_rooms language plpgsql set search_path=''
as $$
declare
  r public.bingo_rooms;
  me public.bingo_participants := p_me;
  v_line record;
  v_count integer;
  v_best integer := 0;
  v_best_type text := null;
  v_best_lines integer := 0;
  v_win_id text := null;
  v_win_type text := null;
  v_win_mask integer := null;
  v_cap integer := (p_room.settings->>'winners')::integer;
  v_events jsonb := p_room.events;
  v_seq bigint := p_room.event_seq;
  v_winners jsonb := p_room.winners;
  v_count_winners integer := p_room.winner_count;
  v_placement integer := null;
  v_final boolean := false;
  v_one_away boolean := me.one_away;
  v_cells jsonb;
  v_pacing jsonb := p_room.pacing;
  v_gate_open boolean;
  v_pending_line text := me.pending_line;
  v_pending_question integer := me.pending_question;
  v_pending_seq bigint := me.pending_seq;
begin
  for v_line in select * from private.bingo_lines(p_room.settings->'patterns') loop
    v_count := bit_count((me.marks & v_line.mask)::bit(25))::integer;
    if v_count > v_best then v_best := v_count; v_best_type := v_line.line_type; v_best_lines := 1;
    elsif v_count = v_best and v_best > 0 then v_best_lines := v_best_lines + 1;
    end if;
    if v_win_id is null and (me.marks & v_line.mask) = v_line.mask then
      v_win_id := v_line.line_id; v_win_type := v_line.line_type; v_win_mask := v_line.mask;
    end if;
  end loop;

  if p_used_free then
    v_seq := v_seq + 1;
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object('type','free-space','name',me.display_name,'emoji',me.emoji,'participant',me.id));
  end if;

  -- The winner gate: open when no pacing (older rooms), or at/after the next eligible call.
  v_gate_open := v_pacing is null or p_room.question_number >= (v_pacing->>'nextEligibleCall')::integer;

  if v_win_id is not null and not me.has_won and me.pending_line is null and v_gate_open and (v_cap = 0 or v_count_winners < v_cap) then
    v_count_winners := v_count_winners + 1;
    v_placement := v_count_winners;
    select jsonb_agg(me.board->i order by i) into v_cells from generate_series(0,24) i where ((v_win_mask >> i) & 1) = 1;
    v_winners := v_winners || jsonb_build_array(jsonb_build_object(
      'id',me.id,'name',me.display_name,'emoji',me.emoji,'placement',v_placement,'line',v_win_id,'lineType',v_win_type,'mask',v_win_mask,'cells',v_cells,
      'question',p_room.question_number));
    v_seq := v_seq + 1;
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object(
      'type','bingo','name',me.display_name,'emoji',me.emoji,'participant',me.id,'placement',v_placement,'line',v_win_id,'lineType',v_win_type,'cap',v_cap));
    v_final := (v_cap > 0 and v_count_winners >= v_cap)
      or (v_cap = 0 and not exists (
        select 1 from public.bingo_participants o
        where o.room_id=p_room.id and o.status='active' and not o.has_won and o.id<>me.id));
    if v_pacing is not null then
      v_pacing := v_pacing || jsonb_build_object('lastWinnerCall',p_room.question_number,'nextEligibleCall',p_room.question_number + (v_pacing->>'spacing')::integer);
    end if;
  elsif v_win_id is not null and not me.has_won and me.pending_line is null and v_pacing is not null then
    -- A line finished while the gate is closed (the other student on the same
    -- call): kept as pending, confirmed when the next gate opens. Not a Bingo yet.
    v_seq := v_seq + 1;
    v_pending_line := v_win_id; v_pending_question := p_room.question_number; v_pending_seq := v_seq;
  elsif v_best = 4 and not me.one_away and not me.has_won then
    v_one_away := true;
    v_seq := v_seq + 1;
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object('type','one-away','name',me.display_name,'emoji',me.emoji,'participant',me.id));
  end if;

  update public.bingo_participants set
    best_count=v_best, best_type=v_best_type, best_lines=v_best_lines, one_away=v_one_away,
    has_won=has_won or v_placement is not null,
    placement=coalesce(placement, v_placement),
    win_line=case when v_placement is not null then v_win_id else win_line end,
    pending_line=case when v_placement is not null then null else v_pending_line end,
    pending_question=case when v_placement is not null then null else v_pending_question end,
    pending_seq=case when v_placement is not null then null else v_pending_seq end,
    version=version+1
    where id=me.id;

  update public.bingo_rooms set
    events=v_events, event_seq=v_seq, winners=v_winners, winner_count=v_count_winners, pacing=v_pacing,
    leaderboard=private.bingo_leaderboard(p_room.id),
    phase=case when v_final then 'WINNER_REVEAL' else phase end,
    phase_started_at=case when v_final then statement_timestamp() else phase_started_at end,
    phase_deadline=case when v_final then statement_timestamp()+interval '5 seconds' else phase_deadline end,
    completed_reason=case when v_final then (case when v_cap > 0 then 'winners' else 'everyone' end) else completed_reason end,
    version=version+1, updated_at=statement_timestamp()
    where id=p_room.id returning * into r;
  return r;
end
$$;
revoke all on function private.bingo_apply_progress(public.bingo_rooms,public.bingo_participants,boolean) from public,anon,authenticated;

-- Ordinary taps (unlocked path) also keep best_lines current.
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
  v_best_lines integer := 0;
  v_wins boolean := false;
begin
  select * into located from private.bingo_locate_player(p_token_hash);
  me := located.me; r := located.r;
  if me.id is not null and r.id is not null and me.status='active' and r.status='open'
     and r.expires_at > statement_timestamp()
     and r.game_number=p_game and r.question_number=p_question and r.phase='QUESTION_ACTIVE'
     and (r.phase_deadline is null or r.phase_deadline > statement_timestamp())
     and me.board is not null and me.game_number=r.game_number then
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
        if v_count > v_best then v_best := v_count; v_best_type := v_line.line_type; v_best_lines := 1;
        elsif v_count = v_best and v_best > 0 then v_best_lines := v_best_lines + 1;
        end if;
        if (v_marks & v_line.mask) = v_line.mask then v_wins := true; end if;
      end loop;
      if not v_wins and not (v_best = 4 and not me.one_away) then
        update public.bingo_participants set
          marks=v_marks, mark_question=p_question, correct_count=correct_count+1,
          response_ms=response_ms + greatest(0, floor(extract(epoch from (statement_timestamp() - r.question_started_at))*1000)::bigint),
          best_count=v_best, best_type=v_best_type, best_lines=v_best_lines, version=version+1
          where id=me.id and version=me.version and status='active' and game_number=p_game
          returning * into me;
        if found then return private.bingo_player_view(r,me,'correct'); end if;
      end if;
    end if;
  end if;

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

-- 6. The scheduler ---------------------------------------------------------------------------------
-- Chooses and starts the next call of a paced room. Caller holds the room lock
-- and the previous question has ended (marks are final).
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
  v_safe boolean; v_fresh boolean;
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
        + case when v_one_away < v_one_away_cap then 2 * (c->>'newfour')::numeric else -4 * (c->>'newfour')::numeric end
        + 1 * (c->>'newthree')::numeric
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

create or replace function private.bingo_next_question(p_room public.bingo_rooms)
returns public.bingo_rooms language plpgsql set search_path=''
as $$
declare
  r public.bingo_rooms;
  seconds integer := (p_room.settings->>'questionSeconds')::integer;
begin
  if p_room.pacing is not null then return private.bingo_schedule(p_room); end if;
  if p_room.question_number >= jsonb_array_length(p_room.deck) then
    update public.bingo_rooms set phase='GAME_COMPLETE', phase_started_at=statement_timestamp(), phase_deadline=null,
      completed_reason=coalesce(completed_reason,'deck'), version=version+1, updated_at=statement_timestamp()
      where id=p_room.id returning * into r;
    return r;
  end if;
  update public.bingo_rooms set phase='QUESTION_ACTIVE', question_number=question_number+1,
    question_started_at=statement_timestamp(), phase_started_at=statement_timestamp(),
    phase_deadline=case when seconds=0 then null else statement_timestamp()+make_interval(secs => seconds) end,
    version=version+1, updated_at=statement_timestamp()
    where id=p_room.id returning * into r;
  return r;
end
$$;
revoke all on function private.bingo_next_question(public.bingo_rooms) from public,anon,authenticated;

-- 7. Start a paced game -------------------------------------------------------------------------
-- The application server sends the universe, every joined player's card and
-- the pacing plan; everything is re-checked here.
create or replace function public.bingo_host_start_paced(
  p_owner_hash text, p_token_hash text, p_kind text, p_settings jsonb, p_seed text, p_questions jsonb, p_boards jsonb, p_pacing jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  e jsonb;
  v_players integer;
  v_cap integer;
  v_needed integer;
  v_required integer;
  boards jsonb := case when jsonb_typeof(p_boards)='object' then p_boards else '{}'::jsonb end;
  v_pacing jsonb;
  v_dealt integer;
begin
  select * into r from public.bingo_rooms where host_token_hash=p_token_hash and host_owner_hash=p_owner_hash for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  if r.status<>'open' or r.expires_at <= statement_timestamp() then return private.bingo_host_view(r,'expired'); end if;
  r := private.bingo_advance(r);
  if (p_kind='start' and r.phase<>'LOBBY') or (p_kind='again' and r.phase<>'GAME_COMPLETE') or p_kind not in ('start','again') then
    return private.bingo_host_view(r,'stale');
  end if;
  if r.settings is distinct from p_settings then return private.bingo_host_view(r,'stale'); end if;
  select count(*) into v_players from public.bingo_participants p where p.room_id=r.id and p.status='active';
  if v_players = 0 then return private.bingo_host_view(r,'no-players'); end if;
  if p_seed !~ '^[0-9a-f]{32}$' or jsonb_typeof(p_questions)<>'array' or jsonb_array_length(p_questions) not between 1 and 1200
     or not private.bingo_pacing_valid(p_pacing) then
    return private.bingo_host_view(r,'invalid-game');
  end if;
  for e in select x from jsonb_array_elements(p_questions) x loop
    if not private.bingo_question_valid(e, r.settings) then return private.bingo_host_view(r,'invalid-game'); end if;
  end loop;
  if (select count(distinct x->>'q') from jsonb_array_elements(p_questions) x) <> jsonb_array_length(p_questions) then
    return private.bingo_host_view(r,'invalid-game');
  end if;
  -- Every late class is a class of the universe.
  if exists (select 1 from jsonb_array_elements_text(p_pacing->'late') l
             where not exists (select 1 from jsonb_array_elements(p_questions) x where x->>'c' = l)) then
    return private.bingo_host_view(r,'invalid-game');
  end if;
  -- Capacity: the winners the host asked for must fit the unique questions.
  v_cap := (r.settings->>'winners')::integer;
  v_needed := case when v_cap = 0 then v_players else v_cap end;
  v_required := (p_pacing->>'firstWinCall')::integer + (p_pacing->>'spacing')::integer * greatest(0, v_needed - 1) + (p_pacing->>'buffer')::integer;
  if v_needed > (p_pacing->>'maxWinners')::integer or v_required > jsonb_array_length(p_questions) then
    return private.bingo_host_view(r,'winners-exceed-capacity') || jsonb_build_object(
      'maxWinners', least((p_pacing->>'maxWinners')::integer, greatest(0, 1 + ((jsonb_array_length(p_questions) - (p_pacing->>'firstWinCall')::integer - (p_pacing->>'buffer')::integer) / (p_pacing->>'spacing')::integer))),
      'requestedWinners', v_needed, 'requiredCalls', v_required, 'availableQuestions', jsonb_array_length(p_questions));
  end if;

  delete from public.bingo_room_questions where room_id=r.id;
  insert into public.bingo_room_questions(room_id,q,c,t,s,k,n,d)
    select r.id, x->>'q', x->>'c', x->>'t', x->>'s', x->>'k', (x->>'n')::integer, (x->>'d')::integer from jsonb_array_elements(p_questions) x;

  v_pacing := jsonb_build_object(
    'firstWinCall',(p_pacing->>'firstWinCall')::integer,'spacing',(p_pacing->>'spacing')::integer,'buffer',(p_pacing->>'buffer')::integer,
    'maxWinners',(p_pacing->>'maxWinners')::integer,'scaled',coalesce(p_pacing->'scaled','false'::jsonb),
    'late',(select jsonb_agg(distinct l) from jsonb_array_elements_text(p_pacing->'late') l),
    'reserve',coalesce(p_pacing->'reserve','[]'::jsonb),
    'universe',jsonb_array_length(p_questions),
    'nextEligibleCall',(p_pacing->>'firstWinCall')::integer,'lastWinnerCall',null,
    'coverage','{}'::jsonb,'calls','[]'::jsonb,'stuck',0);

  update public.bingo_participants p set
    game_number=r.game_number+1,
    board=case when p.status='active' and boards ? (p.id::text) and private.bingo_paced_board_valid(boards->(p.id::text), r.settings, v_pacing->'late', r.id)
      then boards->(p.id::text) else null end,
    marks=0, free_used=false, mark_question=0, attempt_question=0, attempts=0,
    correct_count=0, response_ms=0, has_won=false, placement=null, win_line=null, best_count=0, best_type=null, best_lines=0,
    pending_line=null, pending_question=null, pending_seq=null,
    one_away=false, version=version+1
    where p.room_id=r.id;
  select count(*) into v_dealt from public.bingo_participants p where p.room_id=r.id and p.status='active' and p.board is not null;
  update public.bingo_rooms set
    game_number=game_number+1, game_seed=p_seed, pool=null, deck='[]'::jsonb, pacing=v_pacing, question_number=0, question_started_at=null,
    phase='COUNTDOWN', paused_phase=null, paused_remaining_ms=null,
    phase_started_at=statement_timestamp(), phase_deadline=statement_timestamp()+interval '3 seconds',
    winner_count=0, winners='[]'::jsonb, events='[]'::jsonb, completed_reason=null,
    leaderboard=private.bingo_leaderboard(r.id),
    expires_at=greatest(expires_at, statement_timestamp()+interval '3 hours'),
    version=version+1, updated_at=statement_timestamp()
    where id=r.id returning * into r;
  return private.bingo_host_view(r,'started') || jsonb_build_object('dealt',v_dealt);
end
$$;
revoke all on function public.bingo_host_start_paced(text,text,text,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bingo_host_start_paced(text,text,text,jsonb,text,jsonb,jsonb,jsonb) to service_role;

-- 8. Cards dealt after Start (late joiners, refused cards) --------------------------------------------
create or replace function public.bingo_set_board(p_token_hash text, p_game integer, p_board jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  r public.bingo_rooms;
  me public.bingo_participants;
  free_on boolean;
  board_values text[];
  pool_values text[];
begin
  select * into located from private.bingo_locate_player(p_token_hash);
  if (located.me).id is null or (located.r).id is null then return jsonb_build_object('result','not-found'); end if;
  select * into r from public.bingo_rooms where id=(located.r).id for update;
  select * into me from public.bingo_participants where id=(located.me).id for update;
  if me.status<>'active' then return jsonb_build_object('result','removed'); end if;
  if r.status<>'open' then return jsonb_build_object('result','closed'); end if;
  if r.game_number<>p_game or (r.pool is null and r.pacing is null) then return private.bingo_player_view(r,me,'stale'); end if;
  if me.board is not null and me.game_number=r.game_number then return private.bingo_player_view(r,me,'ok'); end if;
  if r.pacing is not null then
    if not private.bingo_paced_board_valid(p_board, r.settings, r.pacing->'late', r.id) then return private.bingo_player_view(r,me,'invalid-board'); end if;
  else
    free_on := r.settings->'freeSpace'='true';
    if jsonb_typeof(p_board)<>'array' or jsonb_array_length(p_board)<>25 then return private.bingo_player_view(r,me,'invalid-board'); end if;
    if free_on and (p_board->12 is distinct from '{"free":true}'::jsonb
        or (select count(*) from jsonb_array_elements(p_board) e where e ? 'free')<>1) then
      return private.bingo_player_view(r,me,'invalid-board');
    end if;
    if not free_on and exists (select 1 from jsonb_array_elements(p_board) e where e ? 'free') then
      return private.bingo_player_view(r,me,'invalid-board');
    end if;
    if exists (select 1 from jsonb_array_elements(p_board) e where not (e ? 'free')
        and (jsonb_typeof(e->'n')<>'number' or jsonb_typeof(e->'d')<>'number' or (e->>'n') !~ '^[0-9]{1,4}$' or (e->>'d') !~ '^[1-9][0-9]{0,2}$')) then
      return private.bingo_player_view(r,me,'invalid-board');
    end if;
    select array_agg(x order by x) into board_values
      from (select (e->>'n')||'/'||(e->>'d') as x from jsonb_array_elements(p_board) e where not (e ? 'free')) s;
    select array_agg(x order by x) into pool_values
      from (select (e->>'n')||'/'||(e->>'d') as x from jsonb_array_elements(r.pool) e) s;
    if board_values is distinct from pool_values then return private.bingo_player_view(r,me,'invalid-board'); end if;
  end if;
  update public.bingo_participants set board=p_board, game_number=r.game_number, marks=0, free_used=false, best_count=0, best_type=null, best_lines=0,
    pending_line=null, pending_question=null, pending_seq=null, one_away=false, version=version+1
    where id=me.id returning * into me;
  return private.bingo_player_view(r,me,'ok');
end
$$;

-- 9. Host commands: a new game or a closed room drops its universe; a removed player drops any pending line.
create or replace function public.bingo_host_command(p_owner_hash text, p_token_hash text, p_command text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  remaining integer;
  target uuid;
  expect_question integer := case when jsonb_typeof(p_args->'question')='number' then (p_args->>'question')::integer else null end;
  expect_phase text := p_args->>'phase';
begin
  select * into r from public.bingo_rooms where host_token_hash=p_token_hash and host_owner_hash=p_owner_hash for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  if r.status<>'open' then return private.bingo_host_view(r,'closed'); end if;
  if r.expires_at <= statement_timestamp() then return private.bingo_host_view(r,'expired'); end if;
  r := private.bingo_advance(r);

  if p_command='settings' then
    if r.phase<>'LOBBY' then return private.bingo_host_view(r,'stale'); end if;
    if not private.bingo_settings_valid(p_args->'settings') then return private.bingo_host_view(r,'invalid-settings'); end if;
    update public.bingo_rooms set settings=p_args->'settings', version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='audio' then
    if p_args->>'music' not in ('host','all','off') or p_args->>'celebration' not in ('host','all','off') then
      return private.bingo_host_view(r,'invalid-settings');
    end if;
    update public.bingo_rooms set
      settings=settings || jsonb_build_object('music',p_args->>'music','celebration',p_args->>'celebration'),
      version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='pause' then
    if r.phase not in ('COUNTDOWN','QUESTION_ACTIVE','ANSWER_REVEAL','LEADERBOARD_UPDATE') then return private.bingo_host_view(r,'stale'); end if;
    remaining := case when r.phase_deadline is null then null
      else greatest(0, floor(extract(epoch from (r.phase_deadline - statement_timestamp()))*1000)::integer) end;
    update public.bingo_rooms set paused_phase=phase, phase='PAUSED', paused_remaining_ms=remaining,
      phase_deadline=null, version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='resume' then
    if r.phase<>'PAUSED' then return private.bingo_host_view(r,'stale'); end if;
    update public.bingo_rooms set phase=paused_phase, paused_phase=null,
      phase_deadline=case when paused_remaining_ms is null then null else statement_timestamp()+make_interval(secs => paused_remaining_ms/1000.0) end,
      paused_remaining_ms=null, version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='next' then
    if expect_phase is distinct from r.phase or expect_question is distinct from r.question_number then
      return private.bingo_host_view(r,'stale');
    end if;
    if r.phase='QUESTION_ACTIVE' then
      r := private.bingo_to_reveal(r);
    elsif r.phase in ('COUNTDOWN','ANSWER_REVEAL','LEADERBOARD_UPDATE') then
      r := private.bingo_next_question(r);
    else
      return private.bingo_host_view(r,'stale');
    end if;

  elsif p_command='end' then
    if r.phase not in ('COUNTDOWN','QUESTION_ACTIVE','ANSWER_REVEAL','LEADERBOARD_UPDATE','PAUSED','WINNER_REVEAL') then
      return private.bingo_host_view(r,'stale');
    end if;
    update public.bingo_rooms set phase='GAME_COMPLETE', paused_phase=null, paused_remaining_ms=null,
      phase_started_at=statement_timestamp(), phase_deadline=null,
      completed_reason=coalesce(completed_reason,'host'), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='change-settings' then
    if r.phase<>'GAME_COMPLETE' then return private.bingo_host_view(r,'stale'); end if;
    update public.bingo_participants set board=null, marks=0, free_used=false, mark_question=0, attempt_question=0, attempts=0,
      correct_count=0, response_ms=0, has_won=false, placement=null, win_line=null, best_count=0, best_type=null, best_lines=0,
      pending_line=null, pending_question=null, pending_seq=null, one_away=false, version=version+1
      where room_id=r.id;
    delete from public.bingo_room_questions where room_id=r.id;
    update public.bingo_rooms set phase='LOBBY', pool=null, deck=null, game_seed=null, pacing=null, question_number=0, question_started_at=null,
      phase_started_at=statement_timestamp(), phase_deadline=null, winner_count=0, winners='[]'::jsonb, events='[]'::jsonb,
      completed_reason=null, leaderboard=private.bingo_leaderboard(r.id), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='lock' or p_command='unlock' then
    update public.bingo_rooms set join_locked=(p_command='lock'), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='remove' then
    begin
      target := (p_args->>'participant')::uuid;
    exception when others then
      return private.bingo_host_view(r,'invalid-request');
    end;
    update public.bingo_participants set status='removed', display_name='Removed player', name_key='removed:'||id::text,
      emoji=null, board=null, pending_line=null, pending_question=null, pending_seq=null, version=version+1
      where id=target and room_id=r.id and status='active';
    if not found then return private.bingo_host_view(r,'stale'); end if;
    update public.bingo_rooms set
      winners=(select coalesce(jsonb_agg(case when w->>'id'=target::text then w || '{"name":"Removed player","emoji":null}'::jsonb else w end order by (w->>'placement')::integer), '[]'::jsonb)
        from jsonb_array_elements(winners) w),
      events=(select coalesce(jsonb_agg(case when e->>'participant'=target::text then e || '{"name":"Removed player","emoji":null}'::jsonb else e end order by (e->>'seq')::bigint), '[]'::jsonb)
        from jsonb_array_elements(events) e),
      leaderboard=private.bingo_leaderboard(r.id), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
    r := private.bingo_check_everyone(r);

  elsif p_command='code' then
    if r.phase<>'LOBBY' or r.game_number<>0 then return private.bingo_host_view(r,'stale'); end if;
    if (p_args->>'code') !~ '^[1-9][0-9]{5}$' then return private.bingo_host_view(r,'invalid-request'); end if;
    if exists (select 1 from public.bingo_rooms where code=p_args->>'code' and status='open') then
      return private.bingo_host_view(r,'code-taken');
    end if;
    begin
      update public.bingo_rooms set code=p_args->>'code', version=version+1, updated_at=statement_timestamp()
        where id=r.id returning * into r;
    exception when unique_violation then
      return private.bingo_host_view(r,'code-taken');
    end;

  elsif p_command='close' then
    delete from public.bingo_participants where room_id=r.id;
    delete from public.bingo_room_questions where room_id=r.id;
    update public.bingo_rooms set status='closed', phase=case when game_number=0 then 'LOBBY' else 'GAME_COMPLETE' end,
      paused_phase=null, paused_remaining_ms=null,
      phase_deadline=null, pool=null, deck=null, game_seed=null, pacing=null, winners='[]'::jsonb, events='[]'::jsonb,
      leaderboard='[]'::jsonb, version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
    return private.bingo_host_view(r,'closed');

  else
    return private.bingo_host_view(r,'invalid-request');
  end if;
  return private.bingo_host_view(r,'ok');
end
$$;
