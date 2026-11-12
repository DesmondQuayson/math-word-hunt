-- Math Race Champions: Race Dollars move exactly once, a finish needs 30 correct
-- answers, rooms are temporary, one code space covers every live game, and a
-- browser can never reach any of it directly.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select plan(170);

-- ------------------------------------------------------------------- fixture
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('aaaaaaaa-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','race-a@example.test','x',now(),now(),now(),'{}','{}'),
  ('bbbbbbbb-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','race-b@example.test','x',now(),now(),now(),'{}','{}');

create temporary table fixture(name text primary key, value text);
grant all on fixture to service_role;

-- A racer state as engine/race.js writes it.
create or replace function pg_temp.rs(p_correct int default 0, p_wrong int default 0, p_x numeric default 0, p_finish numeric default null, p_t numeric default 0)
returns jsonb language sql immutable as $$
  select jsonb_build_object('t',p_t,'x',p_x,'v',60,'correct',p_correct,'wrong',p_wrong,'answered',p_correct+p_wrong,'streak',0,'bestStreak',p_correct,'maxSpeed',120,'lockedUntil',0,'finishMs',p_finish)
$$;
create or replace function pg_temp.hash(p text) returns text language sql immutable as $$ select md5(p)||md5(p||'x') $$;
create or replace function pg_temp.settings() returns jsonb language sql immutable as $$
  select '{"categories":["missing-addend","powers"],"difficulty":"easy"}'::jsonb
$$;
-- A started race whose lights went out a minute ago.
create or replace function pg_temp.run(p_user uuid, p_stage int) returns uuid language plpgsql as $$
declare
  started jsonb := public.race_run_start(p_user, p_stage, pg_temp.settings(), repeat('a',32), repeat('b',32), pg_temp.rs(), 4000);
begin
  if started->>'result' <> 'started' then raise exception 'run not started: %', started; end if;
  update public.race_runs set starts_at = statement_timestamp() - interval '1 minute' where id = (started->>'id')::uuid;
  return (started->>'id')::uuid;
end $$;

-- ---------------------------------------------------------------- the catalog
select is((select status from public.game_catalog_entries where stable_key='math-race-champions'), 'draft', 'the catalog entry is a draft');
select is((select title from public.game_catalog_entries where stable_key='math-race-champions'), 'Math Race Champions', 'it is called Math Race Champions');
select is((select slug from public.game_catalog_entries where stable_key='math-race-champions'), 'math-race-champions', 'its slug is math-race-champions');
select ok((select tags @> array['free-game','racing','multiplayer','classroom-game'] from public.game_catalog_entries where stable_key='math-race-champions'), 'it is tagged free, racing, multiplayer and classroom');
select ok((select topics @> array['arithmetic','percentages','decimals','exponents','algebra-foundations'] from public.game_catalog_entries where stable_key='math-race-champions'), 'it is filed under its five topics');
select is((select publication_metadata->>'internal_route' from public.game_catalog_entries where stable_key='math-race-champions'), '/games/math-race-champions/play', 'it opens at its play route');

