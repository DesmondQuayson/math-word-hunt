begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public','game_packages','versioned game package metadata exists');
select has_table('public','game_package_assets','private game asset evidence exists');
select has_table('public','game_package_quarantine_events','rejected package evidence exists');
select has_table('public','game_launch_events','minimal adult launch evidence exists');
select results_eq(
  $$select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.game_packages'::regclass,'public.game_package_assets'::regclass,'public.game_package_quarantine_events'::regclass,'public.game_launch_events'::regclass) order by relname$$,
  $$values ('game_launch_events'::name,true,true),('game_package_assets'::name,true,true),('game_package_quarantine_events'::name,true,true),('game_packages'::name,true,true)$$,
  'every Phase 8E table has forced RLS'
);
select results_eq(
  $$select id,public,file_size_limit from storage.buckets where id in ('game-packages','game-package-quarantine') order by id$$,
  $$values ('game-package-quarantine'::text,false,26214400::bigint),('game-packages'::text,false,20971520::bigint)$$,
  'game assets and quarantine evidence use private bounded buckets'
);
select is(count(*)::bigint,5::bigint,'game package storage has restrictive browser-denial policies')
  from pg_policies where schemaname='storage' and policyname like 'game_package_%';
select results_eq(
  $$select role_name,table_name,privilege,has_table_privilege(role_name,table_name,privilege) from (values
    ('anon'::name,'public.game_packages'::text,'SELECT'::text),
    ('authenticated'::name,'public.game_package_assets'::text,'SELECT'::text),
    ('authenticated'::name,'public.game_launch_events'::text,'INSERT'::text),
    ('service_role'::name,'public.game_packages'::text,'SELECT'::text),
    ('service_role'::name,'public.game_packages'::text,'UPDATE'::text)
  ) checks(role_name,table_name,privilege)$$,
  $$values
    ('anon'::name,'public.game_packages'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.game_package_assets'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.game_launch_events'::text,'INSERT'::text,false),
    ('service_role'::name,'public.game_packages'::text,'SELECT'::text,true),
    ('service_role'::name,'public.game_packages'::text,'UPDATE'::text,false)$$,
  'browser roles cannot enumerate packages and service mutations remain bounded'
);
select results_eq(
  $$select signature,
      coalesce((select bool_or(acl.grantee=0 and acl.privilege_type='EXECUTE') from pg_proc procedure cross join lateral aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) acl where procedure.oid=to_regprocedure(signature)),false),
      has_function_privilege('anon',signature,'EXECUTE'),has_function_privilege('authenticated',signature,'EXECUTE'),has_function_privilege('service_role',signature,'EXECUTE')
    from (values
      ('public.archive_game_package(uuid,uuid,bigint)'::text),
      ('public.record_game_package_launch(uuid,uuid)'::text),
      ('public.record_game_package_quarantine(uuid,text,text,bigint,text,jsonb)'::text),
      ('public.register_game_package(uuid,uuid,integer,text,text,text,text,text,text,jsonb,jsonb,text,bigint,bigint,jsonb)'::text),
      ('public.rollback_game_package(uuid,uuid,bigint)'::text),
      ('public.transition_game_package(uuid,uuid,bigint,text)'::text)
    ) functions(signature) order by signature$$,
  $$select signature,false,false,false,true from (values
      ('public.archive_game_package(uuid,uuid,bigint)'::text),
      ('public.record_game_package_launch(uuid,uuid)'::text),
      ('public.record_game_package_quarantine(uuid,text,text,bigint,text,jsonb)'::text),
      ('public.register_game_package(uuid,uuid,integer,text,text,text,text,text,text,jsonb,jsonb,text,bigint,bigint,jsonb)'::text),
      ('public.rollback_game_package(uuid,uuid,bigint)'::text),
      ('public.transition_game_package(uuid,uuid,bigint,text)'::text)
    ) functions(signature) order by signature$$,
  'only service_role executes all six Phase 8E security-definer workflows'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
  ('f8400000-0000-0000-0000-000000000001','authenticated','authenticated','phase8e-owner@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
  ('f8400000-0000-0000-0000-000000000002','authenticated','authenticated','phase8e-subscriber@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
  ('f8400000-0000-0000-0000-000000000003','authenticated','authenticated','phase8e-no-access@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values('f8410000-0000-0000-0000-000000000001','f8400000-0000-0000-0000-000000000001','owner',true);
insert into public.consumer_game_entitlements(user_id,entitlement_state,current_period_ends_at,authoritative_version) values('f8400000-0000-0000-0000-000000000002','subscription-active',now()+interval '30 days',1);

set local role service_role;
select public.create_content_grade('f8410000-0000-0000-0000-000000000001',4::smallint,'Grade 4','grade-4',4::smallint);
select public.create_content_topic('f8410000-0000-0000-0000-000000000001',(select id from public.content_grades where grade_number=4),'Fractions','fractions',1::smallint);
select public.create_content_lesson('f8410000-0000-0000-0000-000000000001',(select id from public.content_topics where slug='fractions'),'Equivalent fractions','equivalent-fractions',1::smallint);
select public.create_content_resource('f8410000-0000-0000-0000-000000000001',(select id from public.content_lessons where slug='equivalent-fractions'),'game','fraction-field',1::smallint,'Fraction Field','Owner-created fraction game.',null,array['fractions'],'{"game_id":"fraction-field"}'::jsonb);

select public.transition_content_resource('f8410000-0000-0000-0000-000000000001',resource_id,1,1,'validating') from public.lesson_resource_assignments where slug='fraction-field';
select public.transition_content_resource('f8410000-0000-0000-0000-000000000001',resource_id,1,2,'ready_for_review') from public.lesson_resource_assignments where slug='fraction-field';
select throws_ok(
  $$select public.transition_content_resource('f8410000-0000-0000-0000-000000000001',resource_id,1,3,'published') from public.lesson_resource_assignments where slug='fraction-field'$$,
  'P0001','Reviewed game package required before publication','content publication cannot bypass package validation evidence'
);
select public.transition_content_resource('f8410000-0000-0000-0000-000000000001',resource_id,1,3,'draft') from public.lesson_resource_assignments where slug='fraction-field';

select lives_ok(
  $$select public.register_game_package('f8410000-0000-0000-0000-000000000001',resource_id,1,'fraction-field','1.0.0','1.0','1.0.0','game/index.html','thumbnail.png',
    '{"game_id":"fraction-field","version":"1.0.0"}'::jsonb,'{"author":"MathNexa"}'::jsonb,repeat('a',64),2048,4096,
    '[{"path":"game/index.html","object_path":"games/fraction-field/v1/game/index.html","mime_type":"text/html","byte_size":120,"sha256":"1111111111111111111111111111111111111111111111111111111111111111"},{"path":"game/main.js","object_path":"games/fraction-field/v1/game/main.js","mime_type":"text/javascript","byte_size":80,"sha256":"2222222222222222222222222222222222222222222222222222222222222222"},{"path":"thumbnail.png","object_path":"games/fraction-field/v1/thumbnail.png","mime_type":"image/png","byte_size":64,"sha256":"3333333333333333333333333333333333333333333333333333333333333333"},{"path":"metadata.json","object_path":"games/fraction-field/v1/metadata.json","mime_type":"application/json","byte_size":32,"sha256":"4444444444444444444444444444444444444444444444444444444444444444"}]'::jsonb)
    from public.lesson_resource_assignments where slug='fraction-field'$$,
  'a bounded validated draft package is registered'
);
select is((select public.transition_game_package('f8410000-0000-0000-0000-000000000001',id,4,'validating') from public.game_packages where package_version='1.0.0' and source_package_id is null),5::bigint,'draft package enters validating with optimistic lock');
select is((select public.transition_game_package('f8410000-0000-0000-0000-000000000001',id,5,'ready_for_review') from public.game_packages where package_version='1.0.0' and source_package_id is null),6::bigint,'validated package becomes reviewable');
select is((select public.transition_game_package('f8410000-0000-0000-0000-000000000001',id,6,'published') from public.game_packages where package_version='1.0.0' and source_package_id is null),7::bigint,'reviewed package publishes with content version');

select ok((select public.record_game_package_launch('f8400000-0000-0000-0000-000000000002',id) from public.game_packages where package_version='1.0.0' and source_package_id is null),'active adult subscriber receives launch authorization');
select is((select public.record_game_package_launch('f8400000-0000-0000-0000-000000000003',id) from public.game_packages where package_version='1.0.0' and source_package_id is null),false,'ordinary account without entitlement is denied launch');
select is((select count(*)::bigint from public.game_launch_events),1::bigint,'denied launch creates no forged evidence');

select is((select public.revise_content_resource('f8410000-0000-0000-0000-000000000001',resource_id,7,'Fraction Field 1.1','Updated owner-created game.',null,array['fractions'],'{"game_id":"fraction-field"}'::jsonb) from public.lesson_resource_assignments where slug='fraction-field'),2,'existing game creates an additive draft content version');
select throws_ok(
  $$select public.register_game_package('f8410000-0000-0000-0000-000000000001',resource_id,2,'fraction-field','1.0.0','1.0','1.0.0','game/index.html','thumbnail.png','{}','{}',repeat('b',64),2048,4096,'[{"path":"game/index.html","object_path":"games/fraction-field/v2/game/index.html","mime_type":"text/html","byte_size":120,"sha256":"1111111111111111111111111111111111111111111111111111111111111111"},{"path":"game/main.js","object_path":"games/fraction-field/v2/game/main.js","mime_type":"text/javascript","byte_size":80,"sha256":"2222222222222222222222222222222222222222222222222222222222222222"},{"path":"thumbnail.png","object_path":"games/fraction-field/v2/thumbnail.png","mime_type":"image/png","byte_size":64,"sha256":"3333333333333333333333333333333333333333333333333333333333333333"}]') from public.lesson_resource_assignments where slug='fraction-field'$$,
  'P0001','Package version must increase','same package version cannot replace history'
);
select lives_ok(
  $$select public.register_game_package('f8410000-0000-0000-0000-000000000001',resource_id,2,'fraction-field','1.1.0','1.0','1.0.0','game/index.html','thumbnail.png','{"game_id":"fraction-field","version":"1.1.0"}','{"author":"MathNexa"}',repeat('b',64),2050,4100,'[{"path":"game/index.html","object_path":"games/fraction-field/v2/game/index.html","mime_type":"text/html","byte_size":121,"sha256":"5111111111111111111111111111111111111111111111111111111111111111"},{"path":"game/main.js","object_path":"games/fraction-field/v2/game/main.js","mime_type":"text/javascript","byte_size":81,"sha256":"5222222222222222222222222222222222222222222222222222222222222222"},{"path":"thumbnail.png","object_path":"games/fraction-field/v2/thumbnail.png","mime_type":"image/png","byte_size":65,"sha256":"5333333333333333333333333333333333333333333333333333333333333333"},{"path":"metadata.json","object_path":"games/fraction-field/v2/metadata.json","mime_type":"application/json","byte_size":33,"sha256":"5444444444444444444444444444444444444444444444444444444444444444"}]') from public.lesson_resource_assignments where slug='fraction-field'$$,
  'higher package version updates the stable game resource'
);
select public.transition_game_package('f8410000-0000-0000-0000-000000000001',(select id from public.game_packages where package_version='1.1.0'),8,'validating');
select public.transition_game_package('f8410000-0000-0000-0000-000000000001',(select id from public.game_packages where package_version='1.1.0'),9,'ready_for_review');
select public.transition_game_package('f8410000-0000-0000-0000-000000000001',(select id from public.game_packages where package_version='1.1.0'),10,'published');
select lives_ok($$select public.rollback_game_package('f8410000-0000-0000-0000-000000000001',(select id from public.game_packages where package_version='1.0.0' and source_package_id is null),11)$$,'rollback creates a new published content/package version');
select is((select resource_version_number from public.game_packages where source_package_id is not null),3,'rollback creates a new resource version');
select is((select package_version from public.game_packages where source_package_id is not null),'1.0.0'::text,'rollback preserves the selected package version');
select is((select publication_state from public.game_packages where source_package_id is not null),'published'::text,'rollback publishes additive history');
select lives_ok($$select public.archive_game_package('f8410000-0000-0000-0000-000000000001',(select id from public.game_packages where source_package_id is not null),12)$$,'current rollback package can be archived without deleting history');

select lives_ok($$select public.record_game_package_quarantine('f8410000-0000-0000-0000-000000000001','unsafe-game.zip',repeat('c',64),1024,'quarantine/games/unsafe-game.zip','["unsafe-entry-path","dynamic-code"]')$$,'unsafe archive evidence is quarantined without execution');
select is((select count(*)::bigint from public.game_package_quarantine_events),1::bigint,'quarantine decision is retained privately');

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f8400000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select * from public.game_package_assets$$,'42501',null,'subscriber cannot enumerate package object paths');
select throws_ok($$select public.record_game_package_launch('f8400000-0000-0000-0000-000000000002',(select id from public.game_packages limit 1))$$,'42501',null,'browser cannot self-authorize a launch');
reset role;

select results_eq(
  $$select action,count(*)::bigint from public.admin_audit_log where action like 'admin.game.package.%' group by action order by action$$,
  $$values ('admin.game.package.archived'::text,1::bigint),('admin.game.package.imported'::text,2::bigint),('admin.game.package.published'::text,2::bigint),('admin.game.package.quarantined'::text,1::bigint),('admin.game.package.rolled_back'::text,1::bigint),('admin.game.package.validated'::text,4::bigint)$$,
  'import, validation, publication, quarantine, and rollback are audited'
);
select * from finish();
rollback;
