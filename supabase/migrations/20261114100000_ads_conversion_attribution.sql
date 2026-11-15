-- Google Ads conversion measurement (owner request, 2026-11-14).
--
-- Google Ads reported zero conversions while this database held real sign-ups,
-- trials and paid subscriptions: nothing connected an ad click to what the
-- account later did. This migration adds the two missing records and nothing
-- else. It changes no existing table, function, entitlement or billing rule.
--
--   ad_click_attributions   the Google Ads click identifier (gclid, gbraid or
--                           wbraid) a visitor arrived with, kept with the
--                           account they then created. One row per account,
--                           first click wins.
--   ads_conversion_events   the authoritative ledger of the three conversions:
--                             account_created       the account's email address was confirmed
--                             trial_started         the one 24-hour trial began at the provider
--                             subscription_started  the first invoice with money actually paid
--                           One row per account and event, so a repeated page
--                           load, webhook replay or reconciliation run can
--                           never count twice.
--
-- Nothing here is readable from a browser: RLS is on with no policy, the tables
-- carry no grant for anon or authenticated, and every function is service-role
-- only. No name, email address or payment detail is stored; the ledger row's own
-- random id is the opaque transaction identifier reported to Google Ads.

-- When measurement began in this database. Subscriptions that started before it
-- are never reported: their first payment happened before any click could have
-- been captured, so a later renewal must not look like a first purchase.
create table public.ads_conversion_settings (
  singleton boolean primary key default true check (singleton),
  tracking_started_at timestamptz not null default statement_timestamp()
);
insert into public.ads_conversion_settings default values;
alter table public.ads_conversion_settings enable row level security;
alter table public.ads_conversion_settings force row level security;
revoke all on table public.ads_conversion_settings from public,anon,authenticated,service_role;
grant select on table public.ads_conversion_settings to service_role;

-- A click identifier is URL-safe base64 text. (Postgres caps a regex repetition
-- count at 255, so the length is checked separately.)
create table public.ad_click_attributions (
  user_id uuid primary key references public.consumer_accounts(user_id) on delete cascade,
  gclid text check (gclid is null or (gclid ~ '^[A-Za-z0-9_-]+$' and char_length(gclid) between 10 and 512)),
  gbraid text check (gbraid is null or (gbraid ~ '^[A-Za-z0-9_-]+$' and char_length(gbraid) between 10 and 512)),
  wbraid text check (wbraid is null or (wbraid ~ '^[A-Za-z0-9_-]+$' and char_length(wbraid) between 10 and 512)),
  -- When the visitor landed with the identifier, not when the account was made.
  clicked_at timestamptz not null,
  captured_at timestamptz not null default statement_timestamp(),
  capture_point text not null check (capture_point in ('sign-up', 'checkout')),
  check (num_nonnulls(gclid, gbraid, wbraid) >= 1),
  check (clicked_at <= captured_at + interval '5 minutes')
);
alter table public.ad_click_attributions enable row level security;
alter table public.ad_click_attributions force row level security;
revoke all on table public.ad_click_attributions from public,anon,authenticated,service_role;
grant select on table public.ad_click_attributions to service_role;

create table public.ads_conversion_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.consumer_accounts(user_id) on delete cascade,
  event_name text not null check (event_name in ('account_created', 'trial_started', 'subscription_started')),
  occurred_at timestamptz not null,
  -- Only a first payment carries a value, and only what was actually paid.
  value_minor_units integer check (value_minor_units is null or value_minor_units > 0),
  currency text check (currency is null or currency = 'usd'),
  stripe_environment text check (stripe_environment is null or stripe_environment in ('test', 'live')),
  recorded_at timestamptz not null default statement_timestamp(),
  unique (user_id, event_name),
  check ((event_name = 'subscription_started') = (value_minor_units is not null)),
  check ((value_minor_units is null) = (currency is null)),
  check ((event_name = 'account_created') = (stripe_environment is null))
);
create index ads_conversion_events_occurred_at_idx on public.ads_conversion_events (occurred_at);
alter table public.ads_conversion_events enable row level security;
alter table public.ads_conversion_events force row level security;
revoke all on table public.ads_conversion_events from public,anon,authenticated,service_role;
grant select on table public.ads_conversion_events to service_role;