-- -------------------------------------------------------------- nothing is public
select ok(not has_table_privilege('anon','public.race_wallets','select'), 'anon cannot read wallets');
select ok(not has_table_privilege('authenticated','public.race_wallets','select'), 'signed-in browsers cannot read wallets');
select ok(not has_table_privilege('authenticated','public.race_wallets','update'), 'signed-in browsers cannot change wallets');
select ok(not has_table_privilege('authenticated','public.race_ledger','select'), 'signed-in browsers cannot read the ledger');
select ok(not has_table_privilege('authenticated','public.race_garage','insert'), 'signed-in browsers cannot add cars');
select ok(not has_table_privilege('authenticated','public.race_runs','select'), 'signed-in browsers cannot read races (their seeds)');
select ok(not has_table_privilege('authenticated','public.race_rooms','select'), 'signed-in browsers cannot read rooms (their seeds)');
select ok(not has_table_privilege('anon','public.race_participants','select'), 'anon cannot read participants');
select ok(not has_table_privilege('authenticated','public.race_stage_progress','update'), 'signed-in browsers cannot change stage wins');
select ok((select bool_and(relforcerowsecurity) from pg_class where oid in ('public.race_wallets'::regclass,'public.race_ledger'::regclass,'public.race_garage'::regclass,'public.race_profiles'::regclass,'public.race_stage_progress'::regclass,'public.race_runs'::regclass,'public.race_rooms'::regclass,'public.race_participants'::regclass,'public.race_cars'::regclass,'public.race_achievements'::regclass)), 'every table forces row level security');
select is((select count(*)::int from pg_policies where schemaname='public' and tablename like 'race\_%'), 0, 'and has no policy: browsers are simply denied');
select ok(not has_function_privilege('anon','public.race_purchase(uuid,text,text)','execute'), 'anon cannot call purchase');
select ok(not has_function_privilege('authenticated','public.race_purchase(uuid,text,text)','execute'), 'signed-in browsers cannot call purchase');
select ok(not has_function_privilege('authenticated','public.race_run_finish(uuid,uuid,integer,jsonb,boolean,integer,integer,text[],jsonb)','execute'), 'signed-in browsers cannot finish races');
select ok(not has_function_privilege('authenticated','public.race_player_commit(text,integer,jsonb)','execute'), 'signed-in browsers cannot save online progress');
select ok(not has_function_privilege('authenticated','public.race_host_command(text,text,text,jsonb)','execute'), 'signed-in browsers cannot command rooms');
select ok(has_function_privilege('service_role','public.race_purchase(uuid,text,text)','execute'), 'the application server can');
select ok(not has_table_privilege('service_role','public.race_ledger','update'), 'not even the application can rewrite the ledger');
select ok(not has_table_privilege('service_role','public.race_ledger','delete'), 'not even the application can delete the ledger');
select ok(not has_table_privilege('service_role','public.race_ledger','truncate'), 'not even the application can empty the ledger');
select ok(not has_table_privilege('service_role','public.race_cars','update'), 'the application cannot change a price');
select ok(not has_table_privilege('service_role','public.race_achievements','update'), 'or an achievement reward');
select ok(not has_sequence_privilege('anon','public.race_ledger_id_seq','select,usage,update'), 'a browser cannot touch the ledger numbering');

-- ---------------------------------------------------------- prices and rewards
select is((select array_agg(price order by sort) from public.race_cars), array[0,2000,4000,6000], 'one free car and three at 2,000, 4,000 and 6,000');
select is((select array_agg(name order by sort) from public.race_cars), array['Street Starter','Turbo Sprint','Velocity GT','Thunder X'], 'named as the owner named them');
select is((select array_agg(private.race_stage_reward(s) order by s) from generate_series(1,10) s), array[500,600,700,800,900,1000,1100,1200,1300,1400], 'stage rewards start at 500 and rise by 100');
select is((select sum(private.race_stage_reward(s))::int from generate_series(1,10) s), 9500, '9,500 in all');
select is(private.race_stage_reward(0) + private.race_stage_reward(11), 0, 'no reward outside the ten stages');
select is((select count(*)::int from public.race_achievements where reward=250), 10, 'ten achievements of 250');
select is((select sum(price)::int from public.race_cars), (select sum(private.race_stage_reward(s))::int from generate_series(1,10) s) + (select sum(reward)::int from public.race_achievements), 'everything earnable buys exactly the three cars');

-- ------------------------------------------------------------ what a state may be
select ok(private.race_state_valid(pg_temp.rs()), 'a new racer state is valid');
select ok(private.race_state_valid(pg_temp.rs(30,2,4.8,180000)), 'a finish with 30 correct answers is valid');
select ok(not private.race_state_valid(pg_temp.rs(29,0,4.8,180000)), 'a finish with 29 correct answers is not: the database holds the 30-answer rule too');
select ok(not private.race_state_valid(pg_temp.rs(5,1,1) || '{"answered":9}'::jsonb), 'answered must be correct plus wrong');
select ok(not private.race_state_valid(pg_temp.rs() || '{"x":-1}'::jsonb), 'distance cannot be negative');
select ok(not private.race_state_valid('{"correct":40}'::jsonb), 'a made-up state is refused');
select ok(private.race_settings_valid(pg_temp.settings()), 'the seven categories and five difficulties are accepted');
select ok(not private.race_settings_valid('{"categories":["decimal-to-fraction"],"difficulty":"easy"}'::jsonb), 'there is no Decimal to Fraction');
select ok(not private.race_settings_valid('{"categories":[],"difficulty":"easy"}'::jsonb), 'at least one category');
select ok(not private.race_settings_valid('{"categories":["powers"],"difficulty":"impossible"}'::jsonb), 'only the five difficulties');

