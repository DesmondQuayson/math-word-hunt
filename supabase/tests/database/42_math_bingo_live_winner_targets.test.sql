begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Math Bingo Live winner targets and variable pacing (20261111100000): any
-- winner target from 1 to 60, a first winner gate drawn per game from calls
-- 14-17, a fresh 8-11 call gap drawn after every new winner event, same-call
-- ties that share a placement (past the target too), and games that end
-- when the target is reached, when everyone has won, or never with an
-- invented winner. The win checks below drive the real mark function; the
-- position of the room in its game (call number, called answer) is set
-- directly so that every gate boundary can be tested exactly.

-- Fixtures (as in 40_math_bingo_live_pacing) --------------------------------------------------------
create function pg_temp.settings(p_winners jsonb) returns jsonb language sql as $$
  select jsonb_build_object('mode','addition','level','within-50','questionSeconds',0,'revealSeconds',0,
    'patterns',jsonb_build_object('rows',true,'columns',false,'diagonals',false),'winners',p_winners,
    'freeSpace',true,'music','host','celebration','host','equivalentFractions',false)
$$;
create function pg_temp.settings(p_winners integer) returns jsonb language sql as $$ select pg_temp.settings(to_jsonb(p_winners)) $$;
create function pg_temp.q(p_a integer, p_b integer) returns jsonb language sql as $$
  select jsonb_build_object('q','addition:'||least(p_a,p_b)||':'||greatest(p_a,p_b),'c',(p_a+p_b)::text||'/1','t',p_a||' + '||p_b,'s','x','k','arithmetic','n',p_a+p_b,'d',1)
$$;
create function pg_temp.universe() returns jsonb language sql as $$
  select (select jsonb_agg(pg_temp.q(v,0) order by v) from generate_series(1,16) v)
      || (select jsonb_agg(pg_temp.q(v-1,1) order by v) from generate_series(2,16) v)
$$;
create function pg_temp.cell(p_n integer) returns jsonb language sql as $$ select jsonb_build_object('n',p_n,'d',1) $$;
-- Rows: [1 2 3 4 L13] [5 6 7 8 L14] [9 10 F 11 L15] [12 1 2 3 L16] [4 5 6 7 L13]; every row holds a late cell.
create function pg_temp.card() returns jsonb language sql as $$
  select jsonb_build_array(
    pg_temp.cell(1), pg_temp.cell(2), pg_temp.cell(3), pg_temp.cell(4), pg_temp.cell(13),
    pg_temp.cell(5), pg_temp.cell(6), pg_temp.cell(7), pg_temp.cell(8), pg_temp.cell(14),
    pg_temp.cell(9), pg_temp.cell(10), '{"free":true}'::jsonb, pg_temp.cell(11), pg_temp.cell(15),
    pg_temp.cell(12), pg_temp.cell(1), pg_temp.cell(2), pg_temp.cell(3), pg_temp.cell(16),
    pg_temp.cell(4), pg_temp.cell(5), pg_temp.cell(6), pg_temp.cell(7), pg_temp.cell(13))
$$;
create function pg_temp.pacing() returns jsonb language sql as $$
  select jsonb_build_object('late',jsonb_build_array('13/1','14/1','15/1','16/1'),'reserve','[]'::jsonb)
$$;
create function pg_temp.hex(p_prefix text, p_i integer) returns text language sql as $$ select rpad(p_prefix, 60, '0') || lpad(p_i::text, 4, '0') $$;
create function pg_temp.room(p_token text) returns public.bingo_rooms language sql as $$ select * from public.bingo_rooms where host_token_hash=p_token $$;
create function pg_temp.boards(p_token text) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(p.id::text, pg_temp.card()), '{}'::jsonb) from public.bingo_participants p where p.room_id=(pg_temp.room(p_token)).id and p.status='active'
$$;
-- A room with p_players players (tokens pg_temp.hex(p_prefix, 1..n)), started as a paced game with seed p_seed.
create function pg_temp.game(p_code text, p_owner text, p_token text, p_winners integer, p_prefix text, p_players integer, p_seed text) returns text language plpgsql as $$
declare g integer;
begin
  perform public.bingo_create_room(p_code, p_owner, p_token, pg_temp.settings(p_winners));
  for g in 1..p_players loop
    perform public.bingo_join_room(p_code, 'P'||g, pg_temp.hex(p_prefix, g), '7777777777777777777777777777777777777777777777777777777777777777', null);
  end loop;
  return public.bingo_host_start_paced(p_owner, p_token, 'start', pg_temp.settings(p_winners), p_seed, pg_temp.universe(), pg_temp.boards(p_token), pg_temp.pacing())->>'result';
