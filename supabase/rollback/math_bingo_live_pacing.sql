-- Rollback for 20261108100000_math_bingo_live_pacing.sql: restores every
-- function exactly as 20261103100000 / 20261106100000 / 20261107100000 left
-- it, removes the scheduler, the paced Start, the question universe table and
-- the pacing columns. Run inside one transaction. Rooms started as paced games
-- must be closed first (their deck is the Called history and has no fixed
-- length); the v1.2.37 application works afterwards.
begin;

drop function if exists public.bingo_host_start_paced(text,text,text,jsonb,text,jsonb,jsonb,jsonb);
drop function if exists private.bingo_schedule(public.bingo_rooms);
drop function if exists private.bingo_paced_board_valid(jsonb,jsonb,jsonb,uuid);
drop function if exists private.bingo_pacing_valid(jsonb);
drop function if exists private.bingo_question_valid(jsonb,jsonb);
drop function if exists private.bingo_cell_class(jsonb,jsonb);

create or replace function private.bingo_leaderboard(p_room_id uuid)
returns jsonb language sql stable set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.display_name,'emoji',s.emoji,'rank',s.ord,'won',s.has_won,'placement',s.placement,
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
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object('type','free-space','name',me.display_name,'emoji',me.emoji,'participant',me.id));
  end if;

  if v_win_id is not null and not me.has_won and (v_cap = 0 or v_count_winners < v_cap) then
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
  elsif v_best = 4 and not me.one_away and not me.has_won then
    v_one_away := true;
    v_seq := v_seq + 1;
    v_events := private.bingo_event(v_events, v_seq, jsonb_build_object('type','one-away','name',me.display_name,'emoji',me.emoji,'participant',me.id));
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

revoke all on function public.bingo_mark(text,integer,integer,integer) from public,anon,authenticated;

grant execute on function public.bingo_mark(text,integer,integer,integer) to service_role;

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

create or replace function private.bingo_player_view(p_room public.bingo_rooms, p_me public.bingo_participants, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select (private.bingo_core(p_room, p_result) - 'leaderboard') || jsonb_build_object(
    'leaderboard',(select coalesce(jsonb_agg(e order by (e->>'rank')::integer), '[]'::jsonb)
      from jsonb_array_elements(private.bingo_leaderboard(p_room.id)) e
      where (e->>'rank')::integer <= 5 or e->>'id' = p_me.id::text),
    'me',jsonb_build_object(
      'id',p_me.id,'name',p_me.display_name,'emoji',p_me.emoji,'status',p_me.status,'gameNumber',p_me.game_number,
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

create or replace function private.bingo_host_view(p_room public.bingo_rooms, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select private.bingo_core(p_room, p_result) || jsonb_build_object(
    'progress',private.bingo_progress(p_room.id),
    'players',(select coalesce(jsonb_agg(jsonb_build_object(
        'id',p.id,'name',p.display_name,'emoji',p.emoji,
        'connected',p.seen_at > statement_timestamp() - interval '12 seconds',
        'hasWon',p.has_won,'placement',p.placement,'best',p.best_count,'bestType',p.best_type,'correct',p.correct_count
      ) order by p.joined_at, p.id), '[]'::jsonb)
      from public.bingo_participants p where p.room_id=p_room.id and p.status='active')
  )
$$;

revoke all on function private.bingo_host_view(public.bingo_rooms,text) from public,anon,authenticated;

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

revoke all on function public.bingo_set_board(text,integer,jsonb) from public,anon,authenticated;

grant execute on function public.bingo_set_board(text,integer,jsonb) to service_role;

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
      emoji=null, board=null, version=version+1
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
    -- A room closed before its first game stays LOBBY (no game ever ran).
    update public.bingo_rooms set status='closed', phase=case when game_number=0 then 'LOBBY' else 'GAME_COMPLETE' end,
      paused_phase=null, paused_remaining_ms=null,
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

revoke all on function public.bingo_host_command(text,text,text,jsonb) from public,anon,authenticated;

grant execute on function public.bingo_host_command(text,text,text,jsonb) to service_role;

drop table if exists public.bingo_room_questions;
alter table public.bingo_participants drop constraint if exists bingo_participants_best_lines_check;
alter table public.bingo_participants drop column if exists best_lines;
alter table public.bingo_participants drop column if exists pending_line;
alter table public.bingo_participants drop column if exists pending_question;
alter table public.bingo_participants drop column if exists pending_seq;
alter table public.bingo_rooms drop constraint if exists bingo_rooms_pacing_check;
alter table public.bingo_rooms drop column if exists pacing;
alter table public.bingo_rooms drop constraint if exists bingo_rooms_deck_check;
alter table public.bingo_rooms drop constraint if exists bingo_rooms_game_state_check;
alter table public.bingo_rooms add constraint bingo_rooms_deck_check
  check (deck is null or (jsonb_typeof(deck)='array' and jsonb_array_length(deck) between 1 and 100));
alter table public.bingo_rooms add constraint bingo_rooms_game_state_check
  check (game_number = 0 or phase in ('LOBBY','GAME_COMPLETE') or (pool is not null and deck is not null and game_seed is not null));

commit;