-- ----------------------------------------------------------------- Computer Race
select is((public.race_bootstrap('aaaaaaaa-1111-4111-8111-111111111111')->>'balance')::int, 0, 'a new account starts with no Race Dollars');
select is((public.race_bootstrap('aaaaaaaa-1111-4111-8111-111111111111')->>'unlocked')::int, 1, 'with Stage 1 open');
select is(public.race_bootstrap('aaaaaaaa-1111-4111-8111-111111111111')->>'equipped', 'starter', 'driving the free starter car');
select is(public.race_bootstrap('aaaaaaaa-1111-4111-8111-111111111111')->'owned', '[]'::jsonb, 'owning nothing else');

select is((public.race_run_start('aaaaaaaa-1111-4111-8111-111111111111',2,pg_temp.settings(),repeat('a',32),repeat('b',32),pg_temp.rs(),4000))->>'result', 'stage-locked', 'Stage 2 cannot be started before Stage 1 is won');
select is((public.race_run_start('aaaaaaaa-1111-4111-8111-111111111111',1,pg_temp.settings(),repeat('a',32),repeat('b',32),pg_temp.rs(5,0,1),4000))->>'result', 'invalid-request', 'a race cannot start with answers already in it');
select is((public.race_run_start('aaaaaaaa-1111-4111-8111-111111111111',1,'{"categories":["decimal-to-fraction"],"difficulty":"easy"}',repeat('a',32),repeat('b',32),pg_temp.rs(),4000))->>'result', 'invalid-request', 'or with a category that does not exist');

