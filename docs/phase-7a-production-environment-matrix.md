# Phase 7A Production environment matrix

Status: approved architecture. Existing Preview and public-only Production
remain unchanged during Phase 7A and Phase 7B repository work.

## Isolation topology

| Environment | Hosting | Account/data | Stripe | Game access |
| --- | --- | --- | --- | --- |
| Local | local Next.js | local Supabase, synthetic general accounts only | fixture/test | local entitlement rehearsal |
| Protected Preview | existing protected Preview | existing isolated Preview; no Production reuse | disabled/test-only history | unchanged |
| Public-only Production | current project at `mathnexa.com` | none | disabled | current public link until controlled cutover |
| Production rehearsal | new protected Production-platform project | new Production Supabase, synthetic minimal accounts | test mode | authenticated entitlement gateway |
| Full Production | verified Production-platform project | Production Supabase minimal accounts | live, one monthly price | valid 24-hour trial or active subscription only |

Preview and Production use different hosting projects, Supabase projects, keys,
users, Stripe objects, endpoint secrets, sender configuration, logs, and
operator evidence. No Preview value may be copied to Production.

## Runtime contract

- Preserve `local`, `preview`, and `production-public`.
- Add `production-platform`.
- Use a server-only activation state: `rehearsal`, `ready`, or `live`.
- Missing, malformed, mixed, or browser-controlled state denies.
- Rehearsal requires HTTPS, Production project identity, Stripe test mode,
  synthetic accounts, forbidden fixtures, no indexing, and protected access.
- Live requires exact `https://mathnexa.com`, Stripe live mode, verified
  transactional email, forbidden fixtures, approved deletion/support policy,
  tested game-asset gating, and owner activation.

## Environment variables

| Variable | Rehearsal | Full Production | Exposure |
| --- | --- | --- | --- |
| `MVH_APP_ENVIRONMENT` | `production-platform` | `production-platform` | server |
| `MVH_COMMERCIAL_ACTIVATION` | `rehearsal` | `live` after approval | server |
| `MVH_APPLICATION_ORIGIN` | exact protected HTTPS | `https://mathnexa.com` | server |
| `MVH_SUPABASE_PROJECT_REF` | Production ref | same Production ref | server, non-secret |
| `NEXT_PUBLIC_SUPABASE_URL` | Production URL | Production URL | browser connectivity |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Production key | Production key | browser connectivity |
| `SUPABASE_URL` | Production URL | Production URL | server |
| `SUPABASE_SECRET_KEY` | Production secret | Production secret | server secret |
| `APP_BASE_URL` | exact rehearsal origin | `https://mathnexa.com` | server |
| `MVH_EMAIL_DELIVERY` | configured/verified | `transactional-verified` | server |
| `MVH_FIXTURE_POLICY` | `forbidden` | `forbidden` | server |
| `MVH_PILOT_STATE` | inactive | inactive | server |
| `MVH_INVITATIONS_ENABLED` | false | false | server |
| `BILLING_ENABLED` | gated true | gated true | server |
| `BILLING_ENVIRONMENT` | production-rehearsal | production | server |
| `STRIPE_MODE` | test | live | server |
| `STRIPE_SECRET_KEY` | test secret | live secret | server secret |
| `STRIPE_WEBHOOK_SECRET` | rehearsal endpoint | live endpoint | server secret |
| `STRIPE_PRODUCT_GAME_ACCESS` | test Product | live Product | server |
| `STRIPE_PRICE_GAME_MONTHLY` | test `$5.99 USD` monthly Price | live `$5.99 USD` monthly Price | server |
| `STRIPE_PORTAL_CONFIGURATION_ID` | test Portal | live Portal | server |
| `BILLING_APP_BASE_URL` | rehearsal origin | `https://mathnexa.com` | server |
| `BILLING_CHECKOUT_ENABLED` | gated | enabled last | server |
| `BILLING_PORTAL_ENABLED` | gated | enabled before Checkout | server |
| `BILLING_WEBHOOK_ENABLED` | enabled first | enabled first | server |
| `BILLING_ENTITLEMENT_DEFAULT_DENY` | true until verified | false only after approval | server |
| `BILLING_LIVE_ACTIVATION` | absent | exact owner approval marker | server |
| `MVH_BUILD_ID` | release commit | release commit | public-safe |

There is no annual Price variable and no browser plan/entitlement variable.
Stripe publishable configuration is used only if an approved Stripe browser
component requires it; Checkout itself is created server-side and hosted by
Stripe. Supabase SMTP credentials remain in Production Auth provider settings.

## Fail-closed requirements

Reject:

- Preview project references or keys in Production;
- test/live key, Product, Price, Customer, Subscription, or webhook mismatch;
- any Price not exactly USD 599 recurring monthly for the approved Product;
- live activation without verified email, billing reconciliation, deletion and
  support readiness, or authenticated game-asset gating;
- a second trial for an account with trial history;
- browser-provided account status, trial timestamps, plan, Price, Customer,
  Subscription, entitlement, or activation state;
- public access to canonical HTML, vocabulary, or dependent game assets in
  full Production;
- any Production form, schema, log, or API that accepts prohibited educational
  or progress data.

## Rollback topology

Build the subscription platform in a new Vercel project. Preserve the current
provider-free project unchanged. A launch rollback moves `mathnexa.com` back to
the public-only project and blocks the failed platform host while billing and
deletion obligations are resolved. Preview is never used as rollback.
