begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Catalog: registered, but DRAFT (never listed, never published) -------------
select results_eq(
  $$select stable_key,slug,title,launch_type,status,thumbnail_reference,resource_id,package_id,canonical_route,external_url
    from public.game_catalog_entries where stable_key='math-bingo-live'$$,
  $$values ('math-bingo-live'::text,'math-bingo-live'::text,'Math Bingo Live'::text,'internal'::text,'draft'::text,
    'builtin:math-bingo-live'::text,null::uuid,null::uuid,null::text,null::text)$$,
  'Math Bingo Live is one destination-free internal game in DRAFT'
);
select is((select description from public.game_catalog_entries where stable_key='math-bingo-live'),
  'Solve math questions, mark your card, and race classmates to Bingo.', 'card copy is exact');

-- Browser identities have no access at all ---------------------------------
select ok(not has_table_privilege('anon','public.bingo_rooms','SELECT'), 'anon cannot read rooms');
select ok(not has_table_privilege('authenticated','public.bingo_rooms','SELECT'), 'authenticated cannot read rooms');
select ok(not has_table_privilege('anon','public.bingo_participants','SELECT'), 'anon cannot read participants');
select ok(not has_table_privilege('authenticated','public.bingo_participants','UPDATE'), 'authenticated cannot write participants');
select ok(not has_table_privilege('anon','public.bingo_join_failures','SELECT'), 'anon cannot read the join limiter');
select ok(not has_function_privilege('anon','public.bingo_mark(text,integer,integer,integer)','EXECUTE'), 'anon cannot mark directly');
select ok(not has_function_privilege('authenticated','public.bingo_host_command(text,text,text,jsonb)','EXECUTE'), 'browsers cannot command a room');
select ok(not has_function_privilege('anon','public.bingo_join_room(text,text,text,text)','EXECUTE'), 'anon cannot join directly');
select ok(not has_function_privilege('authenticated','public.bingo_set_board(text,integer,jsonb)','EXECUTE'), 'browsers cannot write a card');
select ok(has_function_privilege('service_role','public.bingo_player_state(text,bigint,bigint)','EXECUTE'), 'the server can read player state');
select ok((select relforcerowsecurity from pg_class where oid='public.bingo_rooms'::regclass), 'room RLS is forced');
select ok((select relforcerowsecurity from pg_class where oid='public.bingo_participants'::regclass), 'participant RLS is forced');

-- Fixtures -----------------------------------------------------------------
create function pg_temp.settings(p_winners integer, p_seconds integer) returns jsonb language sql as $$
  select jsonb_build_object('mode','addition','level','within-50','questionSeconds',p_seconds,'revealSeconds',0,
    'patterns',jsonb_build_object('rows',true,'columns',false,'diagonals',false),'winners',p_winners,
    'freeSpace',true,'music','host','celebration','host','equivalentFractions',false)
$$;
create function pg_temp.pool() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('n',v,'d',1) order by v) from generate_series(1,24) v
$$;
-- Question k asks for value ((k-1) % 24) + 1.
create function pg_temp.deck() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('t',v::text||' + 0','s','x','k','arithmetic','n',v,'d',1) order by k)
  from (select k, ((k-1) % 24) + 1 as v from generate_series(1,48) k) s
$$;
-- Ava/Omar: values 1..12 in cells 0..11, Free Space at 12, 13..24 in cells 13..24.
create function pg_temp.card_ava() returns jsonb language sql as $$
  select jsonb_agg(case when i=12 then '{"free":true}'::jsonb else jsonb_build_object('n',case when i<12 then i+1 else i end,'d',1) end order by i)
  from generate_series(0,24) i
$$;
-- Zion: row 1 holds 6..10, row 2 holds 1..5.
create function pg_temp.card_zion() returns jsonb language sql as $$
  select jsonb_agg(case when i=12 then '{"free":true}'::jsonb else jsonb_build_object('n',
    case when i<5 then i+6 when i<10 then i-4 when i<12 then i+1 else i end,'d',1) end order by i)
  from generate_series(0,24) i
