-- Polygon Showdown: permanent progress belongs to accounts, rooms are temporary,
-- coins move exactly once, and a browser can never reach any of it directly.
begin;
create extension if not exists pgtap with schema extensions;
set search_path = extensions, public;
select plan(99);

-- ------------------------------------------------------------------- fixture
insert into auth.users(id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','polygon-a@example.test','x',now(),now(),now(),'{}','{}'),
  ('22222222-2222-2222-2222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','polygon-b@example.test','x',now(),now(),now(),'{}','{}');

create temporary table fixture(name text primary key, value text);
grant all on fixture to service_role;

create or replace function pg_temp.state(p_board text default repeat('01230123',8), p_moves int default 0, p_coins int default 0, p_score bigint default 0, p_matches int default 0, p_cascades int default 0, p_clear int default 0, p_combo int default 0)
returns jsonb language sql immutable as $$
  select jsonb_build_object('rules',1,'board',p_board,'cursors',jsonb_build_array(0,0,0,0,0,0,0,0),'reshuffles',0,'moves',p_moves,'coins',p_coins,'score',p_score,'matches',p_matches,'cascades',p_cascades,'largestClear',p_clear,'bestCombo',p_combo,'cleared',0)
$$;

create or replace function pg_temp.hash(p text) returns text language sql immutable as $$ select md5(p)||md5(p||'x') $$;

-- ---------------------------------------------------------------- the catalog
select is((select status from public.game_catalog_entries where stable_key='polygon-showdown'), 'draft', 'the catalog entry is a draft');
select is((select title from public.game_catalog_entries where stable_key='polygon-showdown'), 'Polygon Showdown', 'it is called Polygon Showdown');
select is((select slug from public.game_catalog_entries where stable_key='polygon-showdown'), 'polygon-showdown', 'its slug is polygon-showdown');
select ok((select 'geometry' = any(topics) from public.game_catalog_entries where stable_key='polygon-showdown'), 'it is filed under geometry');
select is((select publication_metadata->>'category' from public.game_catalog_entries where stable_key='polygon-showdown'), 'Geometry', 'its category is Geometry');
select ok((select 'free-game' = any(tags) from public.game_catalog_entries where stable_key='polygon-showdown'), 'it is tagged as free');

-- -------------------------------------------------------------- nothing is public
select ok(not has_table_privilege('anon','public.polygon_wallets','select'), 'anon cannot read wallets');
select ok(not has_table_privilege('authenticated','public.polygon_wallets','select'), 'signed-in browsers cannot read wallets');
select ok(not has_table_privilege('authenticated','public.polygon_ledger','select'), 'signed-in browsers cannot read the ledger');
select ok(not has_table_privilege('authenticated','public.polygon_inventory','insert'), 'signed-in browsers cannot add inventory');
select ok(not has_table_privilege('authenticated','public.polygon_rooms','select'), 'signed-in browsers cannot read rooms');
select ok(not has_table_privilege('anon','public.polygon_participants','select'), 'anon cannot read participants');
select ok((select relforcerowsecurity from pg_class where oid='public.polygon_wallets'::regclass), 'wallets force row level security');
select ok((select relforcerowsecurity from pg_class where oid='public.polygon_ledger'::regclass), 'the ledger forces row level security');
select ok((select relforcerowsecurity from pg_class where oid='public.polygon_rooms'::regclass), 'rooms force row level security');
select ok(not has_function_privilege('anon','public.polygon_purchase(uuid,text,text)','execute'), 'anon cannot call purchase');
select ok(not has_function_privilege('authenticated','public.polygon_purchase(uuid,text,text)','execute'), 'signed-in browsers cannot call purchase');
select ok(not has_function_privilege('authenticated','public.polygon_solo_commit(uuid,uuid,integer,integer,jsonb,integer,boolean,text[],boolean)','execute'), 'signed-in browsers cannot save runs');
select ok(not has_function_privilege('authenticated','public.polygon_player_commit(text,integer,jsonb,integer)','execute'), 'signed-in browsers cannot save moves');
select ok(has_function_privilege('service_role','public.polygon_purchase(uuid,text,text)','execute'), 'the application server can');
select ok(not has_table_privilege('service_role','public.polygon_ledger','update'), 'not even the application can rewrite the ledger');
select ok(not has_table_privilege('service_role','public.polygon_ledger','delete'), 'not even the application can delete the ledger');

-- -------------------------------------------------------------------- Solo
select is((public.polygon_bootstrap('11111111-1111-1111-1111-111111111111')->'wallet'->>'balance')::int, 0, 'a new account starts with no coins');
select is(public.polygon_bootstrap('11111111-1111-1111-1111-111111111111')->'activeRun', 'null'::jsonb, 'and no run');

insert into fixture select 'run', (public.polygon_solo_start('11111111-1111-1111-1111-111111111111', repeat('a',32), pg_temp.state(), false))->>'id';
select is((public.polygon_solo_start('11111111-1111-1111-1111-111111111111', repeat('b',32), pg_temp.state(), false))->>'result', 'run-active', 'a second run does not silently replace the first');

select is(
  (public.polygon_solo_commit('11111111-1111-1111-1111-111111111111',(select value::uuid from fixture where name='run'),1,1,pg_temp.state(repeat('01230123',8),5,10,300,6,1,4,2),1000,false,array['first-match'],false))->>'result',
  'ok', 'a save goes through');
select is((select (state->>'coins')::int from public.polygon_solo_runs where id=(select value::uuid from fixture where name='run')), 10, 'the run remembers its coins');
select is((select best_combo from public.polygon_profiles where user_id='11111111-1111-1111-1111-111111111111'), 2, 'the best combo is saved');
select ok((select achievements ? 'first-match' from public.polygon_profiles where user_id='11111111-1111-1111-1111-111111111111'), 'the achievement is saved');

select is(
  (public.polygon_solo_commit('11111111-1111-1111-1111-111111111111',(select value::uuid from fixture where name='run'),1,1,pg_temp.state(repeat('01230123',8),9,20,300,6,1,4,2),1000,false,'{}',false))->>'result',
  'conflict', 'a stale save is refused');
select is(
  (public.polygon_solo_commit('11111111-1111-1111-1111-111111111111',(select value::uuid from fixture where name='run'),9,2,pg_temp.state(repeat('01230123',8),9,20,300,6,1,4,2),1000,false,'{}',false))->>'result',
  'superseded', 'a save from a replaced window is refused');
select is(
  (public.polygon_solo_commit('11111111-1111-1111-1111-111111111111',(select value::uuid from fixture where name='run'),1,2,pg_temp.state(repeat('01230123',8),9,5,300,6,1,4,2),1000,false,'{}',false))->>'result',
  'invalid-request', 'coins can never go down in a run');
select is(
  (public.polygon_solo_commit('22222222-2222-2222-2222-222222222222',(select value::uuid from fixture where name='run'),1,2,pg_temp.state(repeat('01230123',8),9,20,300,6,1,4,2),1000,false,'{}',false))->>'result',
  'not-found', 'someone else cannot save this run');

-- Forcing the coins into the wallet, then asking again: paid once.
select is((public.polygon_solo_commit('11111111-1111-1111-1111-111111111111',(select value::uuid from fixture where name='run'),1,2,pg_temp.state(repeat('01230123',8),9,30,300,6,1,4,2),1000,true,'{}',false))->>'balance', '30', 'banking puts the run''s coins in the wallet');
select is((public.polygon_solo_commit('11111111-1111-1111-1111-111111111111',(select value::uuid from fixture where name='run'),1,3,pg_temp.state(repeat('01230123',8),9,30,300,6,1,4,2),1000,true,'{}',false))->>'balance', '30', 'banking again adds nothing');
select is((select count(*)::int from public.polygon_ledger where user_id='11111111-1111-1111-1111-111111111111'), 1, 'one ledger line for one earning');
select is((select event from public.polygon_ledger where user_id='11111111-1111-1111-1111-111111111111'), 'EARN_SOLO', 'recorded as EARN_SOLO');
select is((select balance_after from public.polygon_ledger where user_id='11111111-1111-1111-1111-111111111111'), 30, 'with the balance it left');

-- Coming back: a new window takes over and continues.
select is((public.polygon_solo_open('11111111-1111-1111-1111-111111111111')->>'epoch')::int, 2, 'continuing opens the run for this window');
select is((public.polygon_solo_open('11111111-1111-1111-1111-111111111111')->'state'->>'coins')::int, 30, 'with its coins restored');
select is((public.polygon_bootstrap('11111111-1111-1111-1111-111111111111')->'activeRun'->>'coins')::int, 30, 'the home screen knows the run is waiting');

-- Coins left unbanked reach the wallet when the player next arrives.
select lives_ok($$ select public.polygon_solo_commit('11111111-1111-1111-1111-111111111111',(select value::uuid from fixture where name='run'),3,4,pg_temp.state(repeat('01230123',8),10,33,300,6,1,4,2),1000,false,'{}',false) $$, 'a small save stays out of the wallet for now');
select is((public.polygon_bootstrap('11111111-1111-1111-1111-111111111111')->'wallet'->>'balance')::int, 33, 'and is banked on the next visit');

-- ------------------------------------------------------------------ the shop
update public.polygon_wallets set balance=500 where user_id='11111111-1111-1111-1111-111111111111';
select is((public.polygon_purchase('11111111-1111-1111-1111-111111111111','shoes-nova-high','key-00000001'))->>'result', 'ok', 'buying works');
select is((select balance from public.polygon_wallets where user_id='11111111-1111-1111-1111-111111111111'), 150, 'the example: 500 less 350 leaves 150');
select ok(exists(select 1 from public.polygon_inventory where user_id='11111111-1111-1111-1111-111111111111' and item_key='shoes-nova-high'), 'the shoes are owned');
select is((public.polygon_purchase('11111111-1111-1111-1111-111111111111','shoes-nova-high','key-00000001'))->>'idempotent', 'true', 'the same purchase retried is recognised');
select is((select balance from public.polygon_wallets where user_id='11111111-1111-1111-1111-111111111111'), 150, 'and charges nothing');
select is((public.polygon_purchase('11111111-1111-1111-1111-111111111111','shoes-nova-high','key-00000002'))->>'result', 'owned', 'an owned item cannot be bought twice');
select is((select balance from public.polygon_wallets where user_id='11111111-1111-1111-1111-111111111111'), 150, 'even with a new key');
select is((public.polygon_purchase('11111111-1111-1111-1111-111111111111','hat-supernova-halo','key-00000003'))->>'result', 'insufficient', 'too expensive is refused');
select is((select balance from public.polygon_wallets where user_id='11111111-1111-1111-1111-111111111111'), 150, 'and costs nothing');
select ok(not exists(select 1 from public.polygon_inventory where user_id='11111111-1111-1111-1111-111111111111' and item_key='hat-supernova-halo'), 'and gives nothing');
select is((public.polygon_purchase('11111111-1111-1111-1111-111111111111','made-up-item','key-00000004'))->>'result', 'item-not-found', 'an unknown item is refused');
select is((public.polygon_purchase('11111111-1111-1111-1111-111111111111','top-everyday','key-00000005'))->>'result', 'free-item', 'a free item is not sold');
update public.polygon_wallets set balance=75 where user_id='11111111-1111-1111-1111-111111111111';
select is((public.polygon_purchase('11111111-1111-1111-1111-111111111111','hat-snapback','key-00000006'))->>'result', 'ok', 'spending the exact balance works');
select is((select balance from public.polygon_wallets where user_id='11111111-1111-1111-1111-111111111111'), 0, 'and leaves zero');
select throws_ok($$ update public.polygon_wallets set balance=-1 where user_id='11111111-1111-1111-1111-111111111111' $$, '23514', null, 'a balance can never be negative');
select ok((select achievements ? 'first-purchase' from public.polygon_profiles where user_id='11111111-1111-1111-1111-111111111111'), 'the first purchase is remembered');

-- ---------------------------------------------------------------- the avatar
select is((public.polygon_avatar_save('11111111-1111-1111-1111-111111111111', jsonb_build_object('base','base-a','skin','skin-3','hair','hair-afro','hairColor','hc-black','facialHair','fh-none','lipstick','lip-none','eyeShadow','shadow-none','blush','blush-none','eyeliner','liner-none','top','top-navy','bottom','bottom-jeans','shoes','shoes-nova-high'), null, null))->>'result', 'ok', 'wearing what you own works');
select is((public.polygon_avatar_save('22222222-2222-2222-2222-222222222222', jsonb_build_object('base','base-a','skin','skin-3','hair','hair-afro','hairColor','hc-black','facialHair','fh-none','lipstick','lip-none','eyeShadow','shadow-none','blush','blush-none','eyeliner','liner-none','top','top-navy','bottom','bottom-jeans','shoes','shoes-nova-high'), null, null))->>'result', 'item-not-owned', 'wearing what you do not own is refused');
select is((public.polygon_bootstrap('11111111-1111-1111-1111-111111111111')->'profile'->'avatar'->>'shoes'), 'shoes-nova-high', 'the avatar is still wearing the shoes on return');
select is((public.polygon_avatar_save('11111111-1111-1111-1111-111111111111', '{"base":"base-a","top":"shoes-everyday"}'::jsonb, null, null))->>'result', 'avatar-invalid', 'an item in the wrong slot is refused');

-- ----------------------------------------------------------------- the rooms
insert into fixture select 'room', (public.polygon_create_room('482391',pg_temp.hash('owner-a'),pg_temp.hash('host-a'),pg_temp.hash('seat-a'),'11111111-1111-1111-1111-111111111111','Desmond','🦁',300,repeat('c',32),pg_temp.state()))->>'id';
select is((select count(*)::int from public.polygon_participants where room_id=(select value::uuid from fixture where name='room')), 1, 'the creator is a participant from the start');
select ok((select is_creator from public.polygon_participants where token_hash=pg_temp.hash('seat-a')), 'and is marked as creator');
select is((public.polygon_player_load(pg_temp.hash('seat-a'))->>'phase'), 'LOBBY', 'the room begins in the lobby');
select is((public.polygon_create_room('482391',pg_temp.hash('owner-b'),pg_temp.hash('host-b'),pg_temp.hash('seat-b'),null,'Zion','🐼',300,repeat('d',32),pg_temp.state()))->>'result', 'code-taken', 'a code in use is not given out again');
select is(public.live_room_game_for_code('482391'), 'polygon_showdown', 'the code identifies this game');
select is(public.live_room_game_for_code('999999'), null, 'an unknown code identifies nothing');

-- One code space across every live game.
select is((public.bingo_create_room('482391',pg_temp.hash('bingo-owner'),pg_temp.hash('bingo-host'),'{"mode":"addition","level":"facts-20","questionSeconds":15,"revealSeconds":3,"patterns":{"rows":true,"columns":true,"diagonals":false},"winners":1,"freeSpace":false,"equivalentFractions":false,"music":"host","celebration":"host"}'::jsonb))->>'result', 'code-taken', 'Bingo cannot take a code a Showdown holds');
select is((public.bingo_create_room('654321',pg_temp.hash('bingo-owner'),pg_temp.hash('bingo-host'),'{"mode":"addition","level":"facts-20","questionSeconds":15,"revealSeconds":3,"patterns":{"rows":true,"columns":true,"diagonals":false},"winners":1,"freeSpace":false,"equivalentFractions":false,"music":"host","celebration":"host"}'::jsonb))->>'result', 'created', 'Bingo rooms are created as before');
select is(public.live_room_game_for_code('654321'), 'math_bingo_live', 'a Bingo code still belongs to Bingo');
select is((public.polygon_create_room('654321',pg_temp.hash('owner-c'),pg_temp.hash('host-c'),pg_temp.hash('seat-c'),null,'Mina',null,300,repeat('e',32),pg_temp.state()))->>'result', 'code-taken', 'a Showdown cannot take a code Bingo holds');
select is((public.polygon_join_room('482391','Ava','🚀',pg_temp.hash('seat-ava'),pg_temp.hash('addr'),null))->>'result', 'joined', 'a guest joins with a code and a name');
select is((public.polygon_join_room('482391','Ava',null,pg_temp.hash('seat-ava2'),pg_temp.hash('addr'),null)->'me'->>'name'), 'Ava 2', 'a repeated name stays readable');
select is((select user_id from public.polygon_participants where token_hash=pg_temp.hash('seat-ava')), null, 'a guest has no account behind them');
select is((public.polygon_host_command(pg_temp.hash('owner-b'),pg_temp.hash('host-a'),'start','{}'))->>'result', 'not-found', 'a host token without the owner session commands nothing');
select is((public.polygon_host_command(pg_temp.hash('owner-a'),pg_temp.hash('seat-a'),'start','{}'))->>'result', 'not-found', 'a seat token cannot command the room');
select is((public.polygon_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'start','{}'))->>'phase', 'COUNTDOWN', 'the creator starts the room');
select is((public.polygon_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'start','{}'))->>'result', 'already-started', 'starting twice does nothing');
select is((public.polygon_join_room('482391','Omar','⭐',pg_temp.hash('seat-omar'),pg_temp.hash('addr'),null))->>'result', 'joined', 'late players can join while it is unlocked');
select is((public.polygon_host_command(pg_temp.hash('owner-a'),pg_temp.hash('host-a'),'lock','{}'))->>'locked', 'true', 'the creator can lock joining');
select is((public.polygon_join_room('482391','Late',null,pg_temp.hash('seat-late'),pg_temp.hash('addr'),null))->>'result', 'locked', 'locked means locked');

