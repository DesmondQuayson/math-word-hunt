begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_column('public','consumer_game_entitlements','capability_key','one existing entitlement row carries the all-access capability');
select has_table('public','game_catalog_entries','standalone game catalog exists');
select has_table('public','game_external_allowed_hosts','external games use an explicit host allowlist');
select has_table('public','game_catalog_destination_audit','game destination changes are audited');
select has_table('public','topic_resource_assignments','topic-level Quiz assignments exist');
select has_column('public','content_resources','resource_scope','content has an explicit global/topic/lesson scope');
select has_column('public','content_resources','scope_status','legacy scope is explicit');

select results_eq(
  $$select stable_key,slug,title,launch_type,canonical_route,status,display_order,version,resource_id,package_id
    from public.game_catalog_entries where stable_key='math-vocabulary-hunt'$$,
  $$values('math-vocabulary-hunt'::text,'math-vocabulary-hunt'::text,'Math Vocabulary Hunt'::text,'canonical'::text,'/play'::text,'published'::text,1::smallint,'7.0.0'::text,null::uuid,null::uuid)$$,
  'migration owns one published canonical Math Vocabulary Hunt entry with no taxonomy parent'
);
select is(
  (select count(*)::bigint from public.game_catalog_entries where stable_key='math-vocabulary-hunt'),
  1::bigint,
  'canonical catalog reconciliation is singular'
);
select is(
  (select count(*)::bigint from public.game_catalog_destination_audit where catalog_entry_id='9b000000-0000-4000-8000-000000000001'),
  1::bigint,
  'canonical destination creation has sanitized append-only audit evidence'
);

select results_eq(
  $$select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in(
    'public.game_catalog_entries'::regclass,'public.game_external_allowed_hosts'::regclass,
    'public.game_catalog_destination_audit'::regclass,'public.topic_resource_assignments'::regclass
  ) order by relname$$,
  $$values
    ('game_catalog_destination_audit'::name,true,true),('game_catalog_entries'::name,true,true),
    ('game_external_allowed_hosts'::name,true,true),('topic_resource_assignments'::name,true,true)$$,
  'new product tables force RLS'
);
select results_eq(
  $$select role_name,table_name,privilege,has_table_privilege(role_name,table_name,privilege) from(values
    ('anon'::name,'public.game_catalog_entries'::text,'SELECT'::text),
    ('authenticated'::name,'public.game_catalog_entries'::text,'SELECT'::text),
    ('authenticated'::name,'public.topic_resource_assignments'::text,'INSERT'::text),
    ('authenticated'::name,'public.consumer_game_entitlements'::text,'UPDATE'::text)
  )x(role_name,table_name,privilege)$$,
  $$values
    ('anon'::name,'public.game_catalog_entries'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.game_catalog_entries'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.topic_resource_assignments'::text,'INSERT'::text,false),
    ('authenticated'::name,'public.consumer_game_entitlements'::text,'UPDATE'::text,false)$$,
  'browser roles cannot read private catalogs or forge access and hierarchy'
);

