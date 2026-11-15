# MathNexa v1.2.50 release record: Google Ads conversions recorded on the server

Released 2026-11-15 01:26:26Z (2026-11-14 evening, US Central). Owner instruction (2026-11-14): repair Google Ads conversion tracking so the account can see which ad visitors register, start the trial and become paying subscribers. Owner approval: "Approve release", given after the staging review (`owner-review/google-ads-conversion-tracking-2026-11-14.md`), which covered the Privacy Notice wording, measurement-only consent, the production migration and the release plan.

| | |
| --- | --- |
| Version | `v1.2.50` (annotated tag on the build commit) |
| Build | `8907692`. `/api/health` reports it. |
| Source branch | `feature/ads-conversion-tracking`, on `ce63180` (v1.2.49 record): `4b1d9e5`, `eaedc6c`, `81bf698`, `e70b21e`, `8907692` |
| Staging deployment | `dpl_J2qvZA5NCxanHGDkFcuPcqEyTkEn` (build `e70b21e`; `8907692` adds only the production database launcher), hosted review PASS |
| Production runtime | `dpl_EC4eQfcPYodg9qATVQvCVD83coiU`, promoted 2026-11-15 01:26:06–01:26:26Z |
| Rollback runtime | `dpl_26XMr1XGLZTQ69vSU8TrRXbsM45L` (v1.2.49, build `8f69eb1`), retained |
| Database | Migration `20261114100000_ads_conversion_attribution.sql`, applied to production 2026-11-15 01:19:42Z |
| Environment | Unchanged. `MVH_ADS_FEED_PASSWORD` is not set, so the conversion file answers 404 until the owner sets it. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-50` |

Evidence: `docs/releases/evidence/mathnexa-v1.2.50/`.

## Cause

Google Ads reported zero conversions while the database held real sign-ups, trials and paid subscriptions.

- The Google tag installed in v1.2.48 (`GTM-53VDQ6ZL`, destination `AW-18462869878`) is a base tag. The published container holds no conversion label and no conversion rule, and the site sent no event.
- The first payment happens 24 hours after Checkout, when the trial ends and nobody is on the site, so a browser tag cannot see it.
- No ad click identifier was kept, although auto-tagging adds one to the landing URL.
- There was no consent handling, and the Privacy Notice did not name Google.

## Fix

The three conversions are recorded on the server, from the facts billing already trusts, and Google Ads imports them by click identifier. Nothing about a conversion is sent from the browser. Full description: `docs/google-ads-conversion-tracking.md`.

| Conversion | Recorded when | Value |
| --- | --- | --- |
| `account_created` | the account's email address is confirmed for the first time (trigger on `consumer_accounts`) | none |
| `trial_started` | Stripe reports the account's subscription as trialing | none |
| `subscription_started` | the first Stripe invoice that is paid with an amount above zero | amount paid, USD |

| | |
| --- | --- |
| Once each | `ads_conversion_events` has a unique key on account and conversion. |
| Never counted | An unconfirmed sign-up, a page load, the Checkout return page, the $0 trial invoice, a failed payment, a webhook replay, a renewal, and a subscription created before measurement began (2026-11-15 01:19:39Z in production). |
| Late events | Webhooks and the scheduled reconciliation share the synchronizer, so a first payment is recorded when its event is late, out of order or never arrives. |
| Click identifier | `gclid`, `gbraid` or `wbraid` from the landing URL is kept in the HttpOnly cookie `mathnexa-ad-click` (90 days), then with the account at sign-up or when Checkout is asked for. The first click wins. |
| File for Google Ads | `GET /api/internal/ads/google-ads-conversions.csv`, HTTP Basic, user `mathnexa-ads-feed`. Closed (404) until `MVH_ADS_FEED_PASSWORD` is set. Click identifier, conversion name, time, amount paid and a random order id; no personal data. |
| Consent | Ad measurement runs only for visitors in the United States, never with Global Privacy Control, and never after the visitor turns it off on the Privacy page. The Google tag gets Consent Mode defaults before it starts: denied everywhere, storage and ad measurement granted for the United States, ad personalisation denied for everyone, `ads_data_redaction` on. |
| Privacy Notice | "Service providers" names Google, and a new section "Advertising measurement" describes the above and holds the switch. The version date is unchanged. |
| Unchanged | Every existing table and function, billing and entitlement rules, sign-in, the CSP, robots.txt and the sitemap. The sign-up and Checkout actions gained one guarded call each that cannot change their outcome. |

Files: application code under `apps/platform-web` (`app/api/ad-click`, `app/api/internal/ads`, `app/auth-actions.ts`, `app/billing-actions.ts`, `app/layout.tsx`, `app/privacy/page.tsx`, `components/analytics`, `lib/analytics`, `lib/billing/consumer-repository.ts`, `lib/billing/consumer-synchronizer.ts`), one migration, tests, `e2e/ads-conversions`, staging and production launchers, and the documentation.

## Gates

| Gate | Result |
| --- | --- |
| Typecheck, lint | Pass (8 warnings, all in an untouched file, as before) |
| Unit | 1,786 web (1 skipped) and 245 core |
| Security suite | 353, plus the bundle and Number Cross audits and the protection-bypass tests (47) |
| Database (pgTAP, fresh local reset) | 1,833 of 1,833; 62 new in `44_ads_conversion_attribution.test.sql` |
| Funnel in browsers (`e2e/ads-conversions`) | 64 of 64: 16 each in Chromium, WebKit, a Pixel 7 profile and an iPhone 14 profile |
| Existing browser suites | Account identity 10/10, billing lifecycle 11/11, commercial consent 3/3, homepage and public pages 31/31, school access 21/21, free-game sign-up 8/8, Quiz PDFs 20/20, Number Cross 1/1 |
| Production build | Pass |

`scripts/audit-phase11-security.mjs` fails on `main` as well: its homepage asset list is older than the v1.2.41 homepage. It was not changed here.

## Staging

- Database: `invoke-ads-conversions-staging.ps1` identify, migrate (after a dry run), verify and smoke all PASS. No existing row moved; a browser key is refused on every table and function.
- Hosted review of `dpl_J2qvZA5NCxanHGDkFcuPcqEyTkEn` in real browsers: 31 of 31 checks in each of the four profiles. Consent Mode is set before the tag starts; with Global Privacy Control there is no advertising cookie and the click identifier is not sent to Google; with an email address typed and submitted on a tagged page, no address, hash of it or user-data field reached Google.

## Production

Migration first, then preflight → non-aliased candidate → candidate probe → promote → live probe → live checks.

| Check | Result |
| --- | --- |
| Database audit (read-only) | Target proven to be production; only this migration pending; nothing of it existed |
| Migration | Dry run listed exactly this file; applied 01:19:42Z; 35 statements recorded. No row moved: 49 accounts, 6 subscriptions (5 active, 1 canceled), 53 webhook events before and after. The billing synchronizer, account provisioner and trial claim functions are byte-identical. |
| New objects | 3 tables with row security forced and no policy; `service_role` holds SELECT only; 2 triggers; 4 functions, service role only |
| Preflight | The apex was serving `dpl_26XMr1XGLZTQ69vSU8TrRXbsM45L` (v1.2.49), as expected |
| Live probe before | PASS, 22/22 |
| Candidate probe | PASS, 7/7 |
| Live probe after | PASS, 22/22; `/api/health` ready, build `8907692`, payments live |
| Pages (32 routes) vs a capture just before | 31 identical. `/privacy` gained the advertising section. `robots.txt`, `sitemap.xml` and the CSP header are byte-identical. |
| Live HTML | The consent defaults sit between `function gtag` and `gtag('js')` |
| `/api/ad-click` | Cross-site: 403. Same-origin with a click identifier: 204 and `mathnexa-ad-click` with `Secure; HttpOnly; SameSite=lax; Max-Age=7776000`. With `Sec-GPC: 1`: 204 and no cookie. |
| Conversion file | 404, with or without a credential: closed until the password is set |
| Live browsers (Chromium, WebKit, Pixel 7 and iPhone 14 profiles; anonymous) | 13 of 14 checks in each. Consent defaults are queued before the tag starts; the container loads once; an ad landing is answered 204 with the HttpOnly cookie, which page scripts cannot read; the Privacy page switch clears the click cookie and the tag's cookies, and the tag then starts denied; with Global Privacy Control nothing is granted, no cookie is written and the click identifier is not sent to Google. The one failing check is the first finding below. |
| Homepage three plays and Stop (Chromium and WebKit) | Plays, rests, Stop by pointer and keyboard, reduced motion and axe pass. Two items were flagged: one console message (the second finding below), and one WebKit hidden-tab timing reading that passed in 3 of 3 reruns. |
| Paid subscribers (Stripe vs database, read-only) | 6 subscriptions, all live mode and matching; identical before and after |
| Ledger | 0 clicks and 0 conversions at release: nothing is backfilled |
| Logs from promotion onwards | 0 5xx, 0 error, 0 fatal. The 4xx responses are the live probe's expected answers and this record's own checks. |
| ShowMe Math Lab | ETag unchanged |
| Deployments | The production project gained exactly one deployment |

## Findings for a follow-up (not changed here)

Both concern hosts the Google tag asks for that the v1.2.48 CSP does not list. Neither affects the server-side conversions, and widening the CSP is an owner decision.

1. **`connect-src` refuses `https://www.googleadservices.com/pagead/set_partitioned_cookie`.** The tag makes this request on a landing URL that carries `gclid`, so it happens on every ad click. The v1.2.48 measurement loaded pages without a click identifier and did not see it. Effect: a console message, and Google's own partitioned click cookie is not set. The tag's first-party `_gcl_aw` cookie and MathNexa's click cookie are unaffected.
2. **`img-src` refuses `https://www.googletagmanager.com/td`**, the tag's sampled diagnostics ping. Seen once across the homepage checks. Effect: a console message.

