begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public','resource_files','private resource file metadata exists');
select has_table('public','resource_download_events','download audit evidence exists');
select results_eq(
  $$select relname,relrowsecurity,relforcerowsecurity from pg_class
    where oid in ('public.resource_files'::regclass,'public.resource_download_events'::regclass) order by relname$$,
  $$values ('resource_download_events'::name,true,true),('resource_files'::name,true,true)$$,
  'resource metadata and download evidence have forced RLS'
);
select results_eq(
  $$select id,public,file_size_limit from storage.buckets where id in ('resource-files','resource-quarantine') order by id$$,
  $$values ('resource-files'::text,false,20971520::bigint),('resource-quarantine'::text,false,20971520::bigint)$$,
  'accepted and quarantined resources use private bounded buckets'
);
select results_eq(
  $$select count(*)::bigint from pg_policies where schemaname='storage' and policyname like 'resource_%'$$,
  $$values (5::bigint)$$,
  'resource storage has restrictive browser-denial policies'
);
select results_eq(
  $$select role_name,table_name,privilege,has_table_privilege(role_name,table_name,privilege) from (values
    ('anon'::name,'public.resource_files'::text,'SELECT'::text),
    ('authenticated'::name,'public.resource_files'::text,'SELECT'::text),
    ('authenticated'::name,'public.resource_download_events'::text,'INSERT'::text),
    ('service_role'::name,'public.resource_files'::text,'SELECT'::text),
    ('service_role'::name,'public.resource_files'::text,'INSERT'::text)
  ) checks(role_name,table_name,privilege)$$,
  $$values
    ('anon'::name,'public.resource_files'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.resource_files'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.resource_download_events'::text,'INSERT'::text,false),
    ('service_role'::name,'public.resource_files'::text,'SELECT'::text,true),
    ('service_role'::name,'public.resource_files'::text,'INSERT'::text,false)$$,
  'browser roles see no files and service writes use bounded functions'
);
select results_eq(
  $$select signature,
      has_function_privilege('anon',signature,'EXECUTE'),
      has_function_privilege('authenticated',signature,'EXECUTE'),
      has_function_privilege('service_role',signature,'EXECUTE')
    from (values
      ('public.record_resource_download(uuid,uuid)'::text),
      ('public.register_resource_file(uuid,uuid,integer,text,text,text,text,text,text,bigint,text,text,jsonb,uuid)'::text)
    ) functions(signature) order by signature$$,
  $$values
    ('public.record_resource_download(uuid,uuid)'::text,false,false,true),
    ('public.register_resource_file(uuid,uuid,integer,text,text,text,text,text,text,bigint,text,text,jsonb,uuid)'::text,false,false,true)$$,
  'only service_role can register files or record authorized downloads'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
  ('f8300000-0000-0000-0000-000000000001','authenticated','authenticated','phase8d-owner@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
  ('f8300000-0000-0000-0000-000000000002','authenticated','authenticated','phase8d-subscriber@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
  ('f8300000-0000-0000-0000-000000000003','authenticated','authenticated','phase8d-no-access@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled)
values('f8310000-0000-0000-0000-000000000001','f8300000-0000-0000-0000-000000000001','owner',true);
insert into public.consumer_game_entitlements(user_id,entitlement_state,current_period_ends_at,authoritative_version)
values('f8300000-0000-0000-0000-000000000002','subscription-active',now()+interval '30 days',1);

set local role service_role;
select public.create_content_grade('f8310000-0000-0000-0000-000000000001',5::smallint,'Grade 5','grade-5',5::smallint);
select public.create_content_topic('f8310000-0000-0000-0000-000000000001',(select id from public.content_grades where grade_number=5),'Decimals','decimals',1::smallint);
select public.create_content_lesson('f8310000-0000-0000-0000-000000000001',(select id from public.content_topics where slug='decimals'),'Decimal operations','decimal-operations',1::smallint);
select public.create_content_resource(
  'f8310000-0000-0000-0000-000000000001',(select id from public.content_lessons where slug='decimal-operations'),
  'homework_pdf','decimal-practice',1::smallint,'Decimal practice','Interactive homework PDF.',null,array['decimals'],
  '{"difficulty":"core","estimated_minutes":20}'::jsonb
);

select public.transition_content_resource('f8310000-0000-0000-0000-000000000001',resource_id,1,1,'validating')
from public.lesson_resource_assignments where slug='decimal-practice';
select public.transition_content_resource('f8310000-0000-0000-0000-000000000001',resource_id,1,2,'ready_for_review')
from public.lesson_resource_assignments where slug='decimal-practice';
select throws_ok(
  $$select public.transition_content_resource(
    'f8310000-0000-0000-0000-000000000001',resource_id,1,3,'published'
  ) from public.lesson_resource_assignments where slug='decimal-practice'$$,
  'P0001','Accepted PDF required before publication','PDF resources cannot publish without accepted validation evidence'
);

select lives_ok(
  $$select public.register_resource_file(
    'f8310000-0000-0000-0000-000000000001',resource_id,1,'primary_pdf','Decimal Practice.pdf','decimal-practice.pdf',
    'resource-files','resources/phase8d/decimal-practice.pdf','application/pdf',1024,
    repeat('a',64),'accepted','{"magic":"pdf","javascript":false,"acroform":true}'::jsonb,null
  ) from public.lesson_resource_assignments where slug='decimal-practice'$$,
  'accepted PDF validation evidence is registered through the server boundary'
);
select results_eq(
  $$select public.transition_content_resource(
    'f8310000-0000-0000-0000-000000000001',resource_id,1,3,'published'
  ) from public.lesson_resource_assignments where slug='decimal-practice'$$,
  $$values (4::bigint)$$,
  'reviewed PDF publishes only after accepted file evidence exists'
);

select results_eq(
  $$select public.record_resource_download(
    'f8300000-0000-0000-0000-000000000002',id
  ) from public.resource_files where normalized_filename='decimal-practice.pdf'$$,
  $$values (true)$$,
  'active adult subscriber receives an audited download authorization'
);
select results_eq(
  $$select public.record_resource_download(
    'f8300000-0000-0000-0000-000000000003',id
  ) from public.resource_files where normalized_filename='decimal-practice.pdf'$$,
  $$values (false)$$,
  'ordinary account without entitlement is denied download authorization'
);
select results_eq(
  $$select count(*)::bigint from public.resource_download_events$$,
  $$values (1::bigint)$$,
  'denied cross-account attempt creates no forged download evidence'
);

select lives_ok(
  $$select public.register_resource_file(
    'f8310000-0000-0000-0000-000000000001',resource_id,1,'preview_image','Unsafe.pdf','unsafe.pdf',
    'resource-quarantine','quarantine/phase8d/unsafe.pdf','application/octet-stream',512,
    repeat('b',64),'quarantined','{"findings":["pdf-javascript"]}'::jsonb,null
  ) from public.lesson_resource_assignments where slug='decimal-practice'$$,
  'rejected content is retained only in private quarantine with findings'
);
select results_eq(
  $$select validation_state,bucket_id from public.resource_files where sha256=repeat('b',64)$$,
  $$values ('quarantined'::text,'resource-quarantine'::text)$$,
  'quarantined files cannot be mistaken for accepted download objects'
);

reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f8300000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select * from public.resource_files$$,'42501',null,'subscriber cannot enumerate private object paths');
select throws_ok(
  $$select public.record_resource_download(
    'f8300000-0000-0000-0000-000000000002',(select id from public.resource_files limit 1)
  )$$,
  '42501',null,'browser cannot self-authorize or forge download evidence'
);
reset role;

select results_eq(
  $$select action,count(*)::bigint from public.admin_audit_log where action in (
    'admin.resource.uploaded','admin.resource.quarantined','content.resource.downloaded'
  ) group by action order by action$$,
  $$values
    ('admin.resource.quarantined'::text,1::bigint),
    ('admin.resource.uploaded'::text,1::bigint),
    ('content.resource.downloaded'::text,1::bigint)$$,
  'uploads, quarantine decisions, and successful downloads are audited'
);

select * from finish();
rollback;
