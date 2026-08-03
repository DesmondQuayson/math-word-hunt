begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public', 'content_grades', 'content grades table exists');
select has_table('public', 'content_topics', 'content topics table exists');
select has_table('public', 'content_lessons', 'content lessons table exists');
select has_table('public', 'content_resources', 'content resources table exists');
select has_table('public', 'content_resource_versions', 'immutable resource versions table exists');
select has_table('public', 'lesson_resource_assignments', 'lesson resource assignments table exists');

select results_eq(
  $$select relname, relrowsecurity, relforcerowsecurity from pg_class
    where oid in (
      'public.content_grades'::regclass,
      'public.content_topics'::regclass,
      'public.content_lessons'::regclass,
      'public.content_resources'::regclass,
      'public.content_resource_versions'::regclass,
      'public.lesson_resource_assignments'::regclass
    ) order by relname$$,
  $$values
    ('content_grades'::name,true,true),
    ('content_lessons'::name,true,true),
    ('content_resource_versions'::name,true,true),
    ('content_resources'::name,true,true),
    ('content_topics'::name,true,true),
    ('lesson_resource_assignments'::name,true,true)$$,
  'every Phase 8B table has enabled and forced RLS'
);

select results_eq(
  $$select count(*)::bigint from pg_policies
    where schemaname='public' and tablename in (
      'content_grades','content_topics','content_lessons','content_resources',
      'content_resource_versions','lesson_resource_assignments'
    )$$,
  $$values (0::bigint)$$,
  'content tables use deny-all RLS with server-only access rather than browser policies'
);

select results_eq(
  $$select role_name, table_name, privilege, has_table_privilege(role_name, table_name, privilege)
    from (values
      ('anon'::name,'public.content_grades'::text,'SELECT'::text),
      ('anon'::name,'public.content_resources'::text,'INSERT'::text),
      ('authenticated'::name,'public.content_lessons'::text,'SELECT'::text),
      ('authenticated'::name,'public.content_resource_versions'::text,'UPDATE'::text),
      ('authenticated'::name,'public.lesson_resource_assignments'::text,'DELETE'::text)
    ) checks(role_name,table_name,privilege)$$,
  $$select role_name,table_name,privilege,false from (values
      ('anon'::name,'public.content_grades'::text,'SELECT'::text),
      ('anon'::name,'public.content_resources'::text,'INSERT'::text),
      ('authenticated'::name,'public.content_lessons'::text,'SELECT'::text),
      ('authenticated'::name,'public.content_resource_versions'::text,'UPDATE'::text),
      ('authenticated'::name,'public.lesson_resource_assignments'::text,'DELETE'::text)
    ) checks(role_name,table_name,privilege)$$,
  'browser roles have no direct content privileges'
);

select results_eq(
  $$select table_name, privilege, has_table_privilege('service_role', table_name, privilege)
    from (values
      ('public.content_grades'::text,'SELECT'::text),
      ('public.content_resources'::text,'SELECT'::text),
      ('public.content_resources'::text,'INSERT'::text),
      ('public.content_resource_versions'::text,'UPDATE'::text),
      ('public.lesson_resource_assignments'::text,'DELETE'::text)
    ) checks(table_name,privilege)$$,
  $$values
    ('public.content_grades'::text,'SELECT'::text,true),
    ('public.content_resources'::text,'SELECT'::text,true),
    ('public.content_resources'::text,'INSERT'::text,false),
    ('public.content_resource_versions'::text,'UPDATE'::text,false),
    ('public.lesson_resource_assignments'::text,'DELETE'::text,false)$$,
  'service role can read but must use bounded functions for every mutation'
);

