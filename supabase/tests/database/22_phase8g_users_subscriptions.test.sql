begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public','admin_account_operations','bounded account operation evidence exists');
select has_table('public','admin_user_support_notes','immutable support notes exist');
select has_table('public','consumer_complimentary_entitlements','time-limited complimentary grants exist');
select results_eq(
  $$select relname,relrowsecurity,relforcerowsecurity from pg_class where oid in ('public.admin_account_operations'::regclass,'public.admin_user_support_notes'::regclass,'public.consumer_complimentary_entitlements'::regclass) order by relname$$,
  $$values ('admin_account_operations'::name,true,true),('admin_user_support_notes'::name,true,true),('consumer_complimentary_entitlements'::name,true,true)$$,
  'all Phase 8G tables force RLS'
);
select results_eq(
  $$select role_name,table_name,privilege,has_table_privilege(role_name,table_name,privilege) from(values
    ('anon'::name,'public.admin_account_operations'::text,'SELECT'::text),
    ('authenticated'::name,'public.admin_user_support_notes'::text,'SELECT'::text),
    ('authenticated'::name,'public.consumer_complimentary_entitlements'::text,'UPDATE'::text),
    ('service_role'::name,'public.admin_account_operations'::text,'SELECT'::text),
    ('service_role'::name,'public.admin_account_operations'::text,'UPDATE'::text))x(role_name,table_name,privilege)$$,
  $$values ('anon'::name,'public.admin_account_operations'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.admin_user_support_notes'::text,'SELECT'::text,false),
    ('authenticated'::name,'public.consumer_complimentary_entitlements'::text,'UPDATE'::text,false),
    ('service_role'::name,'public.admin_account_operations'::text,'SELECT'::text,true),
    ('service_role'::name,'public.admin_account_operations'::text,'UPDATE'::text,false)$$,
  'browser enumeration and raw service mutation are denied'
);
select results_eq(
  $$select signature,coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.oid=to_regprocedure(signature)),false),has_function_privilege('anon',signature,'EXECUTE'),has_function_privilege('authenticated',signature,'EXECUTE'),has_function_privilege('service_role',signature,'EXECUTE') from(values
    ('public.add_admin_user_support_note(uuid,uuid,uuid,text)'::text),
    ('public.deny_admin_refund_review(uuid,uuid,uuid,uuid,uuid)'::text),
    ('public.finish_admin_account_operation(uuid,uuid,uuid,text,text)'::text),
    ('public.grant_admin_complimentary_entitlement(uuid,uuid,uuid,uuid,timestamp with time zone)'::text),
    ('public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)'::text),
    ('public.revoke_admin_consumer_sessions(uuid,uuid,uuid,uuid)'::text),
    ('public.revoke_admin_complimentary_entitlement(uuid,uuid,uuid,uuid)'::text),
    ('public.set_admin_consumer_account_status(uuid,uuid,uuid,uuid,text)'::text),
    ('public.submit_admin_refund_review(uuid,uuid,uuid,uuid)'::text))f(signature) order by signature$$,
  $$select signature,false,false,false,true from(values
    ('public.add_admin_user_support_note(uuid,uuid,uuid,text)'::text),
    ('public.deny_admin_refund_review(uuid,uuid,uuid,uuid,uuid)'::text),
    ('public.finish_admin_account_operation(uuid,uuid,uuid,text,text)'::text),
    ('public.grant_admin_complimentary_entitlement(uuid,uuid,uuid,uuid,timestamp with time zone)'::text),
    ('public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)'::text),
    ('public.revoke_admin_consumer_sessions(uuid,uuid,uuid,uuid)'::text),
    ('public.revoke_admin_complimentary_entitlement(uuid,uuid,uuid,uuid)'::text),
    ('public.set_admin_consumer_account_status(uuid,uuid,uuid,uuid,text)'::text),
    ('public.submit_admin_refund_review(uuid,uuid,uuid,uuid)'::text))f(signature) order by signature$$,
  'only service_role executes all nine admin account workflows'
);
select is(coalesce((select bool_or(a.grantee=0 and a.privilege_type='EXECUTE') from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner)))a where p.oid='public.get_own_active_complimentary_entitlement()'::regprocedure),false),false,'PUBLIC cannot execute the own complimentary resolver');
select is(has_function_privilege('anon','public.get_own_active_complimentary_entitlement()','EXECUTE'),false,'anon cannot execute the own complimentary resolver');
select is(has_function_privilege('authenticated','public.get_own_active_complimentary_entitlement()','EXECUTE'),true,'authenticated may resolve only its own complimentary grant');
select is((select count(*)::bigint from pg_proc where oid in(
  'public.prepare_admin_account_operation(uuid,uuid,uuid,text,text,text)'::regprocedure,
  'public.finish_admin_account_operation(uuid,uuid,uuid,text,text)'::regprocedure,
  'public.set_admin_consumer_account_status(uuid,uuid,uuid,uuid,text)'::regprocedure,
  'public.grant_admin_complimentary_entitlement(uuid,uuid,uuid,uuid,timestamptz)'::regprocedure,
  'public.revoke_admin_consumer_sessions(uuid,uuid,uuid,uuid)'::regprocedure,
  'public.revoke_admin_complimentary_entitlement(uuid,uuid,uuid,uuid)'::regprocedure,
  'public.add_admin_user_support_note(uuid,uuid,uuid,text)'::regprocedure,
  'public.submit_admin_refund_review(uuid,uuid,uuid,uuid)'::regprocedure,
  'public.deny_admin_refund_review(uuid,uuid,uuid,uuid,uuid)'::regprocedure,
  'public.get_own_active_complimentary_entitlement()'::regprocedure
) and prosecdef and proconfig @> array['search_path=""']),10::bigint,'every Phase 8G SECURITY DEFINER function pins an empty search_path');

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('87000000-0000-4000-8000-000000000001','authenticated','authenticated','phase8g-owner@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
 ('87000000-0000-4000-8000-000000000002','authenticated','authenticated','phase8g-account@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
 ('87000000-0000-4000-8000-000000000003','authenticated','authenticated','phase8g-ordinary@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values('87100000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000001','owner',true);
insert into public.admin_sessions(id,admin_user_id,token_hash,assurance_level,started_at,expires_at) values
 ('87200000-0000-4000-8000-000000000001','87100000-0000-4000-8000-000000000001',repeat('a',64),'aal2',now()-interval '1 minute',now()+interval '10 minutes'),
 ('87200000-0000-4000-8000-000000000002','87100000-0000-4000-8000-000000000001',repeat('b',64),'aal2',now()-interval '10 minutes',now()+interval '10 minutes');

set local role service_role;
select throws_ok($$select public.prepare_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','suspend','phase8g:suspend:missing-reason',null)$$,'P0001','A bounded operation reason is required','sensitive operation requires a reason');
select throws_ok($$select public.prepare_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000002','87000000-0000-4000-8000-000000000002','suspend','phase8g:suspend:stale-owner','Owner verified suspension')$$,'42501','Fresh owner reauthentication required','high-risk operation rejects stale MFA-bound admin session');

select lives_ok($$select public.prepare_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','suspend','phase8g:suspend:account-0001','Owner verified suspension')$$,'fresh owner prepares a bounded suspension');
select is((select public.prepare_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','suspend','phase8g:suspend:account-0001','Owner verified suspension')),(select id from public.admin_account_operations where idempotency_key='phase8g:suspend:account-0001'),'same idempotency key returns the existing owned operation');
select is((select public.revoke_admin_consumer_sessions('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='phase8g:suspend:account-0001'),'87000000-0000-4000-8000-000000000002')),0,'prepared suspension safely revokes all target Auth sessions');
select is((select public.set_admin_consumer_account_status('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='phase8g:suspend:account-0001'),'87000000-0000-4000-8000-000000000002','suspended')),'suspended','prepared suspension changes only application account status');
select public.finish_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='phase8g:suspend:account-0001'),'succeeded',null);
select is((select account_status from public.consumer_accounts where user_id='87000000-0000-4000-8000-000000000002'),'suspended','suspension is server authoritative');
select is((select operation_state||':'||(before_snapshot->>'account_status')||':'||(after_snapshot->>'account_status') from public.admin_account_operations where idempotency_key='phase8g:suspend:account-0001'),'succeeded:active:suspended','operation evidence records safe before and after state');

select public.prepare_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','restore','phase8g:restore:account-0001','Owner verified restoration');
select public.set_admin_consumer_account_status('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='phase8g:restore:account-0001'),'87000000-0000-4000-8000-000000000002','active');
select public.finish_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='phase8g:restore:account-0001'),'succeeded',null);

select public.prepare_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','grant-complimentary','phase8g:grant:account-000001','Approved seven-day support grant');
select throws_ok($$select public.grant_admin_complimentary_entitlement('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='phase8g:grant:account-000001'),'87000000-0000-4000-8000-000000000002',now()+interval '91 days')$$,'P0001','Prepared bounded complimentary grant required','complimentary grant cannot exceed ninety days');
select lives_ok($$select public.grant_admin_complimentary_entitlement('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='phase8g:grant:account-000001'),'87000000-0000-4000-8000-000000000002',now()+interval '7 days')$$,'bounded complimentary entitlement is granted');

reset role;set local role authenticated;
select set_config('request.jwt.claims','{"sub":"87000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
select is((select count(*)::bigint from public.get_own_active_complimentary_entitlement()),1::bigint,'owner account resolves only its active complimentary expiry');
select throws_ok($$select public.prepare_admin_account_operation('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','restore','phase8g:browser:self-authority','Browser attempt')$$,'42501',null,'browser cannot execute owner workflow');
select set_config('request.jwt.claims','{"sub":"87000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
select is((select count(*)::bigint from public.get_own_active_complimentary_entitlement()),0::bigint,'cross-account complimentary access is not visible');

reset role;set local role service_role;
select lives_ok($$select public.add_admin_user_support_note('87100000-0000-4000-8000-000000000001','87200000-0000-4000-8000-000000000001','87000000-0000-4000-8000-000000000002','Account owner requested help with confirmation.')$$,'bounded support note is added');
reset role;
select throws_ok($$update public.admin_user_support_notes set note='silently replaced'$$,'P0001','Phase 8G evidence is append-only','support note evidence cannot be modified');

select is((select count(*)::bigint from public.admin_users where user_id='87000000-0000-4000-8000-000000000002'),0::bigint,'consumer operations never self-promote a user to admin');
select is((select count(*)::bigint from public.admin_audit_log where action like 'admin.account.%'),6::bigint,'prepared, completed, and support-note events are immutable audit evidence');
select * from finish();
rollback;