$$;
create function pg_temp.host(p_command text, p_args jsonb default '{}'::jsonb) returns jsonb language sql as $$
  select public.bingo_host_command(repeat('1',64), repeat('a',64), p_command, p_args)
$$;
-- "Next" as the host screen sends it: with the phase and question it shows.
create function pg_temp.next() returns text language sql as $$
  select (pg_temp.host('next', (select jsonb_build_object('phase',phase,'question',question_number)
    from public.bingo_rooms where host_token_hash=repeat('a',64))))->>'result'
$$;
create function pg_temp.room() returns public.bingo_rooms language sql as $$
  select * from public.bingo_rooms where host_token_hash=repeat('a',64)
$$;
create function pg_temp.mark(p_token text, p_cell integer) returns jsonb language sql as $$
  select public.bingo_mark(p_token, (pg_temp.room()).game_number, (pg_temp.room()).question_number, p_cell)
$$;

\set ava '''bbbb000000000000000000000000000000000000000000000000000000000001'''
\set zion '''bbbb000000000000000000000000000000000000000000000000000000000002'''
\set omar '''bbbb000000000000000000000000000000000000000000000000000000000003'''
\set ava2 '''bbbb000000000000000000000000000000000000000000000000000000000004'''
\set subject '''9999999999999999999999999999999999999999999999999999999999999999'''

-- Room creation and joining ------------------------------------------------
select is(public.bingo_create_room('482391',repeat('1',64),repeat('a',64),pg_temp.settings(2,0))->>'result','created','a host creates a room');
select is(public.bingo_create_room('482391',repeat('2',64),repeat('c',64),pg_temp.settings(2,0))->>'result','code-taken','a live code cannot be reused');
select is(public.bingo_create_room('500001',repeat('2',64),repeat('c',64),'{"mode":"algebra"}'::jsonb)->>'result','invalid-settings','malformed settings are refused');
select ok((public.bingo_host_state(repeat('1',64),repeat('a',64),null)::text) !~ 'aaaaaaaa|1111111111', 'token and owner hashes never leave the database');
select is(public.bingo_host_state(repeat('2',64),repeat('a',64),null)->>'result','not-found','another account cannot read the room');
select is(public.bingo_host_command(repeat('2',64),repeat('a',64),'lock','{}')->>'result','not-found','another account cannot command the room');

select is(public.bingo_join_room('000000','Ava',:ava,:subject)->>'result','not-found','an unknown code is refused');
select is(public.bingo_join_room('482391','A',:ava,:subject)->>'result','invalid-name','a one-letter name is refused');
select is(public.bingo_join_room('482391','Ava',:ava,:subject)->>'result','joined','Ava joins with code and name only');
select is(public.bingo_join_room('482391','Zion',:zion,:subject)->>'result','joined','Zion joins');
select is(public.bingo_join_room('482391','Omar',:omar,:subject)->>'result','joined','Omar joins');
select is(public.bingo_join_room('482391','ava',:ava2,:subject)->'me'->>'name','ava 2','a duplicate name is kept readable');
select is(jsonb_array_length(public.bingo_host_state(repeat('1',64),repeat('a',64),null)->'players'),4,'the host sees every player live');
select ok((public.bingo_player_state(:ava,null,null)::text) !~ 'bbbb0000', 'a player view never contains a token hash');
select is(public.bingo_player_state(:ava,null,null)->>'phase','LOBBY','players wait in the lobby');
select is((public.bingo_player_state(:ava,null,null)->>'needsBoard')::boolean,false,'no card before the game starts');

-- Lock / remove ------------------------------------------------------------
select is(pg_temp.host('lock')->>'joinLocked','true','the host locks joining');
select is(public.bingo_join_room('482391','Late',repeat('d',64),:subject)->>'result','locked','a locked room refuses new players');
select is(pg_temp.host('unlock')->>'joinLocked','false','the host unlocks joining');
select is(pg_temp.host('remove',jsonb_build_object('participant',(select id from public.bingo_participants where token_hash=:ava2)))->>'result','ok','the host removes a player');
select is(public.bingo_player_state(:ava2,null,null)->>'result','removed','a removed player is told so');
select is(jsonb_array_length(public.bingo_host_state(repeat('1',64),repeat('a',64),null)->'players'),3,'removed players leave the roster');

