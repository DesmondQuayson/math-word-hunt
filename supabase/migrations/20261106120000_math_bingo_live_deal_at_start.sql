-- Math Bingo Live — deal every card in the teacher's Start / Play Again call.
--
-- Staging at 50 students: the worst seconds of a game were its first ones.
-- Every student's first poll after Start found "needs a card", so the server
-- dealt it and stored it with bingo_set_board: 50 extra requests in a few
-- seconds, each taking the room row lock, on top of 50 polls and the first
-- Free Space claims. The Supabase API layer queued them (2–9 s spikes, even for
-- an unrelated one-row read).
--
-- Now the application server deals every joined student's card from the new
-- game's secret seed (the same deal as before) and sends them with Start. The
-- database stores each card only if it is exactly this game's pool with the
-- Free Space where the settings say (the same checks bingo_set_board makes);
-- a card that fails, or a student who joins later, falls back to
-- bingo_set_board as before. One request instead of fifty.
--
-- Additive and compatible: the seven-argument bingo_host_start used by
-- v1.2.35 is unchanged; this adds an eight-argument version.
-- Rollback: supabase/rollback/math_bingo_live_room_speed.sql.

-- The card checks of bingo_set_board, as a reusable test.
create or replace function private.bingo_board_valid(p_board jsonb, p_pool jsonb, p_free_on boolean)
returns boolean language plpgsql immutable set search_path=''
as $$
declare
  board_values text[];
  pool_values text[];
begin
  if p_board is null or jsonb_typeof(p_board) is distinct from 'array' or jsonb_array_length(p_board)<>25 then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_board) e where jsonb_typeof(e) is distinct from 'object') then return false; end if;
  if p_free_on and (p_board->12 is distinct from '{"free":true}'::jsonb
      or (select count(*) from jsonb_array_elements(p_board) e where e ? 'free')<>1) then
    return false;
  end if;
  if not p_free_on and exists (select 1 from jsonb_array_elements(p_board) e where e ? 'free') then return false; end if;
  if exists (select 1 from jsonb_array_elements(p_board) e where not (e ? 'free')
      and (jsonb_typeof(e->'n') is distinct from 'number' or jsonb_typeof(e->'d') is distinct from 'number'
        or (e->>'n') !~ '^[0-9]{1,4}$' or (e->>'d') !~ '^[1-9][0-9]{0,2}$')) then
    return false;
  end if;
  select array_agg(x order by x) into board_values
    from (select (e->>'n')||'/'||(e->>'d') as x from jsonb_array_elements(p_board) e where not (e ? 'free')) s;
  select array_agg(x order by x) into pool_values
    from (select (e->>'n')||'/'||(e->>'d') as x from jsonb_array_elements(p_pool) e) s;
  return board_values is not distinct from pool_values;
end
$$;
revoke all on function private.bingo_board_valid(jsonb,jsonb,boolean) from public,anon,authenticated;

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
  if p_seed !~ '^[0-9a-f]{32}$' or jsonb_typeof(p_pool)<>'array' or jsonb_array_length(p_pool)<>expected_pool
     or jsonb_typeof(p_deck)<>'array' or jsonb_array_length(p_deck) not between expected_pool and 100 then
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
