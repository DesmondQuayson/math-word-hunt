# Google Ads conversion tracking

How MathNexa tells Google Ads which ad clicks became registered accounts, free trials and paying subscribers.

## Why it is built this way

Google Ads reported zero conversions while the database held real sign-ups, trials and paid subscriptions. The Google
tag (`GTM-53VDQ6ZL`, destination `AW-18462869878`) was installed in v1.2.48, but it is a base tag: the account has no
conversion action attached to it, and nothing on the site ever told Google that an account, a trial or a payment
happened.

A browser tag cannot measure this funnel honestly:

- **The first payment happens 24 hours after Checkout**, when the trial ends and nobody is on the site.
- **A return page is not proof.** Counting a visit to `/checkout/status` counts reloads and reopened links.
- **Email confirmation often happens in another browser** (a phone's mail app), where the ad cookie does not exist.
- **Safari caps script-written ad cookies** at 7 days, or 24 hours for a decorated ad landing.
- **The sign-up form answers the same way** whether or not the address already has an account, so a browser event
  there would count attempts or reveal which addresses exist.

So the three conversions are recorded **on the server**, from the same authoritative facts billing uses, and Google
Ads **imports** them by ad click identifier. Nothing about a conversion is sent from the browser.

## The three conversions

| Conversion (exact name) | Recorded when | Value | Recommended role |
| --- | --- | --- | --- |
| `account_created` | The account's email address is confirmed for the first time (database trigger on `consumer_accounts`). | none | Secondary |
| `trial_started` | Stripe reports the account's subscription as `trialing`. The product sells one 24-hour trial per account, so this is the first-time trial. | none | Secondary |
| `subscription_started` | The first Stripe invoice that is paid, belongs to the account's subscription and has an amount above zero. | the amount actually paid, USD | **Primary** |

What never counts:

- a sign-up that is not confirmed, a page load, a reload, or a visit to the Checkout return page;
- the $0 trial invoice, an open or failed invoice, or a cancelled Checkout;
- a replayed webhook, a second delivery, a reconciliation run, or a renewal;
- a renewal of a subscription that began before measurement started (`ads_conversion_settings.tracking_started_at`);
- a payment by an account that already paid on an earlier subscription.

Each account can hold each conversion once: `ads_conversion_events` has a unique key on account and event name.

## How a click reaches a conversion

1. **Landing.** A Google ad click arrives with `gclid` (or `gbraid` / `wbraid` from iOS) in the URL, because the
   account has auto-tagging on. `components/analytics/ad-click-capture.tsx` hands those values, and nothing else, to
   `POST /api/ad-click`.
2. **Cookie.** If the visitor's consent allows it (below), the route keeps the identifier in the HttpOnly,
   first-party cookie `mathnexa-ad-click` for 90 days. Page scripts, including the Google tag, cannot read it.
3. **Account.** At sign-up (and at the start of Checkout for an account that has none), the server stores the click
   with the account in `ad_click_attributions` and clears the cookie. The first click stored wins.
4. **Ledger.** The database trigger and the subscription synchronizer write `ads_conversion_events`. Webhooks,
   replays and the scheduled reconciliation all pass through the same synchronizer, so a first payment is recorded
   even when its webhook is late, out of order or never arrives.
5. **Report.** Google Ads fetches `/api/internal/ads/google-ads-conversions.csv` on a schedule. A row exists only for
   an active account that holds a click, for a conversion that happened after the click and within 90 days of it.

## The file Google Ads imports

`GET /api/internal/ads/google-ads-conversions.csv`

- **Closed by default.** 404 until `MVH_ADS_FEED_PASSWORD` (24 characters or more) is set; 401 without the
  credential. User name `mathnexa-ads-feed`, HTTP Basic (what Google Ads sends) or `Authorization: Bearer`.
- **Columns:** `Google Click ID, GBRAID, WBRAID, Conversion Name, Conversion Time, Conversion Value, Conversion
  Currency, Order ID, Ad User Data, Ad Personalization`.
- **Order ID** is the ledger row's random id: opaque, stable, and not derived from anything about the customer.
- **Consent columns:** `Ad User Data` is `Granted` (a click is kept only where consent allows measurement);
  `Ad Personalization` is `Denied` (measurement only, never audience building).
- **Window:** the last 30 days by default (`?days=1..90`). The same rows are offered again each day on purpose:
  Google Ads refuses a conversion whose click is under six hours old, so it must be offered again, and it counts a
  click, name and time only once.
- **Layouts:** ISO 8601 times with `+00:00` (Data Manager). `?layout=legacy` gives the older Uploads template with
  its `Parameters:TimeZone=+0000` row.
- **No personal data:** no name, email address, account id, Stripe id or page address is in the file.

## What the owner sets up in Google Ads (account 589-904-8460)

Nothing below is done by the code, and no conversion id or label is needed: Google Ads matches imported conversions
to conversion actions by **name**.

1. **Create three conversion actions** (Goals > Summary > Create conversion action > Conversions offline > add a
   data source for conversions from clicks). The names must match exactly, lower case with underscores.

   | Name | Category | Value | Count | Click-through window | Role |
   | --- | --- | --- | --- | --- | --- |
   | `account_created` | Sign-up | Don't use a value | One | 30 days | Secondary |
   | `trial_started` | Begin checkout | Don't use a value | One | 30 days | Secondary |
   | `subscription_started` | Purchase | Use different values for each conversion; default 5.99 USD | One | 90 days | **Primary** |

   Attribution model: data-driven (the default). Create the actions **before** running ads: Google Ads cannot credit
   a click made before the conversion action existed, and needs 4 to 6 hours after creation before the first import.
2. **Set the feed password.** Add `MVH_ADS_FEED_PASSWORD` (a long random value) to the production Vercel project and
   redeploy. Keep the value in the password manager.
3. **Connect the file** (Tools > Data manager > Connect product > HTTPS > Direct connection > Conversions):
   URL `https://mathnexa.com/api/internal/ads/google-ads-conversions.csv`, user name `mathnexa-ads-feed`, the
   password from step 2. Map the columns by name and schedule it **daily**.
4. **Turn off automatic user-provided data detection** on the Google tag (Tools > Data manager > Google tag > Manage >
   "Allow user-provided data capabilities"). The published container has automatic email, phone and address detection
   switched on; MathNexa promises not to send those.

The first import can be checked by hand: download the file with the credential and upload it once.

## Consent

Ad measurement is opt-out, and only where that is the rule (`lib/analytics/ad-measurement.ts`):

- **On** for visitors the hosting platform places in the United States.
- **Off** everywhere else. MathNexa has no consent banner, so it does not ask and does not measure.
- **Off** when the browser sends Global Privacy Control (`Sec-GPC: 1`).
- **Off** when the visitor turns it off on the Privacy page ("Advertising measurement"). That also clears the click
  held in the browser and, when signed in, the one kept with the account.

The Google tag follows the same rule through Consent Mode defaults set before it starts
(`lib/analytics/google-tag.ts`): everything denied by default; storage and ad measurement granted only in the United
States and only without an opt-out; `ad_personalization` denied for everyone; `ads_data_redaction` on. A campaign
that targets another country needs a consent banner first, and then that country added to
`AD_MEASUREMENT_COUNTRIES`.

## Privacy

- Stored: the click identifier, when the visitor landed, and where it was attached (sign-up or Checkout); the
  conversion name, time and, for a first payment, the amount.
- Not stored or sent: name, email address, IP address, pages visited, anything done inside MathNexa.
- A deletion request removes the click identifier at once; the ledger rows go with the account.
- The tables have row level security with no policy, no grant to browser roles, and are written only through
  service-role functions.
- The Privacy Notice names Google and describes this. Its wording needs the owner's review.

## Verifying

- `npm run supabase:test`: `44_ads_conversion_attribution.test.sql` (rules, privileges, de-duplication).
- `node scripts/run-ads-conversions-e2e.mjs`: the full funnel in Chromium, WebKit and two phone profiles against
  the local stack and the fixture billing provider.
- Reconciling with the database, read-only:

  ```sql
  select event_name, count(*) as recorded,
         count(*) filter (where click.user_id is not null) as with_ad_click
    from public.ads_conversion_events event
    left join public.ad_click_attributions click using (user_id)
   group by event_name;
  ```

## Turning it off

Remove `MVH_ADS_FEED_PASSWORD`: the file answers 404 and Google Ads receives nothing further. The ledger keeps
recording, so nothing is lost if it is turned on again.
