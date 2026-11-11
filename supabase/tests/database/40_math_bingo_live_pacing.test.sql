begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Math Bingo Live winner pacing (20261108100000): the question universe, the
-- paced Start and its card checks, the scheduler's gates, pending lines, and
-- standings with ties. Deterministic: every card and every call is chosen from
-- the seeds below, so the expectations are exact.

-- Access --------------------------------------------------------------------------------------------
select ok(not has_table_privilege('anon','public.bingo_room_questions','SELECT'), 'anon cannot read the question universe');
select ok(not has_table_privilege('authenticated','public.bingo_room_questions','SELECT'), 'browsers cannot read the question universe');
select ok((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.bingo_room_questions'::regclass), 'the universe table has RLS forced');
select ok(not has_function_privilege('anon','public.bingo_host_start_paced(text,text,text,jsonb,text,jsonb,jsonb,jsonb)','EXECUTE'), 'anon cannot start a paced game');
select ok(not has_function_privilege('authenticated','public.bingo_host_start_paced(text,text,text,jsonb,text,jsonb,jsonb,jsonb)','EXECUTE'), 'browsers cannot start a paced game');
select ok(has_function_privilege('service_role','public.bingo_host_start_paced(text,text,text,jsonb,text,jsonb,jsonb,jsonb)','EXECUTE'), 'the server starts paced games');
select ok((select prosecdef from pg_proc where oid='public.bingo_host_start_paced(text,text,text,jsonb,text,jsonb,jsonb,jsonb)'::regprocedure), 'paced Start runs as definer');
select ok(not has_function_privilege('authenticated','private.bingo_schedule(public.bingo_rooms)','EXECUTE'), 'browsers cannot call the scheduler');
select ok(not has_function_privilege('authenticated','private.bingo_paced_board_valid(jsonb,jsonb,jsonb,uuid)','EXECUTE'), 'browsers cannot call the card check');

-- Fixtures: Addition "facts" with a tiny made-up universe so every call is predictable. -------------
-- Classes 1..16 ("k + 0"), and a second question for 2..16 ("(k-1) + 1"): 31 unique questions.
create function pg_temp.settings(p_winners integer) returns jsonb language sql as $$
  select jsonb_build_object('mode','addition','level','within-50','questionSeconds',0,'revealSeconds',0,
    'patterns',jsonb_build_object('rows',true,'columns',false,'diagonals',false),'winners',p_winners,
    'freeSpace',true,'music','host','celebration','host','equivalentFractions',false)
$$;
create function pg_temp.q(p_a integer, p_b integer) returns jsonb language sql as $$
  select jsonb_build_object('q','addition:'||least(p_a,p_b)||':'||greatest(p_a,p_b),'c',(p_a+p_b)::text||'/1','t',p_a||' + '||p_b,'s','x','k','arithmetic','n',p_a+p_b,'d',1)
$$;
create function pg_temp.universe() returns jsonb language sql as $$
  select (select jsonb_agg(pg_temp.q(v,0) order by v) from generate_series(1,16) v)
      || (select jsonb_agg(pg_temp.q(v-1,1) order by v) from generate_series(2,16) v)
$$;
create function pg_temp.cell(p_n integer) returns jsonb language sql as $$ select jsonb_build_object('n',p_n,'d',1) $$;
-- A card whose rows are: [1 2 3 4 L13] [5 6 7 8 L14] [9 10 F 11 L15] [12 1 2 3 L16] [4 5 6 7 L13]: every row holds a late cell (13..16).
create function pg_temp.card() returns jsonb language sql as $$
  select jsonb_build_array(
    pg_temp.cell(1), pg_temp.cell(2), pg_temp.cell(3), pg_temp.cell(4), pg_temp.cell(13),
    pg_temp.cell(5), pg_temp.cell(6), pg_temp.cell(7), pg_temp.cell(8), pg_temp.cell(14),
    pg_temp.cell(9), pg_temp.cell(10), '{"free":true}'::jsonb, pg_temp.cell(11), pg_temp.cell(15),
    pg_temp.cell(12), pg_temp.cell(1), pg_temp.cell(2), pg_temp.cell(3), pg_temp.cell(16),
    pg_temp.cell(4), pg_temp.cell(5), pg_temp.cell(6), pg_temp.cell(7), pg_temp.cell(13))
$$;
create function pg_temp.pacing(p_max integer) returns jsonb language sql as $$
  select jsonb_build_object('firstWinCall',15,'spacing',10,'buffer',3,'maxWinners',p_max,'scaled',false,'late',jsonb_build_array('13/1','14/1','15/1','16/1'),'reserve','[]'::jsonb)
$$;
create function pg_temp.room(p_token text) returns public.bingo_rooms language sql as $$ select * from public.bingo_rooms where host_token_hash=p_token $$;
create function pg_temp.boards(p_token text) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(p.id::text, pg_temp.card()), '{}'::jsonb) from public.bingo_participants p where p.room_id=(pg_temp.room(p_token)).id and p.status='active'
$$;
create function pg_temp.next(p_owner text, p_token text) returns text language sql as $$
  select (public.bingo_host_command(p_owner, p_token, 'next',
    (select jsonb_build_object('phase',phase,'question',question_number) from public.bingo_rooms where host_token_hash=p_token)))->>'result'
$$;
-- Reveal the live question and call the next one.
create function pg_temp.advance(p_owner text, p_token text) returns integer language plpgsql as $$
begin
  perform pg_temp.next(p_owner, p_token);
  perform pg_temp.next(p_owner, p_token);
  return (pg_temp.room(p_token)).question_number;
end $$;
create function pg_temp.current_class(p_token text) returns text language sql as $$
  select ((pg_temp.room(p_token)).deck->((pg_temp.room(p_token)).question_number-1))->>'n' || '/1'
$$;
-- Mark the matching unmarked cell of the current call for a player (the first one), if any.
create function pg_temp.mark(p_token text, p_player text) returns text language plpgsql as $$
declare r public.bingo_rooms := pg_temp.room(p_token); me public.bingo_participants; i integer;
begin
  select * into me from public.bingo_participants where token_hash=p_player;
  for i in 0..24 loop
    if not ((me.board->i) ? 'free') and ((me.marks >> i) & 1) = 0 and private.bingo_matches(r.settings, r.deck->(r.question_number-1), me.board->i) then
      return public.bingo_mark(p_player, r.game_number, r.question_number, i)->>'result';
    end if;
  end loop;
  return 'no-match';
end $$;

\set subject '''7777777777777777777777777777777777777777777777777777777777777777'''
\set owner '''1111111111111111111111111111111111111111111111111111111111111111'''
\set token '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''
\set ava '''cccc000000000000000000000000000000000000000000000000000000000001'''
\set zion '''cccc000000000000000000000000000000000000000000000000000000000002'''
\set omar '''cccc000000000000000000000000000000000000000000000000000000000003'''

-- Start checks ----------------------------------------------------------------------------------------
select is(public.bingo_create_room('811001',:owner,:token,pg_temp.settings(2))->>'result','created','a room (2 winners)');
select is(public.bingo_join_room('811001','Ava',:ava,:subject,'🦁')->>'result','joined','Ava');
select is(public.bingo_join_room('811001','Zion',:zion,:subject,'🚀')->>'result','joined','Zion');
select is(public.bingo_join_room('811001','Omar',:omar,:subject,null)->>'result','joined','Omar');
select is(public.bingo_host_start_paced(:owner,:token,'start',pg_temp.settings(2),repeat('4',32),pg_temp.universe() || jsonb_build_array(pg_temp.q(1,0)),pg_temp.boards(:token),pg_temp.pacing(2))->>'result','invalid-game','a universe that repeats a question is refused');
select is(public.bingo_host_start_paced(:owner,:token,'start',pg_temp.settings(2),repeat('4',32),jsonb_set(pg_temp.universe(),'{0,n}','5'),pg_temp.boards(:token),pg_temp.pacing(2))->>'result','invalid-game','a question whose answer is wrong is refused');
select is(public.bingo_host_start_paced(:owner,:token,'start',pg_temp.settings(2),repeat('4',32),pg_temp.universe(),pg_temp.boards(:token),jsonb_set(pg_temp.pacing(2),'{late}','["99/1"]'))->>'result','invalid-game','a late class outside the universe is refused');
select is((pg_temp.room(:token)).phase,'LOBBY','nothing started yet');
-- A card with a row that has no late cell is not stored (that player is dealt later).
select is((public.bingo_host_start_paced(:owner,:token,'start',pg_temp.settings(2),repeat('4',32),pg_temp.universe(),
  jsonb_set(pg_temp.boards(:token), array[(select id::text from public.bingo_participants where token_hash=:omar),'4'], pg_temp.cell(5)),pg_temp.pacing(2))->>'dealt')::integer,2,'Start keeps only cards whose every enabled line holds a late cell');
select is((select count(*)::integer from public.bingo_room_questions where room_id=(pg_temp.room(:token)).id),31,'the universe is stored with the room');
select is((pg_temp.room(:token)).deck,'[]'::jsonb,'the Called history starts empty');
select is(((pg_temp.room(:token)).pacing->>'firstWinCall')::integer,private.bingo_first_gate(repeat('4',32),31),'the first gate is the one drawn from the game seed (the payload''s number is ignored)');
select is(((pg_temp.room(:token)).pacing->>'nextEligibleCall')::integer,15,'for this seed: call 15 (one of 14 to 17)');
select ok(public.bingo_host_state(:owner,:token,null,null) ? 'pacing' is false and public.bingo_player_state(:ava,null,null) ? 'pacing' is false, 'no screen is sent the gate numbers');
select is((public.bingo_player_state(:omar,null,null)->>'needsBoard')::boolean,true,'Omar needs a card');
select ok(public.bingo_player_state(:omar,null,null)->'late' = '["13/1","14/1","15/1","16/1"]'::jsonb, 'his reply names the late classes');
select is(jsonb_array_length(public.bingo_player_state(:omar,null,null)->'callable'),16,'and the classes still callable');
select is(public.bingo_set_board(:omar,1,jsonb_set(pg_temp.card(),'{4}',pg_temp.cell(5)))->>'result','invalid-board','a late card without a late cell in a row is refused');
select is(public.bingo_set_board(:omar,1,pg_temp.card())->>'result','ok','a valid late card is stored');

-- Calls 1..14: early classes only; no row can finish -------------------------------------------------
select is(pg_temp.next(:owner,:token),'ok','question 1');
-- Perfect players use the Free Space as soon as the first question is live.
select is(public.bingo_free_space(:ava,1,1)->>'result','free-space','Ava takes the Free Space');
select is(public.bingo_free_space(:zion,1,1)->>'result','free-space','Zion takes the Free Space');
select is(public.bingo_free_space(:omar,1,1)->>'result','free-space','Omar takes the Free Space');
create temporary table calls (n integer, cls text, late boolean);
do $$
declare n integer; cls text;
begin
  for n in 1..14 loop
    cls := pg_temp.current_class('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
    insert into calls values (n, cls, cls in ('13/1','14/1','15/1','16/1'));
    -- Everyone marks everything they can.
    perform pg_temp.mark('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccc000000000000000000000000000000000000000000000000000000000001');
    perform pg_temp.mark('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccc000000000000000000000000000000000000000000000000000000000002');
    perform pg_temp.mark('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','cccc000000000000000000000000000000000000000000000000000000000003');
    if n < 14 then perform pg_temp.advance('1111111111111111111111111111111111111111111111111111111111111111','aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'); end if;
  end loop;
end $$;
select is((select count(*)::integer from calls where late),0,'calls 1-14 use early classes only');
select is((select count(distinct e->>'q')::integer from jsonb_array_elements((pg_temp.room(:token)).deck) e),14,'fourteen different questions, none repeated');
select is((select min(best_count)::integer from public.bingo_participants where room_id=(pg_temp.room(:token)).id),4,'perfect players stand at 4/5 (every early cell of a row marked)');
select is((select count(distinct cls)::integer from calls),12,'no early class is asked twice while a fresh one remains');
select is((pg_temp.room(:token)).winner_count,0,'nobody has won before call 15');
select is((select count(*)::integer from public.bingo_participants where room_id=(pg_temp.room(:token)).id and pending_line is not null),0,'no line completed before call 15');
-- Standings: three equal players tie at rank 1.
select is((select count(*)::integer from jsonb_array_elements(public.bingo_host_state(:owner,:token,null,null)->'leaderboard') e where (e->>'rank')::integer=1 and (e->>'tied')::boolean),3,'three players with equal progress share rank 1');

-- Call 15: the gate opens, one late class is called, a single winner ---------------------------------
select is(pg_temp.advance(:owner,:token),15,'call 15');
select ok(pg_temp.current_class(:token) in ('13/1','14/1','15/1','16/1'), 'call 15 is a late class (a real Bingo opportunity)');
select is(pg_temp.mark(:token,:ava),'correct','Ava completes a row');
select is((pg_temp.room(:token)).winner_count,1,'Ava is the first winner');
select is(((pg_temp.room(:token)).pacing->>'nextEligibleCall')::integer,15 + private.bingo_winner_gap(repeat('4',32),1),'the next new winner waits the gap drawn after this event');
select is(private.bingo_winner_gap(repeat('4',32),1),10,'for this seed: 10 calls (one of 8 to 11), so call 25');
select is(((pg_temp.room(:token)).pacing->>'lastWinnerCall')::integer,15,'the winner call is recorded');
select is((pg_temp.room(:token)).pacing->'gaps','[10]'::jsonb,'and the gap, for the record');
-- Zion holds the same row: his correct mark on the same call completes it too: a tie.
select is(pg_temp.mark(:token,:zion),'correct','Zion''s mark on the same call is correct');
select is((pg_temp.room(:token)).winner_count,2,'it is a Bingo on the same call (tap order does not separate them)');
select is((select placement from public.bingo_participants where token_hash=:zion),1,'Zion shares first place with Ava');
select is((select count(*)::integer from public.bingo_participants where room_id=(pg_temp.room(:token)).id and pending_line is not null),0,'nothing is left pending');
select is((select count(*)::integer from jsonb_array_elements((pg_temp.room(:token)).events) e where e->>'type'='bingo'),2,'both Bingos are announced');
select is((select e->>'tie' from jsonb_array_elements((pg_temp.room(:token)).events) e where e->>'type'='bingo' and e->>'name'='Zion'),'true','his is announced as a tie');
select is(((pg_temp.room(:token)).pacing->>'nextEligibleCall')::integer,25,'a tie does not draw a new gap');
select is((select array_agg(e->>'rank' order by e->>'name') from jsonb_array_elements(public.bingo_host_state(:owner,:token,null,null)->'leaderboard') e where e->>'name' in ('Ava','Zion')),array['1','1'],'both rank first');
select is((select bool_and((e->>'tied')::boolean) from jsonb_array_elements(public.bingo_host_state(:owner,:token,null,null)->'leaderboard') e where e->>'name' in ('Ava','Zion')),true,'shown as tied');
-- The target (2) is reached: the rest of call 15 still counts, the game ends when it closes.
select is((pg_temp.room(:token)).phase,'QUESTION_ACTIVE','the target reached does not cut call 15 short');
select is(((pg_temp.room(:token)).pacing->>'closing')::integer,15,'the room knows it closes with this call');
select is(pg_temp.mark(:token,:omar),'correct','Omar completes the same row on the same call');
select is((pg_temp.room(:token)).winner_count,3,'a third same-call winner counts, past the target of 2');
select is((select placement from public.bingo_participants where token_hash=:omar),1,'sharing first place');
-- All three players have now won: nobody is left to tie, so the game ends at once.
select is((pg_temp.room(:token)).phase,'WINNER_REVEAL','everyone has Bingo: the game ends at once');
select is(pg_temp.next(:owner,:token),'stale','there is no call left for the host to close');
select is((pg_temp.room(:token)).completed_reason,'winners','because the target was reached');
select is((pg_temp.room(:token)).question_number,15,'no further question was asked');
select is((select count(distinct e->>'id')::integer from jsonb_array_elements((pg_temp.room(:token)).winners) e),3,'three different winners, each recorded once');
select is((select count(distinct e->>'q')::integer from jsonb_array_elements((pg_temp.room(:token)).deck) e),jsonb_array_length((pg_temp.room(:token)).deck),'no question repeated');

-- Standings ranking contract -----------------------------------------------------------------------------
select is(public.bingo_create_room('811002',repeat('2',64),repeat('b',64),pg_temp.settings(3))->>'result','created','a ranking room');
-- Ava, Zion and Omar each stand at 4/5 on one line; Juliet stands at 4/5 on two lines.
select is((select count(*)::integer from (select public.bingo_join_room('811002',n.name,repeat('d',60)||lpad(n.g::text,4,'0'),:subject,null)->>'result' as r from (values (1,'Ava'),(2,'Zion'),(3,'Omar'),(4,'Juliet')) n(g,name)) s where r='joined'),4,'four players: Ava, Zion, Omar, Juliet');
update public.bingo_participants set best_count=4, best_lines=1, correct_count=5 where token_hash=repeat('d',60)||'0001';
update public.bingo_participants set best_count=4, best_lines=1, correct_count=5 where token_hash=repeat('d',60)||'0002';
update public.bingo_participants set best_count=4, best_lines=1, correct_count=5 where token_hash=repeat('d',60)||'0003';
update public.bingo_participants set best_count=4, best_lines=2, correct_count=5 where token_hash=repeat('d',60)||'0004';
create temporary table ranks as select e->>'name' as name, (e->>'rank')::integer as rank, (e->>'tied')::boolean as tied
  from jsonb_array_elements(public.bingo_host_state(repeat('2',64),repeat('b',64),null,null)->'leaderboard') e;
select is((select rank from ranks where name='Juliet'),1,'Juliet (4/5 on two lines) ranks above 4/5 on one line');
select is((select tied from ranks where name='Juliet'),false,'and is not a tie');
select is((select array_agg(rank order by name) from ranks where name<>'Juliet'),array[2,2,2],'Ava, Zion and Omar (equal 4/5, one line) share rank 2');
select is((select bool_and(tied) from ranks where name<>'Juliet'),true,'and are shown as tied (T-2)');
update public.bingo_participants set response_ms=10 where token_hash=repeat('d',60)||'0001';
update public.bingo_participants set response_ms=9000 where token_hash=repeat('d',60)||'0002';
select is((select array_agg((e->>'rank')::integer order by e->>'name') from jsonb_array_elements(public.bingo_host_state(repeat('2',64),repeat('b',64),null,null)->'leaderboard') e where e->>'name' in ('Ava','Zion')),array[2,2],'response time never breaks a tie');

select * from finish();
rollback;
