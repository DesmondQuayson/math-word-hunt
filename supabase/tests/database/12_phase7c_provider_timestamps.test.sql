begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

set local role service_role;
select public.set_platform_identity_model('consumer-v1');
reset role;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  'c0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'phase7c-timestamp@example.invalid', crypt('ConsumerPass123', gen_salt('bf')),
  now(), '{}'
);

insert into public.billing_customers (
  id, owner_consumer_id, stripe_environment, stripe_customer_id
) values (
  'c1000000-0000-0000-0000-000000000001',
  'c0000000-0000-0000-0000-000000000001', 'test',
  'cus_Phase7CTimestamp'
);

select lives_ok(
  $$insert into public.billing_subscriptions (
    id, owner_consumer_id, billing_customer_id, stripe_environment,
    stripe_subscription_id, product_key, plan_key, stripe_price_id,
    subscription_status, current_period_start, current_period_end,
    cancel_at_period_end, canceled_at, latest_authoritative_event_created_at
  ) values (
    'c2000000-0000-0000-0000-000000000001',
    'c0000000-0000-0000-0000-000000000001',
    'c1000000-0000-0000-0000-000000000001', 'test',
    'sub_Phase7CTimestamp', 'math-vocabulary-hunt', 'mathnexa-monthly',
    'price_Phase7CTimestamp', 'active',
    date_trunc('second', now()) - interval '1 day',
    date_trunc('second', now()) + interval '29 days', true,
    date_trunc('second', now()), now()
  )$$,
  'same-second provider cancellation is accepted after its period begins'
);

select throws_ok(
  $$update public.billing_subscriptions
      set canceled_at = current_period_start - interval '1 second'
      where id = 'c2000000-0000-0000-0000-000000000001'$$,
  '23514', null,
  'a cancellation timestamp before the authoritative period is rejected'
);

select * from finish();
rollback;
