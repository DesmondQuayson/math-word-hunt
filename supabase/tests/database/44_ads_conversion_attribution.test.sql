begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
\set phase7d_identity_model 'consumer-v1'
\ir ../helpers/select-identity-model.psql

-- Google Ads conversion measurement: the click a visitor arrived with and the
-- ledger of the three conversions. The ledger must hold each conversion once,
-- only when it is real (a confirmed address, the provider's own trial, money
-- actually paid, a first purchase), and nothing here may be readable or
-- writable from a browser.

-- ---------------------------------------------------------------------------
-- Shape and privileges
-- ---------------------------------------------------------------------------
select has_table('public', 'ad_click_attributions', 'click attribution table exists');
select has_table('public', 'ads_conversion_events', 'conversion ledger exists');
select has_table('public', 'ads_conversion_settings', 'measurement epoch exists');
select is((select count(*)::int from public.ads_conversion_settings), 1, 'exactly one measurement epoch');
select col_is_unique('public', 'ads_conversion_events', array['user_id', 'event_name'], 'one ledger row per account and event');

select is(
  (select count(*)::int from pg_class where relnamespace = 'public'::regnamespace
     and relname in ('ad_click_attributions', 'ads_conversion_events', 'ads_conversion_settings')
     and relrowsecurity and relforcerowsecurity),
  3, 'RLS is enabled and forced on all three tables');
select is(
  (select count(*)::int from pg_policies where schemaname = 'public'
     and tablename in ('ad_click_attributions', 'ads_conversion_events', 'ads_conversion_settings')),
  0, 'no policy opens any of them');
select is(
  (select count(*)::int from unnest(array['anon', 'authenticated']) as role_name,
     unnest(array['ad_click_attributions', 'ads_conversion_events', 'ads_conversion_settings']) as table_name,
     unnest(array['select', 'insert', 'update', 'delete', 'truncate']) as privilege
     where has_table_privilege(role_name, 'public.' || table_name, privilege)),
  0, 'a browser role holds no privilege on any of them');
select is(
  (select count(*)::int from unnest(array['ad_click_attributions', 'ads_conversion_events', 'ads_conversion_settings']) as table_name,
     unnest(array['insert', 'update', 'delete', 'truncate']) as privilege
     where has_table_privilege('service_role', 'public.' || table_name, privilege)),
  0, 'the service role writes only through the functions');
select is(
  (select count(*)::int from unnest(array['anon', 'authenticated']) as role_name,
     unnest(array[
       'public.store_ad_click_attribution(uuid,text,text,text,timestamptz,text)',
       'public.erase_ad_click_attribution(uuid)',
       'public.record_consumer_subscription_conversions(uuid,text,text,text,timestamptz,timestamptz,integer)',
       'public.list_reportable_ads_conversions(timestamptz,text)'
     ]) as function_name
     where has_function_privilege(role_name, function_name, 'execute')),
  0, 'a browser role can execute none of the functions');

set local role service_role;
select lives_ok($$select public.set_platform_identity_model('consumer-v1')$$, 'consumer identity model selected');
reset role;

