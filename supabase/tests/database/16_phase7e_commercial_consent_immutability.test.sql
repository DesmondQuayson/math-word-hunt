begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select ok(
  has_table_privilege('service_role','public.consumer_commercial_acceptances','SELECT')
  and has_table_privilege('service_role','public.consumer_commercial_acceptances','INSERT'),
  'service_role retains acceptance SELECT and INSERT'
);
select ok(
  not has_table_privilege('service_role','public.consumer_commercial_acceptances','UPDATE')
  and not has_table_privilege('service_role','public.consumer_commercial_acceptances','DELETE')
  and not has_table_privilege('service_role','public.consumer_commercial_acceptances','TRUNCATE'),
  'service_role has no destructive acceptance privileges'
);
select ok(
  has_table_privilege('service_role','public.consumer_checkout_acceptance_bindings','SELECT')
  and has_table_privilege('service_role','public.consumer_checkout_acceptance_bindings','INSERT'),
  'service_role retains Checkout-binding SELECT and INSERT'
);
select ok(
  not has_table_privilege('service_role','public.consumer_checkout_acceptance_bindings','UPDATE')
  and not has_table_privilege('service_role','public.consumer_checkout_acceptance_bindings','DELETE')
  and not has_table_privilege('service_role','public.consumer_checkout_acceptance_bindings','TRUNCATE'),
  'service_role has no destructive Checkout-binding privileges'
);

select ok(
  not has_table_privilege('anon','public.consumer_commercial_acceptances','SELECT')
  and not has_table_privilege('anon','public.consumer_commercial_acceptances','INSERT')
  and not has_table_privilege('anon','public.consumer_commercial_acceptances','UPDATE')
  and not has_table_privilege('anon','public.consumer_commercial_acceptances','DELETE')
  and not has_table_privilege('anon','public.consumer_commercial_acceptances','TRUNCATE'),
  'anon receives no acceptance privileges'
);
select ok(
  not has_table_privilege('authenticated','public.consumer_commercial_acceptances','INSERT')
  and not has_table_privilege('authenticated','public.consumer_commercial_acceptances','UPDATE')
  and not has_table_privilege('authenticated','public.consumer_commercial_acceptances','DELETE')
  and not has_table_privilege('authenticated','public.consumer_commercial_acceptances','TRUNCATE'),
  'authenticated receives no acceptance write privileges'
);
select ok(
  not has_table_privilege('anon','public.consumer_checkout_acceptance_bindings','SELECT')
  and not has_table_privilege('anon','public.consumer_checkout_acceptance_bindings','INSERT')
  and not has_table_privilege('anon','public.consumer_checkout_acceptance_bindings','UPDATE')
  and not has_table_privilege('anon','public.consumer_checkout_acceptance_bindings','DELETE')
  and not has_table_privilege('anon','public.consumer_checkout_acceptance_bindings','TRUNCATE'),
  'anon receives no Checkout-binding privileges'
);
select ok(
  not has_table_privilege('authenticated','public.consumer_checkout_acceptance_bindings','INSERT')
  and not has_table_privilege('authenticated','public.consumer_checkout_acceptance_bindings','UPDATE')
  and not has_table_privilege('authenticated','public.consumer_checkout_acceptance_bindings','DELETE')
  and not has_table_privilege('authenticated','public.consumer_checkout_acceptance_bindings','TRUNCATE'),
  'authenticated receives no Checkout-binding write privileges'
);
select is_empty(
  $$select 1 from information_schema.role_table_grants
    where grantee = 'PUBLIC'
      and table_schema = 'public'
      and table_name in ('consumer_commercial_acceptances','consumer_checkout_acceptance_bindings')$$,
  'PUBLIC receives no commercial-evidence privileges'
);