end $$;
-- Put the room on call p_call with answer p_answer live (the scheduler's choice is tested in suite 40).
create function pg_temp.at_call(p_token text, p_call integer, p_answer integer) returns integer language sql as $$
  update public.bingo_rooms set phase='QUESTION_ACTIVE', question_number=p_call, phase_deadline=null,
    deck=(select jsonb_agg(pg_temp.q(p_answer,0)) from generate_series(1,p_call)),
    phase_started_at=statement_timestamp(), question_started_at=statement_timestamp(), version=version+1
    where host_token_hash=p_token returning question_number
$$;
-- A player holding cells 0-3 of row 1 (1 2 3 4): the late cell 4 (13) completes it.
create function pg_temp.ready(p_player text) returns void language sql as $$
  update public.bingo_participants set marks=15, best_count=4, version=version+1 where token_hash=p_player
$$;
create function pg_temp.tap(p_token text, p_player text, p_cell integer) returns text language sql as $$
  select public.bingo_mark(p_player, (pg_temp.room(p_token)).game_number, (pg_temp.room(p_token)).question_number, p_cell)->>'result'
$$;
create function pg_temp.next(p_owner text, p_token text) returns text language sql as $$
  select (public.bingo_host_command(p_owner, p_token, 'next',
    (select jsonb_build_object('phase',phase,'question',question_number) from public.bingo_rooms where host_token_hash=p_token)))->>'result'
$$;
create function pg_temp.placement(p_player text) returns integer language sql as $$ select placement from public.bingo_participants where token_hash=p_player $$;
create function pg_temp.rank(p_owner text, p_token text, p_player text) returns text language sql as $$
  select e->>'rank' || case when (e->>'tied')::boolean then 'T' else '' end
  from jsonb_array_elements(public.bingo_host_state(p_owner, p_token, null, null)->'leaderboard') e
  where e->>'id' = (select id::text from public.bingo_participants where token_hash=p_player)
$$;

-- 1. A winner target is a whole number from 1 to 60 (server-side, new rooms and settings) ---------------
select is(public.bingo_create_room('900001',pg_temp.hex('a1',1),pg_temp.hex('b1',1),pg_temp.settings(0))->>'result','invalid-settings','0 winners is refused');
select is(public.bingo_create_room('900001',pg_temp.hex('a1',2),pg_temp.hex('b1',2),pg_temp.settings(-1))->>'result','invalid-settings','a negative target is refused');
select is(public.bingo_create_room('900001',pg_temp.hex('a1',3),pg_temp.hex('b1',3),pg_temp.settings('1.5'::jsonb))->>'result','invalid-settings','a decimal target is refused');
select is(public.bingo_create_room('900001',pg_temp.hex('a1',4),pg_temp.hex('b1',4),pg_temp.settings('"5"'::jsonb))->>'result','invalid-settings','a target written as text is refused');
select is(public.bingo_create_room('900001',pg_temp.hex('a1',5),pg_temp.hex('b1',5),pg_temp.settings('"NaN"'::jsonb))->>'result','invalid-settings','"NaN" is refused');
select is(public.bingo_create_room('900001',pg_temp.hex('a1',6),pg_temp.hex('b1',6),pg_temp.settings('null'::jsonb))->>'result','invalid-settings','a missing target is refused');
select is(public.bingo_create_room('900001',pg_temp.hex('a1',7),pg_temp.hex('b1',7),pg_temp.settings(61))->>'result','invalid-settings','61 is refused: a room holds at most 60 players');
select is(public.bingo_create_room('900001',pg_temp.hex('a1',8),pg_temp.hex('b1',8),pg_temp.settings('1e400'::jsonb))->>'result','invalid-settings','an enormous number is refused');
select is(public.bingo_create_room('900002',pg_temp.hex('a1',9),pg_temp.hex('b1',9),pg_temp.settings(1))->>'result','created','1 winner');
select is(public.bingo_create_room('900003',pg_temp.hex('a1',10),pg_temp.hex('b1',10),pg_temp.settings(7))->>'result','created','7 winners (no preset needed)');
select is(public.bingo_create_room('900004',pg_temp.hex('a1',11),pg_temp.hex('b1',11),pg_temp.settings(60))->>'result','created','60 winners');
select is(public.bingo_host_command(pg_temp.hex('a1',10),pg_temp.hex('b1',10),'settings',jsonb_build_object('settings',pg_temp.settings(0)))->>'result','invalid-settings','the lobby cannot change the target to 0');
select is(public.bingo_host_command(pg_temp.hex('a1',10),pg_temp.hex('b1',10),'settings',jsonb_build_object('settings',pg_temp.settings(18)))->>'result','ok','or to 18');
select is((pg_temp.room(pg_temp.hex('b1',10))).settings->'winners','18'::jsonb,'stored as given, not rounded or reset');

-- 2. The draws: server-side, from the secret seed, never from a player --------------------------------
select is(private.bingo_first_gate_bounds(240),array[14,17],'a standard level: first gate 14 to 17');
select is(private.bingo_first_gate_bounds(22),array[14,17],'Fraction Bingo to eighths (22 questions): 14 to 17');
select is(private.bingo_first_gate_bounds(15),array[9,12],'to sixths (15 questions, too small for 14+): 9 to 12');
select is(private.bingo_first_gate_bounds(10),array[4,7],'to fifths (10 questions): 4 to 7');
select is(pg_get_function_arguments('private.bingo_winner_gap(text,integer)'::regprocedure),'p_seed text, p_event integer','a gap depends only on the game seed and the event number (never a player)');
select is(private.bingo_first_gate(repeat('4',32),240),private.bingo_first_gate(repeat('4',32),240),'a draw is repeatable: a retry or reconnect cannot draw again');
create temporary table firsts as select private.bingo_first_gate(md5('room-'||g), 240) as v from generate_series(1,10000) g;
create temporary table gaps as select private.bingo_winner_gap(md5('room-'||g), k) as v from generate_series(1,2500) g, generate_series(1,4) k;
select is((select array_agg(distinct v order by v) from firsts),array[14,15,16,17],'10,000 rooms: every first gate is 14, 15, 16 or 17');
select ok((select bool_and(n between 2300 and 2700) from (select count(*) as n from firsts group by v) s), 'and each value comes up about a quarter of the time');
select is((select array_agg(distinct v order by v) from gaps),array[8,9,10,11],'10,000 winner events: every gap is 8, 9, 10 or 11');
select ok((select bool_and(n between 2300 and 2700) from (select count(*) as n from gaps group by v) s), 'and each value comes up about a quarter of the time');
select ok(not private.bingo_new_settings_valid(pg_temp.settings(0)) and private.bingo_settings_valid(pg_temp.settings(0)),
  'stored rooms from before keep "everyone" valid (the table check), new input cannot use it');

-- 3. Gates: first 14, then +8, +11, +9, +10 (a seed with exactly those draws) ---------------------------
create temporary table seed1 as
  select s from (select md5('sequence-a-'||g) s from generate_series(1,400000) g) x
  where private.bingo_first_gate(s,31)=14 and private.bingo_winner_gap(s,1)=8 and private.bingo_winner_gap(s,2)=11
    and private.bingo_winner_gap(s,3)=9 and private.bingo_winner_gap(s,4)=10 limit 1;
select is((select count(*)::integer from seed1),1,'a seed drawing 14, +8, +11, +9, +10');
\set o1 '''c100000000000000000000000000000000000000000000000000000000000001'''
\set t1 '''c200000000000000000000000000000000000000000000000000000000000001'''
select is(pg_temp.game('901001',:o1,:t1,20,'d1',8,(select s from seed1)),'started','8 players, 20 winners wanted: Start no longer refuses a target');
select is(((pg_temp.room(:t1)).pacing->>'firstWinCall')::integer,14,'the first gate drawn for this game: call 14');
select is(((pg_temp.room(:t1)).pacing->>'nextEligibleCall')::integer,14,'nobody can win before it');
select ok(not (public.bingo_host_state(:o1,:t1,null,null)::text like '%nextEligibleCall%') and not (public.bingo_player_state(pg_temp.hex('d1',1),null,null)::text like '%firstWinCall%'), 'the gates are not sent to the host or to a student');
select pg_temp.ready(pg_temp.hex('d1',g)) from generate_series(1,8) g;
select is(pg_temp.at_call(:t1,13,13),13,'call 13 (one before the gate)');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',1),4),'correct','P1 completes a row on call 13');
select is((pg_temp.room(:t1)).winner_count,0,'before the first gate it is not a Bingo');
select is((select pending_line from public.bingo_participants where token_hash=pg_temp.hex('d1',1)),'row-1','the line is kept, waiting for a gate');
select is(pg_temp.at_call(:t1,14,13),14,'call 14: the first gate');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',2),4),'correct','P2 completes a row on call 14');
select is(pg_temp.placement(pg_temp.hex('d1',2)),1,'the first winner');
select is(((pg_temp.room(:t1)).pacing->>'nextEligibleCall')::integer,22,'the next new winner: not before call 22 (14 + 8)');
select is(pg_temp.at_call(:t1,21,13),21,'call 21');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',3),4),'correct','P3 completes a row on call 21');
select is((pg_temp.room(:t1)).winner_count,1,'one call too early: not a Bingo');
select is(pg_temp.at_call(:t1,22,13),22,'call 22');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',4),4),'correct','P4 completes a row on call 22');
select is(pg_temp.placement(pg_temp.hex('d1',4)),2,'the second winner, exactly at the gate');
select is(((pg_temp.room(:t1)).pacing->>'nextEligibleCall')::integer,33,'a fresh gap: not before call 33 (22 + 11)');
select is(pg_temp.at_call(:t1,33,13),33,'call 33');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',5),4),'correct','P5 completes a row on call 33');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',6),4),'correct','P6 completes a row on the same call');
select is(array[pg_temp.placement(pg_temp.hex('d1',5)),pg_temp.placement(pg_temp.hex('d1',6))],array[3,3],'P5 and P6 share third place');
select is(((pg_temp.room(:t1)).pacing->>'nextEligibleCall')::integer,42,'one event, one gap: not before call 42 (33 + 9)');
select is(pg_temp.at_call(:t1,41,13),41,'call 41');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',7),4),'correct','P7 completes a row on call 41');
select is(pg_temp.at_call(:t1,42,13),42,'call 42');
select is(pg_temp.tap(:t1,pg_temp.hex('d1',8),4),'correct','P8 completes a row on call 42');
select is(pg_temp.placement(pg_temp.hex('d1',8)),5,'fifth (after four winners, two of them tied)');
select is(((pg_temp.room(:t1)).pacing->>'nextEligibleCall')::integer,52,'not before call 52 (42 + 10)');
select is((pg_temp.room(:t1)).pacing->'gaps','[8,11,9,10]'::jsonb,'the gaps drawn, one per winner event');
select is((select jsonb_agg(e->'n') from jsonb_array_elements((pg_temp.room(:t1)).pacing->'winnerEvents') e),'[14,22,33,42]'::jsonb,'the winner calls');
select is((select jsonb_agg(e->'winners') from jsonb_array_elements((pg_temp.room(:t1)).pacing->'winnerEvents') e),'[1,1,2,1]'::jsonb,'and the winners of each event');
select is(array[pg_temp.rank(:o1,:t1,pg_temp.hex('d1',2)),pg_temp.rank(:o1,:t1,pg_temp.hex('d1',4)),pg_temp.rank(:o1,:t1,pg_temp.hex('d1',5)),pg_temp.rank(:o1,:t1,pg_temp.hex('d1',6)),pg_temp.rank(:o1,:t1,pg_temp.hex('d1',8))],
  array['1','2','3T','3T','5'],'standings: 1, 2, T-3, T-3, 5');
