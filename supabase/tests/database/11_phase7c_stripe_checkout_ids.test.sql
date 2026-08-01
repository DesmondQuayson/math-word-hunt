begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

select lives_ok(
  $$insert into public.billing_webhook_events (
    stripe_event_id, event_type, stripe_environment, stripe_object_id,
    event_created_at, payload_sha256
  ) values (
    'evt_Phase7CTestCheckout', 'checkout.session.completed', 'test',
    'cs_test_Phase7CCheckout', now(), repeat('a', 64)
  )$$,
  'Stripe test Checkout Session ids are accepted'
);

select lives_ok(
  $$insert into public.billing_webhook_events (
    stripe_event_id, event_type, stripe_environment, stripe_object_id,
    event_created_at, payload_sha256
  ) values (
    'evt_Phase7CLiveCheckout', 'checkout.session.completed', 'live',
    'cs_live_Phase7CCheckout', now(), repeat('b', 64)
  )$$,
  'Stripe live Checkout Session ids retain a valid production shape'
);

select lives_ok(
  $$insert into public.billing_webhook_events (
    stripe_event_id, event_type, stripe_environment, stripe_object_id,
    event_created_at, payload_sha256
  ) values (
    'evt_Phase7CLegacyCheckout', 'checkout.session.completed', 'test',
    'cs_Phase7CFixture', now(), repeat('c', 64)
  )$$,
  'existing fixture Checkout Session ids remain valid'
);

select throws_ok(
  $$insert into public.billing_webhook_events (
    stripe_event_id, event_type, stripe_environment, stripe_object_id,
    event_created_at, payload_sha256
  ) values (
    'evt_Phase7CMalformedCheckout', 'checkout.session.completed', 'test',
    'cs_preview_Phase7CCheckout', now(), repeat('d', 64)
  )$$,
  '23514', null,
  'unknown Checkout environment markers are rejected'
);

select throws_ok(
  $$insert into public.billing_webhook_events (
    stripe_event_id, event_type, stripe_environment, stripe_object_id,
    event_created_at, payload_sha256
  ) values (
    'evt_Phase7CUnsafeCheckout', 'checkout.session.completed', 'test',
    'cs_test_Phase7C_Extra', now(), repeat('e', 64)
  )$$,
  '23514', null,
  'additional separators remain rejected'
);

select * from finish();
rollback;
