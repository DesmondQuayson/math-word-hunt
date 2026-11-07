begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Math Bingo Live final gameplay (20261107100000): unique, checked decks;
-- every player's answers are independent; optional curated emoji.

-- Access ------------------------------------------------------------------------------------
select ok(not has_function_privilege('anon','public.bingo_join_room(text,text,text,text,text)','EXECUTE'), 'anon cannot join directly (with an emoji)');
select ok(not has_function_privilege('authenticated','public.bingo_join_room(text,text,text,text,text)','EXECUTE'), 'browsers cannot join directly (with an emoji)');
select ok(has_function_privilege('service_role','public.bingo_join_room(text,text,text,text,text)','EXECUTE'), 'the server joins players');
select ok((select prosecdef from pg_proc where oid='public.bingo_join_room(text,text,text,text,text)'::regprocedure), 'join runs as definer');
select ok(not has_function_privilege('anon','public.bingo_join_room(text,text,text,text)','EXECUTE'), 'the v1.2.35 join stays server-only');
select ok(not has_function_privilege('authenticated','private.bingo_deck_valid(jsonb,jsonb,jsonb)','EXECUTE'), 'browsers cannot call the deck check');
select ok(not has_function_privilege('authenticated','private.bingo_emoji_valid(text)','EXECUTE'), 'browsers cannot call the emoji check');

-- Fixtures ------------------------------------------------------------------------------------
create function pg_temp.settings(p_mode text default 'addition') returns jsonb language sql as $$
  select jsonb_build_object('mode',p_mode,'level',case when p_mode='fractions' then 'to-fifths' else 'within-50' end,'questionSeconds',0,'revealSeconds',0,
    'patterns',jsonb_build_object('rows',true,'columns',false,'diagonals',false),'winners',2,
    'freeSpace',true,'music','host','celebration','host','equivalentFractions',false)
$$;
create function pg_temp.q(p_a integer, p_b integer) returns jsonb language sql as $$
  -- "a + b" with its canonical identity (smaller operand first).
  select jsonb_build_object('q','addition:'||least(p_a,p_b)||':'||greatest(p_a,p_b),'t',p_a||' + '||p_b,'s','x','k','arithmetic','n',p_a+p_b,'d',1)
$$;
create function pg_temp.pool() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('n',v,'d',1) order by v) from generate_series(1,24) v
$$;
create function pg_temp.deck() returns jsonb language sql as $$
  select jsonb_agg(pg_temp.q(v,0) order by v) from generate_series(1,24) v
$$;
create function pg_temp.card() returns jsonb language sql as $$
  select jsonb_agg(case when i=12 then '{"free":true}'::jsonb else jsonb_build_object('n',case when i<12 then i+1 else i end,'d',1) end order by i)
  from generate_series(0,24) i
$$;
-- Two 12s: the pool 1..11, 12, 12, 13..23.
create function pg_temp.pool12() returns jsonb language sql as $$
  select jsonb_agg(jsonb_build_object('n',v,'d',1) order by v) from (select generate_series(1,23) v union all select 12) s
$$;
-- Cells 0 and 1 are 12; 2..11 are 1..10; centre Free Space; 13..24 are 11, 13..23.
create function pg_temp.card12() returns jsonb language sql as $$
  select jsonb_agg(case when i in (0,1) then '{"n":12,"d":1}'::jsonb when i=12 then '{"free":true}'::jsonb
    when i<12 then jsonb_build_object('n',i-1,'d',1) when i=13 then '{"n":11,"d":1}'::jsonb else jsonb_build_object('n',i-1,'d',1) end order by i)
  from generate_series(0,24) i
$$;
-- 7 + 5 = 12, then 8 + 4 = 12 (a different question, same answer), then the rest.
create function pg_temp.deck12() returns jsonb language sql as $$
  select jsonb_build_array(pg_temp.q(7,5), pg_temp.q(8,4)) || (select jsonb_agg(pg_temp.q(v,0) order by v) from generate_series(1,23) v where v<>12)
$$;
create function pg_temp.room(p_token text) returns public.bingo_rooms language sql as $$
  select * from public.bingo_rooms where host_token_hash=p_token
$$;
create function pg_temp.next(p_owner text, p_token text) returns text language sql as $$
  select (public.bingo_host_command(p_owner, p_token, 'next',
    (select jsonb_build_object('phase',phase,'question',question_number) from public.bingo_rooms where host_token_hash=p_token)))->>'result'
$$;
create function pg_temp.mark(p_room_token text, p_player text, p_cell integer) returns text language sql as $$
  select public.bingo_mark(p_player, (pg_temp.room(p_room_token)).game_number, (pg_temp.room(p_room_token)).question_number, p_cell)->>'result'
