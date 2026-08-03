begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public','platform_analytics_events','aggregate-only analytics table exists');
select has_table('public','platform_feature_flags','server-owned feature flags exist');
select has_table('public','platform_feature_flag_history','feature flag history exists');
select has_table('public','platform_retention_runs','retention evidence exists');
select results_eq(
  $$select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.platform_analytics_events'::regclass,'public.platform_feature_flags'::regclass,'public.platform_feature_flag_history'::regclass,'public.platform_retention_runs'::regclass) order by relname$$,
  $$values ('platform_analytics_events'::name,true,true),('platform_feature_flag_history'::name,true,true),('platform_feature_flags'::name,true,true),('platform_retention_runs'::name,true,true)$$,
  'all Phase 8H tables force RLS'
);
select results_eq(
  $$select role_name,table_name,privilege,has_table_privilege(role_name,table_name,privilege) from(values
    ('anon'::name,'public.platform_analytics_events'::text,'SELECT'::text),
    ('authenticated'::name,'public.platform_feature_flags'::text,'SELECT'::text),
    ('service_role'::name,'public.platform_feature_flags'::text,'SELECT'::text),
    ('service_role'::name,'public.platform_feature_flags'::text,'UPDATE'::text))x(role_name,table_name,privilege)$$,
  $$values ('anon'::name,'public.platform_analytics_events'::text,'SELECT'::text,false),('authenticated'::name,'public.platform_feature_flags'::text,'SELECT'::text,false),('service_role'::name,'public.platform_feature_flags'::text,'SELECT'::text,true),('service_role'::name,'public.platform_feature_flags'::text,'UPDATE'::text,false)$$,
  'browser enumeration and raw service mutation are denied'
);
select results_eq(
  $$select signature,coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.oid=to_regprocedure(signature)),false),has_function_privilege('anon',signature,'EXECUTE'),has_function_privilege('authenticated',signature,'EXECUTE'),has_function_privilege('service_role',signature,'EXECUTE') from(values
    ('public.record_platform_aggregate_event(text,timestamp with time zone,smallint,text,text,text,integer,text)'::text),
    ('public.get_platform_migration_status()'::text),
    ('public.get_platform_storage_usage()'::text),
    ('public.run_platform_analytics_retention(uuid,uuid,text)'::text),
    ('public.set_platform_feature_flag(uuid,uuid,text,boolean,text,text,bigint)'::text))f(signature) order by signature$$,
  $$select signature,false,false,false,true from(values
    ('public.record_platform_aggregate_event(text,timestamp with time zone,smallint,text,text,text,integer,text)'::text),
    ('public.get_platform_migration_status()'::text),
    ('public.get_platform_storage_usage()'::text),
    ('public.run_platform_analytics_retention(uuid,uuid,text)'::text),
    ('public.set_platform_feature_flag(uuid,uuid,text,boolean,text,text,bigint)'::text))f(signature) order by signature$$,
  'only service_role executes Phase 8H server workflows'
);
select is((select count(*)::bigint from pg_proc where oid in(
  'public.record_platform_aggregate_event(text,timestamptz,smallint,text,text,text,integer,text)'::regprocedure,
  'public.get_platform_migration_status()'::regprocedure,
  'public.get_platform_storage_usage()'::regprocedure,
  'public.run_platform_analytics_retention(uuid,uuid,text)'::regprocedure,
  'public.set_platform_feature_flag(uuid,uuid,text,boolean,text,text,bigint)'::regprocedure
) and prosecdef and proconfig @> array['search_path=""']),5::bigint,'every Phase 8H SECURITY DEFINER function pins an empty search_path');
select is((select count(*)::bigint from public.platform_feature_flags),4::bigint,'four known fail-safe flags are seeded');
set local role service_role;
select ok((select applied_count>0 from public.get_platform_migration_status()),'service-only migration health reports applied migrations');
select lives_ok($$select * from public.get_platform_storage_usage()$$,'service-only storage health is readable without exposing object paths');
reset role;
select is((select count(*)::bigint from public.platform_analytics_events where to_jsonb(platform_analytics_events)::text ~* '(user_id|email|ip|token|student)'),0::bigint,'aggregate schema exposes no identity-shaped fields');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('88000000-0000-4000-8000-000000000001','authenticated','authenticated','phase8h-owner@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values('88100000-0000-4000-8000-000000000001','88000000-0000-4000-8000-000000000001','owner',true);
insert into public.admin_sessions(id,admin_user_id,token_hash,assurance_level,started_at,expires_at) values
 ('88200000-0000-4000-8000-000000000001','88100000-0000-4000-8000-000000000001',repeat('c',64),'aal2',now()-interval '1 minute',now()+interval '10 minutes'),
 ('88200000-0000-4000-8000-000000000002','88100000-0000-4000-8000-000000000001',repeat('d',64),'aal2',now()-interval '10 minutes',now()+interval '10 minutes');

set local role authenticated;
select throws_ok($$select public.set_platform_feature_flag('88100000-0000-4000-8000-000000000001','88200000-0000-4000-8000-000000000001','maintenance-mode',true,'Maintenance','Browser attempt',1)$$,'42501',null,'authenticated browser cannot mutate feature flags');
reset role;set local role service_role;
select throws_ok($$select public.set_platform_feature_flag('88100000-0000-4000-8000-000000000001','88200000-0000-4000-8000-000000000001','maintenance-mode',true,null,'Planned maintenance',1)$$,'P0001','Invalid bounded feature flag change','maintenance mode requires public-safe explanatory copy');
select throws_ok($$select public.set_platform_feature_flag('88100000-0000-4000-8000-000000000001','88200000-0000-4000-8000-000000000002','checkout-emergency-disabled',true,null,'Provider incident response',1)$$,'42501','Fresh owner reauthentication required','emergency checkout disable requires a fresh MFA-bound owner session');
select is((select public.set_platform_feature_flag('88100000-0000-4000-8000-000000000001','88200000-0000-4000-8000-000000000001','maintenance-mode',true,'Brief planned maintenance','Planned maintenance window',1)),2::bigint,'owner enables maintenance mode with optimistic concurrency');
select throws_ok($$select public.set_platform_feature_flag('88100000-0000-4000-8000-000000000001','88200000-0000-4000-8000-000000000001','maintenance-mode',false,null,'Stale browser replay',1)$$,'P0001','Feature flag version conflict','stale feature flag write is rejected');
select lives_ok($$select public.record_platform_aggregate_event('game-completion',now(),3::smallint,'fractions','equivalent-fractions','success',1,'runtime')$$,'service records a sanitized aggregate completion signal');
reset role;
select lives_ok($$insert into public.platform_analytics_events(metric_key,occurred_at,outcome,quantity,source) values('vercel-error',now()-interval '401 days','failure',1,'vercel')$$,'fixture inserts a retention-expired aggregate event');
set local role service_role;
select lives_ok($$select public.run_platform_analytics_retention('88100000-0000-4000-8000-000000000001','88200000-0000-4000-8000-000000000001','Scheduled aggregate retention verification')$$,'fresh owner runs bounded aggregate retention');
select is((select count(*)::bigint from public.platform_analytics_events where occurred_at<now()-interval '400 days'),0::bigint,'retention removes only expired aggregate events');
select is((select deleted_event_count from public.platform_retention_runs order by completed_at desc limit 1),1,'retention evidence records the deleted aggregate count');
reset role;
select throws_ok($$update public.platform_feature_flag_history set reason='silently replaced'$$,'P0001','Phase 8H operational evidence is append-only','feature flag history cannot be modified');
select throws_ok($$delete from public.platform_retention_runs$$,'P0001','Phase 8H operational evidence is append-only','retention evidence cannot be deleted');
set local role service_role;
select is((select public.set_platform_feature_flag('88100000-0000-4000-8000-000000000001','88200000-0000-4000-8000-000000000001','admin-emergency-disabled',true,null,'Verified emergency security exercise',1)),2::bigint,'fresh owner activates emergency admin disable');
reset role;
select is((select count(*)::bigint from public.admin_sessions where ended_at is null and revoked_at is null),0::bigint,'emergency admin disable revokes every active admin session');
select is((select count(*)::bigint from public.admin_audit_log where action like 'admin.operations.%'),3::bigint,'feature and retention workflows write immutable audit evidence');
select * from finish();
rollback;
