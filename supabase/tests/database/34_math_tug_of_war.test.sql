begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Catalog -------------------------------------------------------------------
select results_eq(
  $$select stable_key,slug,title,launch_type,status,version,thumbnail_reference,difficulty,resource_id,package_id,canonical_route,external_url
    from public.game_catalog_entries where stable_key='math-tug-of-war'$$,
  $$values ('math-tug-of-war'::text,'math-tug-of-war'::text,'Math Tug of War'::text,'internal'::text,'published'::text,'1.0.0'::text,
    'builtin:math-tug-of-war'::text,'mixed'::text,null::uuid,null::uuid,null::text,null::text)$$,
  'Math Tug of War is one published, destination-free internal game'
);
select results_eq(
  $$select description,publication_metadata->>'internal_registry_key',publication_metadata->>'internal_route'
    from public.game_catalog_entries where stable_key='math-tug-of-war'$$,
  $$values ('Solve the math. Pull the rope. Beat the other side!'::text,'math-tug-of-war'::text,'/games/math-tug-of-war/play'::text)$$,
  'card copy and trusted registration are exact'
);

-- Browser identities have no access at all ---------------------------------
select ok(not has_table_privilege('anon','public.tug_rooms','SELECT'), 'anon cannot read rooms');
select ok(not has_table_privilege('authenticated','public.tug_rooms','SELECT'), 'authenticated cannot read rooms');
select ok(not has_table_privilege('authenticated','public.tug_rooms','UPDATE'), 'authenticated cannot write rooms');
select ok(not has_table_privilege('authenticated','public.tug_join_failures','SELECT'), 'authenticated cannot read join failures');
select ok(not has_function_privilege('authenticated','public.tug_submit_answer(text,text,integer,integer,boolean)','EXECUTE'),
  'browsers cannot submit answers directly');
select ok(not has_function_privilege('anon','public.tug_create_room(text,text,text,text,text,text)','EXECUTE'),
  'anon cannot create rooms');
select ok(not has_function_privilege('authenticated','public.tug_join_room(text,text,text,text)','EXECUTE'),
  'authenticated cannot join rooms directly');
select ok(has_function_privilege('service_role','public.tug_room_state(text,text)','EXECUTE'), 'the server can read room state');

-- Lifecycle -----------------------------------------------------------------
\set host_token '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''
\set guest_token '''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'''
\set third_token '''cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'''
\set owner_a '''1111111111111111111111111111111111111111111111111111111111111111'''
\set owner_b '''2222222222222222222222222222222222222222222222222222222222222222'''
\set owner_c '''3333333333333333333333333333333333333333333333333333333333333333'''

select is(public.tug_create_room('TW7K2','integers','0123456789abcdef0123456789abcdef','Ava',:host_token,:owner_a)->>'result','created','host creates a room');
select is(public.tug_create_room('TW7K2','addition','0123456789abcdef0123456789abcdef','Zed',:third_token,:owner_c)->>'result','code-taken','a live code cannot be reused');
select is((public.tug_room_state('TW7K2',:host_token)->>'status'),'waiting','host waits for an opponent');
select is((public.tug_room_state('TW7K2',:host_token)->'names'->>'turquoise'),'Ava','host is the Turquoise team');
select ok((public.tug_room_state('TW7K2',:host_token)::text) !~ 'aaaaaaaa|token', 'token hashes never leave the database');
select is(public.tug_room_state('TW7K2',:host_token)->>'seed','0123456789abcdef0123456789abcdef','the trusted server receives the question seed');

select is(public.tug_join_room('NOPE2','Bo',:guest_token,:owner_b)->>'result','not-found','an unknown code is refused');
select is(public.tug_submit_answer('TW7K2',:host_token,1,0,true)->>'result','not-playing','no pulls before the opponent joins');

select is(public.tug_join_room('TW7K2','Bo',:guest_token,:owner_b)->>'result','joined','guest joins');
select is(public.tug_room_state('TW7K2',:guest_token)->>'team','pink','guest is the Pink team');
select is(public.tug_room_state('TW7K2',:guest_token)->>'skill','integers','guest inherits the host skill');
select is(public.tug_join_room('TW7K2','Cy',:third_token,:owner_c)->>'result','full','a third player is refused');
select is(public.tug_join_room('TW7K2','Bo',:guest_token,:owner_b)->>'result','full','a duplicate join cannot take a second seat');
select is(public.tug_room_state('TW7K2',:third_token)->>'result','not-found','an outsider token sees nothing');