-- Start --------------------------------------------------------------------
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'start',pg_temp.settings(3,0),repeat('e',32),pg_temp.pool(),pg_temp.deck())->>'result','stale','a start built from other settings is refused');
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'start',pg_temp.settings(2,0),repeat('e',32),'[]'::jsonb,pg_temp.deck())->>'result','invalid-game','a malformed pool is refused');
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'start',pg_temp.settings(2,0),repeat('e',32),pg_temp.pool(),pg_temp.deck())->>'result','started','the host starts');
select is((pg_temp.room()).phase,'COUNTDOWN','the game counts down');
select is((public.bingo_player_state(:ava,null,null)->>'needsBoard')::boolean,true,'each player needs a card');
select is(public.bingo_player_state(:ava,null,null)->>'seed',repeat('e',32),'the trusted server receives the seed to deal');
select is(public.bingo_set_board(:ava,1,(select jsonb_set(pg_temp.card_ava(),'{0}','{"n":99,"d":1}')))->>'result','invalid-board','a card that is not the pool is refused');
select is(public.bingo_set_board(:ava,1,(select jsonb_set(pg_temp.card_ava(),'{12}','{"n":1,"d":1}')))->>'result','invalid-board','a card without the Free Space is refused');
select is(public.bingo_set_board(:ava,1,pg_temp.card_ava())->>'result','ok','Ava receives her card');
select is(public.bingo_set_board(:ava,1,pg_temp.card_zion())->'me'->'board',pg_temp.card_ava(),'a card is dealt once per game');
select is(public.bingo_set_board(:zion,1,pg_temp.card_zion())->>'result','ok','Zion receives his card');
select is(public.bingo_set_board(:omar,1,pg_temp.card_ava())->>'result','ok','Omar receives his card');
select is(pg_temp.mark(:ava,0)->>'result','not-active','no marks during the countdown');

-- Question 1 (answer 1) ------------------------------------------------------
select is(pg_temp.next(),'ok','countdown -> question 1');
select is((pg_temp.room()).phase,'QUESTION_ACTIVE','question 1 is live');
select ok(public.bingo_mark(:ava,1,2,0)->>'result'='stale', 'an answer for another question is stale');
select is(pg_temp.mark(:ava,12)->>'result','use-free-space','the centre is the Free Space, not an answer');
select is(pg_temp.mark(:ava,0)->>'result','correct','Ava marks 1');
select is(pg_temp.mark(:ava,0)->>'result','already-marked','a cell is marked once');
select is(pg_temp.mark(:ava,1)->>'result','mark-used','one normal mark per question');
select is(pg_temp.mark(:zion,0)->>'result','incorrect','a wrong cell is not marked');
select is(pg_temp.mark(:zion,1)->>'result','incorrect','a second wrong cell is not marked');
select is(pg_temp.mark(:zion,5)->>'result','out-of-attempts','no brute force: two wrong taps lock the card for this question');
select is(public.bingo_free_space(:omar,1,1)->>'result','free-space','Omar uses the Free Space');
select is(public.bingo_free_space(:omar,1,1)->>'result','free-used','the Free Space cannot be used twice');
select is(((pg_temp.room()).events->-1)->>'type','free-space','Free Space is broadcast');
select is(((pg_temp.room()).events->-1)->>'name','Omar','the broadcast names the player');
select is(pg_temp.mark(:omar,0)->>'result','correct','the Free Space does not use the normal mark');
select is(pg_temp.host('next',jsonb_build_object('phase','ANSWER_REVEAL','question',1))->>'result','stale','a stale Next is ignored');
select is(pg_temp.next(),'ok','question 1 -> reveal');
select is(pg_temp.mark(:zion,5)->>'result','not-active','no marks during the reveal');
select is(public.bingo_free_space(:zion,1,1)->>'result','not-active','no Free Space during the reveal');
select is(pg_temp.next(),'ok','reveal -> question 2');

