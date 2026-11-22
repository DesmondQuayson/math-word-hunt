# MathNexa v1.2.64 — growth and analytics: Super Admin revenue reporting, checkout counts, feed images

Released 2026-11-22 (UTC) under explicit owner approval ("promote v1.2.64 to Production but make sure you dont
destroy anything we built"), after the owner's brief "PREPARE v1.2.64 GROWTH & ANALYTICS UPDATE" was checked on
staging previews. Staging and production were built from the same commit.

The work was finished on 22 November on `feature/acquisition-completion` (commits `aaf8781`, `6fc0c8c`, `a672605`
on the older main `d2a4de8`) and held back from v1.2.61–v1.2.63. It was carried onto current main (`4be94d5`,
v1.2.63) on a fresh branch by cherry-pick, with no conflicts: no file it touches was changed by v1.2.61–v1.2.63.

What changed (`4e5dd49`):
- **Super Admin → Subscriber funnel.** New counts: successful renewals (paid monthly charges after the first),
  refunds Stripe completed for MathNexa customers (read-only `refunds.list`; shown as "Not recorded" when Stripe
  cannot be read) and net revenue (revenue collected minus refunds, before Stripe fees). A new "At a glance" table
  shows today, the last 7 days, this month and lifetime side by side, using the same counting rules as the period
  view (US Central days). Read only; no database change.
- **Analytics.** When both subscription agreements are ticked and secure checkout is requested, the consent form
  hands Vercel Web Analytics one event, `trial_checkout_submitted` or `paid_checkout_submitted`, carrying only the
  visit's first page and source class. It is inert while `MVH_WEB_ANALYTICS` is unset (production: unset, so
  nothing is sent), never throws and never delays the request. The Privacy Notice paragraph that appears only when
  analytics is on, and the funnel's source note, mention it.
- **Proof that email never blocks access (test only).** The phase 7C capture stub answers 503 for
  `email-failure-*` recipients; the new spec shows the trial still activates, the entitlement is trial-active, the
  game opens at once, the email is attempted exactly once and an exact webhook replay sends nothing.
- **Feed images (repository assets).** The seven prepared Facebook and Instagram feed images, their review sheet
  and `captions.md` are kept in `owner-review/feed-images-2026-11-22/` (byte copies of the local owner-review
  package, SHA-256 checked) with a README. They sit outside `apps/platform-web/public`, so the site never serves
  them, and nothing was posted, uploaded or scheduled anywhere.

These areas are unchanged: the three signed-out homepage buttons, Create account (no plan card, short line under
the button), Start free trial (plan card), trial eligibility (`consumer_accounts.trial_redeemed_at`) and
second-trial prevention, the free-trial email (no Refunds section) and the paid-subscription email, the refund
policy, pricing ($5.99/month), the 24-hour trial, the payment-method requirement, Checkout, the webhook,
entitlements, cancellation, the email sending path and its switch (still on), Authorize Code, billing records,
every migration and table, production environment variables, Web Analytics (still off), Stripe account settings
(including customer emails), Google Ads (campaigns, budgets, ads, Performance Max, conversion actions, assets) and
the Google tag.

