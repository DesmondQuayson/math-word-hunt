-- Rollback for 20261106100000_math_bingo_live_room_speed.sql,
-- 20261106110000_math_bingo_live_player_payload.sql and
-- 20261106120000_math_bingo_live_deal_at_start.sql (drops the eight-argument
-- bingo_host_start and bingo_board_valid; the seven-argument one was never changed).
-- Restores the v1.2.35 bodies of bingo_core, bingo_host_view, bingo_player_view,
-- bingo_host_state(text,text,bigint) and bingo_mark verbatim from 20261103100000_math_bingo_live.sql, and drops the
-- four-argument bingo_host_state and bingo_progress. Run it only together with a
-- rollback of the application to a build that calls the three-argument bingo_host_state
-- (v1.2.35 or earlier): the newer application needs the four-argument function.
begin;
drop function if exists public.bingo_host_start(text,text,text,jsonb,text,jsonb,jsonb,jsonb);
drop function if exists private.bingo_board_valid(jsonb,jsonb,boolean);
drop function if exists public.bingo_host_state(text,text,bigint,bigint);

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
drop function if exists private.bingo_progress(uuid);

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
  -- Fast path, no locks: these refusals are final for this question (they
  -- only ever become more true), so one spamming client cannot queue the
  -- whole room behind its requests.
  select * into located from private.bingo_locate_player(p_token_hash);
  if (located.me).id is not null and (located.r).id is not null and (located.me).status='active' and (located.r).status='open'
     and (located.r).game_number=p_game and (located.r).question_number=p_question and (located.r).phase='QUESTION_ACTIVE'
     and ((located.r).phase_deadline is null or (located.r).phase_deadline > statement_timestamp()) then
    if (located.me).has_won then return private.bingo_player_view(located.r,located.me,'already-won'); end if;
    -- Same precedence as the locked path: only for a valid, unmarked, non-Free-Space cell.
    if p_cell between 0 and 24 and not ((located.r).settings->'freeSpace'='true' and p_cell=12)
       and (((located.me).marks >> p_cell) & 1)=0 then
      if (located.me).mark_question=p_question then return private.bingo_player_view(located.r,located.me,'mark-used'); end if;
      if (located.me).attempt_question=p_question and (located.me).attempts >= 2 then
        return private.bingo_player_view(located.r,located.me,'out-of-attempts');
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
revoke all on function public.bingo_host_state(text,text,bigint) from public,anon,authenticated;
revoke all on function public.bingo_mark(text,integer,integer,integer) from public,anon,authenticated;
grant execute on function public.bingo_host_state(text,text,bigint) to service_role;
grant execute on function public.bingo_mark(text,integer,integer,integer) to service_role;
create or replace function private.bingo_player_view(p_room public.bingo_rooms, p_me public.bingo_participants, p_result text)
returns jsonb language sql stable set search_path=''
as $
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
$;
revoke all on function private.bingo_player_view(public.bingo_rooms,public.bingo_participants,text) from public,anon,authenticated;
commit;

