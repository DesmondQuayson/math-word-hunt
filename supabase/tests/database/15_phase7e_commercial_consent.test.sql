begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select has_table('public','consumer_commercial_acceptances','versioned commercial acceptance evidence exists');
select has_table('public','consumer_checkout_acceptance_bindings','Checkout acceptance binding exists');
select has_table('public','consumer_refund_requests','minimal refund-review requests exist');
select has_function('public','bind_consumer_checkout_acceptance',array['uuid','uuid','text','text'],'service-only acceptance binding exists');
select has_function('public','has_current_consumer_checkout_acceptance',array['uuid','text','text'],'current acceptance verification exists');
select has_function('public','request_own_consumer_refund_review',array[]::text[],'authenticated refund-review request exists');
select hasnt_column('public','consumer_commercial_acceptances','email','acceptance evidence does not duplicate email');
select hasnt_column('public','consumer_commercial_acceptances','student_id','acceptance evidence has no student data');
select hasnt_column('public','consumer_refund_requests','message','refund requests collect no narrative educational data');

set local role service_role;
select public.set_platform_identity_model('consumer-v1');
reset role;
insert into auth.users (id,aud,role,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('e0000000-0000-0000-0000-000000000001','authenticated','authenticated','phase7e-a@example.invalid',crypt('ConsumerPass123',gen_salt('bf')),now(),'{}'),
 ('e0000000-0000-0000-0000-000000000002','authenticated','authenticated','phase7e-b@example.invalid',crypt('ConsumerPass123',gen_salt('bf')),now(),'{}');

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select throws_ok(
  $$insert into public.consumer_commercial_acceptances (
    owner_user_id,stripe_environment,product_key,amount_minor_units,currency,billing_interval,trial_seconds,
    terms_version,privacy_version,cancellation_policy_version,refund_policy_version,
    subscription_terms_accepted,automatic_renewal_accepted,trial_accepted,monthly_price_accepted,
    cancellation_policy_accepted,refund_policy_accepted,privacy_and_terms_accepted
  ) values ('e0000000-0000-0000-0000-000000000001','live','mathnexa-monthly',599,'usd','month',86400,
    '2026-08-01','2026-08-01','2026-08-01','2026-08-01',true,true,true,true,true,true,true)$$,
  '42501',null,'browser cannot forge commercial acceptance'
);
select throws_ok(
  $$select public.bind_consumer_checkout_acceptance('e1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','live',repeat('a',64))$$,
  '42501',null,'browser cannot bind acceptance to Checkout'
);
reset role;

set local role service_role;
insert into public.consumer_commercial_acceptances (
  id,owner_user_id,stripe_environment,product_key,amount_minor_units,currency,billing_interval,trial_seconds,
  terms_version,privacy_version,cancellation_policy_version,refund_policy_version,
  subscription_terms_accepted,automatic_renewal_accepted,trial_accepted,monthly_price_accepted,
  cancellation_policy_accepted,refund_policy_accepted,privacy_and_terms_accepted
) values (
  'e1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','live',
  'mathnexa-monthly',599,'usd','month',86400,'2026-08-01','2026-08-01','2026-08-01','2026-08-01',
  true,true,true,true,true,true,true
);
select ok(
  public.bind_consumer_checkout_acceptance(
    'e1000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','live',repeat('a',64)
  ),
  'trusted server binds current owner acceptance to a hashed Live Checkout'
);
select ok(
  public.has_current_consumer_checkout_acceptance('e0000000-0000-0000-0000-000000000001','live',repeat('a',64)),
  'exact owner, environment, Checkout hash, product, price, trial and policy versions verify'
);
select isnt(
  public.has_current_consumer_checkout_acceptance('e0000000-0000-0000-0000-000000000002','live',repeat('a',64)),
  true,
  'another account cannot reuse commercial acceptance'
);
select isnt(
  public.has_current_consumer_checkout_acceptance('e0000000-0000-0000-0000-000000000001','test',repeat('a',64)),
  true,
  'Test cannot reuse Live acceptance'
);
select throws_ok(
  $$update public.consumer_commercial_acceptances set terms_version='2026-08-02' where id='e1000000-0000-0000-0000-000000000001'$$,
  '42501',null,'commercial evidence cannot be rewritten'
);
reset role;

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000002","role":"authenticated"}',true);
select is_empty($$select * from public.consumer_commercial_acceptances$$,'account B cannot read account A acceptance');
select is_empty($$select * from public.consumer_checkout_acceptance_bindings$$,'account B cannot read account A Checkout binding');
reset role;

insert into public.billing_customers (
  id,owner_consumer_id,stripe_environment,stripe_customer_id
) values ('e2000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','live','cus_Phase7ELiveA');
insert into public.billing_subscriptions (
  id,owner_consumer_id,billing_customer_id,stripe_environment,stripe_subscription_id,
  product_key,plan_key,stripe_price_id,subscription_status,current_period_start,current_period_end,
  cancel_at_period_end,first_paid_at,last_paid_at,latest_authoritative_event_created_at
) values (
  'e3000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',
  'e2000000-0000-0000-0000-000000000001','live','sub_Phase7ELiveA','math-vocabulary-hunt',
  'mathnexa-monthly','price_Phase7ELiveMonthly','active',now(),now()+interval '1 month',false,now(),now(),now()
);
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"e0000000-0000-0000-0000-000000000001","role":"authenticated"}',true);
select lives_ok($$select public.request_own_consumer_refund_review()$$,'owner can request first-charge review without narrative data');
select results_eq(
  $$select request_scope from public.consumer_refund_requests$$,
  $$values ('first-charge-review'::text)$$,
  'refund request stores only the approved review scope'
);
reset role;

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