update public.bingo_participants set correct_count=9 where token_hash=pg_temp.hex('d1',5);
select is(array[pg_temp.rank(:o1,:t1,pg_temp.hex('d1',5)),pg_temp.rank(:o1,:t1,pg_temp.hex('d1',6))],array['3T','3T'],'tied winners stay tied whatever their marks');
-- Three lines wait (P1, P3, P7). At the gate of call 52 the scheduler confirms them together.
select is(pg_temp.at_call(:t1,51,13),51,'call 51');
select is(pg_temp.next(:o1,:t1),'ok','reveal call 51');
select is(pg_temp.next(:o1,:t1),'ok','the scheduler moves to call 52');
select is((pg_temp.room(:t1)).winner_count,8,'the three waiting lines are confirmed at the gate');
select is((select array_agg(placement order by token_hash) from public.bingo_participants where token_hash in (pg_temp.hex('d1',1),pg_temp.hex('d1',3),pg_temp.hex('d1',7))),array[6,6,6],'sharing sixth place (none could win earlier than the others)');
select is((select array_agg((e->>'completedAt')::integer order by (e->>'completedAt')::integer) from jsonb_array_elements((pg_temp.room(:t1)).winners) e where e ? 'completedAt'),array[13,21,41],'each records the call its line was completed');
select is((select array_agg(distinct (e->>'question')::integer) from jsonb_array_elements((pg_temp.room(:t1)).winners) e where e ? 'completedAt'),array[52],'and the call it was confirmed');
select is((pg_temp.room(:t1)).phase,'WINNER_REVEAL','all 8 players have won: the game ends although 20 were wanted');
select is((pg_temp.room(:t1)).completed_reason,'everyone','because everyone has Bingo');
select is((select count(distinct e->>'id')::integer from jsonb_array_elements((pg_temp.room(:t1)).winners) e),8,'8 different winners: none invented, none counted twice');