select lives_ok(
  $$revoke update, delete, truncate on table
      public.consumer_commercial_acceptances,
      public.consumer_checkout_acceptance_bindings
    from service_role$$,
  'reapplying destructive service_role revocation is safe'
);
select lives_ok(
  $$grant select, insert on table
      public.consumer_commercial_acceptances,
      public.consumer_checkout_acceptance_bindings
    to service_role$$,
  'reapplying required service_role grants is safe'
);
select lives_ok(
  $$revoke insert, update, delete, truncate on table
      public.consumer_commercial_acceptances,
      public.consumer_checkout_acceptance_bindings
    from public, anon, authenticated$$,
  'reapplying browser-role revocation is safe'
);

set local role service_role;
select public.set_platform_identity_model('consumer-v1');
reset role;
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('e4000000-0000-0000-0000-000000000001','authenticated','authenticated','phase7e-immutable@example.invalid',crypt('ConsumerPass123',gen_salt('bf')),now(),'{}');

set local role service_role;
select lives_ok(
  $$insert into public.consumer_commercial_acceptances (
      id,owner_user_id,stripe_environment,product_key,amount_minor_units,currency,billing_interval,trial_seconds,
      terms_version,privacy_version,cancellation_policy_version,refund_policy_version,
      subscription_terms_accepted,automatic_renewal_accepted,trial_accepted,monthly_price_accepted,
      cancellation_policy_accepted,refund_policy_accepted,privacy_and_terms_accepted
    ) values (
      'e4100000-0000-0000-0000-000000000001','e4000000-0000-0000-0000-000000000001','live',
      'mathnexa-monthly',599,'usd','month',86400,'2026-08-01','2026-08-01','2026-08-01','2026-08-01',
      true,true,true,true,true,true,true
    )$$,
  'service_role can append commercial acceptance evidence'
);
select lives_ok(
  $$insert into public.consumer_checkout_acceptance_bindings (
      id,acceptance_id,owner_user_id,stripe_environment,setup_checkout_hash
    ) values (
      'e4200000-0000-0000-0000-000000000001','e4100000-0000-0000-0000-000000000001',
      'e4000000-0000-0000-0000-000000000001','live',repeat('c',64)
    )$$,
  'service_role can append Checkout consent bindings'
);
select results_eq(
  $$select count(*) from public.consumer_commercial_acceptances
    where id='e4100000-0000-0000-0000-000000000001'$$,
  $$values (1::bigint)$$,
  'service_role can select appended acceptance evidence'
);
select results_eq(
  $$select count(*) from public.consumer_checkout_acceptance_bindings
    where id='e4200000-0000-0000-0000-000000000001'$$,
  $$values (1::bigint)$$,
  'service_role can select appended Checkout binding'
);
select throws_ok(
  $$update public.consumer_commercial_acceptances set terms_version='2026-08-02'
    where id='e4100000-0000-0000-0000-000000000001'$$,
  '42501',null,'service_role cannot rewrite acceptance evidence'
);
select throws_ok(
  $$delete from public.consumer_commercial_acceptances
    where id='e4100000-0000-0000-0000-000000000001'$$,
  '42501',null,'service_role cannot delete acceptance evidence'
);
select throws_ok(
  $$truncate table public.consumer_commercial_acceptances$$,
  '42501',null,'service_role cannot truncate acceptance evidence'
);
select throws_ok(
  $$update public.consumer_checkout_acceptance_bindings set setup_checkout_hash=repeat('d',64)
    where id='e4200000-0000-0000-0000-000000000001'$$,
  '42501',null,'service_role cannot reassign a Checkout binding'
);
select throws_ok(
  $$delete from public.consumer_checkout_acceptance_bindings
    where id='e4200000-0000-0000-0000-000000000001'$$,
  '42501',null,'service_role cannot delete a Checkout binding'
);
select throws_ok(
  $$truncate table public.consumer_checkout_acceptance_bindings$$,
  '42501',null,'service_role cannot truncate Checkout bindings'
);
reset role;

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