-- account_created: the first time an account's email address is confirmed.
-- Recorded here rather than in the sign-up form because the form answers the
-- same way whether or not the address already has an account; a browser event
-- at that point would either count attempts or reveal which addresses exist.
-- A failure to record must never block account provisioning, so it is swallowed.
create or replace function private.record_account_created_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null and new.account_status = 'active'
    and (tg_op = 'INSERT' or old.email_confirmed_at is null) then
    begin
      insert into public.ads_conversion_events (user_id, event_name, occurred_at)
      values (new.user_id, 'account_created', new.email_confirmed_at)
      on conflict (user_id, event_name) do nothing;
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;
revoke all on function private.record_account_created_conversion() from public,anon,authenticated;
create trigger record_account_created_conversion
after insert or update of email_confirmed_at on public.consumer_accounts
for each row execute function private.record_account_created_conversion();

-- A deletion request stops reporting at once: without the click identifier no
-- conversion of this account can reach Google Ads. The ledger rows carry no
-- external identifier and go with the account when it is deleted.
create or replace function private.erase_ad_click_on_deletion_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_status = 'deletion_pending' and old.account_status is distinct from 'deletion_pending' then
    begin
      delete from public.ad_click_attributions where user_id = new.user_id;
    exception when others then
      null;
    end;
  end if;
  return new;
end;
$$;
revoke all on function private.erase_ad_click_on_deletion_request() from public,anon,authenticated;
create trigger erase_ad_click_on_deletion_request
after update of account_status on public.consumer_accounts
for each row execute function private.erase_ad_click_on_deletion_request();

