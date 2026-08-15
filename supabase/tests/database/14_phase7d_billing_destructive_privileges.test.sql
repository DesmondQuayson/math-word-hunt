begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'legacy-preview'
\ir ../helpers/select-identity-model.psql

select results_eq(
  $$select has_table_privilege('service_role', 'public.billing_webhook_events', privilege)
      from unnest(array['SELECT', 'INSERT', 'UPDATE']) as privilege$$,
  $$values (true), (true), (true)$$,
  'service role retains required webhook SELECT, INSERT, and UPDATE privileges'
);
select results_eq(
  $$select has_table_privilege('service_role', 'public.billing_subscriptions', privilege)
      from unnest(array['SELECT', 'INSERT', 'UPDATE']) as privilege$$,
  $$values (true), (true), (true)$$,
  'service role retains required subscription SELECT, INSERT, and UPDATE privileges'
);
select results_eq(
  $$select has_table_privilege('service_role', 'public.billing_webhook_events', privilege)
      from unnest(array['DELETE', 'TRUNCATE']) as privilege$$,
  $$values (false), (false)$$,
  'service role cannot delete or truncate webhook evidence'
);
select results_eq(
  $$select has_table_privilege('service_role', 'public.billing_subscriptions', privilege)
      from unnest(array['DELETE', 'TRUNCATE']) as privilege$$,
  $$values (false), (false)$$,
  'service role cannot delete or truncate subscription evidence'
);

select lives_ok(
  $$revoke delete, truncate on table public.billing_webhook_events,
      public.billing_subscriptions from service_role$$,
  'reapplying the destructive-privilege correction is safe'
);
select lives_ok(
  $$revoke delete, truncate on table public.billing_webhook_events,
      public.billing_subscriptions from service_role$$,
  'a second destructive-privilege correction remains safe'
);

select results_eq(
  $$select role_name, table_name, privilege, has_table_privilege(role_name, table_name, privilege)
      from (values
        ('anon'::name, 'public.billing_webhook_events'::text, 'SELECT'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'INSERT'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'UPDATE'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'DELETE'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'TRUNCATE'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'SELECT'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'INSERT'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'UPDATE'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'DELETE'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'TRUNCATE'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'SELECT'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'INSERT'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'UPDATE'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'DELETE'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'TRUNCATE'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'SELECT'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'INSERT'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'UPDATE'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'DELETE'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'TRUNCATE'::text)
      ) as expected(role_name, table_name, privilege)$$,
  $$select role_name, table_name, privilege, false
      from (values
        ('anon'::name, 'public.billing_webhook_events'::text, 'SELECT'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'INSERT'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'UPDATE'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'DELETE'::text),
        ('anon'::name, 'public.billing_webhook_events'::text, 'TRUNCATE'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'SELECT'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'INSERT'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'UPDATE'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'DELETE'::text),
        ('anon'::name, 'public.billing_subscriptions'::text, 'TRUNCATE'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'SELECT'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'INSERT'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'UPDATE'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'DELETE'::text),
        ('authenticated'::name, 'public.billing_webhook_events'::text, 'TRUNCATE'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'SELECT'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'INSERT'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'UPDATE'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'DELETE'::text),
        ('authenticated'::name, 'public.billing_subscriptions'::text, 'TRUNCATE'::text)
      ) as expected(role_name, table_name, privilege)$$,
  'anonymous and authenticated roles receive no billing table privileges'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  'e0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'phase7d-privileges@example.invalid', crypt('PrivilegePass123', gen_salt('bf')),
  now(), '{"display_name":"Privilege Test"}'
);

set local role service_role;
select lives_ok(
  $$insert into public.billing_webhook_events (
      id, stripe_event_id, event_type, stripe_environment, event_created_at, payload_sha256
    ) values (
      'e1000000-0000-0000-0000-000000000001', 'evt_Phase7DPrivilege',
      'invoice.paid', 'test', now(), repeat('a', 64)
    )$$,
  'service role can insert webhook evidence'
);
select lives_ok(
  $$select id from public.billing_webhook_events
      where id = 'e1000000-0000-0000-0000-000000000001'$$,
  'service role can select webhook evidence'
);
select lives_ok(
  $$update public.billing_webhook_events set replay_count = replay_count + 1
      where id = 'e1000000-0000-0000-0000-000000000001'$$,
  'service role can update webhook evidence'
);
select throws_ok(
  $$delete from public.billing_webhook_events
      where id = 'e1000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'service role DELETE on webhook evidence is denied with insufficient_privilege'
);

select lives_ok(
  $$insert into public.billing_customers (
      id, owner_teacher_id, stripe_environment, stripe_customer_id
    ) values (
      'e2000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001', 'test', 'cus_Phase7DPrivilege'
    )$$,
  'service role can create the billing customer required by a subscription'
);
select lives_ok(
  $$insert into public.billing_subscriptions (
      id, owner_teacher_id, billing_customer_id, stripe_environment,
      stripe_subscription_id, product_key, plan_key, stripe_price_id,
      subscription_status, current_period_start, current_period_end,
      latest_authoritative_event_created_at
    ) values (
      'e3000000-0000-0000-0000-000000000001',
      'e0000000-0000-0000-0000-000000000001',
      'e2000000-0000-0000-0000-000000000001', 'test',
      'sub_Phase7DPrivilege', 'math-vocabulary-hunt', 'teacher-pro-monthly',
      'price_Phase7DPrivilege', 'active', date_trunc('second', now()),
      date_trunc('second', now()) + interval '30 days', date_trunc('second', now())
    )$$,
  'service role can insert a subscription projection'
);
select lives_ok(
  $$select id from public.billing_subscriptions
      where id = 'e3000000-0000-0000-0000-000000000001'$$,
  'service role can select a subscription projection'
);
select lives_ok(
  $$update public.billing_subscriptions set cancel_at_period_end = true
      where id = 'e3000000-0000-0000-0000-000000000001'$$,
  'service role can update a subscription projection'
);
select throws_ok(
  $$delete from public.billing_subscriptions
      where id = 'e3000000-0000-0000-0000-000000000001'$$,
  '42501', null,
  'service role DELETE on subscriptions is denied with insufficient_privilege'
);
reset role;

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