$$;
create function pg_temp.boards(p_room_token text, p_card jsonb) returns jsonb language sql as $$
  select coalesce(jsonb_object_agg(p.id::text, p_card), '{}'::jsonb) from public.bingo_participants p
  where p.room_id=(pg_temp.room(p_room_token)).id and p.status='active'
$$;

\set subject '''9999999999999999999999999999999999999999999999999999999999999999'''

-- Deck check -------------------------------------------------------------------------------------
select ok(private.bingo_deck_valid(pg_temp.deck(), pg_temp.pool(), pg_temp.settings()), 'a deck of distinct, consistent questions is accepted');
select ok(private.bingo_deck_valid(pg_temp.deck12(), pg_temp.pool12(), pg_temp.settings()), '7 + 5 and 8 + 4 (same answer, different questions) are both allowed');
select ok(not private.bingo_deck_valid(pg_temp.deck() || jsonb_build_array(pg_temp.q(1,0)), pg_temp.pool(), pg_temp.settings()), 'the same question twice is refused');
select ok(not private.bingo_deck_valid(pg_temp.deck() || jsonb_build_array(pg_temp.q(0,1)), pg_temp.pool(), pg_temp.settings()), '1 + 0 after 0 + 1 is the same question (addition ignores order)');
select ok(not private.bingo_deck_valid(jsonb_set(pg_temp.deck(),'{0,q}','"addition:1:0"'), pg_temp.pool(), pg_temp.settings()), 'a non-canonical identity is refused');
select ok(not private.bingo_deck_valid(jsonb_set(pg_temp.deck(),'{0,q}','"addition:0:2"'), pg_temp.pool(), pg_temp.settings()), 'an identity that does not match its text is refused');
select ok(not private.bingo_deck_valid(jsonb_set(pg_temp.deck(),'{0,n}','2'), pg_temp.pool(), pg_temp.settings()), 'a wrong answer is refused');
select ok(not private.bingo_deck_valid(pg_temp.deck() || jsonb_build_array(pg_temp.q(30,0)), pg_temp.pool(), pg_temp.settings()), 'a question whose answer is on no card is refused');
select ok(not private.bingo_deck_valid(pg_temp.deck() - 23, pg_temp.pool(), pg_temp.settings()), 'a card value that is never called is refused');
select ok(not private.bingo_deck_valid(jsonb_set(pg_temp.deck(),'{0}','{"q":"subtraction:2:1","t":"2 − 1","s":"x","k":"arithmetic","n":1,"d":1}'), pg_temp.pool(), pg_temp.settings()), 'another operation is refused in Addition');
select ok(private.bingo_deck_valid(jsonb_set(pg_temp.deck(),'{0}','{"q":"subtraction:2:1","t":"2 − 1","s":"x","k":"arithmetic","n":1,"d":1}'), pg_temp.pool(), pg_temp.settings('mixed')), 'Mixed Operations accepts it');
select ok(private.bingo_deck_valid('[{"q":"division:36:6","t":"36 ÷ 6","s":"x","k":"arithmetic","n":6,"d":1}]', '[{"n":6,"d":1}]', jsonb_set(pg_temp.settings(),'{mode}','"division"')), 'division keeps operand order: 36 ÷ 6');
select ok(not private.bingo_deck_valid('[{"q":"division:6:36","t":"36 ÷ 6","s":"x","k":"arithmetic","n":6,"d":1}]', '[{"n":6,"d":1}]', jsonb_set(pg_temp.settings(),'{mode}','"division"')), 'and refuses 6 ÷ 36 as its name');
select ok(not private.bingo_deck_valid('[{"q":"subtraction:6:14","t":"6 − 14","s":"x","k":"arithmetic","n":0,"d":1}]', '[{"n":0,"d":1}]', jsonb_set(pg_temp.settings(),'{mode}','"subtraction"')), 'never a negative answer');
select ok(private.bingo_deck_valid('[{"q":"fraction:2:3","t":"2/3","s":"two thirds","k":"fraction","n":2,"d":3}]', '[{"n":2,"d":3},{"n":2,"d":3}]', pg_temp.settings('fractions')),
  'Fraction Bingo: a deck shorter than the card (each fraction called once) is accepted');
select ok(not private.bingo_deck_valid('[{"q":"fraction:2:3","t":"2/3","s":"two thirds","k":"fraction","n":2,"d":3},{"q":"fraction:2:3","t":"2/3","s":"two thirds","k":"fraction","n":2,"d":3}]', '[{"n":2,"d":3}]', pg_temp.settings('fractions')),
  '2/3 twice in one game is refused');
select ok(not private.bingo_deck_valid('[{"q":"fraction:2:3","t":"2/3","s":"x","k":"fraction","n":2,"d":3}]', '[{"n":2,"d":3}]', pg_temp.settings()), 'a fraction question is refused outside Fraction Bingo');
select ok(not private.bingo_deck_valid('[{"t":"1 + 0","s":"x","k":"arithmetic","n":1,"d":1}]', '[{"n":1,"d":1}]', pg_temp.settings()), 'a question without an identity is refused');