| | |
| --- | --- |
| Version | `v1.2.64`. Production was built from `4e5dd49` (`4e5dd493d9cee8f5468bf7d4e1d81328203b06f3`). `/api/health` reports build `4e5dd49…`, payments `live`. |
| Tag | Annotated tag `v1.2.64` points at `4e5dd49`, the production build. Created and pushed after live verification. |
| Branch | `release/v1.2.64-growth-analytics` from `main` `4be94d5` (v1.2.63): `f054940`, `91e6535`, `43f8483` (the three held-back commits), `4e5dd49` (feed images), then this record. |
| Merge | `main` was still `4be94d5`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `4e5dd49`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging A (analytics off, as production) | `https://mathnexa-platform-staging-75snz98gf-bright-path-ed-tech.vercel.app` (`dpl_2ePZkoLuB4zVecZ6v11UgaSiSqps`), built from `4e5dd49`. |
| Staging B (analytics on, script unavailable) | `https://mathnexa-platform-staging-9s65ftwgl-bright-path-ed-tech.vercel.app` (`dpl_CRX134ZMSwG1hYrC1ctA1LAarRL9`), built from `4e5dd49` with `MVH_WEB_ANALYTICS=enabled` while Web Analytics stays disabled for the staging project. |
| Production candidate | `dpl_6pZRv6Qx9vRdDk1w7iSeuRZ4Kbq4` (`https://mathnexa-platform-production-4udhxvwfd-bright-path-ed-tech.vercel.app`), built from `4e5dd49` with `--prod --skip-domain`. |
| Production runtime | `dpl_6pZRv6Qx9vRdDk1w7iSeuRZ4Kbq4`, promoted 2026-11-22 20:43 UTC. |
| Rollback runtime | `dpl_BTgLdkQu6F9x8GFd2qfS1Dj2Jy7E` (v1.2.63, build `f4ec113`), retained and Ready: `npx vercel@59 promote dpl_BTgLdkQu6F9x8GFd2qfS1Dj2Jy7E --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5, @vercel/analytics 2.0.1, stripe 22.4.0). |

An extra staging preview, `mathnexa-platform-staging-pku3r1toy`, was created by an operator error (a mistyped
revision; the staging folder's previous checkout, `f4ec113`, was uploaded). It was not used for any check. The
staging deploy script now refuses an unknown revision.

## Release gates (local, same worktree, each suite run once)

- Unit: platform-core 245/245; platform-web 1,939 + 1 skipped.
- Typecheck, lint (0 errors), build; security baseline 401/401 and 47 Node tests; platform bundle, Number Cross,
  billing and phase 8H audits pass.
- Browser (local Supabase, fixture billing, email capture stub): phase 8H 1/1 (Super Admin sign-in with an
  authenticator; the funnel shows Successful renewals, Refunds, Net revenue and the "At a glance" table with Today,
  Last 7 days, This month and Lifetime), phase 9 35/35 (homepage states, account pages, responsive and
  accessibility checks), phase 7B 10/10 (account creation and email confirmation), phase 7C 17/17 (trial and paid
  Checkout, confirmation emails, the new email-failure proof), ads conversions 64/64, school access 24/24.
- Email: the free-trial and paid-subscription emails rendered from `4e5dd49` are byte-identical to the v1.2.63
  renders. The free-trial email keeps the exact trial start and end, the 24-hour length, $5.99 USD a month,
  automatic renewal, how to cancel, and the Terms, Privacy and Support links; it has no Refunds heading, no
  seven-day paragraph and no "Refunds are not automatic or guaranteed".

## Revenue figures checked against Stripe and the database

Read-only (database SELECTs, Stripe GET list calls). The branch's own counting code was run on production records
exactly as the page's loader builds them, and every cell was recomputed independently from the raw Stripe invoice
and refund objects and database rows (code that does not import the application's rules). All 40 cells matched,
before and after promotion (20:12 and 20:47 UTC). Owner and test accounts are left out, as on the page.

| Count | Today | Last 7 days | This month | Lifetime |
| --- | --- | --- | --- | --- |
| Accounts created | 0 | 3 | 16 | 52 |
| Genuine first payments | 0 | 0 | 2 | 5 |
| Successful renewals | 0 | 1 | 2 | 5 |
| Revenue collected | $0.00 | $5.99 | $23.96 | $59.90 |
| Refunds | $0.00 | $0.00 | $0.00 | $0.00 |
| Net revenue | $0.00 | $5.99 | $23.96 | $59.90 |
| Subscriptions canceled | 0 | 1 | 1 | 2 |

Stripe held 20 live invoices for MathNexa customers (10 above $0, all paid) and 0 refunds. The page computes these
figures from current records at each view; nothing is hard-coded. The two Stripe calls the page makes
(`invoices.list` and `refunds.list` with `expand: ["data.charge"]`) were made with the app's own SDK (22.4.0) and
pinned API version (`2026-07-29.dahlia`) in test and live mode and both succeeded.

## Staging

- Staging A (analytics off): homepage buttons and both sign-up presentations 80/80 at desktop, tablet, phone and
  320 px (Create account has no plan card and the short line under its button; Start free trial keeps its plan
  card); "Continue to" checks 32/32; analytics-off flows 22/22 (nine public pages on desktop and phone, the three
  homepage buttons, the Create account form sends its request, a synthetic account signs in, and Start free trial
  sends the checkout request, with no analytics call); the feed images are not served (15 candidate paths, all 404).
- Staging B (analytics on): with the analytics script unavailable (404), 22/22; with a working stand-in for the
  analytics script, 23/23, and analytics received exactly one `trial_checkout_submitted` with only `landing` and
  `source`. The sign-up and checkout requests were intercepted before reaching the server, so no account, email or
  Stripe object was created; each synthetic account was deleted.
- Super Admin is switched off on staging previews (`/admin` answers "This feature has not launched"), so the page
  itself was checked in the local Super Admin suite and its figures on production records (above).

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=4e5dd49,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_BTgLdkQu6F9x8GFd2qfS1Dj2Jy7E, RELEASE_PURPOSE=v1.2.64-growth-analytics):
  preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after
  22/22.
- Live, signed out, nothing submitted: homepage buttons and both sign-up presentations 80/80; "Continue to" checks
  32/32; page check 14/14; `/api/health` build `4e5dd49`, payments live; 0 responses with 5xx and 0 error-level
  log entries after promotion; Web Analytics still not mounted (no analytics requests); Google Ads conversion file
  200 with the same 2 rows; live records unchanged (6 subscriptions: 5 active, 1 canceled; 6 entitlements; 16
  consent acceptances; 10 Checkout bindings; 3 conversion events; 53 accounts; 1 admin); `/admin` 404 to an
  anonymous visitor and `/admin/sign-in` 200; Authorize Code form live; ShowMe still answers 401; the feed images
  are not served.

## Known limits

- **A misbehaving analytics script could break page changes once analytics is switched on.** On staging B, an
  analytics stand-in whose every call throws made the page after sign-in show "This page couldn't load": Vercel's
  analytics component reports each client-side page change without catching errors. A full page load works, and
  the new checkout event catches its own errors. This comes from the analytics component added in v1.2.59 and is
  not reachable in production, where analytics is off and the component is not rendered. Add a guard before
  switching Web Analytics on.
- The Super Admin page reads refunds with the production runtime's Stripe key. If that key may not read refunds,
  the page shows Refunds and Net revenue as "Not recorded" rather than a wrong number.
- The owner's own look at Super Admin → Subscriber funnel is the remaining check on the live page.
