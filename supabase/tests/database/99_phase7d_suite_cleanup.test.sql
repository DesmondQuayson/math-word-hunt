begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

select results_eq(
  $$select identity_model from private.platform_identity_policy where singleton$$,
  $$values ('consumer-v1'::text)$$,
  'suite cleanup verification explicitly runs in the consumer identity model'
);
select results_eq(
  $$select count(*)::bigint from auth.users where email like '%@example.invalid'$$,
  $$values (0::bigint)$$,
  'no pgTAP fixture Auth users persist between files'
);
select results_eq(
  $$select sum(row_count)::bigint from (
      select count(*)::bigint as row_count from public.teacher_profiles
      union all select count(*)::bigint from public.teacher_classes
      union all select count(*)::bigint from public.teacher_activities
      union all select count(*)::bigint from public.product_entitlements
      union all select count(*)::bigint from public.account_deletion_requests
      union all select count(*)::bigint from private.account_deletion_audit
      union all select count(*)::bigint from public.consumer_accounts
      union all select count(*)::bigint from public.consumer_game_entitlements
      union all select count(*)::bigint from public.consumer_account_deletion_requests
      union all select count(*)::bigint from public.billing_customers
      union all select count(*)::bigint from public.billing_subscriptions
      union all select count(*)::bigint from public.billing_webhook_events
    ) fixture_rows$$,
  $$values (0::bigint)$$,
  'no pgTAP application fixture rows persist between files'
);

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