-- Pulls, replays and wrong answers
select is(public.tug_submit_answer('TW7K2',:host_token,1,0,true)->>'position','-1','a correct Turquoise answer pulls toward Turquoise');
select is(public.tug_submit_answer('TW7K2',:host_token,1,0,true)->>'result','stale','replaying the same answer cannot score twice');
select is(public.tug_room_state('TW7K2',:host_token)->>'position','-1','the replay did not move the rope');
select is(public.tug_submit_answer('TW7K2',:guest_token,1,0,false)->>'position','-1','a wrong answer never pulls');
select is(public.tug_room_state('TW7K2',:guest_token)->>'questionIndex','1','a wrong answer still moves that player to the next question');
select is(public.tug_submit_answer('TW7K2',:guest_token,1,1,true)->>'position','0','a correct Pink answer pulls toward Pink');
select is(public.tug_submit_answer('TW7K2',:guest_token,0,2,true)->>'result','stale','an answer from another round is stale');
select is(public.tug_submit_answer('TW7K2',:guest_token,1,99,true)->>'result','stale','an answer to a question not yet asked is stale');

-- A token only ever speaks for its own team
select is((public.tug_submit_answer('TW7K2',:guest_token,1,2,true)->'pulls'->>'turquoise'),'1','a Pink token can never add a Turquoise pull');

-- Opponent away: no uncontested pulls
update public.tug_rooms set guest_seen_at=statement_timestamp()-interval '40 seconds' where code='TW7K2';
select is(public.tug_submit_answer('TW7K2',:host_token,1,1,true)->>'result','opponent-away','no pulls while the opponent is disconnected');
select is(public.tug_room_state('TW7K2',:host_token)->'presence'->>'pink','disconnected','the opponent shows as disconnected');
select is(public.tug_room_state('TW7K2',:guest_token)->'presence'->>'pink','connected','a returning player reconnects with the same token');

-- Victory
update public.tug_rooms set position=-4 where code='TW7K2';
select is(public.tug_submit_answer('TW7K2',:host_token,1,1,true)->>'winner','turquoise','reaching the line wins');
select is(public.tug_room_state('TW7K2',:host_token)->>'status','won','the match is won');
select is(public.tug_submit_answer('TW7K2',:guest_token,1,3,true)->>'result','not-playing','nobody pulls after the win');
select is(public.tug_room_state('TW7K2',:host_token)->>'position','-5','the rope stays at the line');

-- Rematch needs both players
select is(public.tug_request_rematch('TW7K2',:host_token,1)->>'result','rematch-requested','one player asks for a rematch');
select is(public.tug_request_rematch('TW7K2',:host_token,1)->>'result','rematch-requested','asking twice is harmless');
select is(public.tug_request_rematch('TW7K2',:guest_token,1)->>'result','rematch-started','both ready starts round two');
select results_eq(
  $$select status,round,position,winner,host_question_index,guest_question_index,host_pulls,guest_pulls from public.tug_rooms where code='TW7K2'$$,
  $$values ('playing'::text,2,0::smallint,null::text,0,0,0,0)$$,
  'the rematch resets the rope and questions but keeps the room'
);
select is(public.tug_request_rematch('TW7K2',:guest_token,1)->>'result','stale','an old rematch request cannot reset round two');

-- Leaving and expiry
select is(public.tug_leave_room('TW7K2',:guest_token)->>'status','closed','a player can leave');
select is(public.tug_room_state('TW7K2',:host_token)->>'closedBy','pink','the other player learns who left');
select is(public.tug_submit_answer('TW7K2',:host_token,2,0,true)->>'result','not-playing','a closed room cannot resume');

select is(public.tug_create_room('EXP22','addition','0123456789abcdef0123456789abcdef','Ann',:host_token,:owner_a)->>'result','created','second room');
update public.tug_rooms set expires_at=statement_timestamp()-interval '1 second' where code='EXP22';
select is(public.tug_join_room('EXP22','Bo',:guest_token,:owner_b)->>'result','expired','an expired room cannot be joined');
select is(public.tug_room_state('EXP22',:host_token)->>'status','expired','an expired room reports expired');
select is(public.tug_create_room('EXP22','addition','0123456789abcdef0123456789abcdef','Ann',:third_token,:owner_c)->>'result','created','an expired code can be reissued');
select is(public.tug_room_state('EXP22',:host_token)->>'status','closed','the expired room stays retired (no stale resurrection)');

-- Guessing is rate limited per player
select is(public.tug_join_room('ZZZZ'||chr(50+(g%8)),'X',:third_token,:owner_c)->>'result','not-found', 'guess ' || g) from generate_series(1,18) g; -- plus the earlier refused third-player join
select is(public.tug_join_room('ZZZZ9','X',:third_token,:owner_c)->>'result','not-found','twentieth failure still answered');
select is(public.tug_join_room('ZZZZ8','X',:third_token,:owner_c)->>'result','rate-limited','repeated guessing is throttled');

-- Constraints hold against direct writes, too
select throws_ok($$update public.tug_rooms set position=9 where code='EXP22'$$, '23514', null, 'the rope can never leave its bounds');

select * from finish();
rollback;
