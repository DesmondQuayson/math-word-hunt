begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public','admin_mfa_challenges','fresh first-factor Admin challenges are server owned');
select has_table('public','game_catalog_entry_versions','game catalog history is append only');
select has_column('public','game_catalog_entries','lock_version','game metadata uses optimistic concurrency');
select results_eq(
  $$select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in(
    'public.admin_mfa_challenges'::regclass,'public.game_catalog_entry_versions'::regclass) order by relname$$,
  $$values
    ('admin_mfa_challenges'::name,true,true),
    ('game_catalog_entry_versions'::name,true,true)$$,
  'Phase 10 security tables force RLS'
);
select results_eq(
  $$select role_name,table_name,privilege,has_table_privilege(role_name,table_name,privilege) from(values
    ('anon'::name,'public.admin_mfa_challenges'::text,'SELECT'::text),
    ('authenticated'::name,'public.admin_mfa_challenges'::text,'SELECT'::text),
    ('service_role'::name,'public.admin_mfa_challenges'::text,'INSERT'::text),
    ('service_role'::name,'public.admin_mfa_challenges'::text,'UPDATE'::text),
    ('authenticated'::name,'public.game_catalog_entry_versions'::text,'SELECT'::text)
  )x(role_name,table_name,privilege)$$,
  $$values
    ('anon'::name,'public.admin_mfa_challenges'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.admin_mfa_challenges'::text,'SELECT'::text,false),
    ('service_role'::name,'public.admin_mfa_challenges'::text,'INSERT'::text,false),
    ('service_role'::name,'public.admin_mfa_challenges'::text,'UPDATE'::text,false),
    ('authenticated'::name,'public.game_catalog_entry_versions'::text,'SELECT'::text,false)$$,
  'browser roles cannot inspect Admin challenges and service mutations use bounded functions'
);
select ok(has_function_privilege('service_role','public.start_admin_mfa_challenge(uuid,text,timestamptz,text,text)','EXECUTE'),'service adapter can start a bounded first-factor challenge');
select ok(has_function_privilege('service_role','public.consume_admin_mfa_challenge(text)','EXECUTE'),'service adapter can atomically consume a first-factor challenge');
select ok(not has_function_privilege('authenticated','public.consume_admin_mfa_challenge(text)','EXECUTE'),'browser identities cannot consume an Admin challenge');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
('a1000000-0000-4000-8000-000000000001','authenticated','authenticated','phase10-owner@example.invalid',crypt('AdminPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values
('a1100000-0000-4000-8000-000000000001','a1000000-0000-4000-8000-000000000001','owner',true);

set local role service_role;
select lives_ok(
  $$select public.start_admin_mfa_challenge('a1100000-0000-4000-8000-000000000001',repeat('a',64),now()+interval '5 minutes','127.0.0.1','pgTAP')$$,
  'fresh password completion can create one short-lived challenge'
);
select is(public.consume_admin_mfa_challenge(repeat('a',64)),true,'the active challenge is consumed once');
select is(public.consume_admin_mfa_challenge(repeat('a',64)),false,'the consumed challenge cannot replay');
select lives_ok(
  $$select public.start_admin_mfa_challenge('a1100000-0000-4000-8000-000000000001',repeat('b',64),now()+interval '5 minutes',null,'pgTAP')$$,
  'a later first factor starts a new challenge'
);
select lives_ok(
  $$select public.start_admin_mfa_challenge('a1100000-0000-4000-8000-000000000001',repeat('c',64),now()+interval '5 minutes',null,'pgTAP')$$,
  'a concurrent replacement revokes the previous active challenge'
);
select is((select revoked_at is not null from public.admin_mfa_challenges where token_hash=repeat('b',64)),true,'replaced challenge is server-revoked');
reset role;

select lives_ok(
  $$select public.update_game_catalog_entry('a1100000-0000-4000-8000-000000000001'::uuid,'9b000000-0000-4000-8000-000000000001'::uuid,1::bigint,
    'math-vocabulary-hunt','Math Vocabulary Hunt','Teacher-focused canonical description.','builtin:math-vocabulary-hunt',5::smallint,8::smallint,
    array['math-vocabulary']::text[],array['vocabulary']::text[],array['whole-group']::text[],'core',1::smallint,null::text,null::text)$$,
  'canonical catalog metadata can be revised without replacing its launch source'
);
select results_eq(
  $$select launch_type,canonical_route,external_url,status from public.game_catalog_entries where stable_key='math-vocabulary-hunt'$$,
  $$values ('canonical'::text,'/play'::text,null::text,'published'::text)$$,
  'canonical route and publication remain protected after metadata editing'
);
select is((select count(*)::bigint from public.game_catalog_entry_versions where catalog_entry_id='9b000000-0000-4000-8000-000000000001'),2::bigint,'canonical edit appends one catalog version');

select lives_ok(
  $$select public.create_global_game_resource('a1100000-0000-4000-8000-000000000001','Standalone game','No curriculum parent.',array['game'],'{"display_order":2}'::jsonb)$$,
  'standalone game resources require no Grade, Topic, or Lesson'
);

insert into public.content_grades(id,grade_number,title,slug,sort_order,publication_state,created_by,updated_by) values
('a1200000-0000-4000-8000-000000000001',7,'Grade 7','grade-7-phase10',7,'published','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001');
insert into public.content_topics(id,grade_id,title,slug,sort_order,publication_state,created_by,updated_by) values
('a1300000-0000-4000-8000-000000000001','a1200000-0000-4000-8000-000000000001','Ratios','ratios-phase10',1,'published','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001');
insert into public.content_lessons(id,topic_id,title,slug,sort_order,publication_state,created_by,updated_by) values
('a1400000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','Unit rates','unit-rates-phase10',1,'published','a1100000-0000-4000-8000-000000000001','a1100000-0000-4000-8000-000000000001');

select public.create_topic_content_resource('a1100000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','quiz_pdf','ratios-quiz',1::smallint,'Topic 1 Quiz: Ratios','Topic scope.',null,array['ratios'],'{"difficulty":"core","estimated_minutes":20}'::jsonb) as phase10_quiz_id \gset
select results_eq(
  $$select r.resource_scope,r.scope_status,a.topic_id from public.content_resources r join public.topic_resource_assignments a on a.resource_id=r.id where a.slug='ratios-quiz'$$,
  $$values ('topic'::text,'current'::text,'a1300000-0000-4000-8000-000000000001'::uuid)$$,
  'current Quiz is Topic scoped and has no Lesson authority'
);
select is((select count(*)::bigint from public.lesson_resource_assignments where resource_id=:'phase10_quiz_id'),0::bigint,'Topic Quiz creates no lesson assignment');
update public.content_resources set publication_state='published' where id=:'phase10_quiz_id';
select public.create_topic_content_resource('a1100000-0000-4000-8000-000000000001','a1300000-0000-4000-8000-000000000001','quiz_pdf','ratios-quiz-2',2::smallint,'Second Quiz','Must not publish.',null,array['ratios'],'{}'::jsonb) as phase10_quiz_2_id \gset
select throws_ok(
  $$update public.content_resources set publication_state='published' where id=(select resource_id from public.topic_resource_assignments where slug='ratios-quiz-2')$$,
  'P0001','Only one current published Quiz is allowed per Topic','duplicate public Quiz for one Topic fails closed'
);

select public.create_content_resource('a1100000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','quiz_pdf','legacy-ratios-quiz',3::smallint,'Legacy lesson Quiz','Preserved legacy metadata.',null,array['legacy'],'{}'::jsonb) as phase10_legacy_id \gset
select is((select resource_scope||'/'||scope_status from public.content_resources where id=:'phase10_legacy_id'),'lesson/legacy'::text,'legacy lesson Quiz remains explicit before conversion');
select lives_ok(
  $$select public.convert_legacy_quiz_to_topic_scope('a1100000-0000-4000-8000-000000000001',(select resource_id from public.lesson_resource_assignments where slug='legacy-ratios-quiz'),'a1300000-0000-4000-8000-000000000001','legacy-ratios-quiz',3::smallint)$$,
  'owner can convert a legacy Quiz to inherited Topic scope'
);
select is((select count(*)::bigint from public.lesson_resource_assignments where resource_id=:'phase10_legacy_id'),1::bigint,'legacy Lesson evidence is preserved after conversion');
select is((select resource_scope||'/'||scope_status from public.content_resources where id=:'phase10_legacy_id'),'topic/current'::text,'converted Quiz becomes current Topic scope');
select is((select count(*)::bigint from public.admin_audit_log where action='admin.quiz.convert-topic-scope' and target=:'phase10_legacy_id'),'1'::bigint,'legacy conversion is audited once');

select public.create_content_resource('a1100000-0000-4000-8000-000000000001','a1400000-0000-4000-8000-000000000001','homework_pdf','unit-rates-homework',5::smallint,'Unit rates Homework','Lesson scope.',null,array['ratios'],'{}'::jsonb) as phase10_homework_id \gset
select results_eq(
  $$select r.resource_scope,r.scope_status from public.content_resources r join public.lesson_resource_assignments a on a.resource_id=r.id where a.slug='unit-rates-homework'$$,
  $$values ('lesson'::text,'current'::text)$$,
  'Homework remains current Lesson scope'
);
select lives_ok(
  $$select public.register_resource_file(
    'a1100000-0000-4000-8000-000000000001',(select resource_id from public.lesson_resource_assignments where slug='unit-rates-homework'),1,'primary_pdf','Unit Rates.pdf','unit-rates.pdf',
    'resource-files','resources/phase10/unit-rates.pdf','application/pdf',1024,repeat('d',64),'accepted',
    '{"magic":"pdf","javascript":false}'::jsonb,null
  )$$,
  'Homework draft has accepted private PDF evidence'
);
select results_eq(
  $$select public.revise_scoped_content_resource(
    'a1100000-0000-4000-8000-000000000001',(select resource_id from public.lesson_resource_assignments where slug='unit-rates-homework'),1::bigint,1::bigint,
    'Unit rates Homework revised','Stable draft route revision.',null,array['ratios'],'{}'::jsonb,
    'unit-rates-homework',5::smallint
  )$$,
  $$values (2)$$,
  'stable Homework revision creates a new immutable version without replacing the resource'
);
select is(
  (select source.version_number from public.content_resource_versions revised
    join public.content_resource_versions source on source.id=revised.source_version_id
    where revised.resource_id=:'phase10_homework_id' and revised.version_number=2),
  1,
  'reopened Homework draft retains its accepted source-file version'
);
select public.transition_content_resource('a1100000-0000-4000-8000-000000000001',:'phase10_homework_id'::uuid,2,2,'validating');
select public.transition_content_resource('a1100000-0000-4000-8000-000000000001',:'phase10_homework_id'::uuid,2,3,'ready_for_review');
select results_eq(
  $$select public.transition_content_resource('a1100000-0000-4000-8000-000000000001',(select resource_id from public.lesson_resource_assignments where slug='unit-rates-homework'),2,4,'published')$$,
  $$values (5::bigint)$$,
  'revised Homework publishes through the accepted source PDF without weakening validation'
);
select throws_ok(
  $$update public.content_lessons set publication_state='archived',archived_at=now() where id='a1400000-0000-4000-8000-000000000001'$$,
  'P0001','Referenced Lesson cannot be archived','referenced taxonomy cannot be destructively hidden'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
