-- Math Race Champions V1 — DRAFT / OWNER REVIEW. Progress, garage and rooms.
--
-- 1. Computer Race progress for signed-in MathNexa accounts: a wallet of virtual
--    Race Dollars with an auditable ledger, owned cars, the equipped car, stage
--    wins and best times, achievements, and the race in progress. Keyed by the
--    internal user id, so it follows the account across devices.
-- 2. Online Race rooms. A room is temporary: guests (room code or QR, no
--    account) exist only inside it, their names and progress are deleted with
--    it, and no wallet, car or stage record is ever created from a room code or
--    a school access code.
-- 3. One six-digit code space for every live game: Math Bingo Live, Polygon
--    Showdown and Math Race Champions can never hold the same open code.
--
-- Race Dollars are fictional. They are earned only here, by winning stages and
-- by achievements, each once per account; they cannot be bought, transferred,
-- withdrawn or exchanged, and nothing in this schema connects them to money.
--
-- Authority model
--   * Browsers never touch these tables: RLS is forced, anon/authenticated hold
--     no grants, and every function is SECURITY DEFINER with EXECUTE for
--     service_role only. The application server is the only caller.
--   * A browser sends a choice (left or right), never a result. The server
--     rebuilds the question from a seed the browser never sees, decides whether
--     the choice was correct, and runs the racing model itself.
--   * Prices and rewards are read here. Nothing a browser sends is a price.
--   * Every answer in an Online Race writes one participant row. No answer ever
--     takes the room row, so a full room never queues behind itself.

-- ------------------------------------------------------------- shared checks

create or replace function private.race_ms(p timestamptz)
returns bigint language sql immutable set search_path=''
as $$ select floor(extract(epoch from p)*1000)::bigint $$;
revoke all on function private.race_ms(timestamptz) from public,anon,authenticated;

-- The shape of a stored racer state (mirrors engine/race.js isRacerState).
create or replace function private.race_state_valid(p jsonb)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(
    jsonb_typeof(p)='object'
    and octet_length(p::text) <= 1024
    and jsonb_typeof(p->'t')='number' and (p->>'t')::numeric >= 0
    and jsonb_typeof(p->'x')='number' and (p->>'x')::numeric >= 0
    and jsonb_typeof(p->'v')='number' and (p->>'v')::numeric >= 0 and (p->>'v')::numeric <= 400
    and (p->>'correct') ~ '^[0-9]{1,5}$'
    and (p->>'wrong') ~ '^[0-9]{1,5}$'
    and (p->>'answered') ~ '^[0-9]{1,5}$'
    and (p->>'answered')::integer = (p->>'correct')::integer + (p->>'wrong')::integer
    and jsonb_typeof(p->'lockedUntil')='number'
    and (jsonb_typeof(p->'finishMs')='null' or (jsonb_typeof(p->'finishMs')='number' and (p->>'finishMs')::numeric >= 0))
    -- The 30-answer rule, held by the database as well: no finish below 30.
    and (jsonb_typeof(p->'finishMs')='null' or (p->>'correct')::integer >= 30),
    false)
$$;
revoke all on function private.race_state_valid(jsonb) from public,anon,authenticated;
-- A table check runs as whoever writes the row; the application server is the only such writer.
grant execute on function private.race_state_valid(jsonb) to service_role;

create or replace function private.race_settings_valid(p jsonb)
returns boolean language sql immutable set search_path=''
as $$
  select coalesce(
    jsonb_typeof(p)='object'
    and p->>'difficulty' in ('beginner','easy','medium','hard','expert')
    and jsonb_typeof(p->'categories')='array'
    and jsonb_array_length(p->'categories') between 1 and 7
    and not exists (
      select 1 from jsonb_array_elements_text(p->'categories') c
      where c not in ('missing-addend','missing-subtrahend','missing-multiplier','missing-divisor','percent-to-decimal','decimal-to-percent','powers')
    ),
    false)
$$;
revoke all on function private.race_settings_valid(jsonb) from public,anon,authenticated;
grant execute on function private.race_settings_valid(jsonb) to service_role;

-- ------------------------------------------------------------------ the garage

-- The cars and their prices. The statistics are the simulation's own numbers
-- (engine/race.js CARS); lib/games/math-race-champions/catalog.test.ts fails if
-- the two ever differ.
create table public.race_cars (
  car_key text primary key check (car_key ~ '^[a-z][a-z0-9-]{2,30}$'),
  name text not null check (name=btrim(name) and char_length(name) between 2 and 40),
  price integer not null check (price >= 0),
  top_speed integer not null check (top_speed between 60 and 400),
  boost integer not null check (boost between 5 and 100),
  decay_milli integer not null check (decay_milli between 10 and 500),
  stage_from smallint not null check (stage_from between 1 and 10),
  stage_to smallint not null check (stage_to between stage_from and 10),
  sort smallint not null,
  active boolean not null default true
);
alter table public.race_cars enable row level security;
alter table public.race_cars force row level security;
revoke all on table public.race_cars from public,anon,authenticated,service_role;
grant select on table public.race_cars to service_role;

insert into public.race_cars(car_key,name,price,top_speed,boost,decay_milli,stage_from,stage_to,sort) values
('starter','Street Starter',0,160,28,100,1,2,1),
('turbo-sprint','Turbo Sprint',2000,185,32,90,3,6,2),
('velocity-gt','Velocity GT',4000,210,36,80,7,8,3),
('thunder-x','Thunder X',6000,240,40,70,9,10,4);

-- Every way to earn Race Dollars other than a stage's first win (engine/race.js ACHIEVEMENTS).
create table public.race_achievements (
  achievement_key text primary key check (achievement_key ~ '^[a-z][a-z0-9-]{2,30}$'),
  reward integer not null check (reward > 0)
);
alter table public.race_achievements enable row level security;
alter table public.race_achievements force row level security;
revoke all on table public.race_achievements from public,anon,authenticated,service_role;
grant select on table public.race_achievements to service_role;

insert into public.race_achievements(achievement_key,reward) values
('first-win',250),('sharp-90',250),('flawless',250),('streak-15',250),('mixed-master',250),
('hard-mode',250),('top-speed',250),('starter-hero',250),('halfway',250),('champion',250);

-- The first-win payment of a stage: 500 Race Dollars, then 100 more per stage.
create or replace function private.race_stage_reward(p_stage integer)
returns integer language sql immutable set search_path=''
as $$ select case when p_stage between 1 and 10 then 400 + 100*p_stage else 0 end $$;
revoke all on function private.race_stage_reward(integer) from public,anon,authenticated;

-- ------------------------------------------------- permanent account progress