-- 4. Gates: first 17, then +11, +8 -----------------------------------------------------------------------
create temporary table seed2 as
  select s from (select md5('sequence-b-'||g) s from generate_series(1,100000) g) x
  where private.bingo_first_gate(s,31)=17 and private.bingo_winner_gap(s,1)=11 and private.bingo_winner_gap(s,2)=8 limit 1;
\set o2 '''c100000000000000000000000000000000000000000000000000000000000002'''
\set t2 '''c200000000000000000000000000000000000000000000000000000000000002'''
select is(pg_temp.game('901002',:o2,:t2,10,'d2',5,(select s from seed2)),'started','a game drawing 17, +11, +8');
select pg_temp.ready(pg_temp.hex('d2',g)) from generate_series(1,5) g;
select is(pg_temp.at_call(:t2,16,13),16,'call 16');
select is(pg_temp.tap(:t2,pg_temp.hex('d2',1),4),'correct','a row completed on call 16');
select is((pg_temp.room(:t2)).winner_count,0,'is not a Bingo: the first gate is 17 in this game');
select is(pg_temp.at_call(:t2,17,13),17,'call 17');
select is(pg_temp.tap(:t2,pg_temp.hex('d2',2),4),'correct','a row on call 17');
select is((pg_temp.room(:t2)).winner_count,1,'is the first Bingo');
select is(((pg_temp.room(:t2)).pacing->>'nextEligibleCall')::integer,28,'next: not before call 28 (17 + 11)');
select is(pg_temp.at_call(:t2,27,13),27,'call 27');
select is(pg_temp.tap(:t2,pg_temp.hex('d2',3),4),'correct','a row on call 27');
select is((pg_temp.room(:t2)).winner_count,1,'too early');
select is(pg_temp.at_call(:t2,28,13),28,'call 28');
select is(pg_temp.tap(:t2,pg_temp.hex('d2',4),4),'correct','a row on call 28');
select is((pg_temp.room(:t2)).winner_count,2,'the second Bingo');
select is(((pg_temp.room(:t2)).pacing->>'nextEligibleCall')::integer,36,'next: not before call 36 (28 + 8)');
select is((pg_temp.room(:t2)).pacing->'gaps','[11,8]'::jsonb,'gaps 11, 8');

