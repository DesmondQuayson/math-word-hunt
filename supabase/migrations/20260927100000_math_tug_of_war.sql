-- Math Tug of War V1.
--
-- 1. Registers the source-controlled internal game in the trusted catalog.
--    The application deployment is registry-gated (an unregistered internal
--    key is dropped from the catalog), so this row is the public cutover.
-- 2. Adds the authoritative Online Match store. Browsers never touch these
--    tables: RLS is forced, anon/authenticated hold no grants, and every
--    function is SECURITY DEFINER with EXECUTE for service_role only. The
--    application server validates answers against questions it regenerates
--    from the secret per-room seed and asks these functions to apply them
--    under a row lock, so two near-simultaneous correct answers are both
--    applied and a replayed or stale submission can never score twice.
--    Room data is ephemeral: rooms expire, and anything older than 24 hours
--    is deleted on the next room creation. No names reach analytics.

do $migration$
declare
  tug_id uuid;
  existing_slug_conflict bigint;
  next_order smallint;
begin
  select count(*) into existing_slug_conflict
  from public.game_catalog_entries
  where slug='math-tug-of-war' and stable_key<>'math-tug-of-war';
  if existing_slug_conflict<>0 then
    raise exception 'Math Tug of War slug belongs to another catalog identity';
  end if;

  select coalesce(
    (select display_order from public.game_catalog_entries where stable_key='math-tug-of-war' and status='published'),
    (select max(display_order)+1 from public.game_catalog_entries where status='published'),
    1
  ) into next_order;

  insert into public.game_catalog_entries(
    stable_key,slug,title,description,launch_type,thumbnail_reference,
    recommended_grade_min,recommended_grade_max,skills,topics,tags,difficulty,status,display_order,version,
    publication_metadata,rollback_metadata
  ) values(
    'math-tug-of-war','math-tug-of-war','Math Tug of War',
    'Solve the math. Pull the rope. Beat the other side!',
    'internal','builtin:math-tug-of-war',1,7,
    array['absolute-value','addition','integers','mental-math','multiplication','opposites','subtraction'],
    array['arithmetic','fact-fluency','integers'],
    array['classroom-game','fact-fluency','integers','smart-board','team-game','tug-of-war','two-player'],
    'mixed','published',next_order,'1.0.0',
    jsonb_build_object(
      'internal_registry_key','math-tug-of-war',
      'internal_route','/games/math-tug-of-war/play',
      'implementation_version','1.0.0',
      'modes',jsonb_build_array('vs-robot','two-teams','online-match'),
      'released_at',statement_timestamp(),
      'release_state','published'
    ),
    jsonb_build_object('strategy','catalog version rollback; archive the entry to withdraw the card')
  )
  on conflict(stable_key) do update set
    resource_id=null,
    package_id=null,
    slug='math-tug-of-war',
    title='Math Tug of War',
    description=excluded.description,
    launch_type='internal',
    canonical_route=null,
    external_url=null,
    external_allowed_host=null,
    thumbnail_reference='builtin:math-tug-of-war',
    recommended_grade_min=1,
    recommended_grade_max=7,
    skills=excluded.skills,
    topics=excluded.topics,
    tags=excluded.tags,
    difficulty='mixed',
    status='published',
    display_order=next_order,
    version='1.0.0',
    publication_metadata=public.game_catalog_entries.publication_metadata || excluded.publication_metadata,
    rollback_metadata=public.game_catalog_entries.rollback_metadata || excluded.rollback_metadata,
    lock_version=public.game_catalog_entries.lock_version+1
  returning id into tug_id;

  perform private.record_game_catalog_version(tug_id,null,null);
end
$migration$;

create table public.tug_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$'),
  skill text not null check (skill in ('addition','subtraction','multiplication','integers','opposite','absolute')),
  question_seed text not null check (question_seed ~ '^[0-9a-f]{32}$'),
  status text not null default 'waiting' check (status in ('waiting','playing','won','closed')),
  round integer not null default 0 check (round between 0 and 10000),
  position smallint not null default 0 check (position between -5 and 5),
  winner text check (winner in ('turquoise','pink')),
  host_name text not null check (char_length(host_name) between 1 and 20),
  guest_name text check (guest_name is null or char_length(guest_name) between 1 and 20),
  host_token_hash text not null check (host_token_hash ~ '^[0-9a-f]{64}$'),
  guest_token_hash text check (guest_token_hash is null or guest_token_hash ~ '^[0-9a-f]{64}$'),
  host_owner_hash text not null check (host_owner_hash ~ '^[0-9a-f]{64}$'),
  guest_owner_hash text check (guest_owner_hash is null or guest_owner_hash ~ '^[0-9a-f]{64}$'),
  host_question_index integer not null default 0 check (host_question_index >= 0),
  guest_question_index integer not null default 0 check (guest_question_index >= 0),
  host_pulls integer not null default 0 check (host_pulls >= 0),
  guest_pulls integer not null default 0 check (guest_pulls >= 0),
  host_seen_at timestamptz not null default statement_timestamp(),
  guest_seen_at timestamptz,
  host_rematch boolean not null default false,
  guest_rematch boolean not null default false,
  closed_by text check (closed_by in ('turquoise','pink','expired')),
  version bigint not null default 1,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  check ((status='won') = (winner is not null)),
  check (status in ('waiting','closed') or guest_token_hash is not null)
);
create unique index tug_rooms_live_code_idx on public.tug_rooms(code) where status in ('waiting','playing','won');
create index tug_rooms_owner_created_idx on public.tug_rooms(host_owner_hash,created_at);
create index tug_rooms_created_idx on public.tug_rooms(created_at);