-- Questions 2-5: Ava completes row 1 ---------------------------------------
select is(pg_temp.mark(:ava,1)->>'result','correct','Ava marks 2');
select is(pg_temp.next(),'ok','q2 reveal'); select is(pg_temp.next(),'ok','q3');
select is(pg_temp.mark(:ava,2)->>'result','correct','Ava marks 3');
select is(pg_temp.next(),'ok','q3 reveal'); select is(pg_temp.next(),'ok','q4');
select is(pg_temp.mark(:ava,3)->>'result','correct','Ava marks 4');
select is(((pg_temp.room()).events->-1)->>'type','one-away','Ava is one away (broadcast without the square)');
select ok(((pg_temp.room()).events->-1)::text !~ '"cell"', 'the one-away event never names a square');
select is(pg_temp.next(),'ok','q4 reveal'); select is(pg_temp.next(),'ok','q5');
select is(pg_temp.mark(:ava,4)->'me'->>'placement','1','Ava completes row 1: FIRST BINGO');
select is(((pg_temp.room()).events->-1)->>'type','bingo','Bingo is broadcast');
select is(((pg_temp.room()).winners->0)->>'line','row-1','the winning line is recorded');
select is(((pg_temp.room()).winners->0)->>'question','5','the question of the Bingo is recorded (its cells stay hidden until it is revealed)');
select is((pg_temp.room()).phase,'QUESTION_ACTIVE','one of two winners: the game continues');
select is(((pg_temp.room()).leaderboard->0)->>'name','Ava','the winner leads the leaderboard');
select is(pg_temp.mark(:ava,5)->>'result','already-won','a winner cannot mark again');
select is(public.bingo_free_space(:ava,1,5)->>'result','already-won','a winner cannot use the Free Space');

-- Questions 6-10: Zion completes his row 1 (6..10) -> second and final winner
select is(pg_temp.next(),'ok','q5 reveal'); select is(pg_temp.next(),'ok','q6');
select is(pg_temp.mark(:zion,0)->>'result','correct','Zion marks 6');
select is(pg_temp.next(),'ok','q6 reveal'); select is(pg_temp.next(),'ok','q7');
select is(pg_temp.mark(:zion,1)->>'result','correct','Zion marks 7');
select is(pg_temp.next(),'ok','q7 reveal'); select is(pg_temp.next(),'ok','q8');
select is(pg_temp.mark(:zion,2)->>'result','correct','Zion marks 8');
select is(pg_temp.next(),'ok','q8 reveal'); select is(pg_temp.next(),'ok','q9');
select is(pg_temp.mark(:zion,3)->>'result','correct','Zion marks 9');
select is(pg_temp.next(),'ok','q9 reveal'); select is(pg_temp.next(),'ok','q10');
select is(pg_temp.mark(:zion,4)->'me'->>'placement','2','Zion: SECOND BINGO');
select is((pg_temp.room()).phase,'WINNER_REVEAL','the configured winner count ends the game at once');
select is((pg_temp.room()).completed_reason,'winners','completed because the winners were found');
select is(pg_temp.mark(:omar,9)->>'result','not-active','no marks after the final winner');
select is(public.bingo_free_space(:zion,1,10)->>'result','not-active','no Free Space after the final winner');
select is((select count(*)::integer from public.bingo_participants where room_id=(pg_temp.room()).id and has_won),2,'exactly two winners');
select is((select array_agg(placement order by placement) from public.bingo_participants where room_id=(pg_temp.room()).id and has_won),array[1,2],'placements are unique and ordered');
select is(pg_temp.next(),'stale','Next cannot start another question after the final winner');
update public.bingo_rooms set phase_deadline=statement_timestamp()-interval '1 second' where host_token_hash=repeat('a',64);
select is(public.bingo_player_state(:omar,null,null)->>'phase','GAME_COMPLETE','after the celebration the game is complete');
select is((pg_temp.room()).question_number,10,'no further question was generated');

