begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'legacy-preview'
\ir ../helpers/select-identity-model.psql

select results_eq(
  $$select id, product_key, display_name, description, is_active
      from public.products where product_key = 'math-vocabulary-hunt'$$,
  $$values (
      '8d2f7667-2da8-4d6f-99bd-57ca6671df13'::uuid,
      'math-vocabulary-hunt'::text,
      'Math Vocabulary Hunt'::text,
      'The current classroom vocabulary game and its future teacher tools.'::text,
      true
    )$$,
  'migration-from-empty installs the exact canonical Math Vocabulary Hunt product'
);

select lives_ok(
  $$select private.ensure_mathnexa_product_catalog()$$,
  'reapplying the canonical catalog definition is idempotent'
);
select lives_ok(
  $$select private.ensure_mathnexa_product_catalog()$$,
  'a second catalog retry remains idempotent'
);
select results_eq(
  $$select count(*)::bigint from public.products where product_key = 'math-vocabulary-hunt'$$,
  $$values (1::bigint)$$,
  'catalog retries never duplicate the product'
);

update public.products
set description = 'operator conflict retained for validation'
where product_key = 'math-vocabulary-hunt';
select throws_ok(
  $$select private.ensure_mathnexa_product_catalog()$$,
  'P0001',
  'phase7d_product_catalog_conflict:canonical_values',
  'an incompatible existing catalog row fails without being overwritten'
);
select results_eq(
  $$select description from public.products where product_key = 'math-vocabulary-hunt'$$,
  $$values ('operator conflict retained for validation'::text)$$,
  'conflict validation preserves the operator-managed value'
);
update public.products
set description = 'The current classroom vocabulary game and its future teacher tools.'
where product_key = 'math-vocabulary-hunt';

select results_eq(
  $$select has_function_privilege('anon', 'private.ensure_mathnexa_product_catalog()', 'execute')$$,
  $$values (false)$$,
  'anonymous clients cannot execute catalog maintenance'
);
select results_eq(
  $$select has_function_privilege('authenticated', 'private.ensure_mathnexa_product_catalog()', 'execute')$$,
  $$values (false)$$,
  'authenticated clients cannot execute catalog maintenance'
);
select results_eq(
  $$select has_function_privilege('service_role', 'private.ensure_mathnexa_product_catalog()', 'execute')$$,
  $$values (false)$$,
  'service requests cannot rewrite the canonical catalog'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  'd0000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated',
  'phase7d-catalog-teacher@example.invalid', crypt('CatalogPass123', gen_salt('bf')),
  now(), '{"display_name":"Catalog Teacher"}'
);
select lives_ok(
  $$insert into public.product_entitlements (
      teacher_user_id, product_key, scope, status, source, starts_at
    ) values (
      'd0000000-0000-0000-0000-000000000001', 'math-vocabulary-hunt',
      'product', 'active', 'manual', now()
    )$$,
  'legacy Preview entitlement foreign keys accept the canonical product'
);

set local role service_role;
select public.set_platform_identity_model('consumer-v1');
reset role;
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data
) values (
  'd0000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated',
  'phase7d-catalog-consumer@example.invalid', crypt('CatalogPass123', gen_salt('bf')),
  now(), '{}'
);
insert into public.billing_customers (
  id, owner_consumer_id, stripe_environment, stripe_customer_id
) values (
  'd1000000-0000-0000-0000-000000000001',
  'd0000000-0000-0000-0000-000000000002', 'test', 'cus_Phase7DCatalog'
);
select lives_ok(
  $$insert into public.billing_subscriptions (
      id, owner_consumer_id, billing_customer_id, stripe_environment,
      stripe_subscription_id, product_key, plan_key, stripe_price_id,
      subscription_status, current_period_start, current_period_end,
      latest_authoritative_event_created_at
    ) values (
      'd2000000-0000-0000-0000-000000000001',
      'd0000000-0000-0000-0000-000000000002',
      'd1000000-0000-0000-0000-000000000001', 'test',
      'sub_Phase7DCatalog', 'math-vocabulary-hunt', 'mathnexa-monthly',
      'price_Phase7DCatalog', 'active',
      date_trunc('second', now()), date_trunc('second', now()) + interval '30 days',
      date_trunc('second', now())
    )$$,
  'consumer billing foreign keys accept the canonical product'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
