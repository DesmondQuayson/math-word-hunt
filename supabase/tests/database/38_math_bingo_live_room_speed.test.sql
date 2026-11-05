begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Math Bingo Live room speed (20261106100000): ordinary taps touch only the
-- player's own row; the host sees them through the progress number; replies
-- carry a live leaderboard. Wins and broadcasts keep the locked path (37).

-- Access: the new functions are server-only ----------------------------------
select ok(not has_function_privilege('anon','public.bingo_host_state(text,text,bigint,bigint)','EXECUTE'), 'anon cannot read host state');
select ok(not has_function_privilege('authenticated','public.bingo_host_state(text,text,bigint,bigint)','EXECUTE'), 'browsers cannot read host state');
select ok(has_function_privilege('service_role','public.bingo_host_state(text,text,bigint,bigint)','EXECUTE'), 'the server reads host state');
select ok((select prosecdef from pg_proc where oid='public.bingo_host_state(text,text,bigint,bigint)'::regprocedure), 'host state runs as definer');
select ok(not has_function_privilege('anon','private.bingo_progress(uuid)','EXECUTE'), 'anon cannot call the progress helper');
select ok(not has_function_privilege('authenticated','private.bingo_progress(uuid)','EXECUTE'), 'browsers cannot call the progress helper');

-- Fixtures (same shapes as 37) -------------------------------------------------
create function pg_temp.settings() returns jsonb language sql as $$
  select jsonb_build_object('mode','addition','level','within-50','questionSeconds',0,'revealSeconds',0,
    'patterns',jsonb_build_object('rows',true,'columns',false,'diagonals',false),'winners',2,
    'freeSpace',true,'music','host','celebration','host','equivalentFractions',false)
$$;
create function pg_temp.pool() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('n',v,'d',1) order by v) from generate_series(1,24) v
$$;
create function pg_temp.deck() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('t',v::text||' + 0','s','x','k','arithmetic','n',v,'d',1) order by k)
  from (select k, ((k-1) % 24) + 1 as v from generate_series(1,48) k) s
$$;
-- Values 1..12 in cells 0..11, Free Space at 12, 13..24 in cells 13..24.
create function pg_temp.card() returns jsonb language sql as $$
  select jsonb_agg(case when i=12 then '{"free":true}'::jsonb else jsonb_build_object('n',case when i<12 then i+1 else i end,'d',1) end order by i)
  from generate_series(0,24) i
$$;
create function pg_temp.room() returns public.bingo_rooms language sql as $$
  select * from public.bingo_rooms where host_token_hash=repeat('a',64)
$$;
create function pg_temp.me(p_token text) returns public.bingo_participants language sql as $$
  select * from public.bingo_participants where token_hash=p_token
$$;
create function pg_temp.host_state(p_version bigint, p_progress bigint) returns jsonb language sql as $$
  select public.bingo_host_state(repeat('1',64), repeat('a',64), p_version, p_progress)
$$;
create function pg_temp.progress() returns bigint language sql as $$
  select coalesce(sum(version),0)::bigint from public.bingo_participants where room_id=(pg_temp.room()).id and status='active'
$$;
create function pg_temp.next() returns text language sql as $$
  select (public.bingo_host_command(repeat('1',64), repeat('a',64), 'next',
    (select jsonb_build_object('phase',phase,'question',question_number) from public.bingo_rooms where host_token_hash=repeat('a',64))))->>'result'
$$;
create function pg_temp.mark(p_token text, p_cell integer) returns jsonb language sql as $$
  select public.bingo_mark(p_token, (pg_temp.room()).game_number, (pg_temp.room()).question_number, p_cell)
$$;

\set ava '''cccc000000000000000000000000000000000000000000000000000000000001'''
\set ben '''cccc000000000000000000000000000000000000000000000000000000000002'''
\set cy '''cccc000000000000000000000000000000000000000000000000000000000003'''
\set subject '''8888888888888888888888888888888888888888888888888888888888888888'''

select is(public.bingo_create_room('612345',repeat('1',64),repeat('a',64),pg_temp.settings())->>'result','created','a room');
select ok((public.bingo_create_room('612346',repeat('9',64),repeat('b',64),pg_temp.settings())->'progress') is not null, 'host replies carry the progress number');
select is(public.bingo_join_room('612345','Ava',:ava,:subject)->>'result','joined','Ava joins');
select is(public.bingo_join_room('612345','Ben',:ben,:subject)->>'result','joined','Ben joins');
select is(public.bingo_join_room('612345','Cy',:cy,:subject)->>'result','joined','Cy joins');
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'start',pg_temp.settings(),repeat('e',32),pg_temp.pool(),pg_temp.deck())->>'result','started','the game starts');
select is(public.bingo_set_board(:ava,1,pg_temp.card())->>'result','ok','Ava card');
select is(public.bingo_set_board(:ben,1,pg_temp.card())->>'result','ok','Ben card');
select is(public.bingo_set_board(:cy,1,pg_temp.card())->>'result','ok','Cy card');
select is(pg_temp.next(),'ok','question 1 (answer 1)');

-- Host unchanged check: room version AND progress ------------------------------
create temporary table before_tap as
  select (pg_temp.room()).version as room_version, pg_temp.progress() as progress,
    (pg_temp.me(:ava)).version as ava_version, (pg_temp.me(:ben)).version as ben_version, (pg_temp.me(:cy)).version as cy_version;