select throws_ok(
  $$insert into public.consumer_game_entitlements(user_id,entitlement_state,capability_key) values('9b000000-0000-4000-8000-000000000099','no-entitlement','GAMES_ONLY')$$,
  '23514',null,'separate module entitlements fail closed'
);
select throws_ok(
  $$insert into public.game_catalog_entries(stable_key,slug,title,description,launch_type,external_url,external_allowed_host,thumbnail_reference,status,display_order,version)
    values('unsafe','unsafe','Unsafe','Unsafe destination','external_https','javascript:alert(1)','games.example.edu','https://example.invalid/thumb.png','published',20,'1')$$,
  'P0001','Unsafe external game destination','an external game cannot bypass the allowlist'
);
insert into public.game_external_allowed_hosts(hostname,enabled) values('games.example.edu',true);
select lives_ok(
  $$insert into public.game_catalog_entries(stable_key,slug,title,description,launch_type,external_url,external_allowed_host,thumbnail_reference,status,display_order,version)
    values('safe-external','safe-external','Safe external','Approved HTTPS game','external_https','https://games.example.edu/math','games.example.edu','https://games.example.edu/thumb.png','published',20,'1')$$,
  'exact allowlisted HTTPS game is accepted'
);
select throws_ok(
  $$update public.game_catalog_entries set external_url='https://games.example.edu/%2f%2fevil.example' where stable_key='safe-external'$$,
  'P0001','Unsafe external game destination','encoded redirect-like external targets fail closed'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
('9b100000-0000-4000-8000-000000000001','authenticated','authenticated','phase9b-a@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
('9b100000-0000-4000-8000-000000000002','authenticated','authenticated','phase9b-b@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}');
insert into public.consumer_game_entitlements(user_id,entitlement_state,current_period_ends_at)
values('9b100000-0000-4000-8000-000000000001','subscription-active',now()+interval '30 days');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"9b100000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is_empty($$select * from public.consumer_game_entitlements$$,'account B cannot read account A all-access evidence');
select throws_ok(
  $$update public.consumer_game_entitlements set capability_key='MATHNEXA_ALL_ACCESS' where user_id='9b100000-0000-4000-8000-000000000001'$$,
  '42501',null,'account B cannot mutate account A capability'
);
reset role;

insert into public.admin_users(id,user_id,role,mfa_enrolled)
values('9b110000-0000-4000-8000-000000000001','9b100000-0000-4000-8000-000000000001','owner',true);
insert into public.content_grades(id,grade_number,title,slug,sort_order,publication_state,created_by,updated_by)
values('9b120000-0000-4000-8000-000000000001',6,'Grade 6','grade-6',6,'published','9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001');
insert into public.content_topics(id,grade_id,title,slug,sort_order,publication_state,created_by,updated_by)
values('9b130000-0000-4000-8000-000000000001','9b120000-0000-4000-8000-000000000001','Expressions','expressions',2,'published','9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001');
insert into public.content_lessons(id,topic_id,title,slug,sort_order,publication_state,created_by,updated_by)
values('9b140000-0000-4000-8000-000000000001','9b130000-0000-4000-8000-000000000001','Write expressions','write-expressions',1,'published','9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001');

insert into public.content_resources(id,resource_type,created_by,updated_by)
values('9b150000-0000-4000-8000-000000000001','quiz_pdf','9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001');
insert into public.lesson_resource_assignments(lesson_id,resource_id,slug,sort_order,created_by,updated_by)
values('9b140000-0000-4000-8000-000000000001','9b150000-0000-4000-8000-000000000001','legacy-quiz',1,'9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001');
select is(
  (select resource_scope||'/'||scope_status from public.content_resources where id='9b150000-0000-4000-8000-000000000001'),
  'lesson/legacy'::text,
  'unchanged Admin Quiz creation is preserved and deterministically classified as legacy'
);
select is(
  (select count(*)::bigint from public.legacy_lesson_quiz_report where resource_id='9b150000-0000-4000-8000-000000000001'),
  1::bigint,
  'legacy lesson Quiz report preserves the real record without public duplication'
);

insert into public.content_resources(id,resource_type,resource_scope,scope_status,created_by,updated_by)
values('9b150000-0000-4000-8000-000000000002','quiz_pdf','topic','current','9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001');
select lives_ok(
  $$insert into public.topic_resource_assignments(topic_id,resource_id,slug,sort_order,created_by,updated_by)
    values('9b130000-0000-4000-8000-000000000001','9b150000-0000-4000-8000-000000000002','topic-2-quiz',2,'9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001')$$,
  'current Quiz uses Grade inherited from Topic and requires no Lesson'
);
select lives_ok(
  $$insert into public.content_resources(id,resource_type,resource_scope,scope_status,created_by,updated_by)
    values('9b150000-0000-4000-8000-000000000003','homework_pdf','topic','current','9b110000-0000-4000-8000-000000000001','9b110000-0000-4000-8000-000000000001')$$,
  'Homework scope normalization rejects topic authority by coercing the server-owned row'
);
select is(
  (select resource_scope from public.content_resources where id='9b150000-0000-4000-8000-000000000003'),
  'lesson'::text,'Homework remains lesson scoped'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