create table public.race_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0 check (balance >= 0),
  lifetime_earned integer not null default 0 check (lifetime_earned >= 0),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.race_wallets enable row level security;
alter table public.race_wallets force row level security;
revoke all on table public.race_wallets from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.race_wallets to service_role;

-- Every change to a balance, forever: earned here, spent there. Not even the
-- application server can edit or delete a line.
create table public.race_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  event text not null check (event in ('STAGE_REWARD','ACHIEVEMENT','PURCHASE_CAR')),
  amount integer not null check ((event='PURCHASE_CAR' and amount<0) or (event<>'PURCHASE_CAR' and amount>0)),
  balance_after integer not null check (balance_after >= 0),
  idempotency_key text not null check (char_length(idempotency_key) between 6 and 128),
  car_key text references public.race_cars(car_key) on delete restrict,
  stage smallint check (stage between 1 and 10),
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata)='object' and octet_length(metadata::text) <= 2048),
  created_at timestamptz not null default statement_timestamp(),
  unique (user_id, idempotency_key),
  check ((event='PURCHASE_CAR')=(car_key is not null)),
  check ((event='STAGE_REWARD')=(stage is not null))
);
create index race_ledger_user_idx on public.race_ledger(user_id,id desc);
alter table public.race_ledger enable row level security;
alter table public.race_ledger force row level security;
revoke all on table public.race_ledger from public,anon,authenticated,service_role;
grant select,insert on table public.race_ledger to service_role;

create table public.race_garage (
  user_id uuid not null references auth.users(id) on delete cascade,
  car_key text not null references public.race_cars(car_key) on delete restrict,
  acquired_at timestamptz not null default statement_timestamp(),
  primary key (user_id, car_key)
);
alter table public.race_garage enable row level security;
alter table public.race_garage force row level security;
revoke all on table public.race_garage from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.race_garage to service_role;

create table public.race_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  equipped_car text not null default 'starter' references public.race_cars(car_key) on delete restrict,
  achievements jsonb not null default '{}'::jsonb check (jsonb_typeof(achievements)='object'),
  races_started integer not null default 0 check (races_started >= 0),
  races_finished integer not null default 0 check (races_finished >= 0),
  races_won integer not null default 0 check (races_won >= 0),
  total_correct bigint not null default 0 check (total_correct >= 0),
  total_wrong bigint not null default 0 check (total_wrong >= 0),
  online_played integer not null default 0 check (online_played >= 0),
  online_won integer not null default 0 check (online_won >= 0),
  updated_at timestamptz not null default statement_timestamp()
);
alter table public.race_profiles enable row level security;
alter table public.race_profiles force row level security;
revoke all on table public.race_profiles from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.race_profiles to service_role;

create table public.race_stage_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  stage smallint not null check (stage between 1 and 10),
  plays integer not null default 0 check (plays >= 0),
  wins integer not null default 0 check (wins >= 0),
  first_won_at timestamptz,
  best_time_ms integer check (best_time_ms is null or best_time_ms > 0),
  best_accuracy smallint check (best_accuracy is null or best_accuracy between 0 and 100),
  last_played_at timestamptz not null default statement_timestamp(),
  primary key (user_id, stage),
  check ((wins > 0)=(first_won_at is not null))
);
alter table public.race_stage_progress enable row level security;
alter table public.race_stage_progress force row level security;
revoke all on table public.race_stage_progress from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.race_stage_progress to service_role;

create table public.race_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stage smallint not null check (stage between 1 and 10),
  car_key text not null references public.race_cars(car_key) on delete restrict,
  settings jsonb not null check (private.race_settings_valid(settings)),
  -- Never sent to a browser: the questions and the computer's race come from these.
  seed text not null check (seed ~ '^[0-9a-f]{32}$'),
  cpu_seed text not null check (cpu_seed ~ '^[0-9a-f]{32}$'),
  status text not null default 'active' check (status in ('active','finished','abandoned')),
  state jsonb not null check (private.race_state_valid(state)),
  version integer not null default 1,
  starts_at timestamptz not null,
  outcome jsonb check (outcome is null or (jsonb_typeof(outcome)='object' and octet_length(outcome::text) <= 2048)),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  ended_at timestamptz,
  check ((status='active')=(ended_at is null))
);
create unique index race_runs_one_active_idx on public.race_runs(user_id) where status='active';
create index race_runs_user_idx on public.race_runs(user_id,created_at desc);
alter table public.race_runs enable row level security;
alter table public.race_runs force row level security;
revoke all on table public.race_runs from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.race_runs to service_role;

-- ------------------------------------------------------------ temporary rooms

create table public.race_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code ~ '^[1-9][0-9]{5}$'),
  owner_hash text not null check (owner_hash ~ '^[0-9a-f]{64}$'),
  host_token_hash text not null check (host_token_hash ~ '^[0-9a-f]{64}$'),
  status text not null default 'open' check (status in ('open','closed')),
  phase text not null default 'LOBBY' check (phase in ('LOBBY','RUNNING','ENDED')),
  settings jsonb not null check (private.race_settings_valid(settings)),
  seed text not null check (seed ~ '^[0-9a-f]{32}$'),
  starts_at timestamptz,
  ends_at timestamptz,
  join_locked boolean not null default false,
  version bigint not null default 1,
  standings jsonb not null default '[]'::jsonb check (jsonb_typeof(standings)='array'),
  standings_at timestamptz,
  finalized_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz not null,
  check (phase='LOBBY' or starts_at is not null),
  check (phase<>'ENDED' or ends_at is not null)
);
create unique index race_rooms_open_code_idx on public.race_rooms(code) where status='open';
create unique index race_rooms_host_token_idx on public.race_rooms(host_token_hash);
create index race_rooms_owner_idx on public.race_rooms(owner_hash,created_at);
create index race_rooms_expires_idx on public.race_rooms(expires_at);
alter table public.race_rooms enable row level security;
alter table public.race_rooms force row level security;
revoke all on table public.race_rooms from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.race_rooms to service_role;