-- Play Again: same roster, everything else reset -----------------------------
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'again',pg_temp.settings(2,0),repeat('f',32),pg_temp.pool(),pg_temp.deck())->>'result','started','Play Again');
select is((pg_temp.room()).game_number,2,'a new game number');
select is((pg_temp.room()).winner_count,0,'winners reset');
select is(jsonb_array_length((pg_temp.room()).events),0,'events reset');
select is((select count(*)::integer from public.bingo_participants where room_id=(pg_temp.room()).id and (has_won or marks<>0 or free_used or board is not null)),0,'cards, marks, Free Space and wins reset');
select is((select count(*)::integer from public.bingo_participants where room_id=(pg_temp.room()).id and status='active'),3,'the roster is kept');
select is(public.bingo_player_state(:ava,null,null)->'me'->>'name','Ava','players keep their seat without re-entering the code');

-- Pause / resume (deterministic) -------------------------------------------
select is(pg_temp.host('pause')->>'phase','PAUSED','the host pauses');
select ok(((pg_temp.room()).paused_remaining_ms) between 0 and 3000, 'the remaining countdown is frozen');
select is(public.bingo_mark(:ava,2,0,0)->>'result','paused','submissions during a pause are refused');
select is(pg_temp.host('pause')->>'result','stale','pausing twice is ignored');
select is(pg_temp.host('resume')->>'phase','COUNTDOWN','resume returns to the paused phase');
select ok((pg_temp.room()).phase_deadline is not null, 'the countdown deadline is restored');

-- Server deadlines -----------------------------------------------------------
update public.bingo_rooms set phase_deadline=statement_timestamp()-interval '1 second' where host_token_hash=repeat('a',64);
select is(public.bingo_player_state(:zion,null,null)->>'phase','QUESTION_ACTIVE','a passed countdown deadline starts question 1');
select is(pg_temp.host('end')->>'phase','GAME_COMPLETE','the host ends the game early');
select is((pg_temp.room()).completed_reason,'host','completed by the host');
select is(pg_temp.host('change-settings')->>'phase','LOBBY','Change Settings returns to the lobby with the roster');
select is(pg_temp.host('settings',jsonb_build_object('settings',pg_temp.settings(1,5)))->>'result','ok','settings change in the lobby');
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'start',pg_temp.settings(1,5),repeat('0',32),pg_temp.pool(),pg_temp.deck())->>'result','started','a timed game starts');
select is(public.bingo_set_board(:ava,3,pg_temp.card_ava())->>'result','ok','card dealt');
update public.bingo_rooms set phase_deadline=statement_timestamp()-interval '1 second' where host_token_hash=repeat('a',64);
select is(public.bingo_player_state(:ava,null,null)->>'phase','QUESTION_ACTIVE','timed question 1');
update public.bingo_rooms set phase_deadline=statement_timestamp()-interval '1 millisecond' where host_token_hash=repeat('a',64);
select is(pg_temp.mark(:ava,0)->>'result','not-active','a mark after the deadline is refused (server clock)');
select is(public.bingo_free_space(:ava,3,1)->>'result','not-active','Free Space at the deadline is refused (server clock)');
select is((pg_temp.room()).phase,'ANSWER_REVEAL','the deadline moved the room to the reveal');

-- Host recovery ----------------------------------------------------------------
select is(public.bingo_host_resume(repeat('1',64),repeat('7',64))->>'result','resumed','the signed-in host recovers the room');
select is(public.bingo_host_state(repeat('1',64),repeat('a',64),null)->>'result','not-found','the previous host token stops working');
select is(public.bingo_host_resume(repeat('2',64),repeat('8',64))->>'result','not-found','another account cannot take over');

-- Join limiter -----------------------------------------------------------------
select is((select count(*)::integer from (select public.bingo_join_room(lpad((100000+g)::text,6,'0'),'Bot',repeat('0',60)||lpad(g::text,4,'0'),repeat('6',64)) from generate_series(1,41) g) s),41,'41 guesses');
select is(public.bingo_join_room('482391','Bot',repeat('5',64),repeat('6',64))->>'result','rate-limited','code guessing is rate limited');