-- 5. Target 5: four winners, then three on one call -------------------------------------------------------
\set o3 '''c100000000000000000000000000000000000000000000000000000000000003'''
\set t3 '''c200000000000000000000000000000000000000000000000000000000000003'''
select is(pg_temp.game('901003',:o3,:t3,5,'d3',9,repeat('4',32)),'started','9 players, 5 winners wanted (seed: gate 15, gaps 10, 10)');
select pg_temp.ready(pg_temp.hex('d3',g)) from generate_series(1,9) g;
select is(pg_temp.at_call(:t3,15,13),15,'call 15');
select is((select count(*)::integer from generate_series(1,4) g where pg_temp.tap(:t3,pg_temp.hex('d3',g),4)='correct'),4,'four rows complete on call 15');
select is((pg_temp.room(:t3)).winner_count,4,'four winners, sharing first place');
select is(pg_temp.at_call(:t3,25,13),25,'call 25 (15 + 10)');
select is(pg_temp.tap(:t3,pg_temp.hex('d3',5),4),'correct','P5 completes a row');
select is((pg_temp.room(:t3)).winner_count,5,'the target of 5 is reached');
select is((pg_temp.room(:t3)).phase,'QUESTION_ACTIVE','but call 25 is not cut short');
select is(pg_temp.tap(:t3,pg_temp.hex('d3',6),4),'correct','P6 completes a row on the same call');
select is(pg_temp.tap(:t3,pg_temp.hex('d3',7),4),'correct','P7 too');
select is((pg_temp.room(:t3)).winner_count,7,'7 winners: a legitimate same-call tie is never cut to fit the target');
select is(array[pg_temp.placement(pg_temp.hex('d3',5)),pg_temp.placement(pg_temp.hex('d3',6)),pg_temp.placement(pg_temp.hex('d3',7))],array[5,5,5],'the three share fifth place');
select is(array[pg_temp.rank(:o3,:t3,pg_temp.hex('d3',1)),pg_temp.rank(:o3,:t3,pg_temp.hex('d3',5)),pg_temp.rank(:o3,:t3,pg_temp.hex('d3',8))],array['1T','5T','8T'],'standings: T-1 (4), T-5 (3), then the others');
select is(pg_temp.next(:o3,:t3),'ok','the host closes call 25');
select is((pg_temp.room(:t3)).phase,'WINNER_REVEAL','the game ends with the call');
select is((pg_temp.room(:t3)).completed_reason,'winners','the target reached');
select is(pg_temp.tap(:t3,pg_temp.hex('d3',8),4),'not-active','no Bingo after the game has closed');
select is((pg_temp.room(:t3)).winner_count,7,'still 7');