## Not proven by this release

- **Google Ads receiving a conversion.** The three conversion actions and the Data manager connection are created by the owner in the account, and a test click identifier is refused by Google. The first real ad click proves it.
- **A real Stripe Sandbox Checkout on hosted staging.** Staging previews carry an older Sandbox key, and no card was entered on a hosted page. The Stripe side was exercised locally with the billing rehearsal and at the database boundary on staging.
- **Physical Safari and phones.** WebKit and phone profiles were used.
- **The Google Ads account itself** was not inspected.

## Owner steps

1. Set `MVH_ADS_FEED_PASSWORD` (24 characters or more) in the production Vercel project and redeploy.
2. In Google Ads, create the conversion actions `account_created`, `trial_started` (both secondary) and `subscription_started` (primary, value per conversion), then connect the file in Data manager with the user name `mathnexa-ads-feed` and that password, daily.
3. Turn off automatic user-provided data detection on the Google tag.
4. Keep the paused ad group paused until the first import has run.

## Rollback

Not needed. If it is, from `C:/GitHub/mathnexa-v1-2-50`:

```bash
RELEASE_CERTIFIED_RUNTIME=8907692 RELEASE_ROLLBACK_DEPLOYMENT=dpl_26XMr1XGLZTQ69vSU8TrRXbsM45L HOTFIX_VERCEL_CLI='npx --yes vercel@59' node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

The migration can stay. The v1.2.49 build never reads the new tables; the confirmation trigger keeps adding `account_created` rows, which nothing reports.