-- ---------------------------------------------------------------------------
-- account_created: the first confirmation of an address, once
-- ---------------------------------------------------------------------------
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data) values
  ('c4000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'ads-a@example.invalid', crypt('ConsumerPass123', gen_salt('bf')), null, '{}'),
  ('c4000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'ads-b@example.invalid', crypt('ConsumerPass123', gen_salt('bf')), timestamptz '2026-11-14 09:00:00+00', '{}'),
  ('c4000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'ads-c@example.invalid', crypt('ConsumerPass123', gen_salt('bf')), now(), '{}'),
  ('c4000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'ads-d@example.invalid', crypt('ConsumerPass123', gen_salt('bf')), now(), '{}'),
  ('c4000000-0000-0000-0000-000000000005', 'authenticated', 'authenticated', 'ads-e@example.invalid', crypt('ConsumerPass123', gen_salt('bf')), now(), '{}');

select is(
  (select count(*)::int from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000001'),
  0, 'an account whose address is not confirmed is not a conversion');
select results_eq(
  $$select event_name, occurred_at, value_minor_units, currency, stripe_environment from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000002'$$,
  $$values ('account_created'::text, timestamptz '2026-11-14 09:00:00+00', null::integer, null::text, null::text)$$,
  'an account created already confirmed is recorded at its confirmation time, with no value');

update auth.users set email_confirmed_at = timestamptz '2026-11-14 10:30:00+00' where id = 'c4000000-0000-0000-0000-000000000001';
select results_eq(
  $$select event_name, occurred_at from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000001'$$,
  $$values ('account_created'::text, timestamptz '2026-11-14 10:30:00+00')$$,
  'confirming the address records account_created');
update auth.users set email_confirmed_at = timestamptz '2026-11-14 11:45:00+00' where id = 'c4000000-0000-0000-0000-000000000001';
select results_eq(
  $$select count(*)::int, min(occurred_at) from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000001'$$,
  $$values (1, timestamptz '2026-11-14 10:30:00+00')$$,
  'a later confirmation timestamp never records a second account_created');

-- ---------------------------------------------------------------------------
-- The click a visitor arrived with: first one wins, nothing malformed
-- ---------------------------------------------------------------------------
set local role service_role;
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000001', 'Cj0KCQjw-FIRSTclick_0123456789', null, null, now() - interval '2 hours', 'sign-up'), 'stored', 'the click is stored with the account');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000001', 'Cj0KCQjw-LATERclick_0123456789', null, null, now() - interval '1 hour', 'checkout'), 'exists', 'a later click never replaces the first');
select is((select gclid from public.ad_click_attributions where user_id = 'c4000000-0000-0000-0000-000000000001'), 'Cj0KCQjw-FIRSTclick_0123456789', 'the first click is the one kept');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000002', null, '0AAAAAo_gbraid_value', null, now(), 'checkout'), 'stored', 'an iOS click with gbraid alone is stored');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-0000000000ff', 'Cj0KCQjw-UNKNOWNuser_0123456789', null, null, now(), 'sign-up'), 'ineligible', 'an account the database does not know stores nothing');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000003', 'bad value; drop', null, null, now(), 'sign-up'), 'invalid', 'a malformed identifier is refused');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000003', null, null, null, now(), 'sign-up'), 'invalid', 'no identifier is refused');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000003', 'Cj0KCQjw-FUTUREclick_0123456789', null, null, now() + interval '1 hour', 'sign-up'), 'invalid', 'a click from the future is refused');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000003', 'Cj0KCQjw-ANCIENTclick_012345678', null, null, now() - interval '91 days', 'sign-up'), 'invalid', 'a click older than 90 days is refused');
select is(public.store_ad_click_attribution('c4000000-0000-0000-0000-000000000003', 'Cj0KCQjw-WRONGpoint_0123456789', null, null, now(), 'homepage'), 'invalid', 'an unknown capture point is refused');
select is((select count(*)::int from public.ad_click_attributions where user_id = 'c4000000-0000-0000-0000-000000000003'), 0, 'nothing refused was stored');
reset role;

-- ---------------------------------------------------------------------------
-- trial_started and subscription_started, from provider snapshots
-- ---------------------------------------------------------------------------
insert into public.billing_customers (id, owner_consumer_id, stripe_environment, stripe_customer_id) values
  ('c4100000-0000-0000-0000-000000000001', 'c4000000-0000-0000-0000-000000000001', 'test', 'cus_AdsA'),
  ('c4100000-0000-0000-0000-000000000003', 'c4000000-0000-0000-0000-000000000003', 'test', 'cus_AdsC'),
  ('c4100000-0000-0000-0000-000000000004', 'c4000000-0000-0000-0000-000000000004', 'test', 'cus_AdsD'),
  ('c4100000-0000-0000-0000-000000000005', 'c4000000-0000-0000-0000-000000000005', 'test', 'cus_AdsE');

create temporary table ads_times as
  select date_trunc('second', now()) - interval '30 minutes' as trial_start;
grant select on ads_times to service_role;

set local role service_role;
create or replace function pg_temp.sync_snapshot(
  p_owner uuid, p_customer text, p_sub text, p_status text,
  p_start timestamptz, p_end timestamptz, p_canceled timestamptz, p_ended timestamptz,
  p_trial_start timestamptz, p_trial_end timestamptz, p_observed timestamptz
) returns text language sql as $$
  select public.synchronize_consumer_billing_subscription(
    'reconciliation', null, null, p_owner, 'test', p_customer, p_sub, 'price_AdsMonthly', p_status,
    p_start, p_end, false, p_canceled, p_ended, p_trial_start, p_trial_end, null, null, p_observed, 7, false);
$$;

-- Account A: a subscription that begins after measurement, with a trial.
select is(
  pg_temp.sync_snapshot('c4000000-0000-0000-0000-000000000001', 'cus_AdsA', 'sub_AdsA', 'trialing',
    (select trial_start from ads_times), (select trial_start + interval '24 hours' from ads_times), null, null,
    (select trial_start from ads_times), (select trial_start + interval '24 hours' from ads_times), (select trial_start + interval '1 second' from ads_times)),
  'trial-active', 'the trial is projected');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'trialing', (select trial_start from ads_times), null, null),
  array['trial_started'], 'a trialing subscription records trial_started');