-- Rewind the clock to play: moves land on one row, and only that row.
update public.polygon_rooms set starts_at=now()-interval '10 seconds', ends_at=now()+interval '5 minutes' where code='482391';
select is((public.polygon_player_commit(pg_temp.hash('seat-a'),1,pg_temp.state(repeat('01230123',8),5,45,450,5,1,4,3),2000))->>'result','ok','the creator plays like anyone else');
select is((public.polygon_player_commit(pg_temp.hash('seat-ava'),1,pg_temp.state(repeat('01230123',8),5,48,480,5,1,4,3),2000))->>'result','ok','and so does a guest');
select is((public.polygon_player_commit(pg_temp.hash('seat-a'),1,pg_temp.state(repeat('01230123',8),6,99,450,5,1,4,3),2000))->>'result','conflict','a stale save is refused');

-- The buzzer, the standings and the reward.
update public.polygon_rooms set standings_at=null, ends_at=now()-interval '5 seconds' where code='482391';
select is((public.polygon_player_commit(pg_temp.hash('seat-a'),2,pg_temp.state(repeat('01230123',8),9,500,450,5,1,4,3),2000))->>'result','conflict','nothing scores after the buzzer and the grace');
select is((public.polygon_player_load(pg_temp.hash('seat-ava'))->>'phase'),'COMPLETE','the buzzer ends the room');
select ok((public.polygon_player_load(pg_temp.hash('seat-ava'))->>'finalized')::boolean,'and the results are final');
select is((public.polygon_player_load(pg_temp.hash('seat-ava'))->'standings'->0->>'name'),'Ava','the creator can lose: the guest with more coins is first');
select is((select amount from public.polygon_ledger where idempotency_key like 'showdown:'||(select value from fixture where name='room')||':%' and user_id='11111111-1111-1111-1111-111111111111'),22,'a signed-in player earns half their Showdown coins');
select is((select count(*)::int from public.polygon_ledger where idempotency_key like 'showdown:'||(select value from fixture where name='room')||':%'),1,'and the guests earn nothing permanent');
select lives_ok($$ select public.polygon_player_load(pg_temp.hash('seat-a')) $$,'reading the results again');
select is((select count(*)::int from public.polygon_ledger where idempotency_key like 'showdown:'||(select value from fixture where name='room')||':%'),1,'pays nothing more');
select is((select count(*)::int from public.polygon_wallets w join public.polygon_participants p on p.user_id=w.user_id where p.token_hash in (pg_temp.hash('seat-ava'),pg_temp.hash('seat-omar'))),0,'a guest never gets a wallet');
select ok((select achievements ? 'first-showdown' from public.polygon_profiles where user_id='11111111-1111-1111-1111-111111111111'),'the signed-in creator gets the achievement');

-- The daily limit on banked coins.
update public.polygon_wallets set earned_day=(statement_timestamp() at time zone 'utc')::date, earned_today=14990 where user_id='11111111-1111-1111-1111-111111111111';
select is((private.polygon_credit('11111111-1111-1111-1111-111111111111','EARN_SOLO',50,'cap-test-1','{}')->>'credited')::int, 10, 'a day''s earnings stop at the limit');
select is((private.polygon_credit('11111111-1111-1111-1111-111111111111','EARN_SOLO',50,'cap-test-2','{}')->>'capped')::boolean, true, 'and say so');
select is((private.polygon_credit('11111111-1111-1111-1111-111111111111','EARN_SOLO',50,'cap-test-1','{}')->>'duplicate')::boolean, true, 'the same earning twice is recognised');

select * from finish();
rollback;
