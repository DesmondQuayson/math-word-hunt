begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public','cms_documents','structured CMS documents exist');
select has_table('public','cms_document_versions','CMS version history exists');
select has_table('public','cms_media_assets','media identities exist');
select has_table('public','cms_media_versions','private media versions exist');
select has_table('public','cms_media_usage','published media usage references exist');
select results_eq(
  $$select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.cms_documents'::regclass,'public.cms_document_versions'::regclass,'public.cms_media_assets'::regclass,'public.cms_media_versions'::regclass,'public.cms_media_usage'::regclass) order by relname$$,
  $$values ('cms_document_versions'::name,true,true),('cms_documents'::name,true,true),('cms_media_assets'::name,true,true),('cms_media_usage'::name,true,true),('cms_media_versions'::name,true,true)$$,
  'all Phase 8F tables have forced RLS'
);
select results_eq(
  $$select id,public,file_size_limit from storage.buckets where id in ('cms-media','cms-media-quarantine') order by id$$,
  $$values ('cms-media'::text,false,20971520::bigint),('cms-media-quarantine'::text,false,20971520::bigint)$$,
  'CMS originals, derivatives, and quarantine are private and bounded'
);
select is(count(*)::bigint,5::bigint,'five restrictive storage policies deny browser CMS-media access') from pg_policies where schemaname='storage' and policyname like 'cms_media_%';
select results_eq(
  $$select role_name,table_name,privilege,has_table_privilege(role_name,table_name,privilege) from (values
    ('anon'::name,'public.cms_documents'::text,'SELECT'::text),('authenticated'::name,'public.cms_media_versions'::text,'SELECT'::text),
    ('authenticated'::name,'public.cms_documents'::text,'UPDATE'::text),('service_role'::name,'public.cms_documents'::text,'SELECT'::text),
    ('service_role'::name,'public.cms_documents'::text,'UPDATE'::text)) x(role_name,table_name,privilege)$$,
  $$values ('anon'::name,'public.cms_documents'::text,'SELECT'::text,false),('authenticated'::name,'public.cms_media_versions'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.cms_documents'::text,'UPDATE'::text,false),('service_role'::name,'public.cms_documents'::text,'SELECT'::text,true),
    ('service_role'::name,'public.cms_documents'::text,'UPDATE'::text,false)$$,
  'browser enumeration and unbounded service mutations are denied'
);
select results_eq(
  $$select signature,
      coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=to_regprocedure(signature)),false),
      has_function_privilege('anon',signature,'EXECUTE'),has_function_privilege('authenticated',signature,'EXECUTE'),has_function_privilege('service_role',signature,'EXECUTE')
    from (values
      ('public.archive_cms_media(uuid,uuid,bigint)'::text),('public.create_cms_document(uuid,text,text,jsonb,jsonb)'::text),
      ('public.register_cms_media(uuid,text,text,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb)'::text),
      ('public.revise_cms_document(uuid,uuid,bigint,jsonb,jsonb)'::text),('public.rollback_cms_document(uuid,uuid,integer,bigint)'::text),
      ('public.revise_cms_media(uuid,uuid,bigint,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb)'::text),
      ('public.transition_cms_document(uuid,uuid,integer,bigint,text)'::text),('public.transition_cms_media(uuid,uuid,bigint,text)'::text)) f(signature) order by signature$$,
  $$select signature,false,false,false,true from (values
      ('public.archive_cms_media(uuid,uuid,bigint)'::text),('public.create_cms_document(uuid,text,text,jsonb,jsonb)'::text),
      ('public.register_cms_media(uuid,text,text,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb)'::text),
      ('public.revise_cms_document(uuid,uuid,bigint,jsonb,jsonb)'::text),('public.rollback_cms_document(uuid,uuid,integer,bigint)'::text),
      ('public.revise_cms_media(uuid,uuid,bigint,text,text,text,text,text,text,bigint,text,integer,integer,text,text,text,text,text,jsonb)'::text),
      ('public.transition_cms_document(uuid,uuid,integer,bigint,text)'::text),('public.transition_cms_media(uuid,uuid,bigint,text)'::text)) f(signature) order by signature$$,
  'only service_role executes all eight Phase 8F owner workflows'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
  ('f8500000-0000-0000-0000-000000000001','authenticated','authenticated','phase8f-owner@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
  ('f8500000-0000-0000-0000-000000000002','authenticated','authenticated','phase8f-user@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values('f8510000-0000-0000-0000-000000000001','f8500000-0000-0000-0000-000000000001','owner',true);

set local role service_role;
select throws_ok(
  $$select public.create_cms_document('f8510000-0000-0000-0000-000000000001','homepage','page','{"title":"Unsafe","description":"","blocks":[{"type":"section","body":"<script>alert(1)</script>"}]}','{}')$$,
  'P0001','Invalid structured CMS document','raw executable HTML is rejected by database authority'
);
select throws_ok(
  $$select public.create_cms_document('f8510000-0000-0000-0000-000000000001','map-prep','configuration','{"title":"MAP Prep","description":"","blocks":[{"type":"external-link","href":"http://unsafe.example"}]}','{}')$$,
  'P0001','Invalid structured CMS document','MAP Prep destination must be HTTPS'
);

select lives_ok($$select public.register_cms_media('f8510000-0000-0000-0000-000000000001','learning-hero','image','hero.png','cms-media','originals/f8520000-0000-0000-0000-000000000001/v1/hero.png','derivatives/f8520000-0000-0000-0000-000000000001/v1/hero.webp','image/png','image/webp',1024,repeat('a',64),1200,600,'Teacher leading math practice','Homepage hero','MathNexa','owned','accepted','{"optimized":true}')$$,'accepted image with dimensions, alt text, and derivative is registered');
select is((select public.transition_cms_media('f8510000-0000-0000-0000-000000000001',id,1,'ready_for_review') from public.cms_media_assets where media_key='learning-hero'),2::bigint,'media enters review');
select is((select public.transition_cms_media('f8510000-0000-0000-0000-000000000001',id,2,'published') from public.cms_media_assets where media_key='learning-hero'),3::bigint,'reviewed media publishes');
select throws_ok($$select public.register_cms_media('f8510000-0000-0000-0000-000000000001','duplicate-hero','image','duplicate.png','cms-media','originals/f8520000-0000-0000-0000-000000000002/v1/x.png','derivatives/f8520000-0000-0000-0000-000000000002/v1/x.webp','image/png','image/webp',1024,repeat('a',64),1200,600,'Duplicate','','','owned','accepted','{}')$$,'P0001','Duplicate media detected','accepted media checksum duplicate fails closed');

select lives_ok($$select public.create_cms_document('f8510000-0000-0000-0000-000000000001','homepage','page',jsonb_build_object('title','MathNexa','description','Teacher-led practice','blocks',jsonb_build_array(jsonb_build_object('type','hero','heading','Practice with purpose','mediaId',(select id::text from public.cms_media_assets where media_key='learning-hero')))),jsonb_build_object('title','MathNexa','description','Teacher-led math practice'))$$,'valid structured homepage draft is created');
select is((select public.transition_cms_document('f8510000-0000-0000-0000-000000000001',id,1,1,'ready_for_review') from public.cms_documents where document_key='homepage'),2::bigint,'CMS draft enters review');
select is((select public.transition_cms_document('f8510000-0000-0000-0000-000000000001',id,1,2,'published') from public.cms_documents where document_key='homepage'),3::bigint,'reviewed CMS document publishes');
select is((select count(*)::bigint from public.cms_media_usage),1::bigint,'publication records a media usage reference');
select throws_ok($$select public.archive_cms_media('f8510000-0000-0000-0000-000000000001',(select id from public.cms_media_assets where media_key='learning-hero'),3)$$,'P0001','Media is in use','referenced media cannot be archived');

select lives_ok($$select public.create_cms_document('f8510000-0000-0000-0000-000000000001','privacy','legal','{"title":"Privacy","description":"Current policy","blocks":[{"type":"legal-section","heading":"Data","body":"MathNexa does not create student profiles."}]}','{"title":"Privacy","description":"MathNexa privacy policy"}')$$,'legal copy starts as a versioned draft');
select public.transition_cms_document('f8510000-0000-0000-0000-000000000001',(select id from public.cms_documents where document_key='privacy'),1,1,'ready_for_review');
select public.transition_cms_document('f8510000-0000-0000-0000-000000000001',(select id from public.cms_documents where document_key='privacy'),1,2,'published');
reset role;
select throws_ok($$update public.cms_document_versions set content='{"blocks":[]}' where document_key='privacy' and version_number=1$$,'P0001','Published CMS history is immutable','published legal history cannot be silently replaced');
set local role service_role;
select is((select public.revise_cms_document('f8510000-0000-0000-0000-000000000001',id,3,'{"title":"Privacy","description":"Revised draft","blocks":[{"type":"legal-section","heading":"Data","body":"Updated prospective copy."}]}','{"title":"Privacy","description":"Draft revision"}') from public.cms_documents where document_key='privacy'),2,'legal edit creates a new draft version');
select is((select count(*)::bigint from public.cms_document_versions where document_key='privacy'),2::bigint,'published legal version remains alongside new draft');

reset role; set local role authenticated;
select set_config('request.jwt.claims','{"sub":"f8500000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select throws_ok($$select * from public.cms_documents$$,'42501',null,'ordinary browser account cannot enumerate CMS drafts');
select throws_ok($$select public.transition_cms_document('f8510000-0000-0000-0000-000000000001',(select gen_random_uuid()),1,1,'published')$$,'42501',null,'browser cannot self-publish content');
reset role;

select results_eq(
  $$select action,count(*)::bigint from public.admin_audit_log where action like 'admin.cms.%' or action like 'admin.media.%' group by action order by action$$,
  $$values ('admin.cms.created'::text,2::bigint),('admin.cms.published'::text,2::bigint),('admin.cms.revised'::text,1::bigint),('admin.cms.submitted'::text,2::bigint),('admin.media.published'::text,1::bigint),('admin.media.submitted'::text,1::bigint),('admin.media.uploaded'::text,1::bigint)$$,
  'CMS, legal, and media lifecycle actions are audited'
);
select * from finish();
rollback;