-- Close ------------------------------------------------------------------------
select is(public.bingo_host_command(repeat('1',64),repeat('7',64),'close','{}')->>'status','closed','the host ends the room');
select is((select count(*)::integer from public.bingo_participants where token_hash in (:ava,:zion,:omar)),0,'closing deletes every participant name and card');
select is(public.bingo_player_state(:ava,null,null)->>'result','not-found','a closed room seat is gone');
select is(public.bingo_join_room('482391','Ava',:ava,:subject)->>'result','not-found','a closed code can no longer be joined');

-- A room closed in the lobby, before any game.
select is(public.bingo_create_room('500002',repeat('3',64),repeat('9',64),pg_temp.settings(1,0))->>'result','created','another host creates a room');
select is(public.bingo_join_room('500002','Ivy',repeat('e',64),:subject)->>'result','joined','a player joins the lobby');
select is(public.bingo_host_command(repeat('3',64),repeat('9',64),'close','{}')->>'status','closed','a lobby room can be ended before any game');
select is(public.bingo_player_state(repeat('e',64),null,null)->>'result','not-found','its players are deleted too');

-- "Everyone can win": when the last player without a Bingo is removed, the game ends.
-- A NEW room cannot store "everyone" (0) since 20261111100000; a room created
-- before it keeps 0 and its rules, which this part checks (the stored value is
-- set directly, as such a room would have it).
select is(public.bingo_create_room('500004',repeat('c',64),repeat('d',64),jsonb_set(pg_temp.settings(0,0),'{winners}','0'))->>'result','invalid-settings','a new room cannot ask for 0 winners');
select is(public.bingo_create_room('500004',repeat('c',64),repeat('d',64),jsonb_set(pg_temp.settings(0,0),'{winners}','2'))->>'result','created','a room created before the winner-target release');
update public.bingo_rooms set settings=jsonb_set(settings,'{winners}','0') where code='500004' and status='open';
select is((select settings->>'winners' from public.bingo_rooms where code='500004' and status='open'),'0','still stores "everyone" (the table accepts it for such rooms)');
select is(public.bingo_join_room('500004','Win',repeat('f',60)||'0001',repeat('5',64))->>'result','joined','winner-to-be joins');
select is(public.bingo_join_room('500004','Wait',repeat('f',60)||'0002',repeat('5',64))->>'result','joined','second player joins');
select is(public.bingo_host_start(repeat('c',64),repeat('d',64),'start',jsonb_set(pg_temp.settings(0,0),'{winners}','0'),repeat('a',32),pg_temp.pool(),pg_temp.deck())->>'result','started','everyone game starts');
select is(public.bingo_set_board(repeat('f',60)||'0001',1,pg_temp.card_ava())->>'result','ok','card');
update public.bingo_rooms set phase_deadline=statement_timestamp()-interval '1 second' where code='500004' and status='open';
select is(public.bingo_free_space(repeat('f',60)||'0001',1,1)->>'result','free-space','Free Space on question 1');
update public.bingo_participants set marks=31744 & ~(1<<10), mark_question=0 where token_hash=repeat('f',60)||'0001';
select is(public.bingo_mark(repeat('f',60)||'0001',1,1,10)->>'result','incorrect','a wrong cell for question 1 is refused');
select is(public.bingo_mark(repeat('f',60)||'0001',1,1,0)->'me'->>'hasWon','false','marking value 1 does not complete row 3');
update public.bingo_participants set marks=31744 & ~(1<<11) where token_hash=repeat('f',60)||'0001';
update public.bingo_rooms set phase='QUESTION_ACTIVE', question_number=12, phase_deadline=null where code='500004' and status='open';
select is(public.bingo_mark(repeat('f',60)||'0001',1,12,11)->'me'->>'placement','1','completing row 3 is a Bingo');
select is((select phase from public.bingo_rooms where code='500004' and status='open'),'QUESTION_ACTIVE','one of two has won: the everyone game goes on');
select is(public.bingo_host_command(repeat('c',64),repeat('d',64),'remove',jsonb_build_object('participant',(select id from public.bingo_participants where token_hash=repeat('f',60)||'0002')))->>'phase','WINNER_REVEAL','removing the last player without a Bingo ends the game');