select results_eq(
  $$with functions(function_signature) as (values
      ('public.archive_content_resource(uuid,uuid,bigint)'::text),
      ('public.create_content_grade(uuid,smallint,text,text,smallint)'::text),
      ('public.create_content_lesson(uuid,uuid,text,text,smallint)'::text),
      ('public.create_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb)'::text),
      ('public.create_content_topic(uuid,uuid,text,text,smallint)'::text),
      ('public.revise_content_resource(uuid,uuid,bigint,text,text,text,text[],jsonb)'::text),
      ('public.rollback_content_resource(uuid,uuid,integer,bigint)'::text),
      ('public.transition_content_resource(uuid,uuid,integer,bigint,text)'::text),
      ('public.update_content_grade(uuid,uuid,bigint,text,text,smallint,text)'::text),
      ('public.update_content_lesson(uuid,uuid,bigint,text,text,smallint,text)'::text),
      ('public.update_content_topic(uuid,uuid,bigint,text,text,smallint,text)'::text),
      ('public.update_lesson_resource_assignment(uuid,uuid,bigint,text,smallint)'::text)
    )
    select function_signature,
      coalesce((select bool_or(acl.grantee=0 and acl.privilege_type='EXECUTE')
        from pg_proc procedure
        cross join lateral aclexplode(coalesce(procedure.proacl,acldefault('f',procedure.proowner))) acl
        where procedure.oid=to_regprocedure(function_signature)),false),
      has_function_privilege('anon',function_signature,'EXECUTE'),
      has_function_privilege('authenticated',function_signature,'EXECUTE'),
      has_function_privilege('service_role',function_signature,'EXECUTE')
    from functions order by function_signature$$,
  $$select function_signature,false,false,false,true from (values
      ('public.archive_content_resource(uuid,uuid,bigint)'::text),
      ('public.create_content_grade(uuid,smallint,text,text,smallint)'::text),
      ('public.create_content_lesson(uuid,uuid,text,text,smallint)'::text),
      ('public.create_content_resource(uuid,uuid,text,text,smallint,text,text,text,text[],jsonb)'::text),
      ('public.create_content_topic(uuid,uuid,text,text,smallint)'::text),
      ('public.revise_content_resource(uuid,uuid,bigint,text,text,text,text[],jsonb)'::text),
      ('public.rollback_content_resource(uuid,uuid,integer,bigint)'::text),
      ('public.transition_content_resource(uuid,uuid,integer,bigint,text)'::text),
      ('public.update_content_grade(uuid,uuid,bigint,text,text,smallint,text)'::text),
      ('public.update_content_lesson(uuid,uuid,bigint,text,text,smallint,text)'::text),
      ('public.update_content_topic(uuid,uuid,bigint,text,text,smallint,text)'::text),
      ('public.update_lesson_resource_assignment(uuid,uuid,bigint,text,smallint)'::text)
    ) functions(function_signature) order by function_signature$$,
  'only service_role can execute the twelve bounded content mutation functions'
);

select results_eq(
  $$select count(*)::bigint from public.content_grades$$,
  $$values (0::bigint)$$,
  'migration fabricates no curriculum rows'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
values(
  'f8200000-0000-0000-0000-000000000001','authenticated','authenticated',
  'phase8b-owner@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'
);
insert into public.admin_users(id,user_id,role,mfa_enrolled)
values('f8210000-0000-0000-0000-000000000001','f8200000-0000-0000-0000-000000000001','owner',true);

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f8200000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}',true);
select throws_ok(
  $$select public.create_content_grade('f8210000-0000-0000-0000-000000000001',4::smallint,'Grade 4','grade-4',4::smallint)$$,
  '42501',null,'an AAL2 owner cannot create content through the browser role'
);
reset role;

set local role service_role;
select lives_ok(
  $$select public.create_content_grade('f8210000-0000-0000-0000-000000000001',4::smallint,'Grade 4','grade-4',4::smallint)$$,
  'MFA-enrolled owner creates a grade through the server boundary'
);
select lives_ok(
  $$select public.create_content_topic(
    'f8210000-0000-0000-0000-000000000001',
    (select id from public.content_grades where grade_number=4),
    'Fractions','fractions',1::smallint
  )$$,
  'owner creates a topic beneath its grade'
);
select lives_ok(
  $$select public.create_content_lesson(
    'f8210000-0000-0000-0000-000000000001',
    (select id from public.content_topics where slug='fractions'),
    'Equivalent fractions','equivalent-fractions',1::smallint
  )$$,
  'owner creates a lesson beneath its topic'
);
select lives_ok(
  $$select public.create_content_resource(
    'f8210000-0000-0000-0000-000000000001',
    (select id from public.content_lessons where slug='equivalent-fractions'),
    'homework_pdf','equivalent-fractions-practice',1::smallint,
    'Equivalent fractions practice','A reviewed teacher-led worksheet.',
    'thumbnails/grade-4/equivalent-fractions.png',array[' Fractions ','grade-4','fractions'],
    '{"asset_pending":true}'::jsonb
  )$$,
  'owner creates a draft resource and stable lesson assignment'
);

select results_eq(
  $$select tags from public.content_resource_versions where version_number=1$$,
  $$values (array['fractions','grade-4']::text[])$$,
  'tags are normalized, deduplicated, and deterministically ordered'
);

select throws_ok(
  $$select public.create_content_grade('f8210000-0000-0000-0000-000000000001',4::smallint,'Duplicate','duplicate',5::smallint)$$,
  '23505',null,'grade numbers are unique and content is not fabricated twice'
);
select throws_ok(
  $$select public.create_content_resource(
    'f8210000-0000-0000-0000-000000000001',
    (select id from public.content_lessons where slug='equivalent-fractions'),
    'map_prep_link','unsafe-map-link',2::smallint,'Unsafe link','',null,array[]::text[],
    '{"external_url":"http://example.invalid"}'::jsonb
  )$$,
  'P0001','Invalid content resource manifest','MAP Prep rejects non-HTTPS destinations'
);
select throws_ok(
  $$select public.create_content_resource(
    'f8210000-0000-0000-0000-000000000001',
    (select id from public.content_lessons where slug='equivalent-fractions'),
    'homework_pdf','unsafe-tag',2::smallint,'Unsafe tag','',null,array['safe','not safe']::text[],
    '{}'::jsonb
  )$$,
  '23502',null,'malformed tags fail closed instead of being silently discarded'
);
select lives_ok(
  $$select public.create_content_resource(
    'f8210000-0000-0000-0000-000000000001',
    (select id from public.content_lessons where slug='equivalent-fractions'),
    'map_prep_link','map-prep',2::smallint,'MAP Prep','Open the separate MAP Prep application.',null,
    array['map-prep']::text[],
    '{"external_url":"https://example.invalid/map-prep"}'::jsonb
  )$$,
  'MAP Prep is stored only as a configurable external HTTPS destination'
);