-- 6. Target 1, two winners on the same call -------------------------------------------------------------
\set o4 '''c100000000000000000000000000000000000000000000000000000000000004'''
\set t4 '''c200000000000000000000000000000000000000000000000000000000000004'''
select is(pg_temp.game('901004',:o4,:t4,1,'d4',3,repeat('4',32)),'started','3 players, 1 winner wanted');
select pg_temp.ready(pg_temp.hex('d4',g)) from generate_series(1,3) g;
select is(pg_temp.at_call(:t4,15,13),15,'call 15');
select is(pg_temp.tap(:t4,pg_temp.hex('d4',1),4),'correct','P1 completes a row');
select is(pg_temp.tap(:t4,pg_temp.hex('d4',2),4),'correct','P2 too, on the same call');
select is((pg_temp.room(:t4)).winner_count,2,'both win: 2 winners for a target of 1');
select is(array[pg_temp.placement(pg_temp.hex('d4',1)),pg_temp.placement(pg_temp.hex('d4',2))],array[1,1],'sharing first place');
-- Duplicate submissions never count twice.
select is(pg_temp.tap(:t4,pg_temp.hex('d4',1),4),'already-won','P1 taps again: refused');
select is(public.bingo_free_space(pg_temp.hex('d4',1),1,15)->>'result','already-won','P1 Free Space: refused');
select is((pg_temp.room(:t4)).winner_count,2,'still 2');
select is((select count(*)::integer from jsonb_array_elements((pg_temp.room(:t4)).winners) e where e->>'id'=(select id::text from public.bingo_participants where token_hash=pg_temp.hex('d4',1))),1,'P1 is recorded once');
select is(pg_temp.next(:o4,:t4),'ok','the host closes call 15');
select is((pg_temp.room(:t4)).phase,'WINNER_REVEAL','game over');

-- 7. More winners wanted than players ------------------------------------------------------------------------
\set o5 '''c100000000000000000000000000000000000000000000000000000000000005'''
\set t5 '''c200000000000000000000000000000000000000000000000000000000000005'''
select is(pg_temp.game('901005',:o5,:t5,10,'d5',5,repeat('4',32)),'started','5 players, 10 winners wanted: Start goes ahead');
select pg_temp.ready(pg_temp.hex('d5',g)) from generate_series(1,5) g;
select is(pg_temp.at_call(:t5,15,13),15,'call 15');
select is((select count(*)::integer from generate_series(1,5) g where pg_temp.tap(:t5,pg_temp.hex('d5',g),4)='correct'),5,'all five complete a row');
select is((pg_temp.room(:t5)).winner_count,5,'5 winners, no phantom sixth');
select is((pg_temp.room(:t5)).phase,'WINNER_REVEAL','everyone has won: the game ends at once (no infinite room)');
select is((pg_temp.room(:t5)).completed_reason,'everyone','because everyone has Bingo');