-- Start refuses a repeating deck ---------------------------------------------------------------
select is(public.bingo_create_room('713001',repeat('1',64),repeat('a',64),pg_temp.settings())->>'result','created','a room');
select is(public.bingo_join_room('713001','Ava',repeat('a',60)||'0001',:subject,'🦁')->>'result','joined','Ava joins with 🦁');
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'start',pg_temp.settings(),repeat('e',32),pg_temp.pool(),
  pg_temp.deck() || jsonb_build_array(pg_temp.q(0,5)),'{}'::jsonb)->>'result','invalid-game','Start refuses a deck that repeats 5 + 0');
select is((pg_temp.room(repeat('a',64))).phase,'LOBBY','and nothing starts');

-- Emoji ----------------------------------------------------------------------------------------------
select is(public.bingo_player_state(repeat('a',60)||'0001',null,null)->'me'->>'emoji','🦁','Ava''s emoji is stored with her seat');
select is(public.bingo_join_room('713001','Zion',repeat('a',60)||'0002',:subject,'🦁')->>'result','joined','two students may pick the same emoji');
select is(public.bingo_join_room('713001','Omar',repeat('a',60)||'0003',:subject,null)->>'result','joined','the emoji is optional');
select is(public.bingo_join_room('713001','Omar',repeat('a',60)||'0004',:subject,'🐼')->'me'->>'name','Omar 2','duplicate names keep the existing rule');
select is(public.bingo_join_room('713001','Eve',repeat('a',60)||'0005',:subject,'<b>x</b>')->>'result','invalid-emoji','markup is refused');
select is(public.bingo_join_room('713001','Eve',repeat('a',60)||'0005',:subject,'😀')->>'result','invalid-emoji','an emoji off the list is refused');
select is(public.bingo_join_room('713001','Eve',repeat('a',60)||'0005',:subject,'🦁🦁')->>'result','invalid-emoji','two emoji are refused');
select is((select count(*)::integer from public.bingo_participants where token_hash=repeat('a',60)||'0005'),0,'a refused join stores nothing');
select throws_ok($$update public.bingo_participants set emoji='<script>' where token_hash=repeat('a',60)||'0001'$$, '23514', null, 'the table itself refuses an emoji off the list');
select is(public.bingo_join_room('713001','Kim',repeat('a',60)||'0006',:subject)->'me'->>'emoji',null,'the v1.2.35 four-argument join still works (no emoji)');
select is((select e->>'emoji' from jsonb_array_elements(public.bingo_host_state(repeat('1',64),repeat('a',64),null,null)->'players') e where e->>'name'='Ava'),'🦁','the host roster shows the emoji');
select is((select e->>'emoji' from jsonb_array_elements(public.bingo_host_state(repeat('1',64),repeat('a',64),null,null)->'leaderboard') e where e->>'name'='Zion'),'🦁','standings carry it');
select is(public.bingo_player_state(repeat('a',60)||'0001',null,null)->'me'->>'emoji','🦁','a reconnect (a new poll from the same seat) keeps it');

-- Start, Free Space announcement with the emoji, removal clears it -----------------------------------
select is(public.bingo_host_start(repeat('1',64),repeat('a',64),'start',pg_temp.settings(),repeat('e',32),pg_temp.pool(),pg_temp.deck(),pg_temp.boards(repeat('a',64),pg_temp.card()))->>'result','started','a unique deck starts');
select is(pg_temp.next(repeat('1',64),repeat('a',64)),'ok','question 1');
select is(public.bingo_free_space(repeat('a',60)||'0004',1,1)->>'result','free-space','Omar 2 (🐼) uses the Free Space');
select is(((pg_temp.room(repeat('a',64))).events->-1)->>'emoji','🐼','the Free Space announcement carries his emoji');
select is(public.bingo_host_command(repeat('1',64),repeat('a',64),'remove',jsonb_build_object('participant',(select id from public.bingo_participants where token_hash=repeat('a',60)||'0004')))->>'result','ok','the teacher removes him');
select is((select emoji from public.bingo_participants where token_hash=repeat('a',60)||'0004'),null,'removal clears the emoji with the name');
select is(((pg_temp.room(repeat('a',64))).events->-1)->>'emoji',null,'and from past announcements');