select results_eq(
  $$select public.transition_content_resource(
    'f8210000-0000-0000-0000-000000000001',resource_id,1,1,'validating'
  ) from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (2::bigint)$$,
  'draft resource enters validation with optimistic locking'
);
select results_eq(
  $$select public.transition_content_resource(
    'f8210000-0000-0000-0000-000000000001',resource_id,1,2,'ready_for_review'
  ) from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (3::bigint)$$,
  'validated resource enters owner review'
);
select results_eq(
  $$select public.transition_content_resource(
    'f8210000-0000-0000-0000-000000000001',resource_id,1,3,'published'
  ) from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (4::bigint)$$,
  'reviewed resource is published through the server boundary'
);
select throws_ok(
  $$select public.transition_content_resource(
    'f8210000-0000-0000-0000-000000000001',resource_id,1,3,'archived'
  ) from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  'P0001','Content version conflict','stale optimistic lock versions fail closed'
);

reset role;
select throws_ok(
  $$update public.content_resource_versions set title='Tampered' where version_number=1 and publication_state='published'$$,
  'P0001','Published content versions are immutable','published version records cannot be modified even by a privileged connection'
);
select throws_ok(
  $$delete from public.content_resources where published_version_number is not null$$,
  'P0001','Published content resources cannot be hard deleted','published resources cannot be hard deleted'
);

set local role service_role;
select results_eq(
  $$select public.revise_content_resource(
    'f8210000-0000-0000-0000-000000000001',resource_id,4,
    'Equivalent fractions practice v2','Second reviewed edition.',
    'thumbnails/grade-4/equivalent-fractions-v2.png',array['fractions','revision-2'],
    '{"asset_pending":true,"edition":2}'::jsonb
  ) from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (2)$$,
  'revision creates a new draft without changing published history'
);
select results_eq(
  $$select public.transition_content_resource('f8210000-0000-0000-0000-000000000001',resource_id,2,5,'validating')
    from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (6::bigint)$$,
  'revision two enters validation'
);
select results_eq(
  $$select public.transition_content_resource('f8210000-0000-0000-0000-000000000001',resource_id,2,6,'ready_for_review')
    from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (7::bigint)$$,
  'revision two enters review'
);
select results_eq(
  $$select public.transition_content_resource('f8210000-0000-0000-0000-000000000001',resource_id,2,7,'published')
    from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (8::bigint)$$,
  'revision two publishes without replacing revision one'
);
select results_eq(
  $$select public.rollback_content_resource(
    'f8210000-0000-0000-0000-000000000001',resource_id,1,8
  ) from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (3)$$,
  'rollback creates a new published version instead of deleting history'
);
select results_eq(
  $$select count(*)::bigint,count(*) filter(where publication_state='published')::bigint,
      count(*) filter(where source_version_id is not null)::bigint
    from public.content_resource_versions v
    join public.lesson_resource_assignments a on a.resource_id=v.resource_id
    where a.slug='equivalent-fractions-practice'$$,
  $$values (3::bigint,3::bigint,1::bigint)$$,
  'all published versions and the rollback provenance remain immutable'
);
select results_eq(
  $$select public.archive_content_resource(
    'f8210000-0000-0000-0000-000000000001',resource_id,9
  ) from public.lesson_resource_assignments where slug='equivalent-fractions-practice'$$,
  $$values (10::bigint)$$,
  'published resources are archived without destructive deletion'
);

select results_eq(
  $$select action,count(*)::bigint from public.admin_audit_log
    where action like 'admin.content.%' group by action order by action$$,
  $$values
    ('admin.content.archive'::text,1::bigint),
    ('admin.content.create'::text,5::bigint),
    ('admin.content.publish'::text,2::bigint),
    ('admin.content.rollback'::text,1::bigint),
    ('admin.content.update'::text,5::bigint)$$,
  'create, update, publish, rollback, and archive operations are audited'
);
select results_eq(
  $$select count(*)::bigint from public.content_resource_versions
    where content_manifest::text ilike '%showme%' or title ilike '%showme%'$$,
  $$values (0::bigint)$$,
  'ShowMe Math content is not imported or duplicated'
);

reset role;
update public.admin_users set mfa_enrolled=false where id='f8210000-0000-0000-0000-000000000001';
set local role service_role;
select throws_ok(
  $$select public.create_content_grade('f8210000-0000-0000-0000-000000000001',5::smallint,'Grade 5','grade-5',5::smallint)$$,
  'P0001','Active MFA-enrolled owner required','content mutations require an active MFA-enrolled owner'
);
reset role;

select * from finish();
rollback;
