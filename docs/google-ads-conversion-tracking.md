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

## The Google Ads account as audited (589-904-8460, 15 November 2026)

Read in the account itself, signed in as the owner, without changing anything.

**Identifiers.** They are four different kinds of number, and they agree with each other:

| Identifier | Value | What it is |
| --- | --- | --- |
| Customer ID | `589-904-8460` | the Google Ads account |
| Google tag destination | `AW-18462869878` | the account's tag (conversion) ID |
| Container | `GTM-53VDQ6ZL` | the same Google tag; Google upgraded it to a Tag Manager container. It is the one installed on the site, and its only destination is `AW-18462869878`. |
| Conversion type ID | `7901107820` | the existing "Sign-up" conversion action (below) |

**The existing "Sign-up" conversion action.** Website source, created 13 November 2026, Primary, in the account-default
goal that both campaigns use, count One, 90-day click window, "use different values, default US$1", status "Awaiting
conversions", nothing recorded. It is measured by an event snippet (its own label on `AW-18462869878`) that is **not
installed on the site and must not be**:

- A browser event on the sign-up form cannot tell a new address from an existing one, and fires before the address
  is confirmed.
- It would count the same person twice once `account_created` is imported.
- Its default value would report US$1 that nobody paid.

Until it is changed it is the only Primary action, so the campaigns optimise towards an action that never records.
Once the three actions below exist, set "Sign-up" to Secondary or remove it (an owner decision).

**Also found:**

- No import conversion action and no Data manager connection exist yet.
- Goals > Conversions > Uploads no longer takes new schedules ("New data connections can be made in Data Manager"),
  so the `?layout=legacy` file is not needed for this account.
- Customer data terms: not accepted. Enhanced conversions and enhanced conversions for leads: not configured. Leave
  all three as they are: this design sends no user-provided data.
- Google tag > Settings > "Allow user-provided data capabilities" is **on**, with automatic detection of email, phone
  number, and name and address. Google states that nothing is processed or sent until the customer data terms are
  accepted, which they are not.
- Google tag diagnostics: "Container quality: Urgent", because the site's Content Security Policy refuses
  `connect-src https://pagead2.googlesyndication.com` (see Consent below), plus the two hosts v1.2.51 has since
  allowed.

## What is set up in Google Ads

No conversion id or label is used. In Data manager **each connection feeds one conversion action**, so the same file
is connected three times, each time filtered to one value of the `Conversion Name` column.

1. **Create three conversion actions** (Goals > Conversions > Summary > Create conversion action > tick "Conversions
   offline" > Save and continue). The names must match exactly, lower case with underscores.

   | Name | Category | Value | Count | Click-through window | Role |
   | --- | --- | --- | --- | --- | --- |
   | `account_created` | Sign-up | Don't use a value | One | 30 days | Secondary |
   | `trial_started` | Begin checkout | Don't use a value | One | 30 days | Secondary |
   | `subscription_started` | Purchase | Use different values for each conversion; default 5.99 USD | One | 90 days | **Primary** |

   Attribution model: data-driven (the default). Create the actions **before** running ads: Google Ads cannot credit
   a click made before the conversion action existed, and needs 4 to 6 hours after creation before the first import.
2. **The feed password.** `MVH_ADS_FEED_PASSWORD` was added to the production Vercel project on 15 November 2026 as a
   Sensitive variable (40 random letters and digits, never displayed). A copy is kept for the owner in
   `%USERPROFILE%\.mathnexa-secrets\ads-feed-credential.clixml`, readable only by that Windows user. It takes effect
   with the next production deployment; until then the file answers 404. To copy it to the clipboard:

   ```powershell
   (Import-Clixml "$env:USERPROFILE\.mathnexa-secrets\ads-feed-credential.clixml").GetNetworkCredential().Password | Set-Clipboard
   ```
3. **Connect the file three times, once per conversion action** (Tools > Data manager > Connect product > HTTPS >
   Direct connection > use case Conversions). For each connection:
   - Accept the customer data policy when asked (the owner does this).
   - Do **not** tick "Turn on enhanced conversions".
   - URL `https://mathnexa.com/api/internal/ads/google-ads-conversions.csv`, user name `mathnexa-ads-feed`, the
     password from step 2.
   - Filter: `Conversion Name` equals the action's name.
   - Map `Google Click ID` to GCLID, `GBRAID`, `WBRAID`, `Conversion Time` to "Conversion date and time",
     `Conversion Value`, `Order ID`. Set the event source to Web. The other columns may stay unmapped.
   - Schedule: daily.

   Data manager reads `.csv` files with a header row and ISO 8601 times with an offset, which is what the file
   sends. Wait 4 to 6 hours after creating an action before its first run. The production firewall has no rule that
   could block Google's fetcher, so Google's list of addresses to allow needs no action.
4. **Turn off user-provided data** on the Google tag (Tools > Data manager > Google tag > Manage > Settings > "Allow
   user-provided data capabilities" off, then publish the container). MathNexa promises not to send those.
5. **Then change the old "Sign-up" action** to Secondary, or remove it.

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

**Where measurement is off, nothing reaches Google beyond the tag's own script.** Measured on the live site on
15 November 2026 (60 page loads in Chromium and WebKit): with consent denied (Global Privacy Control, the Privacy
page switch, and so every visitor outside the United States) the tag tries one cookieless ping per page to
`https://pagead2.googlesyndication.com/ccm/collect`, and the Content Security Policy refuses it. With consent
granted the tag uses the hosts the policy lists and nothing is refused. Google's tag diagnostics report the refused
host as "security settings are blocking measurement". Allowing it would let Google model conversions for visitors
who said no; it is left refused unless the owner decides otherwise, because the conversions here are imported by
click identifier and do not depend on it.

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