-- Keeps the click identifier a visitor arrived with against the account. The
-- first one stored wins; a later click never replaces it.
create or replace function public.store_ad_click_attribution(
  p_user_id uuid,
  p_gclid text,
  p_gbraid text,
  p_wbraid text,
  p_clicked_at timestamptz,
  p_capture_point text
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  stored_count integer;
begin
  if p_user_id is null or p_clicked_at is null
    or p_capture_point is null or p_capture_point not in ('sign-up', 'checkout')
    or num_nonnulls(p_gclid, p_gbraid, p_wbraid) = 0
    or p_clicked_at > statement_timestamp() + interval '5 minutes'
    or p_clicked_at < statement_timestamp() - interval '90 days' then
    return 'invalid';
  end if;
  if not exists (
    select 1 from public.consumer_accounts where user_id = p_user_id and account_status = 'active'
  ) then
    return 'ineligible';
  end if;
  insert into public.ad_click_attributions (user_id, gclid, gbraid, wbraid, clicked_at, capture_point)
  values (p_user_id, p_gclid, p_gbraid, p_wbraid, p_clicked_at, p_capture_point)
  on conflict (user_id) do nothing;
  get diagnostics stored_count = row_count;
  return case when stored_count = 1 then 'stored' else 'exists' end;
exception
  when check_violation then return 'invalid';
end;
$$;
revoke all on function public.store_ad_click_attribution(uuid,text,text,text,timestamptz,text) from public,anon,authenticated;
grant execute on function public.store_ad_click_attribution(uuid,text,text,text,timestamptz,text) to service_role;

-- The account holder withdrew ad measurement: forget the click identifier.
create or replace function public.erase_ad_click_attribution(p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  erased_count integer;
begin
  delete from public.ad_click_attributions where user_id = p_user_id;
  get diagnostics erased_count = row_count;
  return erased_count > 0;
end;
$$;
revoke all on function public.erase_ad_click_attribution(uuid) from public,anon,authenticated;
grant execute on function public.erase_ad_click_attribution(uuid) to service_role;

-- trial_started and subscription_started, from one authoritative provider
-- snapshot. The caller is the canonical subscription synchronizer, after it has
-- projected the snapshot; it passes what Stripe itself reported:
--   p_subscription_status / p_trial_start   the subscription as the provider holds it
--   p_paid_at / p_amount_paid_minor_units   the latest invoice, only when it is
--                                           paid and belongs to this subscription
-- Returns the names it recorded now, so a replay returns an empty array.
create or replace function public.record_consumer_subscription_conversions(
  p_owner_user_id uuid,
  p_stripe_environment text,
  p_stripe_subscription_id text,
  p_subscription_status text,
  p_trial_start timestamptz,
  p_paid_at timestamptz,
  p_amount_paid_minor_units integer
) returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  measurement_started timestamptz;
  subscription_created timestamptz;
  recorded text[] := array[]::text[];
  inserted_count integer;
begin
  if p_stripe_environment is null or p_stripe_environment not in ('test', 'live') then
    return recorded;
  end if;
  select tracking_started_at into measurement_started from public.ads_conversion_settings where singleton;
  select created_at into subscription_created
    from public.billing_subscriptions
    where owner_consumer_id = p_owner_user_id
      and stripe_environment = p_stripe_environment
      and stripe_subscription_id = p_stripe_subscription_id;
  -- Unknown to the projection, or older than measurement: never reported.
  if measurement_started is null or subscription_created is null or subscription_created < measurement_started then
    return recorded;
  end if;

  -- The product sells exactly one 24-hour trial per account, so a subscription
  -- the provider reports as trialing is that first-time trial.
  if p_subscription_status = 'trialing' and p_trial_start is not null then
    insert into public.ads_conversion_events (user_id, event_name, occurred_at, stripe_environment)
    values (p_owner_user_id, 'trial_started', p_trial_start, p_stripe_environment)
    on conflict (user_id, event_name) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then recorded := recorded || 'trial_started'::text; end if;
  end if;

  -- A first payment is an invoice with money actually paid: never the $0 trial
  -- invoice, a failed or open invoice, or a visit to the return page. An account
  -- that already paid on an earlier subscription is not a first purchase. Since
  -- measurement began the unique ledger row settles that. For a subscription
  -- from before it, the projection stamps first_paid_at at the $0 trial invoice,
  -- so a real payment shows as paid evidence at least half a day later.
  if p_paid_at is not null and p_amount_paid_minor_units is not null and p_amount_paid_minor_units > 0
    and not exists (
      select 1 from public.billing_subscriptions earlier
      where earlier.owner_consumer_id = p_owner_user_id
        and earlier.stripe_environment = p_stripe_environment
        and earlier.stripe_subscription_id <> p_stripe_subscription_id
        and earlier.created_at < subscription_created
        and earlier.first_paid_at is not null
        and earlier.last_paid_at >= earlier.first_paid_at + interval '12 hours'
    ) then
    insert into public.ads_conversion_events (
      user_id, event_name, occurred_at, value_minor_units, currency, stripe_environment
    ) values (
      p_owner_user_id, 'subscription_started', p_paid_at, p_amount_paid_minor_units, 'usd', p_stripe_environment
    ) on conflict (user_id, event_name) do nothing;
    get diagnostics inserted_count = row_count;
    if inserted_count = 1 then recorded := recorded || 'subscription_started'::text; end if;
  end if;
  return recorded;
end;
$$;
revoke all on function public.record_consumer_subscription_conversions(uuid,text,text,text,timestamptz,timestamptz,integer) from public,anon,authenticated;
grant execute on function public.record_consumer_subscription_conversions(uuid,text,text,text,timestamptz,timestamptz,integer) to service_role;

-- What may be reported to Google Ads: conversions of active accounts that hold a
-- click identifier, that happened after the click and within the 90 days Google
-- Ads accepts. `p_stripe_environment` keeps test-mode billing out of a live
-- report and the reverse; account_created has no billing mode.
create or replace function public.list_reportable_ads_conversions(
  p_since timestamptz,
  p_stripe_environment text
) returns table (
  conversion_id uuid,
  event_name text,
  occurred_at timestamptz,
  value_minor_units integer,
  currency text,
  gclid text,
  gbraid text,
  wbraid text
)
language sql
stable
security definer
set search_path = ''
as $$
  select event.id, event.event_name, event.occurred_at, event.value_minor_units, event.currency,
         click.gclid, click.gbraid, click.wbraid
    from public.ads_conversion_events event
    join public.ad_click_attributions click on click.user_id = event.user_id
    join public.consumer_accounts account on account.user_id = event.user_id
    where account.account_status = 'active'
      and event.occurred_at >= p_since
      and event.occurred_at >= click.clicked_at
      and event.occurred_at <= click.clicked_at + interval '90 days'
      and (event.stripe_environment is null or event.stripe_environment = p_stripe_environment)
    order by event.occurred_at, event.id;
$$;
revoke all on function public.list_reportable_ads_conversions(timestamptz,text) from public,anon,authenticated;
grant execute on function public.list_reportable_ads_conversions(timestamptz,text) to service_role;
