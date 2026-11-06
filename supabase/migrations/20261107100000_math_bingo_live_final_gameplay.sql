-- Math Bingo Live — final gameplay (follow-up to 20261106120000; staging/owner review).
--
-- 1. No question repeats in a game. The application server builds each deck
--    from canonical question identities ("addition:5:7" is both 5 + 7 and
--    7 + 5; "subtraction:14:6"; "division:36:6"; "fraction:2:3") and uses
--    each at most once. Start now REFUSES a deck in which any identity
--    repeats, any identity disagrees with the question it labels (text,
--    operands, answer, canonical operand order, mode), any call matches no
--    card value, or any card value can never be called
--    (private.bingo_deck_valid). The Called history is the deck prefix, so
--    the history the screens show and the rule that prevents repeats are one
--    structure. A deck may now be shorter than the pool: in Fraction Bingo
--    each fraction is called once.
-- 2. Optional player emoji ("🦁 Ava"): a curated allowlist checked here and
--    by the server, stored on the player's row (so it survives refresh and
--    reconnect), shown in standings, winners and announcements, and cleared
--    when the teacher removes a player.
--
-- Answer isolation was audited at the same time: every mark is keyed by the
-- player's own row (participant id) and validated against that player's own
-- card; there is no room-wide or answer-wide uniqueness (indexes: open room
-- code, host token, player token, active name per room, placement per room).
-- The new pgTAP suite proves 50 players can mark the same answer to the same
-- question.
--
-- Additive and compatible with the v1.2.35 application: new nullable column,
-- new 5-argument bingo_join_room (the 4-argument one delegates to it), the
-- seven-argument bingo_host_start untouched. Rollback:
-- supabase/rollback/math_bingo_live_final_gameplay.sql.

-- 1. Player emoji --------------------------------------------------------------------------
-- Mirrors public/internal-games/math-bingo-live/src/engine/emoji.js (the engine tests compare the two).
create or replace function private.bingo_emoji_valid(p text)
returns boolean language sql immutable set search_path=''
as $$
  select p is null or p = any (array['🐶','🐱','🦁','🐯','🐼','🐸','🐵','🐧','🦊','🐙','🚀','🌟','⭐','🌙','🌈','⚡','🔥','💎','⚽','🏀','🏈','⚾','🎾','🍕','🍎','🍉','🍓','🍩','📚','✏️','🎨','🧠','🧩']::text[])
$$;
revoke all on function private.bingo_emoji_valid(text) from public,anon,authenticated;

alter table public.bingo_participants add column if not exists emoji text;
alter table public.bingo_participants drop constraint if exists bingo_participants_emoji_check;
alter table public.bingo_participants add constraint bingo_participants_emoji_check check (private.bingo_emoji_valid(emoji));

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

create or replace function public.bingo_join_room(p_code text, p_name text, p_token_hash text, p_subject_hash text, p_emoji text)
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
  -- The optional emoji: one of the curated choices, or none.
  if not private.bingo_emoji_valid(p_emoji) then return jsonb_build_object('result','invalid-emoji'); end if;

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
    insert into public.bingo_participants(room_id,token_hash,display_name,name_key,game_number,emoji)
      values(r.id,p_token_hash,candidate,lower(candidate),r.game_number,p_emoji)
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
revoke all on function public.bingo_join_room(text,text,text,text,text) from public,anon,authenticated;
grant execute on function public.bingo_join_room(text,text,text,text,text) to service_role;

-- The v1.2.35 signature: a join without an emoji.
create or replace function public.bingo_join_room(p_code text, p_name text, p_token_hash text, p_subject_hash text)
returns jsonb language sql security definer set search_path=''
as $$ select public.bingo_join_room(p_code, p_name, p_token_hash, p_subject_hash, null::text) $$;
revoke all on function public.bingo_join_room(text,text,text,text) from public,anon,authenticated;
grant execute on function public.bingo_join_room(text,text,text,text) to service_role;

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

-- 2. Unique, checked decks -------------------------------------------------------------------
-- A deck entry: {q: identity, t: text, s: spoken, k: kind, n, d}. Integer
-- arithmetic only; the symbols are the ones the engine prints (− × ÷).
create or replace function private.bingo_deck_valid(p_deck jsonb, p_pool jsonb, p_settings jsonb)
returns boolean language plpgsql immutable set search_path=''
as $$
declare
  e jsonb;
  parts text[];
  op text;
  a numeric;
  b numeric;
  sym text;
  expected numeric;
  mode text := p_settings->>'mode';