insert into fixture select 'run1', (public.race_run_start('aaaaaaaa-1111-4111-8111-111111111111',1,pg_temp.settings(),repeat('a',32),repeat('b',32),pg_temp.rs(),4000))->>'id';
select is((public.race_run_commit('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),1,pg_temp.rs(1,0,0.05)))->>'result', 'conflict', 'nothing is saved before the lights go out');
update public.race_runs set starts_at = statement_timestamp() - interval '1 minute' where id=(select value::uuid from fixture where name='run1');
select is((public.race_run_commit('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),1,pg_temp.rs(1,0,0.05)))->>'result', 'ok', 'an answer is saved');
select is((public.race_run_commit('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),1,pg_temp.rs(2,0,0.1)))->>'result', 'conflict', 'a stale save is refused');
select is((public.race_run_commit('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),2,pg_temp.rs(0,0,0)))->>'result', 'conflict', 'progress never goes back');
select is((public.race_run_commit('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),2,pg_temp.rs(30,0,4.8,90000)))->>'result', 'invalid-request', 'a finish cannot be slipped in as an ordinary save');
select is((public.race_run_commit('bbbbbbbb-2222-4222-8222-222222222222',(select value::uuid from fixture where name='run1'),2,pg_temp.rs(2,0,0.1)))->>'result', 'conflict', 'someone else cannot save this race');
select is((public.race_run_load('bbbbbbbb-2222-4222-8222-222222222222',(select value::uuid from fixture where name='run1')))->>'result', 'not-found', 'or read it');

-- A win needs a finish.
select is((public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),2,pg_temp.rs(12,0,2),true,120000,100,array['first-win'],'{}'))->>'result', 'invalid-request', 'a race that did not finish cannot be a win');
select is((public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),2,pg_temp.rs(29,0,4.8,120000),true,120000,100,array['first-win'],'{}'))->>'result', 'invalid-request', 'nor can a finish with 29 correct answers');
select is((public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),7,pg_temp.rs(34,2,4.8,200000),true,200000,94,array['first-win'],'{}'))->>'result', 'conflict', 'nor a finish from a stale copy of the race');

insert into fixture select 'win1', (public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),2,pg_temp.rs(34,2,4.8,200000),true,200000,94,array['first-win','sharp-90','free-money'],'{"won":true}'))::text;
select is((select value::jsonb->>'result' from fixture where name='win1'), 'finished', 'a real win is recorded');
select is((select (value::jsonb->>'stageReward')::int from fixture where name='win1'), 500, 'Stage 1 pays 500 Race Dollars');
select is((select value::jsonb->'achievements' from fixture where name='win1'), '["first-win","sharp-90"]'::jsonb, 'with the achievements it earned, and nothing for a made-up one');
select is((select (value::jsonb->>'balance')::int from fixture where name='win1'), 1000, '500 + 250 + 250');
select is((select (value::jsonb->>'unlocked')::int from fixture where name='win1'), 2, 'Stage 2 opens');

-- Asked again (two requests crossing, a retry): the same answer, nothing paid twice.
insert into fixture select 'again1', (public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1'),2,pg_temp.rs(34,2,4.8,200000),true,200000,94,array['first-win','sharp-90'],'{"won":true}'))::text;
select is((select value::jsonb->>'result' from fixture where name='again1'), 'already-finished', 'a race is finished once');
select is((select (value::jsonb->'outcome'->'rewards'->>'stageReward')::int from fixture where name='again1'), 500, 'and remembers what it paid');
select is((select (value::jsonb->>'balance')::int from fixture where name='again1'), 1000, 'the balance did not move');
select is((select count(*)::int from public.race_ledger where user_id='aaaaaaaa-1111-4111-8111-111111111111'), 3, 'three ledger lines: one stage, two achievements');

-- Winning Stage 1 again: practice, a better time, no second reward.
insert into fixture select 'run1b', pg_temp.run('aaaaaaaa-1111-4111-8111-111111111111',1)::text;
insert into fixture select 'win1b', (public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run1b'),1,pg_temp.rs(31,0,4.8,150000),true,150000,100,array['first-win','sharp-90','flawless'],'{"won":true}'))::text;
select is((select (value::jsonb->>'stageReward')::int from fixture where name='win1b'), 0, 'the stage reward is paid once per account');
select is((select value::jsonb->'achievements' from fixture where name='win1b'), '["flawless"]'::jsonb, 'only the new achievement pays');
select is((select (value::jsonb->>'balance')::int from fixture where name='win1b'), 1250, 'the balance adds up');
select is((select best_time_ms from public.race_stage_progress where user_id='aaaaaaaa-1111-4111-8111-111111111111' and stage=1), 150000, 'the best time improved');
select is((select wins from public.race_stage_progress where user_id='aaaaaaaa-1111-4111-8111-111111111111' and stage=1), 2, 'two wins are counted');
select is((select count(*)::int from public.race_ledger where user_id='aaaaaaaa-1111-4111-8111-111111111111' and event='STAGE_REWARD'), 1, 'still one stage reward line');

-- A loss, and a race abandoned part-way.
insert into fixture select 'run2', pg_temp.run('aaaaaaaa-1111-4111-8111-111111111111',2)::text;
insert into fixture select 'loss2', (public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run2'),1,pg_temp.rs(33,9,5.3,400000),false,400000,79,array['first-win','hard-mode','top-speed'],'{"won":false}'))::text;
select is((select value::jsonb->'achievements' from fixture where name='loss2'), '["top-speed"]'::jsonb, 'a lost race cannot earn a win''s achievements');
select is((select (value::jsonb->>'stageReward')::int from fixture where name='loss2'), 0, 'or the stage reward');
select is((select (value::jsonb->>'unlocked')::int from fixture where name='loss2'), 2, 'or the next stage');
insert into fixture select 'run2b', pg_temp.run('aaaaaaaa-1111-4111-8111-111111111111',2)::text;
insert into fixture select 'quit2', (public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run2b'),1,pg_temp.rs(12,3,2.1),false,null,80,array['streak-15','top-speed'],'{"won":false}'))::text;
select is((select value::jsonb->'achievements' from fixture where name='quit2'), '[]'::jsonb, 'an unfinished race earns nothing at all');
select is((select wins from public.race_stage_progress where user_id='aaaaaaaa-1111-4111-8111-111111111111' and stage=2), 0, 'Stage 2 is still not won');

-- Starting a new race abandons the one left open: one race at a time.
insert into fixture select 'left', pg_temp.run('aaaaaaaa-1111-4111-8111-111111111111',1)::text;
insert into fixture select 'fresh', pg_temp.run('aaaaaaaa-1111-4111-8111-111111111111',1)::text;
select is((select status from public.race_runs where id=(select value::uuid from fixture where name='left')), 'abandoned', 'the older race is abandoned');
select is((select count(*)::int from public.race_runs where user_id='aaaaaaaa-1111-4111-8111-111111111111' and status='active'), 1, 'one race at a time');

-- Halfway There and Champion come from the stage record itself.
insert into public.race_stage_progress(user_id,stage,plays,wins,first_won_at) select 'aaaaaaaa-1111-4111-8111-111111111111', s, 1, 1, now() from generate_series(2,4) s
  on conflict (user_id,stage) do update set wins=1, first_won_at=now();
select is(private.race_unlocked('aaaaaaaa-1111-4111-8111-111111111111'), 5, 'four stages won opens Stage 5');
insert into fixture select 'run5', pg_temp.run('aaaaaaaa-1111-4111-8111-111111111111',5)::text;
select ok((public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run5'),1,pg_temp.rs(60,3,6.6,300000),true,300000,95,array['first-win'],'{"won":true}')->'achievements') ? 'halfway', 'winning Stages 1 to 5 earns Halfway There');
insert into public.race_stage_progress(user_id,stage,plays,wins,first_won_at) select 'aaaaaaaa-1111-4111-8111-111111111111', s, 1, 1, now() from generate_series(6,9) s;
insert into fixture select 'run10', pg_temp.run('aaaaaaaa-1111-4111-8111-111111111111',10)::text;
insert into fixture select 'win10', (public.race_run_finish('aaaaaaaa-1111-4111-8111-111111111111',(select value::uuid from fixture where name='run10'),1,pg_temp.rs(120,2,10.9,330000),true,330000,98,array['first-win'],'{"won":true}'))::text;
select ok((select value::jsonb->'achievements' ? 'champion' from fixture where name='win10'), 'winning all ten earns Champion');
select is((select (value::jsonb->>'stageReward')::int from fixture where name='win10'), 1400, 'Stage 10 pays 1,400');
select ok((select lifetime_earned <= 12000 from public.race_wallets where user_id='aaaaaaaa-1111-4111-8111-111111111111'), 'nobody can ever have earned more than 12,000');
select is((select balance from public.race_wallets where user_id='aaaaaaaa-1111-4111-8111-111111111111'), (select sum(amount)::int from public.race_ledger where user_id='aaaaaaaa-1111-4111-8111-111111111111'), 'the balance is exactly the sum of the ledger');

-- -------------------------------------------------------------------- the shop
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','turbo-sprint','attempt-0001'))->>'result', 'insufficient', 'no Race Dollars, no car');
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','turbo-sprint','x'))->>'result', 'invalid-request', 'a purchase needs a proper key');
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','moon-rocket','attempt-0002'))->>'result', 'car-not-found', 'a car that does not exist cannot be bought');
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','starter','attempt-0003'))->>'result', 'free-car', 'the free car is not for sale');
select is((select count(*)::int from public.race_ledger where user_id='bbbbbbbb-2222-4222-8222-222222222222'), 0, 'nothing was charged');

update public.race_wallets set balance=6000 where user_id='bbbbbbbb-2222-4222-8222-222222222222';
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','turbo-sprint','attempt-0004'))->>'balance', '4000', 'Turbo Sprint costs 2,000');
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','turbo-sprint','attempt-0004'))->>'idempotent', 'true', 'the same request again is the same answer');
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','turbo-sprint','attempt-0005'))->>'result', 'owned', 'a car already owned is not sold twice');
select is((select balance from public.race_wallets where user_id='bbbbbbbb-2222-4222-8222-222222222222'), 4000, 'and is charged once');
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','thunder-x','attempt-0006'))->>'result', 'insufficient', '4,000 does not buy Thunder X at 6,000');
select is((public.race_purchase('bbbbbbbb-2222-4222-8222-222222222222','velocity-gt','attempt-0007'))->>'balance', '0', 'Velocity GT costs 4,000');
select is((select array_agg(amount order by id) from public.race_ledger where user_id='bbbbbbbb-2222-4222-8222-222222222222'), array[-2000,-4000], 'two purchase lines, at the listed prices');
select is((select min(balance_after) from public.race_ledger where user_id='bbbbbbbb-2222-4222-8222-222222222222'), 0, 'the balance never went below zero');
select throws_ok($$ update public.race_wallets set balance=-1 where user_id='bbbbbbbb-2222-4222-8222-222222222222' $$, '23514', null, 'and cannot');
select is((select count(*)::int from public.race_garage where user_id='bbbbbbbb-2222-4222-8222-222222222222'), 2, 'two cars in the garage');

select is((public.race_equip('bbbbbbbb-2222-4222-8222-222222222222','thunder-x'))->>'result', 'car-not-owned', 'a car must be owned to be driven');
select is((public.race_equip('bbbbbbbb-2222-4222-8222-222222222222','moon-rocket'))->>'result', 'car-not-found', 'and must exist');
select is((public.race_equip('bbbbbbbb-2222-4222-8222-222222222222','velocity-gt'))->>'equipped', 'velocity-gt', 'an owned car is equipped');
select is((public.race_run_start('bbbbbbbb-2222-4222-8222-222222222222',1,pg_temp.settings(),repeat('c',32),repeat('d',32),pg_temp.rs(),4000))->>'car', 'velocity-gt', 'the race uses the equipped car, read here');
select is((public.race_equip('bbbbbbbb-2222-4222-8222-222222222222','starter'))->>'equipped', 'starter', 'the starter can always be chosen again');

-- ------------------------------------------------------------------ the rooms
insert into fixture select 'room', (public.race_create_room('371524',pg_temp.hash('owner-a'),pg_temp.hash('host-a'),pg_temp.hash('seat-a'),'aaaaaaaa-1111-4111-8111-111111111111','Casey','🚀','gold',pg_temp.settings(),repeat('e',32),pg_temp.rs()))->>'id';
select ok((select value is not null from fixture where name='room'), 'a room is created');
select ok((select is_creator from public.race_participants where token_hash=pg_temp.hash('seat-a')), 'its creator is a racer in it');
select is(public.race_player_load(pg_temp.hash('seat-a'))->>'phase', 'LOBBY', 'the room begins in the lobby');
select is(public.live_room_game_for_code('371524'), 'math_race_champions', 'the code identifies this game');
select is(public.live_room_game_for_code('999999'), null, 'an unknown code identifies nothing');

-- One code space across every live game.
select is((public.race_create_room('371524',pg_temp.hash('owner-b'),pg_temp.hash('host-b'),pg_temp.hash('seat-b'),null,'Zion',null,'red',pg_temp.settings(),repeat('f',32),pg_temp.rs()))->>'result', 'code-taken', 'a code in use is not given out again');
select is((public.bingo_create_room('371524',pg_temp.hash('bingo-owner'),pg_temp.hash('bingo-host'),'{"mode":"addition","level":"facts-20","questionSeconds":15,"revealSeconds":3,"patterns":{"rows":true,"columns":true,"diagonals":false},"winners":1,"freeSpace":false,"equivalentFractions":false,"music":"host","celebration":"host"}'::jsonb))->>'result', 'code-taken', 'Bingo cannot take a code a race holds');
select is((public.polygon_create_room('371524',pg_temp.hash('poly-owner'),pg_temp.hash('poly-host'),pg_temp.hash('poly-seat'),null,'Mina',null,300,repeat('d',32),jsonb_build_object('rules',1,'board',repeat('01230123',8),'cursors',jsonb_build_array(0,0,0,0,0,0,0,0),'reshuffles',0,'moves',0,'coins',0,'score',0,'matches',0,'cascades',0,'largestClear',0,'bestCombo',0,'cleared',0)))->>'result', 'code-taken', 'Polygon Showdown cannot take a code a race holds');
select is((public.bingo_create_room('654322',pg_temp.hash('bingo-owner'),pg_temp.hash('bingo-host'),'{"mode":"addition","level":"facts-20","questionSeconds":15,"revealSeconds":3,"patterns":{"rows":true,"columns":true,"diagonals":false},"winners":1,"freeSpace":false,"equivalentFractions":false,"music":"host","celebration":"host"}'::jsonb))->>'result', 'created', 'Bingo rooms are created as before');
select is(public.live_room_game_for_code('654322'), 'math_bingo_live', 'a Bingo code still belongs to Bingo');
select is((public.race_create_room('654322',pg_temp.hash('owner-c'),pg_temp.hash('host-c'),pg_temp.hash('seat-c'),null,'Mina',null,'red',pg_temp.settings(),repeat('f',32),pg_temp.rs()))->>'result', 'code-taken', 'a race cannot take a code Bingo holds');
select is((public.polygon_create_room('482392',pg_temp.hash('poly-owner'),pg_temp.hash('poly-host'),pg_temp.hash('poly-seat'),null,'Mina',null,300,repeat('d',32),jsonb_build_object('rules',1,'board',repeat('01230123',8),'cursors',jsonb_build_array(0,0,0,0,0,0,0,0),'reshuffles',0,'moves',0,'coins',0,'score',0,'matches',0,'cascades',0,'largestClear',0,'bestCombo',0,'cleared',0)))->>'result', 'created', 'Polygon Showdown rooms are created as before');
select is(public.live_room_game_for_code('482392'), 'polygon_showdown', 'a Showdown code still belongs to Polygon Showdown');
select is((public.race_create_room('482392',pg_temp.hash('owner-c'),pg_temp.hash('host-c'),pg_temp.hash('seat-c'),null,'Mina',null,'red',pg_temp.settings(),repeat('f',32),pg_temp.rs()))->>'result', 'code-taken', 'a race cannot take a code a Showdown holds');
select throws_ok($$ update public.polygon_rooms set code='371524' where code='482392' $$, '23505', null, 'the guard holds even for a direct write');

-- Joining: a code and a name, nothing else.
select is((public.race_join_room('371524','Ava','🚀','pink',pg_temp.hash('seat-ava'),pg_temp.hash('addr'),null,pg_temp.rs()))->>'result', 'joined', 'a guest joins with a code and a name');
select is((public.race_join_room('371524','Ava',null,'red',pg_temp.hash('seat-ava2'),pg_temp.hash('addr'),null,pg_temp.rs())->'me'->>'name'), 'Ava 2', 'a repeated name stays readable');
select is((public.race_join_room('371524','Ben',null,'ultraviolet',pg_temp.hash('seat-ben'),pg_temp.hash('addr'),null,pg_temp.rs()))->>'result', 'invalid-request', 'only the listed colours');
select is((public.race_join_room('371524','Ben',null,'green',pg_temp.hash('seat-ben'),pg_temp.hash('addr'),null,pg_temp.rs(3,0,1)))->>'result', 'invalid-request', 'nobody joins with a head start');
select is((public.race_join_room('371524','Ben',null,'green',pg_temp.hash('seat-ben'),pg_temp.hash('addr'),'bbbbbbbb-2222-4222-8222-222222222222',pg_temp.rs()))->>'result', 'joined', 'a signed-in racer joins the same way');
select is((public.race_join_room('111111','Ava',null,'red',pg_temp.hash('seat-x'),pg_temp.hash('addr'),null,pg_temp.rs()))->>'result', 'not-found', 'a wrong code finds nothing');
select is((select count(*)::int from public.race_wallets w where not exists (select 1 from auth.users u where u.id=w.user_id)), 0, 'a guest gets no wallet');
select is((select count(*)::int from public.race_participants where room_id=(select value::uuid from fixture where name='room') and status='active'), 4, 'four racers in the room');

-- The creator's authority is the session and the host token together.
select is((public.race_host_command(pg_temp.hash('owner-b'),pg_temp.hash('host-a'),'start','{}'))->>'result', 'not-found', 'the host token without the creator''s session commands nothing');
select is((public.race_host_command(pg_temp.hash('owner-a'),pg_temp.hash('seat-a'),'start','{}'))->>'result', 'not-found', 'a seat token is not a host token');
select is((public.race_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'lock','{}'))->>'locked', 'true', 'the creator can lock joining');
select is((public.race_join_room('371524','Late',null,'red',pg_temp.hash('seat-late'),pg_temp.hash('addr'),null,pg_temp.rs()))->>'result', 'locked', 'a locked room takes no new racers');
select is((public.race_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'unlock','{}'))->>'locked', 'false', 'and unlock it');
select is((public.race_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'remove',jsonb_build_object('participant',(select id from public.race_participants where token_hash=pg_temp.hash('seat-ava2')))))->>'result', 'ok', 'the creator can remove a racer');
select is(public.race_player_load(pg_temp.hash('seat-ava2'))->>'result', 'removed', 'who is then out');
select is((public.race_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'remove',jsonb_build_object('participant',(select id from public.race_participants where token_hash=pg_temp.hash('seat-a')))))->>'result', 'not-removable', 'the creator cannot be removed');
select is(public.race_leave(pg_temp.hash('seat-a'))->>'result', 'creator-stays', 'and cannot walk out of their own room');

-- The start: one clock, one instant, for everyone.
select is((public.race_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'start','{"countdownMs":5000}'))->>'phase', 'COUNTDOWN', 'the creator starts the countdown');
select is(public.race_player_load(pg_temp.hash('seat-ava'))->>'startsAtMs', public.race_player_load(pg_temp.hash('seat-ben'))->>'startsAtMs', 'every racer has the same start time');
select is((public.race_join_room('371524','Late',null,'red',pg_temp.hash('seat-late'),pg_temp.hash('addr'),null,pg_temp.rs()))->>'result', 'started', 'nobody joins after the start');
select is((public.race_player_commit(pg_temp.hash('seat-ava'),1,pg_temp.rs(1,0,0.2)))->>'result', 'conflict', 'no answer counts before the lights go out');
update public.race_rooms set starts_at = statement_timestamp() - interval '5 minutes' where id=(select value::uuid from fixture where name='room');
select is(public.race_player_load(pg_temp.hash('seat-ava'))->>'phase', 'ACTIVE', 'then the race is on');
select is((public.race_player_commit(pg_temp.hash('seat-ava'),1,pg_temp.rs(1,0,0.2)))->>'result', 'ok', 'an answer is saved');
select is((public.race_player_commit(pg_temp.hash('seat-ava'),1,pg_temp.rs(2,0,0.4)))->>'result', 'conflict', 'a stale save is refused');
select is((public.race_player_commit(pg_temp.hash('seat-ava'),2,pg_temp.rs(0,0,0)))->>'result', 'conflict', 'progress never goes back');
select is((public.race_player_commit(pg_temp.hash('seat-ava'),2,pg_temp.rs(29,0,8,150000)))->>'result', 'invalid-request', 'nobody finishes with 29 correct answers');
select is((public.race_player_commit(pg_temp.hash('seat-ava'),2,pg_temp.rs(40,1,8,150000)))->>'result', 'ok', 'a finish with 30 or more is recorded');
select is((select finish_ms from public.race_participants where token_hash=pg_temp.hash('seat-ava')), 150000, 'with its time');
select is((public.race_player_commit(pg_temp.hash('seat-ava'),3,pg_temp.rs(41,1,8,100000)))->>'result', 'conflict', 'a finish time is written once and never improved afterwards');

-- Finish order: by the moment each racer crossed the line; the same moment shares a place.
select is((public.race_player_commit(pg_temp.hash('seat-ben'),1,pg_temp.rs(35,0,8,150000)))->>'result', 'ok', 'a second racer finishes in the same millisecond');
select is((public.race_player_commit(pg_temp.hash('seat-a'),1,pg_temp.rs(33,4,8,190000)))->>'result', 'ok', 'and a third, later');
select is(
  (select jsonb_object_agg(row->>'name', (row->>'rank')::int) from jsonb_array_elements(private.race_standings((select value::uuid from fixture where name='room'))) row),
  '{"Ava":1,"Ben":1,"Casey":3}'::jsonb, 'the tie shares first place and the next racer is third, whoever joined first');

-- When everyone is home the race ends by itself, and the result is fixed once.
update public.race_rooms set standings_at = statement_timestamp() - interval '5 seconds' where id=(select value::uuid from fixture where name='room');
select is(public.race_player_load(pg_temp.hash('seat-ben'))->>'phase', 'COMPLETE', 'the race completes when every racer has finished');
select is((public.race_player_load(pg_temp.hash('seat-ben'))->>'finalized')::boolean, false, 'answers in flight are let in before the result is fixed');
update public.race_rooms set ends_at = statement_timestamp() - interval '5 seconds' where id=(select value::uuid from fixture where name='room');
select is((public.race_player_load(pg_temp.hash('seat-ben'))->>'finalized')::boolean, true, 'then it is fixed');
select is((public.race_player_commit(pg_temp.hash('seat-a'),2,pg_temp.rs(33,4,8,190000)))->>'result', 'conflict', 'and nothing changes after that');
select is((select online_played from public.race_profiles where user_id='bbbbbbbb-2222-4222-8222-222222222222'), 1, 'a signed-in racer has the race counted');
select is((select online_won from public.race_profiles where user_id='bbbbbbbb-2222-4222-8222-222222222222'), 1, 'and a shared first place is a win');
select is((select online_won from public.race_profiles where user_id='aaaaaaaa-1111-4111-8111-111111111111'), 0, 'third place is not');
select is((select count(*)::int from public.race_ledger where created_at >= statement_timestamp() - interval '1 second' and idempotency_key like 'online%'), 0, 'an Online Race pays no Race Dollars');

-- A creator's next room closes the previous one.
select is((public.race_create_room('371525',pg_temp.hash('owner-a'),pg_temp.hash('host-a2'),pg_temp.hash('seat-a2'),null,'Casey',null,'gold',pg_temp.settings(),repeat('e',32),pg_temp.rs()))->>'result', 'created', 'the creator opens a new room');
select is((select status from public.race_rooms where id=(select value::uuid from fixture where name='room')), 'closed', 'the old one closes');
select is((public.race_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a2'),'end','{}'))->>'result', 'closed', 'ending a room in the lobby closes it');
select is(public.live_room_game_for_code('371525'), null, 'and frees its code');

select * from finish();
rollback;
