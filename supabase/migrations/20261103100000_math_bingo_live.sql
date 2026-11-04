-- Math Bingo Live V1 — DRAFT / OWNER REVIEW.
--
-- 1. Registers the game in the trusted catalog as DRAFT. Draft entries are
--    never listed (the catalog reads status='published' only) and the game's
--    routes refuse to serve a draft outside an explicit local owner preview,
--    so applying this migration publishes nothing.
-- 2. Adds the authoritative live-room store. Browsers never touch these
--    tables: RLS is forced, anon/authenticated hold no grants, and every
--    function is SECURITY DEFINER with EXECUTE for service_role only. The
--    application server (app/api/games/math-bingo-live/*) is the only caller.
--
-- Authority model
--   * The server clock decides everything. Phase deadlines are stored here;
--     any call that finds a deadline passed advances the room under a row
--     lock (lazy, deterministic: no background worker is needed).
--   * A mark is validated HERE against the current question's stored answer
--     and the player's stored card, under the room lock, so two near-
--     simultaneous marks are serialized, winner placements are assigned in
--     one order with a unique index as a backstop, and a player can hold at
--     most one placement per game.
--   * The question deck and answer pool live only in this table and on the
--     application server. Browsers receive the current question, and the
--     answer only once it has been revealed.
--
-- Privacy
--   * Students have no account. A participant is a random bearer token
--     (stored only as a SHA-256 hash) plus a display name for one room.
--   * Rooms expire. Expired and closed rooms (and, by cascade, every
--     participant name and card) are deleted on the next room creation or
--     join; closing a room deletes its participants immediately.
--   * No student email, birthday, school profile or analytics identity.

do $migration$
declare
  bingo_id uuid;
  existing_slug_conflict bigint;
  next_order smallint;
begin
  select count(*) into existing_slug_conflict
  from public.game_catalog_entries
  where slug='math-bingo-live' and stable_key<>'math-bingo-live';
  if existing_slug_conflict<>0 then
    raise exception 'Math Bingo Live slug belongs to another catalog identity';
  end if;

  select coalesce(
    (select display_order from public.game_catalog_entries where stable_key='math-bingo-live'),
    (select max(display_order)+1 from public.game_catalog_entries),
    1
  ) into next_order;

  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    'math-bingo-live','math-bingo-live','Math Bingo Live',
    'Solve math questions, mark your card, and race classmates to Bingo.',
    'internal','builtin:math-bingo-live',1,6,
    array['addition','division','fractions','math-fluency','mental-math','multiplication','strategy','subtraction'],
    array['arithmetic','fact-fluency','fractions'],
    array['bingo','classroom-game','free-game','live-multiplayer','smart-board'],
    'mixed','draft',next_order,'1.0.0',
    jsonb_build_object(
      'internal_registry_key','math-bingo-live',
      'internal_route','/games/math-bingo-live/host',
      'join_route','/join',
      'implementation_version','1.0.0',
      'access','free-host-account; students join with a game code and display name only',
      'release_state','draft-owner-review'
    ),
    jsonb_build_object('strategy','keep draft; to withdraw after release set status to archived (routes then refuse new rooms)')
  )
  on conflict(stable_key) do update set
    resource_id=null,
    package_id=null,
    slug='math-bingo-live',
    title='Math Bingo Live',
    description=excluded.description,
    launch_type='internal',
    canonical_route=null,
    external_url=null,
    external_allowed_host=null,
    thumbnail_reference='builtin:math-bingo-live',
    recommended_grade_min=1,
    recommended_grade_max=6,
    skills=excluded.skills,
    topics=excluded.topics,
    tags=excluded.tags,
    difficulty='mixed',
    status='draft',
    display_order=next_order,
    version='1.0.0',
    publication_metadata=public.game_catalog_entries.publication_metadata || excluded.publication_metadata,
    rollback_metadata=public.game_catalog_entries.rollback_metadata || excluded.rollback_metadata,
    lock_version=public.game_catalog_entries.lock_version+1
  returning id into bingo_id;

  perform private.record_game_catalog_version(bingo_id,null,null);
end
$migration$;

-- Settings shape (mirrors public/internal-games/math-bingo-live/src/engine/settings.js).
-- Comparisons are on jsonb values, so a malformed value can never raise a cast error.
create or replace function private.bingo_settings_valid(p jsonb)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(
    jsonb_typeof(p)='object'
    and p->>'mode' in ('addition','subtraction','multiplication','division','mixed','fractions')
    and jsonb_typeof(p->'level')='string' and char_length(p->>'level') between 1 and 32
    and p->'questionSeconds' in ('5','10','15','20','30','45','60','0')
    and p->'revealSeconds' in ('2','3','5','0')
    and jsonb_typeof(p->'patterns')='object'
    and jsonb_typeof(p->'patterns'->'rows')='boolean'
    and jsonb_typeof(p->'patterns'->'columns')='boolean'
    and jsonb_typeof(p->'patterns'->'diagonals')='boolean'
    and (p->'patterns'->'rows'='true' or p->'patterns'->'columns'='true' or p->'patterns'->'diagonals'='true')
    and jsonb_typeof(p->'winners')='number' and (p->>'winners') ~ '^[0-9]{1,2}$' and (p->>'winners')::integer <= 60
    and jsonb_typeof(p->'freeSpace')='boolean'
    and jsonb_typeof(p->'equivalentFractions')='boolean'
    and p->>'music' in ('host','all','off')
    and p->>'celebration' in ('host','all','off'),
    false)
$$;
revoke all on function private.bingo_settings_valid(jsonb) from public,anon,authenticated;

create table public.bingo_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[1-9][0-9]{5}$'),
  host_owner_hash text not null check (host_owner_hash ~ '^[0-9a-f]{64}$'),
  host_token_hash text not null check (host_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open','closed')),
  phase text not null default 'LOBBY' check (phase in ('LOBBY','COUNTDOWN','QUESTION_ACTIVE','ANSWER_REVEAL','LEADERBOARD_UPDATE','WINNER_REVEAL','GAME_COMPLETE','PAUSED')),
  paused_phase text check (paused_phase is null or paused_phase in ('COUNTDOWN','QUESTION_ACTIVE','ANSWER_REVEAL','LEADERBOARD_UPDATE')),
  paused_remaining_ms integer check (paused_remaining_ms is null or paused_remaining_ms >= 0),
  settings jsonb not null check (private.bingo_settings_valid(settings)),
  game_number integer not null default 0 check (game_number >= 0),
  game_seed text check (game_seed is null or game_seed ~ '^[0-9a-f]{32}$'),
  pool jsonb check (pool is null or (jsonb_typeof(pool)='array' and jsonb_array_length(pool) between 24 and 25)),
  deck jsonb check (deck is null or (jsonb_typeof(deck)='array' and jsonb_array_length(deck) between 1 and 100)),
  question_number integer not null default 0 check (question_number >= 0),
  question_started_at timestamptz,
  phase_started_at timestamptz not null default statement_timestamp(),
  phase_deadline timestamptz,
  winner_count integer not null default 0 check (winner_count between 0 and 60),
  winners jsonb not null default '[]'::jsonb check (jsonb_typeof(winners)='array'),
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events)='array'),
  event_seq bigint not null default 0,
  leaderboard jsonb not null default '[]'::jsonb check (jsonb_typeof(leaderboard)='array'),
  completed_reason text check (completed_reason is null or completed_reason in ('winners','everyone','deck','host')),
  join_locked boolean not null default false,
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  check ((phase='PAUSED') = (paused_phase is not null)),
  check (phase='LOBBY' or game_number >= 1),
  check (game_number = 0 or phase in ('LOBBY','GAME_COMPLETE') or (pool is not null and deck is not null and game_seed is not null))
);
create unique index bingo_rooms_open_code_idx on public.bingo_rooms(code) where status='open';
create unique index bingo_rooms_host_token_idx on public.bingo_rooms(host_token_hash);
create index bingo_rooms_owner_idx on public.bingo_rooms(host_owner_hash,created_at);
create index bingo_rooms_expires_idx on public.bingo_rooms(expires_at);

alter table public.bingo_rooms enable row level security;
alter table public.bingo_rooms force row level security;
revoke all on table public.bingo_rooms from public,anon,authenticated;
grant select,insert,update,delete on table public.bingo_rooms to service_role;

create table public.bingo_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.bingo_rooms(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  display_name text not null check (display_name = btrim(display_name) and char_length(display_name) between 2 and 20),
  name_key text not null,
  status text not null default 'active' check (status in ('active','removed')),
  joined_at timestamptz not null default statement_timestamp(),
  seen_at timestamptz not null default statement_timestamp(),
  game_number integer not null default 0 check (game_number >= 0),
  board jsonb check (board is null or (jsonb_typeof(board)='array' and jsonb_array_length(board)=25)),
  marks integer not null default 0 check (marks between 0 and 33554431),
  free_used boolean not null default false,
  mark_question integer not null default 0,
  attempt_question integer not null default 0,
  attempts integer not null default 0 check (attempts between 0 and 2),
  correct_count integer not null default 0 check (correct_count >= 0),
  response_ms bigint not null default 0 check (response_ms >= 0),
  has_won boolean not null default false,
  placement integer check (placement is null or placement between 1 and 60),
  win_line text,
  best_count smallint not null default 0 check (best_count between 0 and 5),
  best_type text check (best_type is null or best_type in ('row','column','diagonal')),
  one_away boolean not null default false,
  version bigint not null default 1,
  check (has_won = (placement is not null))
);
create unique index bingo_participants_token_idx on public.bingo_participants(token_hash);
create unique index bingo_participants_active_name_idx on public.bingo_participants(room_id,name_key) where status='active';
-- Backstop for the one-placement rule: no two players share a placement.
create unique index bingo_participants_placement_idx on public.bingo_participants(room_id,placement) where placement is not null;
create index bingo_participants_room_idx on public.bingo_participants(room_id,joined_at);

alter table public.bingo_participants enable row level security;
alter table public.bingo_participants force row level security;
revoke all on table public.bingo_participants from public,anon,authenticated;
grant select,insert,update,delete on table public.bingo_participants to service_role;

-- Code-guessing limiter, keyed by a server-side HMAC of the caller's address
-- (never the address itself). A whole class shares one school address, so
-- only FAILED joins count.
create table public.bingo_join_failures (
  subject_hash text primary key check (subject_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default statement_timestamp(),
  failures integer not null default 0 check (failures >= 0)
);
alter table public.bingo_join_failures enable row level security;
alter table public.bingo_join_failures force row level security;
revoke all on table public.bingo_join_failures from public,anon,authenticated;
grant select,insert,update,delete on table public.bingo_join_failures to service_role;

-- ---------------------------------------------------------------- helpers

create or replace function private.bingo_ms(p timestamptz)
returns bigint language sql immutable set search_path=''
as $$ select case when p is null then null else floor(extract(epoch from p)*1000)::bigint end $$;
revoke all on function private.bingo_ms(timestamptz) from public,anon,authenticated;

-- The twelve lines as 25-bit masks (bit i = cell i, reading order), filtered
-- by the room's enabled patterns. Same masks as engine/board.js.
create or replace function private.bingo_lines(p_patterns jsonb)
returns table(ord integer, line_id text, line_type text, mask integer)
language sql immutable set search_path=''
as $$
  select l.ord, l.line_id, l.line_type, l.mask
  from (values
    (1,'row-1','row',31),(2,'row-2','row',992),(3,'row-3','row',31744),(4,'row-4','row',1015808),(5,'row-5','row',32505856),
    (6,'column-1','column',1082401),(7,'column-2','column',2164802),(8,'column-3','column',4329604),(9,'column-4','column',8659208),(10,'column-5','column',17318416),
    (11,'diagonal-1','diagonal',17043521),(12,'diagonal-2','diagonal',1118480)
  ) as l(ord,line_id,line_type,mask)
  where (l.line_type='row' and p_patterns->'rows'='true')
     or (l.line_type='column' and p_patterns->'columns'='true')
     or (l.line_type='diagonal' and p_patterns->'diagonals'='true')
  order by l.ord
$$;
revoke all on function private.bingo_lines(jsonb) from public,anon,authenticated;

-- Does a card cell satisfy the current answer? Integer arithmetic only:
-- exact written fraction by default, rational equality when the host turned
-- Equivalent Fractions on. The shape is never consulted.
create or replace function private.bingo_matches(p_settings jsonb, p_answer jsonb, p_cell jsonb)
returns boolean language plpgsql immutable set search_path=''
as $$
declare
  an bigint; ad bigint; cn bigint; cd bigint;
begin
  if p_answer is null or p_cell is null or p_cell ? 'free'
     or jsonb_typeof(p_cell->'n')<>'number' or jsonb_typeof(p_cell->'d')<>'number' then
    return false;
  end if;
  an := (p_answer->>'n')::bigint; ad := (p_answer->>'d')::bigint;
  cn := (p_cell->>'n')::bigint; cd := (p_cell->>'d')::bigint;
  if p_settings->>'mode'='fractions' then
    if p_settings->'equivalentFractions'='true' then return an*cd = cn*ad; end if;
    return an=cn and ad=cd;
  end if;
  return cd=1 and ad=1 and an=cn;
end
$$;
revoke all on function private.bingo_matches(jsonb,jsonb,jsonb) from public,anon,authenticated;

-- Append one event, keeping only the latest 20 (transient by design).
create or replace function private.bingo_event(p_events jsonb, p_seq bigint, p_event jsonb)
returns jsonb language sql immutable set search_path=''
as $$
  select coalesce(jsonb_agg(x.e order by (x.e->>'seq')::bigint), '[]'::jsonb)
  from (
    select e from jsonb_array_elements(p_events || jsonb_build_array(p_event || jsonb_build_object('seq',p_seq))) e
    order by (e->>'seq')::bigint desc limit 20
  ) x
$$;
revoke all on function private.bingo_event(jsonb,bigint,jsonb) from public,anon,authenticated;

-- Server-authoritative ranking: confirmed winners (by placement), then best
-- enabled-line progress, then correct marks, then average response time
-- (tertiary only), then join order.
create or replace function private.bingo_leaderboard(p_room_id uuid)
returns jsonb language sql stable set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.display_name,'rank',s.ord,'won',s.has_won,'placement',s.placement,
      'best',s.best_count,'type',s.best_type,'correct',s.correct_count,'line',s.win_line
    ) order by s.ord), '[]'::jsonb)
  from (
    select p.*, row_number() over (order by p.has_won desc, p.placement asc nulls last, p.best_count desc, p.correct_count desc,
      case when p.correct_count>0 then p.response_ms::numeric/p.correct_count else 1e15 end asc, p.joined_at asc, p.id asc) as ord
    from public.bingo_participants p
    where p.room_id=p_room_id and p.status='active'
  ) s
$$;
revoke all on function private.bingo_leaderboard(uuid) from public,anon,authenticated;

-- ------------------------------------------------------- state machine

create or replace function private.bingo_next_question(p_room public.bingo_rooms)
returns public.bingo_rooms language plpgsql set search_path=''
as $$
declare
  r public.bingo_rooms;
  seconds integer := (p_room.settings->>'questionSeconds')::integer;
begin
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

create or replace function private.bingo_to_reveal(p_room public.bingo_rooms)
returns public.bingo_rooms language plpgsql set search_path=''
as $$
declare
  r public.bingo_rooms;
  seconds integer := (p_room.settings->>'revealSeconds')::integer;
begin
  update public.bingo_rooms set phase='ANSWER_REVEAL', phase_started_at=statement_timestamp(),
    phase_deadline=case when seconds=0 then null else statement_timestamp()+make_interval(secs => seconds) end,
    version=version+1, updated_at=statement_timestamp()
    where id=p_room.id returning * into r;
  return r;
end
$$;
revoke all on function private.bingo_to_reveal(public.bingo_rooms) from public,anon,authenticated;

-- Apply every transition whose deadline has passed. Caller holds the room
-- row lock. Each new phase starts "now" (not at the missed deadline), so a
-- room nobody is watching never races through questions on its own.
create or replace function private.bingo_advance(p_room public.bingo_rooms)
returns public.bingo_rooms language plpgsql set search_path=''
as $$
declare
  r public.bingo_rooms := p_room;
  steps integer := 0;
begin
  loop
    exit when r.status<>'open' or r.phase_deadline is null or r.phase_deadline > statement_timestamp() or steps >= 6;
    steps := steps + 1;
    if r.phase in ('COUNTDOWN','LEADERBOARD_UPDATE') then
      r := private.bingo_next_question(r);
    elsif r.phase='QUESTION_ACTIVE' then
      r := private.bingo_to_reveal(r);
    elsif r.phase='ANSWER_REVEAL' then
      update public.bingo_rooms set phase='LEADERBOARD_UPDATE', phase_started_at=statement_timestamp(),
        phase_deadline=statement_timestamp()+interval '3 seconds', version=version+1, updated_at=statement_timestamp()
        where id=r.id returning * into r;
    elsif r.phase='WINNER_REVEAL' then
      update public.bingo_rooms set phase='GAME_COMPLETE', phase_started_at=statement_timestamp(), phase_deadline=null,
        version=version+1, updated_at=statement_timestamp()
        where id=r.id returning * into r;
    else
      exit;
    end if;
  end loop;
  return r;
end
$$;
revoke all on function private.bingo_advance(public.bingo_rooms) from public,anon,authenticated;

-- Count a correct mark or a Free Space: best line, "one away", Bingo,
-- winner placement, final-winner game end, leaderboard. Caller holds the
-- room lock and the participant lock.
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
begin
  for v_line in select * from private.bingo_lines(p_room.settings->'patterns') loop
    v_count := bit_count((me.marks & v_line.mask)::bit(25))::integer;
    if v_count > v_best then v_best := v_count; v_best_type := v_line.line_type; end if;
    if v_win_id is null and (me.marks & v_line.mask) = v_line.mask then
      v_win_id := v_line.line_id; v_win_type := v_line.line_type; v_win_mask := v_line.mask;
    end if;
  end loop;

  if p_used_free then
    v_seq := v_seq + 1;
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object('type','free-space','name',me.display_name,'participant',me.id));
  end if;

  if v_win_id is not null and not me.has_won and (v_cap = 0 or v_count_winners < v_cap) then
    v_count_winners := v_count_winners + 1;
    v_placement := v_count_winners;
    select jsonb_agg(me.board->i order by i) into v_cells from generate_series(0,24) i where ((v_win_mask >> i) & 1) = 1;
    v_winners := v_winners || jsonb_build_array(jsonb_build_object(
      'id',me.id,'name',me.display_name,'placement',v_placement,'line',v_win_id,'lineType',v_win_type,'mask',v_win_mask,'cells',v_cells));
    v_seq := v_seq + 1;
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object(
      'type','bingo','name',me.display_name,'participant',me.id,'placement',v_placement,'line',v_win_id,'lineType',v_win_type,'cap',v_cap));
    v_final := (v_cap > 0 and v_count_winners >= v_cap)
      or (v_cap = 0 and not exists (
        select 1 from public.bingo_participants o
        where o.room_id=p_room.id and o.status='active' and not o.has_won and o.id<>me.id));
  elsif v_best = 4 and not me.one_away and not me.has_won then
    v_one_away := true;
    v_seq := v_seq + 1;
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object('type','one-away','name',me.display_name,'participant',me.id));
  end if;

  update public.bingo_participants set
    best_count=v_best, best_type=v_best_type, one_away=v_one_away,
    has_won=has_won or v_placement is not null,
    placement=coalesce(placement, v_placement),
    win_line=case when v_placement is not null then v_win_id else win_line end,
    version=version+1
    where id=me.id;

  update public.bingo_rooms set
    events=v_events, event_seq=v_seq, winners=v_winners, winner_count=v_count_winners,
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

-- ---------------------------------------------------------------- views
-- Everything returned goes to the trusted application server only. The
-- `called` list includes the CURRENT question's answer; the server strips it
-- until the room has revealed it, and never forwards `seed` or `pool`.

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
    'leaderboard',p_room.leaderboard,
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

create or replace function private.bingo_player_view(p_room public.bingo_rooms, p_me public.bingo_participants, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select private.bingo_core(p_room, p_result) || jsonb_build_object(
    'me',jsonb_build_object(
      'id',p_me.id,'name',p_me.display_name,'status',p_me.status,'gameNumber',p_me.game_number,
      'board',case when p_me.game_number=p_room.game_number then p_me.board else null end,
      'marks',p_me.marks,'freeUsed',p_me.free_used,'markQuestion',p_me.mark_question,
      'attemptQuestion',p_me.attempt_question,'attempts',p_me.attempts,'correct',p_me.correct_count,
      'hasWon',p_me.has_won,'placement',p_me.placement,'winLine',p_me.win_line,
      'best',p_me.best_count,'bestType',p_me.best_type,'version',p_me.version
    ),
    'needsBoard',(p_me.status='active' and p_room.status='open' and p_room.game_number>0 and p_room.pool is not null
      and p_room.phase not in ('LOBBY','GAME_COMPLETE') and (p_me.board is null or p_me.game_number<>p_room.game_number)),
    'seed',p_room.game_seed,
    'pool',p_room.pool
  )
$$;
revoke all on function private.bingo_player_view(public.bingo_rooms,public.bingo_participants,text) from public,anon,authenticated;

create or replace function private.bingo_host_view(p_room public.bingo_rooms, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select private.bingo_core(p_room, p_result) || jsonb_build_object(
    'players',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.display_name,
        'connected',p.seen_at > statement_timestamp() - interval '12 seconds',
        'hasWon',p.has_won,'placement',p.placement,'best',p.best_count,'bestType',p.best_type,'correct',p.correct_count
      ) order by p.joined_at, p.id), '[]'::jsonb)
      from public.bingo_participants p where p.room_id=p_room.id and p.status='active')
  )
$$;
revoke all on function private.bingo_host_view(public.bingo_rooms,text) from public,anon,authenticated;

create or replace function private.bingo_cleanup()
returns void language sql set search_path=''
as $$
  delete from public.bingo_rooms
    where expires_at < statement_timestamp() - interval '5 minutes'
       or (status='closed' and updated_at < statement_timestamp() - interval '5 minutes');
  delete from public.bingo_join_failures where window_started_at < statement_timestamp() - interval '1 hour';
$$;
revoke all on function private.bingo_cleanup() from public,anon,authenticated;

-- ----------------------------------------------------------- host functions

create or replace function public.bingo_create_room(p_code text, p_owner_hash text, p_host_token_hash text, p_settings jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  recent bigint;
begin
  perform private.bingo_cleanup();
  if not private.bingo_settings_valid(p_settings) then return jsonb_build_object('result','invalid-settings'); end if;
  select count(*) into recent from public.bingo_rooms
    where host_owner_hash=p_owner_hash and created_at > statement_timestamp() - interval '10 minutes';
  if recent >= 12 then return jsonb_build_object('result','rate-limited'); end if;
  if exists (select 1 from public.bingo_rooms where code=p_code and status='open') then
    return jsonb_build_object('result','code-taken');
  end if;
  -- One live room per host: an older open room is closed and its players removed.
  delete from public.bingo_participants where room_id in
    (select id from public.bingo_rooms where host_owner_hash=p_owner_hash and status='open');
  update public.bingo_rooms set status='closed', version=version+1, updated_at=statement_timestamp()
    where host_owner_hash=p_owner_hash and status='open';
  insert into public.bingo_rooms(code,host_owner_hash,host_token_hash,settings,expires_at)
    values(p_code,p_owner_hash,p_host_token_hash,p_settings,statement_timestamp()+interval '4 hours')
    returning * into r;
  return private.bingo_host_view(r,'created');
end
$$;

-- Teacher refresh / second window: the signed-in host gets a fresh host
-- token for their newest live room; the previous token stops working.
create or replace function public.bingo_host_resume(p_owner_hash text, p_new_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
begin
  select * into r from public.bingo_rooms
    where host_owner_hash=p_owner_hash and status='open' and expires_at > statement_timestamp()
    order by created_at desc limit 1 for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  update public.bingo_rooms set host_token_hash=p_new_token_hash, updated_at=statement_timestamp()
    where id=r.id returning * into r;
  r := private.bingo_advance(r);
  return private.bingo_host_view(r,'resumed');
end
$$;

create or replace function public.bingo_host_state(p_owner_hash text, p_token_hash text, p_since_version bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
begin
  select * into r from public.bingo_rooms where host_token_hash=p_token_hash and host_owner_hash=p_owner_hash;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  if r.status='open' and r.phase_deadline is not null and r.phase_deadline <= statement_timestamp() then
    select * into r from public.bingo_rooms where id=r.id for update;
    r := private.bingo_advance(r);
  end if;
  if p_since_version is not null and p_since_version=r.version and r.status='open' then
    return jsonb_build_object('result','unchanged','version',r.version,'serverNow',private.bingo_ms(statement_timestamp()),
      'players',(select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'connected',p.seen_at > statement_timestamp() - interval '12 seconds') order by p.joined_at, p.id), '[]'::jsonb)
        from public.bingo_participants p where p.room_id=r.id and p.status='active'));
  end if;
  return private.bingo_host_view(r,'ok');
end
$$;

-- Start a game (from the lobby) or Play Again (from Game Complete) with a
-- game the application server built from the room's own settings.
create or replace function public.bingo_host_start(
  p_owner_hash text, p_token_hash text, p_kind text, p_settings jsonb, p_seed text, p_pool jsonb, p_deck jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  expected_pool integer;
begin
  select * into r from public.bingo_rooms where host_token_hash=p_token_hash and host_owner_hash=p_owner_hash for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  if r.status<>'open' or r.expires_at <= statement_timestamp() then return private.bingo_host_view(r,'expired'); end if;
  r := private.bingo_advance(r);
  if (p_kind='start' and r.phase<>'LOBBY') or (p_kind='again' and r.phase<>'GAME_COMPLETE') or p_kind not in ('start','again') then
    return private.bingo_host_view(r,'stale');
  end if;
  if r.settings is distinct from p_settings then return private.bingo_host_view(r,'stale'); end if;
  if not exists (select 1 from public.bingo_participants p where p.room_id=r.id and p.status='active') then
    return private.bingo_host_view(r,'no-players');
  end if;
  expected_pool := case when r.settings->'freeSpace'='true' then 24 else 25 end;
  if p_seed !~ '^[0-9a-f]{32}$' or jsonb_typeof(p_pool)<>'array' or jsonb_array_length(p_pool)<>expected_pool
     or jsonb_typeof(p_deck)<>'array' or jsonb_array_length(p_deck) not between expected_pool and 100 then
    return private.bingo_host_view(r,'invalid-game');
  end if;
  update public.bingo_participants set
    game_number=r.game_number+1, board=null, marks=0, free_used=false, mark_question=0, attempt_question=0, attempts=0,
    correct_count=0, response_ms=0, has_won=false, placement=null, win_line=null, best_count=0, best_type=null,
    one_away=false, version=version+1
    where room_id=r.id;
  update public.bingo_rooms set
    game_number=game_number+1, game_seed=p_seed, pool=p_pool, deck=p_deck, question_number=0, question_started_at=null,
    phase='COUNTDOWN', paused_phase=null, paused_remaining_ms=null,
    phase_started_at=statement_timestamp(), phase_deadline=statement_timestamp()+interval '3 seconds',
    winner_count=0, winners='[]'::jsonb, events='[]'::jsonb, completed_reason=null,
    leaderboard=private.bingo_leaderboard(r.id),
    expires_at=greatest(expires_at, statement_timestamp()+interval '3 hours'),
    version=version+1, updated_at=statement_timestamp()
    where id=r.id returning * into r;
  return private.bingo_host_view(r,'started');
end
$$;

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
    -- The host's view must match, so a double click cannot skip a question.
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
      correct_count=0, response_ms=0, has_won=false, placement=null, win_line=null, best_count=0, best_type=null,
      one_away=false, version=version+1
      where room_id=r.id;
    update public.bingo_rooms set phase='LOBBY', pool=null, deck=null, game_seed=null, question_number=0, question_started_at=null,
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
      board=null, version=version+1
      where id=target and room_id=r.id and status='active';
    if not found then return private.bingo_host_view(r,'stale'); end if;
    update public.bingo_rooms set
      winners=(select coalesce(jsonb_agg(case when w->>'id'=target::text then w || '{"name":"Removed player"}'::jsonb else w end order by (w->>'placement')::integer), '[]'::jsonb)
        from jsonb_array_elements(winners) w),
      events=(select coalesce(jsonb_agg(case when e->>'participant'=target::text then e || '{"name":"Removed player"}'::jsonb else e end order by (e->>'seq')::bigint), '[]'::jsonb)
        from jsonb_array_elements(events) e),
      leaderboard=private.bingo_leaderboard(r.id), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='code' then
    if r.phase<>'LOBBY' or r.game_number<>0 then return private.bingo_host_view(r,'stale'); end if;
    if (p_args->>'code') !~ '^[1-9][0-9]{5}$' then return private.bingo_host_view(r,'invalid-request'); end if;
    if exists (select 1 from public.bingo_rooms where code=p_args->>'code' and status='open') then
      return private.bingo_host_view(r,'code-taken');
    end if;
    update public.bingo_rooms set code=p_args->>'code', version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;

  elsif p_command='close' then
    delete from public.bingo_participants where room_id=r.id;
    update public.bingo_rooms set status='closed', phase='GAME_COMPLETE', paused_phase=null, paused_remaining_ms=null,
      phase_deadline=null, pool=null, deck=null, game_seed=null, winners='[]'::jsonb, events='[]'::jsonb,
      leaderboard='[]'::jsonb, version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
    return private.bingo_host_view(r,'closed');

  else
    return private.bingo_host_view(r,'invalid-request');
  end if;
  return private.bingo_host_view(r,'ok');
end
$$;

-- --------------------------------------------------------- player functions

create or replace function public.bingo_join_room(p_code text, p_name text, p_token_hash text, p_subject_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  me public.bingo_participants;
  failure_row public.bingo_join_failures;
  outcome text;
  candidate text := p_name;
  suffix integer := 1;
begin
  perform private.bingo_cleanup();
  select * into failure_row from public.bingo_join_failures where subject_hash=p_subject_hash for update;
  if failure_row.subject_hash is not null and failure_row.window_started_at > statement_timestamp() - interval '10 minutes'
     and failure_row.failures >= 40 then
    return jsonb_build_object('result','rate-limited');
  end if;
  if p_name is null or p_name<>btrim(p_name) or char_length(p_name) not between 2 and 20 then
    return jsonb_build_object('result','invalid-name');
  end if;

  select * into r from public.bingo_rooms where code=p_code and status='open' for update;
  if r.id is null then
    outcome := 'not-found';
  elsif r.expires_at <= statement_timestamp() then
    outcome := 'expired';
  elsif r.join_locked then
    return jsonb_build_object('result','locked');
  elsif (select count(*) from public.bingo_participants p where p.room_id=r.id and p.status='active') >= 60 then
    return jsonb_build_object('result','full');
  else
    -- Duplicate names stay readable: "Ava", then "Ava 2", "Ava 3"...
    while exists (select 1 from public.bingo_participants p where p.room_id=r.id and p.status='active' and p.name_key=lower(candidate)) loop
      suffix := suffix + 1;
      candidate := btrim(left(p_name, 20 - char_length(' ' || suffix::text))) || ' ' || suffix::text;
    end loop;
    insert into public.bingo_participants(room_id,token_hash,display_name,name_key,game_number)
      values(r.id,p_token_hash,candidate,lower(candidate),r.game_number)
      returning * into me;
    update public.bingo_rooms set leaderboard=private.bingo_leaderboard(r.id), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
    r := private.bingo_advance(r);
    return private.bingo_player_view(r,me,'joined');
  end if;

  insert into public.bingo_join_failures(subject_hash,window_started_at,failures) values(p_subject_hash,statement_timestamp(),1)
    on conflict(subject_hash) do update set
      failures=case when public.bingo_join_failures.window_started_at > statement_timestamp() - interval '10 minutes'
        then public.bingo_join_failures.failures+1 else 1 end,
      window_started_at=case when public.bingo_join_failures.window_started_at > statement_timestamp() - interval '10 minutes'
        then public.bingo_join_failures.window_started_at else statement_timestamp() end;
  return jsonb_build_object('result',outcome);
end
$$;

create or replace function private.bingo_locate_player(p_token_hash text, out me public.bingo_participants, out r public.bingo_rooms)
language plpgsql set search_path=''
as $$
begin
  select * into me from public.bingo_participants where token_hash=p_token_hash;
  if me.id is not null then
    select * into r from public.bingo_rooms where id=me.room_id;
  end if;
end
$$;
revoke all on function private.bingo_locate_player(text) from public,anon,authenticated;

create or replace function public.bingo_player_state(p_token_hash text, p_since_version bigint, p_since_me bigint)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  r public.bingo_rooms;
  me public.bingo_participants;
begin
  select * into located from private.bingo_locate_player(p_token_hash);
  me := located.me; r := located.r;
  if me.id is null or r.id is null then return jsonb_build_object('result','not-found'); end if;
  if me.status='removed' then return jsonb_build_object('result','removed'); end if;
  if r.status<>'open' then return jsonb_build_object('result','closed'); end if;
  if r.expires_at <= statement_timestamp() then return jsonb_build_object('result','expired'); end if;
  if r.phase_deadline is not null and r.phase_deadline <= statement_timestamp() then
    select * into r from public.bingo_rooms where id=r.id for update;
    r := private.bingo_advance(r);
  end if;
  -- Presence heartbeat, at most every five seconds.
  if me.seen_at < statement_timestamp() - interval '5 seconds' then
    update public.bingo_participants set seen_at=statement_timestamp() where id=me.id returning * into me;
  end if;
  if p_since_version is not null and p_since_me is not null and p_since_version=r.version and p_since_me=me.version then
    return jsonb_build_object('result','unchanged','version',r.version,'meVersion',me.version,'serverNow',private.bingo_ms(statement_timestamp()));
  end if;
  return private.bingo_player_view(r,me,'ok');
end
$$;

-- Store a card dealt by the application server from this game's seed and
-- pool. Refused unless it is exactly the room's pool (same multiset) with
-- the Free Space where the settings say, and only once per game.
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
  if r.game_number<>p_game or r.pool is null then return private.bingo_player_view(r,me,'stale'); end if;
  if me.board is not null and me.game_number=r.game_number then return private.bingo_player_view(r,me,'ok'); end if;
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
  update public.bingo_participants set board=p_board, game_number=r.game_number, version=version+1
    where id=me.id returning * into me;
  return private.bingo_player_view(r,me,'ok');
end
$$;

-- Lock order everywhere: room row first, then the participant row.
create or replace function private.bingo_lock_player(p_token_hash text, out me public.bingo_participants, out r public.bingo_rooms)
language plpgsql set search_path=''
as $$
declare
  v_room_id uuid;
begin
  select p.room_id into v_room_id from public.bingo_participants p where p.token_hash=p_token_hash;
  if v_room_id is null then return; end if;
  select * into r from public.bingo_rooms where id=v_room_id for update;
  select * into me from public.bingo_participants where token_hash=p_token_hash for update;
end
$$;
revoke all on function private.bingo_lock_player(text) from public,anon,authenticated;

create or replace function public.bingo_mark(p_token_hash text, p_game integer, p_question integer, p_cell integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  r public.bingo_rooms;
  me public.bingo_participants;
  attempts_now integer;
  correct boolean;
begin
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
  -- One normal mark per question, even when two cells match.
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

create or replace function public.bingo_free_space(p_token_hash text, p_game integer, p_question integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  r public.bingo_rooms;
  me public.bingo_participants;
begin
  select * into located from private.bingo_lock_player(p_token_hash);
  me := located.me; r := located.r;
  if me.id is null or r.id is null then return jsonb_build_object('result','not-found'); end if;
  if me.status<>'active' then return jsonb_build_object('result','removed'); end if;
  if r.status<>'open' then return jsonb_build_object('result','closed'); end if;
  if r.expires_at <= statement_timestamp() then return jsonb_build_object('result','expired'); end if;
  r := private.bingo_advance(r);
  if r.game_number<>p_game then return private.bingo_player_view(r,me,'stale'); end if;
  if r.settings->'freeSpace' is distinct from 'true'::jsonb then return private.bingo_player_view(r,me,'no-free-space'); end if;
  if r.phase='PAUSED' then return private.bingo_player_view(r,me,'paused'); end if;
  if r.phase<>'QUESTION_ACTIVE' then return private.bingo_player_view(r,me,'not-active'); end if;
  if r.question_number<>p_question then return private.bingo_player_view(r,me,'stale'); end if;
  if r.phase_deadline is not null and statement_timestamp() > r.phase_deadline then return private.bingo_player_view(r,me,'too-late'); end if;
  if me.board is null or me.game_number<>r.game_number then return private.bingo_player_view(r,me,'no-card'); end if;
  if me.has_won then return private.bingo_player_view(r,me,'already-won'); end if;
  if me.free_used then return private.bingo_player_view(r,me,'free-used'); end if;
  update public.bingo_participants set marks=marks | (1 << 12), free_used=true, version=version+1
    where id=me.id returning * into me;
  r := private.bingo_apply_progress(r, me, true);
  select * into me from public.bingo_participants where id=me.id;
  return private.bingo_player_view(r,me,'free-space');
end
$$;

create or replace function public.bingo_leave(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
begin
  select * into located from private.bingo_lock_player(p_token_hash);
  if (located.me).id is null then return jsonb_build_object('result','left'); end if;
  delete from public.bingo_participants where id=(located.me).id;
  if (located.r).status='open' then
    update public.bingo_rooms set leaderboard=private.bingo_leaderboard((located.r).id), version=version+1, updated_at=statement_timestamp()
      where id=(located.r).id;
  end if;
  return jsonb_build_object('result','left');
end
$$;

revoke all on function public.bingo_create_room(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.bingo_host_resume(text,text) from public,anon,authenticated;
revoke all on function public.bingo_host_state(text,text,bigint) from public,anon,authenticated;
revoke all on function public.bingo_host_start(text,text,text,jsonb,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function public.bingo_host_command(text,text,text,jsonb) from public,anon,authenticated;
revoke all on function public.bingo_join_room(text,text,text,text) from public,anon,authenticated;
revoke all on function public.bingo_player_state(text,bigint,bigint) from public,anon,authenticated;
revoke all on function public.bingo_set_board(text,integer,jsonb) from public,anon,authenticated;
revoke all on function public.bingo_mark(text,integer,integer,integer) from public,anon,authenticated;
revoke all on function public.bingo_free_space(text,integer,integer) from public,anon,authenticated;
revoke all on function public.bingo_leave(text) from public,anon,authenticated;
grant execute on function public.bingo_create_room(text,text,text,jsonb) to service_role;
grant execute on function public.bingo_host_resume(text,text) to service_role;
grant execute on function public.bingo_host_state(text,text,bigint) to service_role;
grant execute on function public.bingo_host_start(text,text,text,jsonb,text,jsonb,jsonb) to service_role;
grant execute on function public.bingo_host_command(text,text,text,jsonb) to service_role;
grant execute on function public.bingo_join_room(text,text,text,text) to service_role;
grant execute on function public.bingo_player_state(text,bigint,bigint) to service_role;
grant execute on function public.bingo_set_board(text,integer,jsonb) to service_role;
grant execute on function public.bingo_mark(text,integer,integer,integer) to service_role;
grant execute on function public.bingo_free_space(text,integer,integer) to service_role;
grant execute on function public.bingo_leave(text) to service_role;