create table public.race_participants (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.race_rooms(id) on delete cascade,
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  display_name text not null check (display_name=btrim(display_name) and char_length(display_name) between 2 and 40),
  name_key text not null,
  emoji text check (private.bingo_emoji_valid(emoji)),
  -- Paint only. Every racer's car performs identically.
  colour text not null default 'turquoise' check (colour in ('turquoise','pink','gold','green','red','purple','orange','white')),
  is_creator boolean not null default false,
  -- Set only when the racer was signed in to a MathNexa account at join. It
  -- counts the race in that account's record; it changes nothing in play.
  user_id uuid references auth.users(id) on delete set null,
  status text not null default 'active' check (status in ('active','removed')),
  state jsonb not null check (private.race_state_valid(state)),
  correct integer not null default 0 check (correct >= 0),
  wrong integer not null default 0 check (wrong >= 0),
  distance_m integer not null default 0 check (distance_m >= 0),
  finish_ms integer check (finish_ms is null or finish_ms > 0),
  version integer not null default 1,
  joined_at timestamptz not null default statement_timestamp(),
  seen_at timestamptz not null default statement_timestamp(),
  check (not (is_creator and status='removed')),
  check (finish_ms is null or correct >= 30)
);
create unique index race_participants_token_idx on public.race_participants(token_hash);
create unique index race_participants_active_name_idx on public.race_participants(room_id,name_key) where status='active';
create unique index race_participants_one_creator_idx on public.race_participants(room_id) where is_creator;
create index race_participants_room_idx on public.race_participants(room_id);
alter table public.race_participants enable row level security;
alter table public.race_participants force row level security;
revoke all on table public.race_participants from public,anon,authenticated,service_role;
grant select,insert,update,delete on table public.race_participants to service_role;

-- --------------------------------------------- one code space for every live game

-- A six-digit code identifies exactly one open room across all live games. The
-- same guard now sits on all three room tables; each table's own unique index
-- covers its own codes, and the guard covers the other two.
create or replace function private.live_room_code_guard()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.status='open' then
    perform pg_advisory_xact_lock(hashtext('live-room-code:'||new.code));
    if (tg_table_name<>'polygon_rooms' and exists (select 1 from public.polygon_rooms p where p.code=new.code and p.status='open'))
       or (tg_table_name<>'bingo_rooms' and exists (select 1 from public.bingo_rooms b where b.code=new.code and b.status='open'))
       or (tg_table_name<>'race_rooms' and exists (select 1 from public.race_rooms r where r.code=new.code and r.status='open')) then
      raise unique_violation using message='This room code belongs to another live game.';
    end if;
  end if;
  return new;
end
$$;
revoke all on function private.live_room_code_guard() from public,anon,authenticated;
create trigger polygon_rooms_live_code_guard before insert or update of code on public.polygon_rooms
  for each row execute function private.live_room_code_guard();
create trigger race_rooms_live_code_guard before insert or update of code on public.race_rooms
  for each row execute function private.live_room_code_guard();

-- Which game owns an open code: null, 'math_race_champions', 'polygon_showdown' or 'math_bingo_live'.
create or replace function public.live_room_game_for_code(p_code text)
returns text language sql stable security definer set search_path=''
as $$
  select case
    when exists (select 1 from public.race_rooms r where r.code=p_code and r.status='open' and r.expires_at > statement_timestamp()) then 'math_race_champions'
    when exists (select 1 from public.polygon_rooms p where p.code=p_code and p.status='open' and p.expires_at > statement_timestamp()) then 'polygon_showdown'
    when exists (select 1 from public.bingo_rooms b where b.code=p_code and b.status='open' and b.expires_at > statement_timestamp()) then 'math_bingo_live'
    else null
  end
$$;
revoke all on function public.live_room_game_for_code(text) from public,anon,authenticated;
grant execute on function public.live_room_game_for_code(text) to service_role;

-- --------------------------------------------------------------------- wallet

-- The only way Race Dollars are earned. One credit per idempotency key,
-- whatever is retried: a stage pays once, an achievement pays once.
create or replace function private.race_credit(p_user uuid, p_event text, p_amount integer, p_key text, p_stage integer, p_meta jsonb)
returns jsonb language plpgsql set search_path=''
as $$
declare
  w public.race_wallets;
begin
  insert into public.race_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into w from public.race_wallets where user_id=p_user for update;
  if p_amount <= 0 then
    return jsonb_build_object('credited',0,'balance',w.balance);
  end if;
  if exists (select 1 from public.race_ledger l where l.user_id=p_user and l.idempotency_key=p_key) then
    return jsonb_build_object('credited',0,'balance',w.balance,'duplicate',true);
  end if;
  update public.race_wallets set balance=balance+p_amount, lifetime_earned=lifetime_earned+p_amount, updated_at=statement_timestamp()
    where user_id=p_user returning * into w;
  insert into public.race_ledger(user_id,event,amount,balance_after,idempotency_key,stage,metadata)
    values(p_user,p_event,p_amount,w.balance,p_key,p_stage,coalesce(p_meta,'{}'::jsonb));
  return jsonb_build_object('credited',p_amount,'balance',w.balance);
end
$$;
revoke all on function private.race_credit(uuid,text,integer,text,integer,jsonb) from public,anon,authenticated;

-- Grants each achievement once and pays its reward once. Unknown keys are ignored.
create or replace function private.race_grant_achievements(p_user uuid, p_keys text[])
returns text[] language plpgsql set search_path=''
as $$
declare
  fresh text[];
  item record;
  now_text text := to_char(statement_timestamp() at time zone 'utc','YYYY-MM-DD"T"HH24:MI:SS"Z"');
begin
  if p_keys is null or cardinality(p_keys)=0 then return '{}'::text[]; end if;
  insert into public.race_profiles(user_id) values(p_user) on conflict (user_id) do nothing;
  perform 1 from public.race_profiles where user_id=p_user for update;
  select coalesce(array_agg(a.achievement_key order by a.achievement_key),'{}'::text[]) into fresh
    from public.race_achievements a
    where a.achievement_key = any(p_keys)
      and not ((select achievements from public.race_profiles where user_id=p_user) ? a.achievement_key);
  if cardinality(fresh)>0 then
    update public.race_profiles set
      achievements=achievements || (select jsonb_object_agg(k,now_text) from unnest(fresh) k),
      updated_at=statement_timestamp()
      where user_id=p_user;
    for item in select a.achievement_key, a.reward from public.race_achievements a where a.achievement_key = any(fresh) loop
      perform private.race_credit(p_user,'ACHIEVEMENT',item.reward,'achievement:'||item.achievement_key,null,jsonb_build_object('achievement',item.achievement_key));
    end loop;
  end if;
  return fresh;
end
$$;
revoke all on function private.race_grant_achievements(uuid,text[]) from public,anon,authenticated;

-- The highest stage the account may race: Stage 1, then one past the last stage won in order.
create or replace function private.race_unlocked(p_user uuid)
returns integer language sql stable set search_path=''
as $$
  select least(10, 1 + coalesce((
    select max(s.stage) from public.race_stage_progress s
    where s.user_id=p_user and s.wins>0
      and not exists (
        select 1 from generate_series(1, s.stage) g
        where not exists (select 1 from public.race_stage_progress q where q.user_id=p_user and q.stage=g and q.wins>0)
      )
  ),0))