select results_eq(
  $$select occurred_at, value_minor_units, currency, stripe_environment from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000001' and event_name = 'trial_started'$$,
  $$select trial_start, null::integer, null::text, 'test'::text from ads_times$$,
  'the trial start is the provider trial start, with no value');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'trialing', (select trial_start from ads_times), null, null),
  array[]::text[], 'a replay of the same snapshot records nothing');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'trialing', (select trial_start from ads_times), (select trial_start from ads_times), 0),
  array[]::text[], 'the $0 trial invoice is not a payment');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'active', null, (select trial_start from ads_times), null),
  array[]::text[], 'a paid invoice with an unknown amount is not reported');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'active', null, null, 599),
  array[]::text[], 'an amount without a paid time is not a payment');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'past_due', null, null, null),
  array[]::text[], 'a failed first payment records nothing');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'live', 'sub_AdsA', 'active', null, now(), 599),
  array[]::text[], 'a subscription this billing mode does not hold records nothing');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'sandbox', 'sub_AdsA', 'active', null, now(), 599),
  array[]::text[], 'an unknown billing mode records nothing');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsUnknown', 'active', null, now(), 599),
  array[]::text[], 'a subscription the projection does not hold records nothing');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'active', null, (select trial_start + interval '24 hours 5 seconds' from ads_times), 599),
  array['subscription_started'], 'the first invoice with money paid records subscription_started');
select results_eq(
  $$select occurred_at, value_minor_units, currency, stripe_environment from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000001' and event_name = 'subscription_started'$$,
  $$select trial_start + interval '24 hours 5 seconds', 599, 'usd'::text, 'test'::text from ads_times$$,
  'it carries what was actually paid, in USD, at the paid time');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'active', null, (select trial_start + interval '31 days' from ads_times), 599),
  array[]::text[], 'a renewal is never a second subscription_started');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000001', 'test', 'sub_AdsA', 'active', null, (select trial_start + interval '24 hours 5 seconds' from ads_times), 599),
  array[]::text[], 'a replay of the first payment records nothing');
select results_eq(
  $$select event_name, count(*)::int from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000001' group by event_name order by event_name$$,
  $$values ('account_created'::text, 1), ('subscription_started'::text, 1), ('trial_started'::text, 1)$$,
  'account A holds each conversion exactly once');

-- Account C: its subscription began before measurement. A renewal after
-- measurement begins must never look like a first purchase.
select is(
  pg_temp.sync_snapshot('c4000000-0000-0000-0000-000000000003', 'cus_AdsC', 'sub_AdsC', 'active',
    now() - interval '1 day', now() + interval '29 days', null, null, null, null, now() - interval '1 minute'),
  'subscription-active', 'an existing subscriber is projected');
reset role;
update public.billing_subscriptions
  set created_at = (select tracking_started_at - interval '60 days' from public.ads_conversion_settings)
  where stripe_subscription_id = 'sub_AdsC';
set local role service_role;
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000003', 'test', 'sub_AdsC', 'active', null, now(), 599),
  array[]::text[], 'a renewal of a subscription older than measurement is not reported');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000003', 'test', 'sub_AdsC', 'trialing', now() - interval '61 days', null, null),
  array[]::text[], 'nor is its trial');

-- Account D: paid on an earlier subscription, cancelled, subscribes again.
-- The new subscription's first invoice is a payment, not a first purchase.
select is(
  pg_temp.sync_snapshot('c4000000-0000-0000-0000-000000000004', 'cus_AdsD', 'sub_AdsDOld', 'canceled',
    now() - interval '50 days', now() - interval '20 days', now() - interval '25 days', now() - interval '20 days', null, null, now() - interval '20 days'),
  'subscription-expired', 'the earlier subscription is projected as ended');
reset role;
update public.billing_subscriptions set
    created_at = (select tracking_started_at - interval '80 days' from public.ads_conversion_settings),
    first_paid_at = now() - interval '51 days', last_paid_at = now() - interval '50 days'
  where stripe_subscription_id = 'sub_AdsDOld';
set local role service_role;
select is(
  pg_temp.sync_snapshot('c4000000-0000-0000-0000-000000000004', 'cus_AdsD', 'sub_AdsDNew', 'active',
    now() - interval '1 minute', now() + interval '30 days', null, null, null, null, now() - interval '30 seconds'),
  'subscription-active', 'the new subscription is projected');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000004', 'test', 'sub_AdsDNew', 'active', null, now(), 599),
  array[]::text[], 'an account that already paid before is not a first purchase');