-- Every player's answer is independent: 50 players, one question, the same answer --------------------
select is(public.bingo_create_room('713050',repeat('5',64),repeat('6',64),jsonb_set(pg_temp.settings(),'{winners}','0'))->>'result','created','a 50-player room');
select is((select count(*)::integer from (select public.bingo_join_room('713050','Kid '||g,repeat('b',60)||lpad(g::text,4,'0'),:subject,'🚀')->>'result' as r from generate_series(1,50) g) s where r='joined'),50,'50 players join (all 🚀)');
select is(public.bingo_host_start(repeat('5',64),repeat('6',64),'start',jsonb_set(pg_temp.settings(),'{winners}','0'),repeat('f',32),pg_temp.pool(),pg_temp.deck(),pg_temp.boards(repeat('6',64),pg_temp.card()))->>'dealt','50','every card is dealt at Start');
select is(pg_temp.next(repeat('5',64),repeat('6',64)),'ok','question 1: 1 + 0');
select is((select count(*)::integer from (select pg_temp.mark(repeat('6',64), repeat('b',60)||lpad(g::text,4,'0'), 0) as r from generate_series(1,50) g) s where r='correct'),50,
  'all 50 players mark their own 1: nobody consumes the answer');
select is((select count(*)::integer from public.bingo_participants where room_id=(pg_temp.room(repeat('6',64))).id and marks=1 and mark_question=1 and correct_count=1),50,
  'each player''s own card has exactly that cell marked, once');
select is((select count(*)::integer from (select pg_temp.mark(repeat('6',64), repeat('b',60)||lpad(g::text,4,'0'), 0) as r from generate_series(1,50) g) s where r='already-marked'),50,
  'a repeated submission is never counted twice');
select is((select count(*)::integer from jsonb_array_elements(public.bingo_host_state(repeat('5',64),repeat('6',64),null,null)->'leaderboard') e),50,
  'the leaderboard lists all 50 players');
-- Equal progress is a tie (20261108100000): 50 players with one mark each all share rank 1.
select is((select count(*)::integer from jsonb_array_elements(public.bingo_host_state(repeat('5',64),repeat('6',64),null,null)->'leaderboard') e where (e->>'rank')::integer=1 and (e->>'tied')::boolean),50,
  'all 50 share rank 1 and are marked tied');
select is((select count(*)::integer from jsonb_array_elements(public.bingo_host_state(repeat('5',64),repeat('6',64),null,null)->'leaderboard') e where (e->>'correct')::integer=1),50,
  'with one correct mark each');

-- One mark per question, and a second 12 for a later question ------------------------------------------
select is(public.bingo_create_room('713012',repeat('7',64),repeat('8',64),pg_temp.settings())->>'result','created','a room with two 12s on every card');
select is(public.bingo_join_room('713012','Ava',repeat('c',60)||'0001',:subject,'🦁')->>'result','joined','Ava');
select is(public.bingo_join_room('713012','Zion',repeat('c',60)||'0002',:subject,'🚀')->>'result','joined','Zion');
select is(public.bingo_join_room('713012','Omar',repeat('c',60)||'0003',:subject,'🐼')->>'result','joined','Omar');
select is(public.bingo_host_start(repeat('7',64),repeat('8',64),'start',pg_temp.settings(),repeat('d',32),pg_temp.pool12(),pg_temp.deck12(),pg_temp.boards(repeat('8',64),pg_temp.card12()))->>'dealt','3','cards with two 12s');
select is(pg_temp.next(repeat('7',64),repeat('8',64)),'ok','question 1: 7 + 5');
select is(pg_temp.mark(repeat('8',64),repeat('c',60)||'0001',0),'correct','Ava marks her first 12');
select is(pg_temp.mark(repeat('8',64),repeat('c',60)||'0002',0),'correct','Zion still marks his own 12');
select is(pg_temp.mark(repeat('8',64),repeat('c',60)||'0003',1),'correct','Omar marks his other 12');
select is(pg_temp.mark(repeat('8',64),repeat('c',60)||'0001',1),'mark-used','one question gives Ava one mark, even with two 12s');
select is(pg_temp.next(repeat('7',64),repeat('8',64)),'ok','reveal');
select is(pg_temp.next(repeat('7',64),repeat('8',64)),'ok','question 2: 8 + 4 (a different question, also 12)');
select is(pg_temp.mark(repeat('8',64),repeat('c',60)||'0001',1),'correct','Ava uses her second 12');
select is((select marks from public.bingo_participants where token_hash=repeat('c',60)||'0001'),3,'both of Ava''s 12s are marked, one per question');
select is((select marks from public.bingo_participants where token_hash=repeat('c',60)||'0002'),1,'Zion''s card is his own');
select is((select marks from public.bingo_participants where token_hash=repeat('c',60)||'0003'),2,'Omar''s card is his own');
select is(jsonb_array_length((select r.deck from public.bingo_rooms r where r.host_token_hash=repeat('8',64))),
  (select count(distinct e->>'q')::integer from public.bingo_rooms r, jsonb_array_elements(r.deck) e where r.host_token_hash=repeat('8',64)),
  'the stored deck (the Called history) has no repeated question');

select * from finish();
rollback;
