begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

update private.platform_identity_policy
  set identity_model='consumer-v1',updated_at='2026-08-06T12:00:00.123456Z'::timestamptz
  where singleton;

set local role service_role;
select lives_ok(
  $$select public.set_platform_identity_model('consumer-v1')$$,
  'existing consumer-v1 setup remains valid'
);
select is(
  (select updated_at from private.platform_identity_policy where singleton),
  '2026-08-06T12:00:00.123456Z'::timestamptz,
  'legacy setup API preserves updated_at during a semantic no-op'
);
select is(
  public.ensure_platform_identity_model('consumer-v1','consumer-v1'),
  false,
  'compare-and-set setup reports no write when the policy is already correct'
);
select is(
  (select updated_at from private.platform_identity_policy where singleton),
  '2026-08-06T12:00:00.123456Z'::timestamptz,
  'compare-and-set no-op preserves the exact microsecond timestamp'
);
select is(
  public.ensure_platform_identity_model('consumer-v1','legacy-preview'),
  true,
  'a real policy change is applied'
);
select is(
  (select identity_model from private.platform_identity_policy where singleton),
  'legacy-preview'::text,
  'the real policy change persists'
);
select isnt(
  (select updated_at from private.platform_identity_policy where singleton),
  '2026-08-06T12:00:00.123456Z'::timestamptz,
  'a real policy change advances updated_at'
);
select throws_ok(
  $$select public.ensure_platform_identity_model('consumer-v1','consumer-v1')$$,
  '40001','identity_model_concurrent_change',
  'an unexpected concurrent policy value fails closed'
);
select is(
  public.ensure_platform_identity_model('legacy-preview','consumer-v1'),
  true,
  'the expected current policy can be changed back explicitly'
);
select is(
  public.ensure_platform_identity_model('consumer-v1','consumer-v1'),
  false,
  'repeated setup remains idempotent'
);
reset role;

select * from finish();
rollback;