-- Account E: cancelled during its trial before measurement (only the $0
-- invoice was ever paid), and now pays for the first time.
select is(
  pg_temp.sync_snapshot('c4000000-0000-0000-0000-000000000005', 'cus_AdsE', 'sub_AdsEOld', 'canceled',
    now() - interval '50 days', now() - interval '49 days', now() - interval '49 days 12 hours', now() - interval '49 days', null, null, now() - interval '49 days'),
  'subscription-expired', 'the trial-only subscription is projected as ended');
reset role;
update public.billing_subscriptions set
    created_at = (select tracking_started_at - interval '80 days' from public.ads_conversion_settings),
    first_paid_at = now() - interval '50 days', last_paid_at = now() - interval '50 days'
  where stripe_subscription_id = 'sub_AdsEOld';
set local role service_role;
select is(
  pg_temp.sync_snapshot('c4000000-0000-0000-0000-000000000005', 'cus_AdsE', 'sub_AdsENew', 'active',
    now() - interval '1 minute', now() + interval '30 days', null, null, null, null, now() - interval '30 seconds'),
  'subscription-active', 'the returning account is projected');
select is(
  public.record_consumer_subscription_conversions('c4000000-0000-0000-0000-000000000005', 'test', 'sub_AdsENew', 'active', null, now(), 599),
  array['subscription_started'], 'an account that only ever had the $0 trial invoice is a first purchase when it pays');

-- ---------------------------------------------------------------------------
-- What may be reported
-- ---------------------------------------------------------------------------
select results_eq(
  $$select event_name, gclid, value_minor_units from public.list_reportable_ads_conversions(now() - interval '30 days', 'test') where gclid = 'Cj0KCQjw-FIRSTclick_0123456789' order by event_name$$,
  $$values ('subscription_started'::text, 'Cj0KCQjw-FIRSTclick_0123456789'::text, 599), ('trial_started'::text, 'Cj0KCQjw-FIRSTclick_0123456789'::text, null::integer)$$,
  'account A reports the conversions that happened after its click, with the click identifier');
select is(
  (select count(*)::int from public.list_reportable_ads_conversions(now() - interval '30 days', 'test') where gclid = 'Cj0KCQjw-FIRSTclick_0123456789' and event_name = 'account_created'),
  0, 'a conversion from before the click is never reported for it');
select is(
  (select count(*)::int from public.list_reportable_ads_conversions(now() - interval '30 days', 'test') listed
     join public.ads_conversion_events event on event.id = listed.conversion_id
     where event.user_id = 'c4000000-0000-0000-0000-000000000005'),
  0, 'an account with no click reports nothing');
select is(
  (select count(*)::int from public.list_reportable_ads_conversions(now() - interval '30 days', 'live') where gclid = 'Cj0KCQjw-FIRSTclick_0123456789'),
  0, 'test-mode billing conversions are never in a live report');
select is(
  (select count(*)::int from public.list_reportable_ads_conversions(now() + interval '1 day', 'test')),
  0, 'the window bounds what is offered');
select is(
  (select count(*)::int from public.list_reportable_ads_conversions(now() - interval '30 days', null) where gclid = 'Cj0KCQjw-FIRSTclick_0123456789'),
  0, 'without a billing mode only account_created could be offered');

select ok(public.erase_ad_click_attribution('c4000000-0000-0000-0000-000000000002'), 'withdrawing ad measurement erases the click');
select ok(not public.erase_ad_click_attribution('c4000000-0000-0000-0000-000000000002'), 'erasing again finds nothing');
reset role;

-- A deletion request stops reporting at once.
update public.consumer_accounts set account_status = 'deletion_pending', deletion_requested_at = now()
  where user_id = 'c4000000-0000-0000-0000-000000000001';
select is((select count(*)::int from public.ad_click_attributions where user_id = 'c4000000-0000-0000-0000-000000000001'), 0, 'a deletion request erases the click identifier');
set local role service_role;
select is(
  (select count(*)::int from public.list_reportable_ads_conversions(now() - interval '30 days', 'test') where gclid = 'Cj0KCQjw-FIRSTclick_0123456789'),
  0, 'and nothing of that account is offered any more');
reset role;

-- Deleting the account removes every trace.
delete from public.billing_subscriptions where owner_consumer_id = 'c4000000-0000-0000-0000-000000000005';
delete from public.billing_customers where owner_consumer_id = 'c4000000-0000-0000-0000-000000000005';
delete from auth.users where id = 'c4000000-0000-0000-0000-000000000005';
select is((select count(*)::int from public.ads_conversion_events where user_id = 'c4000000-0000-0000-0000-000000000005'), 0, 'deleting the account deletes its ledger rows');

select * from finish();
rollback;
\ir ../helpers/assert-identity-model-restored.psql