$$;
revoke all on function private.race_unlocked(uuid) from public,anon,authenticated;

-- ------------------------------------------------------------ account surface

create or replace function public.race_bootstrap(p_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  w public.race_wallets;
  p public.race_profiles;
  run public.race_runs;
begin
  insert into public.race_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
  insert into public.race_profiles(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into w from public.race_wallets where user_id=p_user;
  select * into p from public.race_profiles where user_id=p_user;
  select * into run from public.race_runs where user_id=p_user and status='active';
  return jsonb_build_object(
    'result','ok',
    'balance',w.balance,
    'lifetimeEarned',w.lifetime_earned,
    'equipped',p.equipped_car,
    'owned',(select coalesce(jsonb_agg(g.car_key order by g.acquired_at),'[]'::jsonb) from public.race_garage g where g.user_id=p_user),
    'cars',(select jsonb_agg(jsonb_build_object('key',c.car_key,'name',c.name,'price',c.price,'topSpeed',c.top_speed,'boost',c.boost,'decayMilli',c.decay_milli,'stageFrom',c.stage_from,'stageTo',c.stage_to) order by c.sort)
            from public.race_cars c where c.active),
    'stages',(select coalesce(jsonb_agg(jsonb_build_object('stage',s.stage,'plays',s.plays,'wins',s.wins,'bestTimeMs',s.best_time_ms,'bestAccuracy',s.best_accuracy) order by s.stage),'[]'::jsonb)
              from public.race_stage_progress s where s.user_id=p_user),
    'unlocked',private.race_unlocked(p_user),
    'achievements',p.achievements,
    'stats',jsonb_build_object('started',p.races_started,'finished',p.races_finished,'won',p.races_won,'correct',p.total_correct,'wrong',p.total_wrong,'onlinePlayed',p.online_played,'onlineWon',p.online_won),
    'activeRun',case when run.id is null then null else jsonb_build_object('id',run.id,'stage',run.stage) end
  );
end
$$;

-- A new race against the computer. The car is the account's equipped car, read
-- here; the stage must be unlocked; any race still open is abandoned.
create or replace function public.race_run_start(p_user uuid, p_stage integer, p_settings jsonb, p_seed text, p_cpu_seed text, p_state jsonb, p_countdown_ms integer)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  p public.race_profiles;
  run public.race_runs;
  car text;
begin
  if p_stage is null or p_stage not between 1 and 10 or not private.race_settings_valid(p_settings) or not private.race_state_valid(p_state)
     or p_countdown_ms is null or p_countdown_ms not between 1000 and 15000 then
    return jsonb_build_object('result','invalid-request');
  end if;
  if (p_state->>'answered')::integer<>0 or (p_state->>'x')::numeric<>0 then return jsonb_build_object('result','invalid-request'); end if;
  insert into public.race_profiles(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into p from public.race_profiles where user_id=p_user for update;
  if p_stage > private.race_unlocked(p_user) then return jsonb_build_object('result','stage-locked','unlocked',private.race_unlocked(p_user)); end if;
  car := p.equipped_car;
  if car<>'starter' and not exists (select 1 from public.race_garage g where g.user_id=p_user and g.car_key=car) then car := 'starter'; end if;
  update public.race_runs set status='abandoned', ended_at=statement_timestamp(), updated_at=statement_timestamp() where user_id=p_user and status='active';
  insert into public.race_runs(user_id,stage,car_key,settings,seed,cpu_seed,state,starts_at)
    values(p_user,p_stage,car,p_settings,p_seed,p_cpu_seed,p_state,statement_timestamp()+make_interval(secs => p_countdown_ms/1000.0))
    returning * into run;
  update public.race_profiles set races_started=races_started+1, updated_at=statement_timestamp() where user_id=p_user;
  return jsonb_build_object('result','started','id',run.id,'stage',run.stage,'car',run.car_key,'settings',run.settings,'seed',run.seed,'cpuSeed',run.cpu_seed,
    'state',run.state,'version',run.version,'status',run.status,'startsAtMs',private.race_ms(run.starts_at),'nowMs',private.race_ms(statement_timestamp()));
end
$$;

create or replace function public.race_run_load(p_user uuid, p_run uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  run public.race_runs;
begin
  select * into run from public.race_runs where id=p_run and user_id=p_user;
  if run.id is null then return jsonb_build_object('result','not-found'); end if;
  return jsonb_build_object('result','ok','id',run.id,'stage',run.stage,'car',run.car_key,'settings',run.settings,'seed',run.seed,'cpuSeed',run.cpu_seed,
    'state',run.state,'version',run.version,'status',run.status,'outcome',run.outcome,
    'startsAtMs',private.race_ms(run.starts_at),'nowMs',private.race_ms(statement_timestamp()));
end
$$;

-- One answer's worth of progress, compare-and-swapped. Progress never goes back.
create or replace function public.race_run_commit(p_user uuid, p_run uuid, p_version integer, p_state jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  new_version integer;
begin
  if not private.race_state_valid(p_state) or jsonb_typeof(p_state->'finishMs')<>'null' then return jsonb_build_object('result','invalid-request'); end if;
  update public.race_runs r set state=p_state, version=r.version+1, updated_at=statement_timestamp()
    where r.id=p_run and r.user_id=p_user and r.status='active' and r.version=p_version
      and statement_timestamp() >= r.starts_at
      and (p_state->>'answered')::integer >= (r.state->>'answered')::integer
      and (p_state->>'correct')::integer >= (r.state->>'correct')::integer
      and (p_state->>'x')::numeric >= (r.state->>'x')::numeric
    returning r.version into new_version;
  if new_version is null then return jsonb_build_object('result','conflict'); end if;
  return jsonb_build_object('result','ok','version',new_version);
end
$$;

-- Closes a race, once, and pays what it earned, once. The stage reward amount
-- and every achievement reward are read here; the application says only what
-- happened (won or not, time, accuracy, which achievements the race itself earned).
create or replace function public.race_run_finish(
  p_user uuid, p_run uuid, p_version integer, p_state jsonb, p_won boolean, p_time_ms integer, p_accuracy integer, p_achievements text[], p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  run public.race_runs;
  first_win boolean := false;
  payout jsonb := jsonb_build_object('credited',0);
  fresh text[];
  keys text[] := coalesce(p_achievements,'{}'::text[]);
  balance integer;
begin
  if not private.race_state_valid(p_state) or p_won is null or p_accuracy is null or p_accuracy not between 0 and 100
     or jsonb_typeof(p_outcome)<>'object' or octet_length(p_outcome::text)>2048 then
    return jsonb_build_object('result','invalid-request');
  end if;
  -- A win needs a finish, and a finish needs 30 correct answers (race_state_valid).
  if p_won and (jsonb_typeof(p_state->'finishMs')='null' or p_time_ms is null or p_time_ms <= 0) then return jsonb_build_object('result','invalid-request'); end if;
  select * into run from public.race_runs where id=p_run and user_id=p_user for update;
  if run.id is null then return jsonb_build_object('result','not-found'); end if;
  if run.status<>'active' then
    select w.balance into balance from public.race_wallets w where w.user_id=p_user;
    return jsonb_build_object('result','already-finished','outcome',run.outcome,'balance',coalesce(balance,0),'unlocked',private.race_unlocked(p_user));
  end if;
  if run.version<>p_version then return jsonb_build_object('result','conflict'); end if;

  update public.race_runs set status='finished', state=p_state, version=version+1, outcome=p_outcome, ended_at=statement_timestamp(), updated_at=statement_timestamp()
    where id=run.id;

  insert into public.race_stage_progress(user_id,stage,plays) values(p_user,run.stage,0) on conflict (user_id,stage) do nothing;
  if p_won then
    select wins=0 into first_win from public.race_stage_progress where user_id=p_user and stage=run.stage for update;
    update public.race_stage_progress set
      plays=plays+1, wins=wins+1,
      first_won_at=coalesce(first_won_at,statement_timestamp()),
      best_time_ms=least(coalesce(best_time_ms,p_time_ms),p_time_ms),
      best_accuracy=greatest(coalesce(best_accuracy,0),p_accuracy),
      last_played_at=statement_timestamp()
      where user_id=p_user and stage=run.stage;
    payout := private.race_credit(p_user,'STAGE_REWARD',private.race_stage_reward(run.stage),'stage:'||run.stage::text,run.stage,jsonb_build_object('run',run.id,'car',run.car_key));
    if (select count(*) from public.race_stage_progress s where s.user_id=p_user and s.stage between 1 and 5 and s.wins>0)=5 then keys := keys || 'halfway'::text; end if;
    if (select count(*) from public.race_stage_progress s where s.user_id=p_user and s.wins>0)=10 then keys := keys || 'champion'::text; end if;
  else
    update public.race_stage_progress set plays=plays+1, last_played_at=statement_timestamp() where user_id=p_user and stage=run.stage;
    -- A race that was not won cannot earn a win's achievements, whatever was sent.
    keys := array(select k from unnest(keys) k where k in ('streak-15','top-speed'));
  end if;
  if jsonb_typeof(p_state->'finishMs')='null' then keys := '{}'::text[]; end if;
  fresh := private.race_grant_achievements(p_user, keys);

  update public.race_profiles set
    races_finished=races_finished+case when jsonb_typeof(p_state->'finishMs')='null' then 0 else 1 end,
    races_won=races_won+case when p_won then 1 else 0 end,
    total_correct=total_correct+(p_state->>'correct')::integer,
    total_wrong=total_wrong+(p_state->>'wrong')::integer,
    updated_at=statement_timestamp()
    where user_id=p_user;

  select w.balance into balance from public.race_wallets w where w.user_id=p_user;
  return jsonb_build_object('result','finished','won',p_won,'firstWin',p_won and coalesce(first_win,false),
    'stageReward',coalesce((payout->>'credited')::integer,0),'achievements',to_jsonb(fresh),
    'achievementReward',(select coalesce(sum(a.reward),0) from public.race_achievements a where a.achievement_key = any(fresh)),
    'balance',coalesce(balance,0),'unlocked',private.race_unlocked(p_user));
end
$$;

-- Atomic: the charge, the ledger line and the ownership happen together or not
-- at all. Retrying with the same key returns the first answer and charges
-- nothing; the price is read here, never taken from a browser.
create or replace function public.race_purchase(p_user uuid, p_car text, p_key text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  w public.race_wallets;
  car public.race_cars;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then return jsonb_build_object('result','invalid-request'); end if;
  insert into public.race_wallets(user_id) values(p_user) on conflict (user_id) do nothing;
  select * into w from public.race_wallets where user_id=p_user for update;
  select * into car from public.race_cars where car_key=p_car and active;
  if car.car_key is null then return jsonb_build_object('result','car-not-found','balance',w.balance); end if;
  if car.price=0 then return jsonb_build_object('result','free-car','balance',w.balance,'car',car.car_key); end if;
  if exists (select 1 from public.race_ledger l where l.user_id=p_user and l.idempotency_key='buy:'||p_key) then
    return jsonb_build_object('result','ok','idempotent',true,'balance',w.balance,'car',car.car_key);
  end if;
  if exists (select 1 from public.race_garage g where g.user_id=p_user and g.car_key=car.car_key) then
    return jsonb_build_object('result','owned','balance',w.balance,'car',car.car_key);
  end if;
  if w.balance < car.price then
    return jsonb_build_object('result','insufficient','balance',w.balance,'price',car.price,'car',car.car_key);
  end if;
  update public.race_wallets set balance=balance-car.price, updated_at=statement_timestamp() where user_id=p_user returning * into w;
  insert into public.race_ledger(user_id,event,amount,balance_after,idempotency_key,car_key)
    values(p_user,'PURCHASE_CAR',-car.price,w.balance,'buy:'||p_key,car.car_key);
  insert into public.race_garage(user_id,car_key) values(p_user,car.car_key);
  return jsonb_build_object('result','ok','balance',w.balance,'car',car.car_key,'price',car.price);
end
$$;

-- Driving a car requires owning it (the starter is everyone's).
create or replace function public.race_equip(p_user uuid, p_car text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  car public.race_cars;
begin
  select * into car from public.race_cars where car_key=p_car and active;
  if car.car_key is null then return jsonb_build_object('result','car-not-found'); end if;
  if car.price>0 and not exists (select 1 from public.race_garage g where g.user_id=p_user and g.car_key=car.car_key) then
    return jsonb_build_object('result','car-not-owned','car',car.car_key);
  end if;
  insert into public.race_profiles(user_id,equipped_car) values(p_user,car.car_key)
    on conflict (user_id) do update set equipped_car=excluded.equipped_car, updated_at=statement_timestamp();
  return jsonb_build_object('result','ok','equipped',car.car_key);
end
$$;

-- ------------------------------------------------------------------ the rooms

/** A race nobody finishes ends by itself 20 minutes after the start. */
create or replace function private.race_cleanup()
returns void language sql set search_path=''
as $$
  delete from public.race_rooms
    where expires_at < statement_timestamp() - interval '5 minutes'
       or (status='closed' and updated_at < statement_timestamp() - interval '5 minutes');
$$;
revoke all on function private.race_cleanup() from public,anon,authenticated;

-- Derived from the clock on every read, so the start lights need no background job.
create or replace function private.race_phase(r public.race_rooms)
returns text language sql stable set search_path=''
as $$
  select case
    when r.phase='LOBBY' then 'LOBBY'
    when r.phase='ENDED' then 'COMPLETE'
    when statement_timestamp() < r.starts_at then 'COUNTDOWN'
    when statement_timestamp() < r.starts_at + interval '20 minutes' then 'ACTIVE'
    else 'COMPLETE'
  end
$$;
revoke all on function private.race_phase(public.race_rooms) from public,anon,authenticated;

-- Finish order is the moment each racer crossed the line, to the millisecond;
-- the same millisecond shares a place. Racers still on the road follow by
-- distance. Join order and names decide nothing.
create or replace function private.race_standings(p_room uuid)
returns jsonb language sql stable set search_path=''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id',s.id,'name',s.display_name,'emoji',s.emoji,'colour',s.colour,'creator',s.is_creator,
      'correct',s.correct,'wrong',s.wrong,'d',s.distance_m,'f',s.finish_ms,'rank',s.place,
      't',s.state->'t','x',s.state->'x','v',s.state->'v',
      'connected',s.seen_at > statement_timestamp() - interval '15 seconds'
    ) order by s.place, s.display_name, s.id),'[]'::jsonb)
  from (
    select p.*, rank() over (order by p.finish_ms asc nulls last, case when p.finish_ms is null then p.distance_m else 0 end desc) as place
    from public.race_participants p where p.room_id=p_room and p.status='active'
  ) s
$$;
revoke all on function private.race_standings(uuid) from public,anon,authenticated;

create or replace function private.race_room_core(r public.race_rooms, p_result text)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object(
    'result',p_result,'id',r.id,'code',r.code,'phase',private.race_phase(r),'settings',r.settings,
    'locked',r.join_locked,'version',r.version,'seed',r.seed,
    'nowMs',private.race_ms(statement_timestamp()),'startsAtMs',private.race_ms(r.starts_at),'endsAtMs',private.race_ms(r.ends_at),
    'finalized',r.finalized_at is not null,'standings',r.standings
  )
$$;
revoke all on function private.race_room_core(public.race_rooms,text) from public,anon,authenticated;

create or replace function private.race_participant_view(p public.race_participants)
returns jsonb language sql stable set search_path=''
as $$
  select jsonb_build_object('id',p.id,'name',p.display_name,'emoji',p.emoji,'colour',p.colour,'isCreator',p.is_creator,'state',p.state,'version',p.version,'signedIn',p.user_id is not null)
$$;
revoke all on function private.race_participant_view(public.race_participants) from public,anon,authenticated;

-- Fixes the result, once, a moment after the race ends (answers still in flight
-- are let in first). Signed-in racers get the race counted in their record.
create or replace function private.race_finalize(p_room uuid)
returns void language plpgsql set search_path=''
as $$
declare
  r public.race_rooms;
  p record;
begin
  select * into r from public.race_rooms where id=p_room and finalized_at is null for update skip locked;
  if r.id is null or r.phase<>'ENDED' or statement_timestamp() < r.ends_at + interval '2500 milliseconds' then return; end if;
  update public.race_rooms set standings=private.race_standings(r.id), standings_at=statement_timestamp(), finalized_at=statement_timestamp(), version=version+1, updated_at=statement_timestamp()
    where id=r.id;
  for p in
    select q.*, rank() over (order by q.finish_ms asc nulls last) as place
    from public.race_participants q where q.room_id=r.id and q.status='active'
  loop
    if p.user_id is null then continue; end if;
    insert into public.race_profiles(user_id) values(p.user_id) on conflict (user_id) do nothing;
    update public.race_profiles set
      online_played=online_played+1,
      online_won=online_won+case when p.finish_ms is not null and p.place=1 then 1 else 0 end,
      updated_at=statement_timestamp()
      where user_id=p.user_id;
  end loop;
end
$$;
revoke all on function private.race_finalize(uuid) from public,anon,authenticated;

-- A reader refreshes the shared standings at most about once a second; everyone
-- else skips the row and reads what is there, so no poll waits behind another.
-- The same reader ends the race when every racer has finished or time is up.
create or replace function private.race_refresh(p_room public.race_rooms)
returns public.race_rooms language plpgsql set search_path=''
as $$
declare
  r public.race_rooms := p_room;
begin
  if r.finalized_at is not null or r.phase='LOBBY' then return r; end if;
  if r.phase='ENDED' then
    if statement_timestamp() >= r.ends_at + interval '2500 milliseconds' then
      perform private.race_finalize(r.id);
      select * into r from public.race_rooms where id=r.id;
    end if;
    return r;
  end if;
  if r.standings_at is null or r.standings_at < statement_timestamp() - interval '900 milliseconds' then
    perform 1 from public.race_rooms where id=r.id for update skip locked;
    if found then
      if statement_timestamp() >= r.starts_at and (
           statement_timestamp() >= r.starts_at + interval '20 minutes'
           or not exists (select 1 from public.race_participants p where p.room_id=r.id and p.status='active' and p.finish_ms is null)) then
        update public.race_rooms set phase='ENDED', ends_at=statement_timestamp(), expires_at=statement_timestamp()+interval '30 minutes',
          standings=private.race_standings(r.id), standings_at=statement_timestamp(), version=version+1, updated_at=statement_timestamp()
          where id=r.id returning * into r;
      else
        update public.race_rooms set standings=private.race_standings(r.id), standings_at=statement_timestamp() where id=r.id returning * into r;
      end if;
    end if;
  end if;
  return r;
end
$$;
revoke all on function private.race_refresh(public.race_rooms) from public,anon,authenticated;

create or replace function public.race_create_room(
  p_code text, p_owner_hash text, p_host_token_hash text, p_player_token_hash text, p_user uuid,
  p_name text, p_emoji text, p_colour text, p_settings jsonb, p_seed text, p_state jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.race_rooms;
  me public.race_participants;
  recent bigint;
begin
  perform private.race_cleanup();
  if not private.race_settings_valid(p_settings) or not private.race_state_valid(p_state) or (p_state->>'answered')::integer<>0 then
    return jsonb_build_object('result','invalid-request');
  end if;
  if p_name is null or p_name<>btrim(p_name) or char_length(p_name) not between 2 and 20 then return jsonb_build_object('result','invalid-name'); end if;
  if not private.bingo_emoji_valid(p_emoji) then return jsonb_build_object('result','invalid-emoji'); end if;
  if p_colour is null or p_colour not in ('turquoise','pink','gold','green','red','purple','orange','white') then return jsonb_build_object('result','invalid-request'); end if;
  select count(*) into recent from public.race_rooms where owner_hash=p_owner_hash and created_at > statement_timestamp() - interval '10 minutes';
  if recent >= 12 then return jsonb_build_object('result','rate-limited'); end if;
  perform pg_advisory_xact_lock(hashtext('live-room-code:'||p_code));
  if exists (select 1 from public.race_rooms x where x.code=p_code and x.status='open')
     or exists (select 1 from public.polygon_rooms x where x.code=p_code and x.status='open')
     or exists (select 1 from public.bingo_rooms x where x.code=p_code and x.status='open') then
    return jsonb_build_object('result','code-taken');
  end if;
  -- One live room per creator: an older one closes and its racers are removed.
  perform 1 from public.race_rooms where owner_hash=p_owner_hash and status='open' order by id for update;
  delete from public.race_participants where room_id in (select id from public.race_rooms where owner_hash=p_owner_hash and status='open');
  update public.race_rooms set status='closed', version=version+1, updated_at=statement_timestamp() where owner_hash=p_owner_hash and status='open';
  begin
    insert into public.race_rooms(code,owner_hash,host_token_hash,settings,seed,expires_at)
      values(p_code,p_owner_hash,p_host_token_hash,p_settings,p_seed,statement_timestamp()+interval '3 hours')
      returning * into r;
  exception when unique_violation then
    return jsonb_build_object('result','code-taken');
  end;
  insert into public.race_participants(room_id,token_hash,display_name,name_key,emoji,colour,is_creator,user_id,state)
    values(r.id,p_player_token_hash,p_name,lower(p_name),p_emoji,p_colour,true,p_user,p_state) returning * into me;
  update public.race_rooms set standings=private.race_standings(r.id), standings_at=statement_timestamp() where id=r.id returning * into r;
  return private.race_room_core(r,'created') || jsonb_build_object('me',private.race_participant_view(me));
end
$$;

-- The creator, back after a refresh or on another device: needs the signed-in
-- owner hash, so a room code alone can never take over a room. Mints fresh
-- host and seat tokens; the old ones stop working.
create or replace function public.race_host_resume(p_owner_hash text, p_new_host_hash text, p_new_player_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.race_rooms;
  me public.race_participants;
begin
  select * into r from public.race_rooms
    where owner_hash=p_owner_hash and status='open' and expires_at > statement_timestamp()
    order by created_at desc limit 1 for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  update public.race_rooms set host_token_hash=p_new_host_hash, updated_at=statement_timestamp() where id=r.id returning * into r;
  update public.race_participants set token_hash=p_new_player_hash where room_id=r.id and is_creator returning * into me;
  r := private.race_refresh(r);
  return private.race_room_core(r,'resumed') || jsonb_build_object('me',private.race_participant_view(me));
end
$$;

create or replace function public.race_host_command(p_owner_hash text, p_token_hash text, p_command text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.race_rooms;
  target uuid;
  phase text;
  countdown integer;
begin
  select * into r from public.race_rooms where host_token_hash=p_token_hash and owner_hash=p_owner_hash and status='open' for update;
  if r.id is null then return jsonb_build_object('result','not-found'); end if;
  phase := private.race_phase(r);

  if p_command='start' then
    if phase<>'LOBBY' then return private.race_room_core(r,'already-started'); end if;
    countdown := coalesce((p_args->>'countdownMs')::integer, 5000);
    if countdown not between 3000 and 15000 then return jsonb_build_object('result','invalid-request'); end if;
    -- Everyone starts on the same instant of the same clock: this one.
    update public.race_rooms set phase='RUNNING',
      starts_at=statement_timestamp()+make_interval(secs => countdown/1000.0),
      expires_at=statement_timestamp()+interval '60 minutes',
      join_locked=true,
      version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
  elsif p_command in ('lock','unlock') then
    if phase<>'LOBBY' then return private.race_room_core(r,'already-started'); end if;
    update public.race_rooms set join_locked=(p_command='lock'), version=version+1, updated_at=statement_timestamp() where id=r.id returning * into r;
  elsif p_command='remove' then
    begin
      target := (p_args->>'participant')::uuid;
    exception when others then
      return jsonb_build_object('result','invalid-request');
    end;
    update public.race_participants set status='removed', display_name='Removed racer', name_key='removed:'||id::text, emoji=null, user_id=null
      where id=target and room_id=r.id and status='active' and not is_creator;
    if not found then return private.race_room_core(r,'not-removable'); end if;
    update public.race_rooms set standings=private.race_standings(r.id), standings_at=statement_timestamp(), version=version+1, updated_at=statement_timestamp() where id=r.id returning * into r;
  elsif p_command='end' then
    if phase='COMPLETE' and r.phase='ENDED' then return private.race_room_core(r,'already-ended'); end if;
    if phase='LOBBY' then
      delete from public.race_participants where room_id=r.id;
      update public.race_rooms set status='closed', version=version+1, updated_at=statement_timestamp() where id=r.id;
      return jsonb_build_object('result','closed');
    end if;
    update public.race_rooms set phase='ENDED', ends_at=statement_timestamp(), starts_at=least(starts_at,statement_timestamp()),
      standings=private.race_standings(r.id), standings_at=statement_timestamp(),
      expires_at=statement_timestamp()+interval '30 minutes', version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
  elsif p_command='players' then
    return private.race_room_core(r,'ok') || jsonb_build_object('players',(
      select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'emoji',p.emoji,'colour',p.colour,'creator',p.is_creator,'correct',p.correct,
        'connected',p.seen_at > statement_timestamp() - interval '15 seconds') order by p.joined_at,p.id),'[]'::jsonb)
      from public.race_participants p where p.room_id=r.id and p.status='active'));
  elsif p_command='close' then
    delete from public.race_participants where room_id=r.id;
    update public.race_rooms set status='closed', version=version+1, updated_at=statement_timestamp() where id=r.id;
    return jsonb_build_object('result','closed');
  else
    return jsonb_build_object('result','invalid-request');
  end if;
  return private.race_room_core(r,'ok');
end
$$;

-- Joining is open only before the start, so every racer has the whole race.
create or replace function public.race_join_room(p_code text, p_name text, p_emoji text, p_colour text, p_token_hash text, p_subject_hash text, p_user uuid, p_state jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  r public.race_rooms;
  me public.race_participants;
  failure_row public.bingo_join_failures;
  outcome text;
  candidate text := p_name;
  suffix integer := 1;
begin
  perform private.race_cleanup();
  -- One limiter for code guessing across every live game.
  select * into failure_row from public.bingo_join_failures where subject_hash=p_subject_hash for update;
  if failure_row.subject_hash is not null and failure_row.window_started_at > statement_timestamp() - interval '10 minutes'
     and failure_row.failures >= 40 then
    return jsonb_build_object('result','rate-limited');
  end if;
  if p_name is null or p_name<>btrim(p_name) or char_length(p_name) not between 2 and 20 then return jsonb_build_object('result','invalid-name'); end if;
  if not private.bingo_emoji_valid(p_emoji) then return jsonb_build_object('result','invalid-emoji'); end if;
  if p_colour is null or p_colour not in ('turquoise','pink','gold','green','red','purple','orange','white')
     or not private.race_state_valid(p_state) or (p_state->>'answered')::integer<>0 then
    return jsonb_build_object('result','invalid-request');
  end if;

  select * into r from public.race_rooms where code=p_code and status='open' for update;
  if r.id is null then
    outcome := 'not-found';
  elsif r.expires_at <= statement_timestamp() then
    outcome := 'expired';
  elsif private.race_phase(r)='COMPLETE' then
    return jsonb_build_object('result','finished');
  elsif private.race_phase(r)<>'LOBBY' then
    return jsonb_build_object('result','started');
  elsif r.join_locked then
    return jsonb_build_object('result','locked');
  elsif (select count(*) from public.race_participants p where p.room_id=r.id and p.status='active') >= 60 then
    return jsonb_build_object('result','full');
  else
    while exists (select 1 from public.race_participants p where p.room_id=r.id and p.status='active' and p.name_key=lower(candidate)) loop
      suffix := suffix + 1;
      candidate := btrim(left(p_name, 20 - char_length(' ' || suffix::text))) || ' ' || suffix::text;
    end loop;
    insert into public.race_participants(room_id,token_hash,display_name,name_key,emoji,colour,user_id,state)
      values(r.id,p_token_hash,candidate,lower(candidate),p_emoji,p_colour,p_user,p_state) returning * into me;
    update public.race_rooms set standings=private.race_standings(r.id), standings_at=statement_timestamp(), version=version+1, updated_at=statement_timestamp()
      where id=r.id returning * into r;
    return private.race_room_core(r,'joined') || jsonb_build_object('me',private.race_participant_view(me));
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

-- Everything one poll needs. Takes no lock on the room except the brief
-- skip-locked standings refresh.
create or replace function public.race_player_load(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me public.race_participants;
  r public.race_rooms;
begin
  select * into me from public.race_participants where token_hash=p_token_hash;
  if me.id is null then return jsonb_build_object('result','not-found'); end if;
  select * into r from public.race_rooms where id=me.room_id;
  if me.status='removed' then return jsonb_build_object('result','removed'); end if;
  if r.status='closed' or r.expires_at <= statement_timestamp() then return jsonb_build_object('result','closed'); end if;
  if me.seen_at < statement_timestamp() - interval '5 seconds' then
    update public.race_participants set seen_at=statement_timestamp() where id=me.id;
  end if;
  r := private.race_refresh(r);
  return private.race_room_core(r,'ok') || jsonb_build_object('me',private.race_participant_view(me));
end
$$;

-- One racer's row, compare-and-swapped. The room row is only read. Progress
-- never goes back, a finish time is written once and never changed, and nothing
-- is accepted before the start or after the result is fixed.
create or replace function public.race_player_commit(p_token_hash text, p_version integer, p_state jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  new_version integer;
begin
  if not private.race_state_valid(p_state) then return jsonb_build_object('result','invalid-request'); end if;
  update public.race_participants p set
    state=p_state,
    correct=(p_state->>'correct')::integer,
    wrong=(p_state->>'wrong')::integer,
    distance_m=floor((p_state->>'x')::numeric*1000)::integer,
    finish_ms=case when jsonb_typeof(p_state->'finishMs')='null' then null else greatest(1,round((p_state->>'finishMs')::numeric)::integer) end,
    version=p.version+1,
    seen_at=statement_timestamp()
  from public.race_rooms r
  where p.token_hash=p_token_hash and p.version=p_version and p.status='active'
    and r.id=p.room_id and r.status='open' and r.finalized_at is null and r.phase in ('RUNNING','ENDED')
    and statement_timestamp() >= r.starts_at
    and p.finish_ms is null
    and (p_state->>'answered')::integer >= (p.state->>'answered')::integer
    and (p_state->>'correct')::integer >= p.correct
    and floor((p_state->>'x')::numeric*1000)::integer >= p.distance_m
    -- After the race has ended only the clock may move a racer, not a new answer.
    and (r.phase='RUNNING' or (p_state->>'answered')::integer = (p.state->>'answered')::integer)
  returning p.version into new_version;
  if new_version is null then return jsonb_build_object('result','conflict'); end if;
  return jsonb_build_object('result','ok','version',new_version);
end
$$;

create or replace function public.race_leave(p_token_hash text)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  me public.race_participants;
begin
  select * into me from public.race_participants where token_hash=p_token_hash;
  if me.id is null then return jsonb_build_object('result','not-found'); end if;
  if me.is_creator then return jsonb_build_object('result','creator-stays'); end if;
  update public.race_participants set status='removed', display_name='Removed racer', name_key='removed:'||id::text, emoji=null, user_id=null where id=me.id;
  return jsonb_build_object('result','left');
end
$$;

do $grants$
declare
  fn text;
begin
  foreach fn in array array[
    'public.race_bootstrap(uuid)',
    'public.race_run_start(uuid,integer,jsonb,text,text,jsonb,integer)',
    'public.race_run_load(uuid,uuid)',
    'public.race_run_commit(uuid,uuid,integer,jsonb)',
    'public.race_run_finish(uuid,uuid,integer,jsonb,boolean,integer,integer,text[],jsonb)',
    'public.race_purchase(uuid,text,text)',
    'public.race_equip(uuid,text)',
    'public.race_create_room(text,text,text,text,uuid,text,text,text,jsonb,text,jsonb)',
    'public.race_host_resume(text,text,text)',
    'public.race_host_command(text,text,text,jsonb)',
    'public.race_join_room(text,text,text,text,text,text,uuid,jsonb)',
    'public.race_player_load(text)',
    'public.race_player_commit(text,integer,jsonb)',
    'public.race_leave(text)'
  ] loop
    execute format('revoke all on function %s from public,anon,authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end
$grants$;