-- Winning ways: only the room's own patterns can win. bingo_lines is the
-- list bingo_apply_progress checks a card against, for each of the five setups.
select is((select string_agg(distinct line_type, ',' order by line_type) from private.bingo_lines('{"rows":true,"columns":false,"diagonals":false}')),'row','rows only: only the 5 rows count');
select is((select string_agg(distinct line_type, ',' order by line_type) from private.bingo_lines('{"rows":false,"columns":true,"diagonals":false}')),'column','columns only: only the 5 columns count');
select is((select string_agg(distinct line_type, ',' order by line_type) from private.bingo_lines('{"rows":false,"columns":false,"diagonals":true}')),'diagonal','diagonals only: only the 2 diagonals count');
select is((select string_agg(distinct line_type, ',' order by line_type) from private.bingo_lines('{"rows":true,"columns":true,"diagonals":false}')),'column,row','rows + columns: no diagonal counts');
select is((select count(*)::integer from private.bingo_lines('{"rows":true,"columns":true,"diagonals":true}')),12,'all three: all 12 lines count');
-- Rows + columns: a completed diagonal is not a Bingo; a completed column is.
select is(public.bingo_create_room('500005',repeat('b',64),repeat('0',64),jsonb_set(pg_temp.settings(1,0),'{patterns}','{"rows":true,"columns":true,"diagonals":false}'))->>'result','created','a rows + columns room');
select is(public.bingo_join_room('500005','Dia',repeat('8',60)||'0001',repeat('5',64))->>'result','joined','a player joins');
select is(public.bingo_host_start(repeat('b',64),repeat('0',64),'start',jsonb_set(pg_temp.settings(1,0),'{patterns}','{"rows":true,"columns":true,"diagonals":false}'),repeat('b',32),pg_temp.pool(),pg_temp.deck())->>'result','started','rows + columns game starts');
select is(public.bingo_set_board(repeat('8',60)||'0001',1,pg_temp.card_ava())->>'result','ok','card');
-- Diagonal 0-6-12-18-24 marked except cell 24 (value 24); question 24 asks for 24.
update public.bingo_participants set marks=17043521 & ~(1<<24), mark_question=0 where token_hash=repeat('8',60)||'0001';
update public.bingo_rooms set phase='QUESTION_ACTIVE', question_number=24, phase_deadline=null where code='500005' and status='open';
select is(public.bingo_mark(repeat('8',60)||'0001',1,24,24)->>'result','correct','the last diagonal cell is a correct mark');
select is((select (marks & 17043521) = 17043521 and not has_won from public.bingo_participants where token_hash=repeat('8',60)||'0001'),true,'a completed diagonal is not a Bingo when diagonals are off');
select is((select winner_count from public.bingo_rooms where code='500005' and status='open'),0,'no winner is recorded for it');
-- Column 0-5-10-15-20: cell 0 is already marked; 5, 10 and 15 are added; question 20 asks for 20 (cell 20).
update public.bingo_participants set marks=marks | (1<<5) | (1<<10) | (1<<15) where token_hash=repeat('8',60)||'0001';
update public.bingo_rooms set question_number=20 where code='500005' and status='open';
select is(public.bingo_mark(repeat('8',60)||'0001',1,20,20)->'me'->>'placement','1','completing column 1 is a Bingo');
select is((select win_line from public.bingo_participants where token_hash=repeat('8',60)||'0001'),'column-1','the Bingo is recorded as column 1, not the diagonal');

-- Participant cap: 60 active players per room.
select is(public.bingo_create_room('500003',repeat('4',64),repeat('8',64),pg_temp.settings(1,0))->>'result','created','a host opens a big room');
select is((select count(*)::integer from (select public.bingo_join_room('500003','Kid '||g,repeat('7',60)||lpad(g::text,4,'0'),repeat('5',64))->>'result' as r from generate_series(1,60) g) s where r='joined'),60,'60 players join');
select is(public.bingo_join_room('500003','Kid 61',repeat('6',60)||'0061',repeat('5',64))->>'result','full','the 61st is refused');

select * from finish();
rollback;