alter table public.tug_rooms enable row level security;
alter table public.tug_rooms force row level security;
revoke all on table public.tug_rooms from public,anon,authenticated;
grant select,insert,update,delete on table public.tug_rooms to service_role;

create table public.tug_join_failures (
  owner_hash text primary key check (owner_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz not null default statement_timestamp(),
  failures integer not null default 0 check (failures >= 0)
);
alter table public.tug_join_failures enable row level security;
alter table public.tug_join_failures force row level security;
revoke all on table public.tug_join_failures from public,anon,authenticated;
grant select,insert,update,delete on table public.tug_join_failures to service_role;

-- Opponent presence: a player seen within this many seconds is connected.
create or replace function private.tug_presence(p_seen timestamptz)
returns text language sql stable set search_path=''
as $$
  select case
    when p_seen is null then 'waiting'
    when p_seen > statement_timestamp() - interval '6 seconds' then 'connected'
    when p_seen > statement_timestamp() - interval '30 seconds' then 'reconnecting'
    else 'disconnected'
  end
$$;
revoke all on function private.tug_presence(timestamptz) from public,anon,authenticated;

-- The one shape every function returns. Token hashes never leave the database.
-- The question seed is returned to the trusted application server only (these
-- functions are service_role-only); the API builds a whitelisted browser
-- payload that never includes it.
create or replace function private.tug_room_view(p_room public.tug_rooms, p_team text, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'result',p_result,
    'code',p_room.code,
    'skill',p_room.skill,
    'status',case when p_room.status in ('waiting','playing','won') and p_room.expires_at <= statement_timestamp() then 'expired' else p_room.status end,
    'round',p_room.round,
    'position',p_room.position,
    'winner',p_room.winner,
    'version',p_room.version,
    'team',p_team,
    'names',jsonb_build_object('turquoise',p_room.host_name,'pink',p_room.guest_name),
    'pulls',jsonb_build_object('turquoise',p_room.host_pulls,'pink',p_room.guest_pulls),
    'questionIndex',case p_team when 'turquoise' then p_room.host_question_index when 'pink' then p_room.guest_question_index end,
    'presence',jsonb_build_object(
      'turquoise',private.tug_presence(p_room.host_seen_at),
      'pink',private.tug_presence(p_room.guest_seen_at)
    ),
    'rematch',jsonb_build_object('turquoise',p_room.host_rematch,'pink',p_room.guest_rematch),
    'closedBy',p_room.closed_by,
    'expiresAt',p_room.expires_at,
    'seed',p_room.question_seed
  )
$$;
revoke all on function private.tug_room_view(public.tug_rooms,text,text) from public,anon,authenticated;

create or replace function public.tug_create_room(
  p_code text, p_skill text, p_seed text, p_host_name text, p_host_token_hash text, p_owner_hash text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  room public.tug_rooms%rowtype;
  recent bigint;
begin
  -- Opportunistic cleanup keeps room data (including names) ephemeral.
  delete from public.tug_rooms where created_at < statement_timestamp() - interval '24 hours';
  delete from public.tug_join_failures where window_started_at < statement_timestamp() - interval '1 hour';

  select count(*) into recent from public.tug_rooms
    where host_owner_hash=p_owner_hash and created_at > statement_timestamp() - interval '10 minutes';
  if recent >= 10 then
    return jsonb_build_object('result','rate-limited');
  end if;

  -- A code whose earlier room has expired may be reused: retire it first.
  update public.tug_rooms set status='closed', closed_by='expired', version=version+1, updated_at=statement_timestamp()
    where code=p_code and status in ('waiting','playing','won') and expires_at <= statement_timestamp();
  if exists (select 1 from public.tug_rooms where code=p_code and status in ('waiting','playing','won')) then
    return jsonb_build_object('result','code-taken');
  end if;

  insert into public.tug_rooms(code,skill,question_seed,host_name,host_token_hash,host_owner_hash,expires_at)
    values(p_code,p_skill,p_seed,p_host_name,p_host_token_hash,p_owner_hash,statement_timestamp()+interval '20 minutes')
    returning * into room;
  return private.tug_room_view(room,'turquoise','created');
end
$$;

create or replace function public.tug_join_room(
  p_code text, p_guest_name text, p_guest_token_hash text, p_owner_hash text
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  room public.tug_rooms%rowtype;
  failure_row public.tug_join_failures%rowtype;
  outcome text;
begin
  select * into failure_row from public.tug_join_failures where owner_hash=p_owner_hash for update;
  if failure_row.owner_hash is not null and failure_row.window_started_at > statement_timestamp() - interval '10 minutes'
     and failure_row.failures >= 20 then
    return jsonb_build_object('result','rate-limited');
  end if;

  select * into room from public.tug_rooms
    where code=p_code and status in ('waiting','playing','won') for update;

  if room.id is null then
    outcome := 'not-found';
  elsif room.expires_at <= statement_timestamp() then
    outcome := 'expired';
  elsif room.guest_token_hash is not null then
    outcome := 'full';
  elsif room.host_token_hash = p_guest_token_hash then
    outcome := 'already-host';
  else
    update public.tug_rooms set
      guest_name=p_guest_name, guest_token_hash=p_guest_token_hash, guest_owner_hash=p_owner_hash,
      guest_seen_at=statement_timestamp(), status='playing', round=1,
      -- A started match gets its full playing window.
      expires_at=greatest(expires_at, statement_timestamp()+interval '3 hours'),
      version=version+1, updated_at=statement_timestamp()
      where id=room.id returning * into room;
    return private.tug_room_view(room,'pink','joined');
  end if;

  insert into public.tug_join_failures(owner_hash,window_started_at,failures) values(p_owner_hash,statement_timestamp(),1)
    on conflict(owner_hash) do update set
      failures=case when public.tug_join_failures.window_started_at > statement_timestamp() - interval '10 minutes'
        then public.tug_join_failures.failures+1 else 1 end,
      window_started_at=case when public.tug_join_failures.window_started_at > statement_timestamp() - interval '10 minutes'
        then public.tug_join_failures.window_started_at else statement_timestamp() end;
  return jsonb_build_object('result',outcome);
end
$$;

-- Resolve a caller's room and team from the room code and token hash.
create or replace function private.tug_locate(p_code text, p_token_hash text, out room public.tug_rooms, out team text)
language plpgsql set search_path=''
as $$
begin
  select * into room from public.tug_rooms
    where code=p_code and status in ('waiting','playing','won','closed')
      and (host_token_hash=p_token_hash or guest_token_hash=p_token_hash)
    order by created_at desc limit 1 for update;
  team := case
    when room.id is null then null
    when room.host_token_hash=p_token_hash then 'turquoise'
    else 'pink'
  end;
end
$$;
revoke all on function private.tug_locate(text,text) from public,anon,authenticated;

create or replace function public.tug_room_state(p_code text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  room public.tug_rooms%rowtype;
begin
  select * into located from private.tug_locate(p_code,p_token_hash);
  if located.team is null then return jsonb_build_object('result','not-found'); end if;
  room := located.room;
  if room.status <> 'closed' and room.expires_at > statement_timestamp() then
    -- Presence: refresh the caller's heartbeat at most every two seconds.
    if located.team='turquoise' and room.host_seen_at < statement_timestamp() - interval '2 seconds' then
      update public.tug_rooms set host_seen_at=statement_timestamp() where id=room.id returning * into room;
    elsif located.team='pink' and (room.guest_seen_at is null or room.guest_seen_at < statement_timestamp() - interval '2 seconds') then
      update public.tug_rooms set guest_seen_at=statement_timestamp() where id=room.id returning * into room;
    end if;
  end if;
  return private.tug_room_view(room,located.team,'ok');
end
$$;

create or replace function public.tug_submit_answer(
  p_code text, p_token_hash text, p_round integer, p_question_index integer, p_correct boolean
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  room public.tug_rooms%rowtype;
  my_index integer;
  opponent_seen timestamptz;
  next_position smallint;
begin
  select * into located from private.tug_locate(p_code,p_token_hash);
  if located.team is null then return jsonb_build_object('result','not-found'); end if;
  room := located.room;
  if room.expires_at <= statement_timestamp() then return private.tug_room_view(room,located.team,'expired'); end if;
  if room.status <> 'playing' then return private.tug_room_view(room,located.team,'not-playing'); end if;
  my_index := case located.team when 'turquoise' then room.host_question_index else room.guest_question_index end;
  -- Exactly-once: only the answer to the caller's CURRENT question counts.
  -- A replay, a double tap or an answer from an earlier round is stale.
  if room.round <> p_round or my_index <> p_question_index then
    return private.tug_room_view(room,located.team,'stale');
  end if;
  opponent_seen := case located.team when 'turquoise' then room.guest_seen_at else room.host_seen_at end;
  if opponent_seen is null or opponent_seen <= statement_timestamp() - interval '10 seconds' then
    return private.tug_room_view(room,located.team,'opponent-away');
  end if;

  next_position := room.position;
  if p_correct then
    next_position := greatest(-5, least(5, room.position + case located.team when 'turquoise' then -1 else 1 end));
  end if;

  update public.tug_rooms set
    host_question_index=host_question_index + case when located.team='turquoise' then 1 else 0 end,
    guest_question_index=guest_question_index + case when located.team='pink' then 1 else 0 end,
    host_pulls=host_pulls + case when located.team='turquoise' and p_correct then 1 else 0 end,
    guest_pulls=guest_pulls + case when located.team='pink' and p_correct then 1 else 0 end,
    position=next_position,
    winner=case when next_position<=-5 then 'turquoise' when next_position>=5 then 'pink' else null end,
    status=case when next_position<=-5 or next_position>=5 then 'won' else 'playing' end,
    host_seen_at=case when located.team='turquoise' then statement_timestamp() else host_seen_at end,
    guest_seen_at=case when located.team='pink' then statement_timestamp() else guest_seen_at end,
    version=version+1, updated_at=statement_timestamp()
    where id=room.id returning * into room;
  return private.tug_room_view(room,located.team,case when p_correct then 'correct' else 'incorrect' end);
end
$$;

create or replace function public.tug_request_rematch(p_code text, p_token_hash text, p_round integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  room public.tug_rooms%rowtype;
begin
  select * into located from private.tug_locate(p_code,p_token_hash);
  if located.team is null then return jsonb_build_object('result','not-found'); end if;
  room := located.room;
  if room.expires_at <= statement_timestamp() then return private.tug_room_view(room,located.team,'expired'); end if;
  if room.status <> 'won' or room.round <> p_round then return private.tug_room_view(room,located.team,'stale'); end if;
  update public.tug_rooms set
    host_rematch=host_rematch or located.team='turquoise',
    guest_rematch=guest_rematch or located.team='pink',
    version=version+1, updated_at=statement_timestamp()
    where id=room.id returning * into room;
  if room.host_rematch and room.guest_rematch then
    update public.tug_rooms set
      status='playing', round=round+1, position=0, winner=null,
      host_question_index=0, guest_question_index=0, host_pulls=0, guest_pulls=0,
      host_rematch=false, guest_rematch=false,
      expires_at=greatest(expires_at, statement_timestamp()+interval '1 hour'),
      version=version+1, updated_at=statement_timestamp()
      where id=room.id returning * into room;
    return private.tug_room_view(room,located.team,'rematch-started');
  end if;
  return private.tug_room_view(room,located.team,'rematch-requested');
end
$$;

create or replace function public.tug_leave_room(p_code text, p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  located record;
  room public.tug_rooms%rowtype;
begin
  select * into located from private.tug_locate(p_code,p_token_hash);
  if located.team is null then return jsonb_build_object('result','not-found'); end if;
  room := located.room;
  if room.status <> 'closed' then
    update public.tug_rooms set status='closed', closed_by=located.team, version=version+1, updated_at=statement_timestamp()
      where id=room.id returning * into room;
  end if;
  return private.tug_room_view(room,located.team,'left');
end
$$;

revoke all on function public.tug_create_room(text,text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.tug_join_room(text,text,text,text) from public,anon,authenticated;
revoke all on function public.tug_room_state(text,text) from public,anon,authenticated;
revoke all on function public.tug_submit_answer(text,text,integer,integer,boolean) from public,anon,authenticated;
revoke all on function public.tug_request_rematch(text,text,integer) from public,anon,authenticated;
revoke all on function public.tug_leave_room(text,text) from public,anon,authenticated;
grant execute on function public.tug_create_room(text,text,text,text,text,text) to service_role;
grant execute on function public.tug_join_room(text,text,text,text) to service_role;
grant execute on function public.tug_room_state(text,text) to service_role;
grant execute on function public.tug_submit_answer(text,text,integer,integer,boolean) to service_role;
grant execute on function public.tug_request_rematch(text,text,integer) to service_role;
grant execute on function public.tug_leave_room(text,text) to service_role;
