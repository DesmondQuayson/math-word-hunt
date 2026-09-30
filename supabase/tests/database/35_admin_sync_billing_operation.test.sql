begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- The operation CHECK and the prepare function must accept the same set.
select is(
  (select pg_get_constraintdef(oid) like '%''sync-billing''::text%' from pg_constraint
    where conrelid='public.admin_account_operations'::regclass and conname='admin_account_operations_operation_check'),
  true,
  'the operation CHECK accepts sync-billing'
);
select is(
  (select count(*)::bigint from unnest(array[
    'resend-confirmation','revoke-sessions','suspend','restore','open-portal',
    'cancel-at-period-end','submit-refund-review','deny-refund-review',
    'grant-complimentary','remove-complimentary','emergency-revoke'
  ]) as op where (select pg_get_constraintdef(oid) from pg_constraint
    where conrelid='public.admin_account_operations'::regclass and conname='admin_account_operations_operation_check') like '%''' || op || '''::text%'),
  11::bigint,
  'every previously allowed operation is still allowed'
);
select is(
  (select count(*)::bigint from pg_constraint
    where conrelid='public.admin_account_operations'::regclass and contype='c'
      and pg_get_constraintdef(oid) like '%operation = ANY%'),
  1::bigint,
  'exactly one operation CHECK exists'
);

insert into auth.users(id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('87500000-0000-4000-8000-000000000001','authenticated','authenticated','sync-owner@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}'),
 ('87500000-0000-4000-8000-000000000002','authenticated','authenticated','sync-account@example.invalid',crypt('SyntheticPass123',gen_salt('bf')),now(),'{}');
insert into public.admin_users(id,user_id,role,mfa_enrolled) values('87600000-0000-4000-8000-000000000001','87500000-0000-4000-8000-000000000001','owner',true);
insert into public.admin_sessions(id,admin_user_id,token_hash,assurance_level,started_at,expires_at) values
 ('87700000-0000-4000-8000-000000000001','87600000-0000-4000-8000-000000000001',repeat('c',64),'aal2',now()-interval '10 minutes',now()+interval '10 minutes'),
 ('87700000-0000-4000-8000-000000000002','87600000-0000-4000-8000-000000000001',repeat('d',64),'aal2',now()-interval '20 minutes',now()-interval '1 minute');

-- The browser roles still cannot reach the workflow.
set local role authenticated;
select throws_ok($$select public.prepare_admin_account_operation('87600000-0000-4000-8000-000000000001','87700000-0000-4000-8000-000000000001','87500000-0000-4000-8000-000000000002','sync-billing','sync:browser:self-authority',null)$$,'42501',null,'authenticated cannot prepare sync-billing');
reset role;

set local role service_role;
-- An expired admin session is still refused.
select throws_ok($$select public.prepare_admin_account_operation('87600000-0000-4000-8000-000000000001','87700000-0000-4000-8000-000000000002','87500000-0000-4000-8000-000000000002','sync-billing','sync:expired:account-0001',null)$$,'42501','Active owner session required','sync-billing requires a live owner session');
-- sync-billing is not a fresh-only operation: a 10-minute-old session may prepare it without a reason.
select lives_ok($$select public.prepare_admin_account_operation('87600000-0000-4000-8000-000000000001','87700000-0000-4000-8000-000000000001','87500000-0000-4000-8000-000000000002','sync-billing','sync:prepare:account-0001',null)$$,'owner prepares sync-billing without violating the operation CHECK');
select is((select public.prepare_admin_account_operation('87600000-0000-4000-8000-000000000001','87700000-0000-4000-8000-000000000001','87500000-0000-4000-8000-000000000002','sync-billing','sync:prepare:account-0001',null)),(select id from public.admin_account_operations where idempotency_key='sync:prepare:account-0001'),'the same idempotency key returns the existing sync-billing operation');
select lives_ok($$select public.finish_admin_account_operation('87600000-0000-4000-8000-000000000001','87700000-0000-4000-8000-000000000001',(select id from public.admin_account_operations where idempotency_key='sync:prepare:account-0001'),'manual_review','billing-sync-review')$$,'a prepared sync-billing operation can be finished');
select throws_ok($$select public.prepare_admin_account_operation('87600000-0000-4000-8000-000000000001','87700000-0000-4000-8000-000000000001','87500000-0000-4000-8000-000000000002','charge-card','sync:unknown:account-0001',null)$$,'P0001','Invalid bounded account operation','unknown operations are still rejected');
reset role;

select is(
  (select operation||':'||operation_state||':'||coalesce(error_code,'-') from public.admin_account_operations where idempotency_key='sync:prepare:account-0001'),
  'sync-billing:manual_review:billing-sync-review',
  'sync-billing evidence is recorded with its outcome'
);
select is(
  (select count(*)::bigint from public.admin_audit_log where target='87500000-0000-4000-8000-000000000002' and action in ('admin.account.operation.prepared','admin.account.operation.manual_review') and metadata->>'operation'='sync-billing'),
  2::bigint,
  'sync-billing prepare and finish are audited once each'
);
-- The table itself still rejects values outside the bounded set.
select throws_ok($$insert into public.admin_account_operations(idempotency_key,admin_user_id,admin_session_id,target_user_id,operation,before_snapshot) values('sync:direct:insert-000001','87600000-0000-4000-8000-000000000001','87700000-0000-4000-8000-000000000001','87500000-0000-4000-8000-000000000002','charge-card','{}'::jsonb)$$,'23514',null,'the CHECK still rejects unbounded operations');

select * from finish();
rollback;