select is(pg_temp.host_state((select room_version from before_tap),(select progress from before_tap))->>'result','unchanged','nothing changed: the host gets the short reply');
select is(pg_temp.host_state((select room_version from before_tap),null)->>'result','ok','without a progress number the host always gets the full view');
select is(public.bingo_host_state(repeat('1',64),repeat('a',64),(select room_version from before_tap))->>'result','ok','the v1.2.35 three-argument call never answers unchanged');

-- An ordinary correct tap ---------------------------------------------------------
select is(pg_temp.mark(:ava,0)->>'result','correct','Ava marks 1');
select is((pg_temp.room()).version,(select room_version from before_tap),'an ordinary correct tap does not change the room version');
select is((pg_temp.me(:ava)).version,(select ava_version from before_tap)+1,'it bumps only Ava''s row version');
select is(pg_temp.progress(),(select progress from before_tap)+1,'the progress number moves by one');
select is(pg_temp.host_state((select room_version from before_tap),(select progress from before_tap))->>'result','ok','the host sees the tap (full view)');
select is((pg_temp.host_state((select room_version from before_tap),(select progress from before_tap))->'players'->0->>'correct')::integer,1,'the host standings show Ava''s correct mark');
select is(pg_temp.host_state((select room_version from before_tap),(select progress from before_tap)+1)->>'result','unchanged','and then the short reply again');
select is((pg_temp.me(:ava)).best_count::integer,1,'best line progress is stored on the fast path');
select is((pg_temp.me(:ava)).best_type,'row','with its line type');
select ok((pg_temp.me(:ava)).response_ms >= 0 and (pg_temp.me(:ava)).correct_count=1, 'correct count and response time are stored');

-- Other players are not disturbed ----------------------------------------------------
select is(public.bingo_player_state(:cy,(select room_version from before_tap),(select cy_version from before_tap))->>'result','unchanged','Cy''s poll stays short while Ava taps');
select is(public.bingo_player_state(:cy,null,null)->'leaderboard'->0->>'name','Ava','replies carry the live leaderboard (Ava leads)');
select is((public.bingo_player_state(:cy,null,null)->'leaderboard'->0->>'correct')::integer,1,'with her correct mark');

-- Wrong taps and refusals ---------------------------------------------------------------
select is(pg_temp.mark(:ben,5)->>'result','incorrect','Ben taps a wrong cell');
select is((pg_temp.room()).version,(select room_version from before_tap),'a wrong tap does not change the room version');
select is((pg_temp.me(:ben)).attempts::integer,1,'one attempt used');
select is(pg_temp.mark(:ben,6)->>'result','incorrect','a second wrong tap');
select is(pg_temp.mark(:ben,0)->>'result','out-of-attempts','two wrong taps lock the card for the question (no lock needed)');
select is(pg_temp.mark(:ava,1)->>'result','mark-used','one mark per question');
select is(pg_temp.mark(:ava,0)->>'result','already-marked','a cell is marked once');
select is(pg_temp.mark(:ava,12)->>'result','use-free-space','the centre is the Free Space');
select is(pg_temp.mark(:ava,25)->>'result','invalid-cell','an invalid cell is refused');
select is((pg_temp.room()).version,(select room_version from before_tap),'refusals do not change the room version');

-- Broadcasts keep the locked path ---------------------------------------------------------
select is(public.bingo_free_space(:cy,1,1)->>'result','free-space','Cy uses the Free Space');
select ok((pg_temp.room()).version > (select room_version from before_tap), 'the Free Space broadcast changes the room version');
select is(((pg_temp.room()).events->-1)->>'type','free-space','and is broadcast');

-- Plain taps, then a first "one away" and a Bingo (both broadcasts) ----------------------------
select is(pg_temp.next(),'ok','question 1 -> reveal');
select is(pg_temp.next(),'ok','question 2 (answer 2)');
create temporary table before_q2 as select (pg_temp.room()).version as room_version;
select is(pg_temp.mark(:ava,1)->>'result','correct','Ava marks 2 on question 2');
select is((pg_temp.room()).version,(select room_version from before_q2),'still no room version change');
select is(pg_temp.next(),'ok','q2 reveal'); select is(pg_temp.next(),'ok','q3');
select is(pg_temp.mark(:ava,2)->>'result','correct','Ava marks 3');
select is(pg_temp.next(),'ok','q3 reveal'); select is(pg_temp.next(),'ok','q4');
create temporary table before_one_away as select (pg_temp.room()).version as room_version;
select is(pg_temp.mark(:ava,3)->>'result','correct','Ava marks 4: one away');
select ok((pg_temp.room()).version > (select room_version from before_one_away), 'a first "one away" is a broadcast: the room version changes');
select is(((pg_temp.room()).events->-1)->>'type','one-away','one-away is broadcast');
select is(pg_temp.next(),'ok','q4 reveal'); select is(pg_temp.next(),'ok','q5');
select is(pg_temp.mark(:ava,4)->'me'->>'placement','1','Ava completes row 1: the Bingo takes the locked path');
select is((pg_temp.room()).winner_count,1,'one winner recorded');
select is(((pg_temp.room()).winners->0)->>'line','row-1','on row 1');

-- Everything for one player still checks out ---------------------------------------------------
select is((select count(*)::integer from public.bingo_participants where room_id=(pg_temp.room()).id and placement is not null),1,'exactly one placement');

select * from finish();
rollback;