-- 8. Players leave: the game ends when nobody is left who could win -----------------------------------------
\set o6 '''c100000000000000000000000000000000000000000000000000000000000006'''
\set t6 '''c200000000000000000000000000000000000000000000000000000000000006'''
select is(pg_temp.game('901006',:o6,:t6,3,'d6',3,repeat('4',32)),'started','3 players, 3 winners wanted');
select pg_temp.ready(pg_temp.hex('d6',1));
select is(pg_temp.at_call(:t6,15,13),15,'call 15');
select is(pg_temp.tap(:t6,pg_temp.hex('d6',1),4),'correct','P1 wins');
select is(public.bingo_host_command(:o6,:t6,'remove',jsonb_build_object('participant',(select id from public.bingo_participants where token_hash=pg_temp.hex('d6',2))))->>'result','ok','P2 is removed');
select is((pg_temp.room(:t6)).phase,'QUESTION_ACTIVE','P3 can still win');
select is(public.bingo_host_command(:o6,:t6,'remove',jsonb_build_object('participant',(select id from public.bingo_participants where token_hash=pg_temp.hex('d6',3))))->>'result','ok','P3 is removed');
select is((pg_temp.room(:t6)).phase,'WINNER_REVEAL','nobody left who could win: the game ends');
select is((pg_temp.room(:t6)).winner_count,1,'with its one winner');

-- 9. Reconnects read the pacing, never redraw it ---------------------------------------------------------------
\set o7 '''c100000000000000000000000000000000000000000000000000000000000007'''
\set t7 '''c200000000000000000000000000000000000000000000000000000000000007'''
\set t7b '''c300000000000000000000000000000000000000000000000000000000000007'''
select is(pg_temp.game('901007',:o7,:t7,4,'d7',4,(select s from seed1)),'started','a game');
select pg_temp.ready(pg_temp.hex('d7',1));
select is(pg_temp.at_call(:t7,14,13),14,'call 14');
select is(pg_temp.tap(:t7,pg_temp.hex('d7',1),4),'correct','a first winner');
create temporary table before7 as select pacing from public.bingo_rooms where host_token_hash=:t7;
select is(public.bingo_host_resume(:o7,:t7b)->>'result','resumed','the host reconnects (a new host token)');
select is(public.bingo_player_state(pg_temp.hex('d7',1),null,null)->'me'->>'placement','1','a player reconnects: still first');
select is(public.bingo_player_state(pg_temp.hex('d7',2),null,null)->'me'->>'hasWon','false','another player reconnects: their card and state are theirs');
select is((select pacing from public.bingo_rooms where host_token_hash=:t7b),(select pacing from before7),'the first gate, the gaps and the next gate are exactly as before');
select is(public.bingo_host_command(:o7,:t7b,'next',jsonb_build_object('phase','QUESTION_ACTIVE','question',14))->>'result','ok','the reconnected host carries on');

-- 10. A room started before this release (stored "everyone") still ends when everyone has won ----------------
\set o8 '''c100000000000000000000000000000000000000000000000000000000000008'''
\set t8 '''c200000000000000000000000000000000000000000000000000000000000008'''
select is(public.bingo_create_room('901008',:o8,:t8,pg_temp.settings(2))->>'result','created','an older room');
update public.bingo_rooms set settings=pg_temp.settings(0) where host_token_hash=:t8;
select is((select count(*)::integer from generate_series(1,2) g where public.bingo_join_room('901008','P'||g,pg_temp.hex('d8',g),'7777777777777777777777777777777777777777777777777777777777777777',null)->>'result'='joined'),2,'two players');
select is(public.bingo_host_start_paced(:o8,:t8,'start',pg_temp.settings(0),repeat('4',32),pg_temp.universe(),pg_temp.boards(:t8),pg_temp.pacing())->>'result','started','its stored settings still start');
select pg_temp.ready(pg_temp.hex('d8',g)) from generate_series(1,2) g;
select is(pg_temp.at_call(:t8,15,13),15,'call 15');
select is(pg_temp.tap(:t8,pg_temp.hex('d8',1),4),'correct','P1 wins');
select is((pg_temp.room(:t8)).phase,'QUESTION_ACTIVE','"everyone": the game goes on');
select is(pg_temp.tap(:t8,pg_temp.hex('d8',2),4),'correct','P2 wins on the same call');
select is((pg_temp.room(:t8)).phase,'WINNER_REVEAL','everyone has won');

select * from finish();
rollback;