begin
  if jsonb_typeof(p_deck) is distinct from 'array' or jsonb_array_length(p_deck) not between 1 and 100 then return false; end if;
  if jsonb_typeof(p_pool) is distinct from 'array' then return false; end if;
  for e in select x from jsonb_array_elements(p_deck) x loop
    if jsonb_typeof(e) is distinct from 'object' or jsonb_typeof(e->'q') is distinct from 'string' or jsonb_typeof(e->'t') is distinct from 'string'
       or jsonb_typeof(e->'s') is distinct from 'string' or jsonb_typeof(e->'n') is distinct from 'number' or jsonb_typeof(e->'d') is distinct from 'number'
       or (e->>'n') !~ '^[0-9]{1,4}$' or (e->>'d') !~ '^[1-9][0-9]{0,2}$' then
      return false;
    end if;
    if (e->>'q') ~ '^(addition|subtraction|multiplication|division):[0-9]{1,4}:[0-9]{1,4}$' then
      parts := string_to_array(e->>'q', ':');
      op := parts[1]; a := parts[2]::numeric; b := parts[3]::numeric;
      if e->>'k' is distinct from 'arithmetic' or (e->>'d') <> '1' then return false; end if;
      if mode = 'fractions' or (mode <> 'mixed' and mode <> op) then return false; end if;
      sym := case op when 'addition' then '+' when 'subtraction' then '−' when 'multiplication' then '×' else '÷' end;
      if op in ('addition','multiplication') then
        -- Canonical order: 5 + 7 and 7 + 5 are one question, named addition:5:7.
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
    elsif (e->>'q') ~ '^fraction:[0-9]{1,3}:[1-9][0-9]{0,2}$' then
      parts := string_to_array(e->>'q', ':');
      if mode <> 'fractions' or e->>'k' is distinct from 'fraction' or (e->>'n') <> parts[2] or (e->>'d') <> parts[3]
         or (e->>'t') <> (parts[2]||'/'||parts[3]) or parts[2]::integer >= parts[3]::integer or parts[2]::integer < 1 then
        return false;
      end if;
    else
      return false;
    end if;
  end loop;
  -- No question twice in one game.
  if (select count(distinct x->>'q') from jsonb_array_elements(p_deck) x) <> jsonb_array_length(p_deck) then return false; end if;
  -- Every call can be marked on a card, and every card value can be called.
  if exists (select 1 from jsonb_array_elements(p_deck) d
             where not exists (select 1 from jsonb_array_elements(p_pool) c where private.bingo_matches(p_settings, d, c))) then
    return false;
  end if;
  if exists (select 1 from jsonb_array_elements(p_pool) c
             where not exists (select 1 from jsonb_array_elements(p_deck) d where private.bingo_matches(p_settings, d, c))) then
    return false;
  end if;
  return true;
end
$$;
revoke all on function private.bingo_deck_valid(jsonb,jsonb,jsonb) from public,anon,authenticated;

create or replace function public.bingo_host_start(
  p_owner_hash text, p_token_hash text, p_kind text, p_settings jsonb, p_seed text, p_pool jsonb, p_deck jsonb, p_boards jsonb
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.bingo_rooms;
  expected_pool integer;
  free_on boolean;
  boards jsonb := case when jsonb_typeof(p_boards)='object' then p_boards else '{}'::jsonb end;
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
  free_on := r.settings->'freeSpace'='true';
  expected_pool := case when free_on then 24 else 25 end;
  -- The deck may be shorter than the pool (Fraction Bingo calls each fraction
  -- once), but every question in it is unique and checked (bingo_deck_valid).
  if p_seed !~ '^[0-9a-f]{32}$' or jsonb_typeof(p_pool)<>'array' or jsonb_array_length(p_pool)<>expected_pool
     or not private.bingo_deck_valid(p_deck, p_pool, r.settings) then
    return private.bingo_host_view(r,'invalid-game');
  end if;
  -- New game for everyone in the room; a valid dealt card is stored at once.
  update public.bingo_participants p set
    game_number=r.game_number+1,
    board=case when p.status='active' and boards ? (p.id::text) and private.bingo_board_valid(boards->(p.id::text), p_pool, free_on)
      then boards->(p.id::text) else null end,
    marks=0, free_used=false, mark_question=0, attempt_question=0, attempts=0,
    correct_count=0, response_ms=0, has_won=false, placement=null, win_line=null, best_count=0, best_type=null,
    one_away=false, version=version+1
    where p.room_id=r.id;
  update public.bingo_rooms set
    game_number=game_number+1, game_seed=p_seed, pool=p_pool, deck=p_deck, question_number=0, question_started_at=null,
    phase='COUNTDOWN', paused_phase=null, paused_remaining_ms=null,
    phase_started_at=statement_timestamp(), phase_deadline=statement_timestamp()+interval '3 seconds',
    winner_count=0, winners='[]'::jsonb, events='[]'::jsonb, completed_reason=null,
    leaderboard=private.bingo_leaderboard(r.id),
    expires_at=greatest(expires_at, statement_timestamp()+interval '3 hours'),
    version=version+1, updated_at=statement_timestamp()
    where id=r.id returning * into r;
  return private.bingo_host_view(r,'started') || jsonb_build_object(
    'dealt',(select count(*) from public.bingo_participants p where p.room_id=r.id and p.status='active' and p.board is not null));
end
$$;
revoke all on function public.bingo_host_start(text,text,text,jsonb,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.bingo_host_start(text,text,text,jsonb,text,jsonb,jsonb,jsonb) to service_role;
