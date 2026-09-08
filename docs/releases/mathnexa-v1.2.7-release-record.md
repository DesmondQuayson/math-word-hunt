# MathNexa v1.2.7 — Subscription Lifecycle Reliability

| | |
|---|---|
| Tag | `v1.2.7` (annotated, bare platform namespace) |
| Frozen application source | `1e707eeb05c0d47d459586f5cbab7e16d13d2a13` |
| Production deployment | `dpl_DRmcCTJvzQ8ey84gG6tRo4Vs3C3c` — `https://mathnexa.com` |
| Immediate rollback | `dpl_8LhZm4s8jJDvKnLgpxJPPqYVNopQ` (pre-repair application) |
| Also retained | `dpl_HqhxWgMDjbubZaR3NfXceiXsWhCe` (same runtime, before the production scheduler secret) |
| Prior frozen release | `v1.2.6` → `04dda341ba1bd57310fd5cb6c72523ba216e479a` (unchanged) |
| Database migration | `20260907130000_subscription_lifecycle_reconciliation.sql`, applied to production (32 → 33) |
| Migration rollback | `supabase/rollback/subscription_lifecycle_reconciliation.sql`, retained, not used |
| Scope | Consumer subscription billing: entitlement projection, webhook handling, reconciliation, the access gate, and the customer-facing subscription copy. No change to Math Vocabulary Hunt, the other games, school access, admin security, the staging gate, or ShowMe / MAP Prep. |

This record is documentation only and lives outside the tag. The application
runtime on `main` after consolidation is identical to `1e707ee`.

## The incident

A real subscriber paid, and the product told them their subscription had ended.

| | |
|---|---|
| Trial | 2026-08-05, converted 2026-08-06 |
| Renewal charged | 2026-09-06, $5.99, invoice paid |
| Stripe subscription | `active`, paid through 2026-10-06T22:17:50Z |
| MathNexa local state | paid through 2026-09-06T22:17:50Z, stale |
| Customer experience | access denied, "Subscription ended" |

## Proven root cause

The live Stripe webhook endpoint was configured on the production Vercel
hostname, `mathnexa-platform-production.vercel.app/api/billing/webhook`. The
application's canonical-host middleware answered that host with **HTTP 308** to
the apex. Stripe does not follow redirects, so the renewal events of 2026-09-06
were never delivered: they still carried `pending_webhooks = 1` days later, and
the last local webhook receipt was dated 2026-08-06.

Entitlement was then a **webhook-only projection**. With no event, the stored
paid-through boundary stayed at the previous cycle, the server clock passed it,
and the access gate revoked a paying customer with no path to recovery.

The 308 was application-level, not platform-level: the redirect response carried
the application's own Content-Security-Policy and security headers and no
`x-matched-path`. An API-version mismatch was ruled out: the endpoint pinned the
same version as the runtime and no receipt was ever rejected for it.

## The fix

* **One canonical synchronizer.** `synchronize_consumer_billing_subscription`
  is the single writer of subscription and entitlement state, taking the source
  (`webhook` | `reconciliation` | `admin`) and an authoritative observation
  timestamp. `apply_consumer_billing_projection` remains as a thin wrapper.
* **Renewal-safe period advancement.** A successful renewal advances
  `current_period_end` on the existing row for the 1st, 2nd and 50th cycle
  alike; the projection never compares stored boundaries to wall-clock time.
* **Webhook host exemption.** `/api/billing/webhook` and `/api/health` are
  exempt from canonical-host normalization, so a machine endpoint answers at
  whatever host it was configured with. Browsers still converge on the apex.
* **Idempotent events.** A duplicate delivery is acknowledged without repeating
  the projection.
* **Stale and out-of-order protection.** A snapshot older than the row's latest
  authoritative event returns `stale_ignored`; the period can never regress.
* **Multiple-subscription precedence.** A terminal snapshot arriving while a
  different current subscription exists returns `superseded_ignored`; a second
  live subscription is flagged for manual review rather than guessed at.
* **On-access self-healing.** A denial that exists only because the clock passed
  a stored boundary consults the provider before it is shown, bounded by a
  6-second timeout and a 300-second per-customer throttle.
* **Read-after-write correctness.** Next.js memoizes identical GET requests
  within one render, so a repaired row was re-read stale. Server-side Supabase
  reads now use an uncached fetch, and the gate re-reads through it.
* **Daily reconciliation.** A scheduled sweep re-reads subscriptions whose
  boundary is near, passed, or unconfirmed, behind a `CRON_SECRET` bearer that
  fails closed.
* **Admin "Sync with Stripe".** An authenticated admin operation that
  resynchronizes one account, with the existing AAL2, CSRF and audit contract.
* **Honest unverifiable state.** When the provider cannot be reached, the
  customer is told the subscription could not be verified right now, never that
  it ended. "Ended" is reserved for a provider-confirmed end.
* **Server-authoritative entitlement.** Access is decided from verified account
  and entitlement data with server time; no client value can grant it.

### Subscription state matrix

| Provider state | Local projection | Access |
|---|---|---|
| `trialing` (exact 24h) | `trial-active` | yes, to trial end |
| `active` | `subscription-active` | yes, to period end |
| `active` + `cancel_at_period_end` | `subscription-canceled-through-period-end` | yes, through the paid period |
| `past_due` within grace | `subscription-grace-period` | yes, to grace end |
| `past_due` beyond grace, `unpaid`, `incomplete`, `paused` | `subscription-past-due` | no |
| `canceled`, `incomplete_expired` | `subscription-expired` | no |
| unknown status | raises, flagged for review | last verified state |

Payment failure opens a 7-day grace window measured from the provider's own
failure timestamp. Retries do not extend it. Recovery restores access
automatically with no manual step.

## Production evidence (redacted)

| | |
|---|---|
| Stripe renewal paid | 2026-09-06 |
| Stripe period | through 2026-10-06 |
| Local before | through 2026-09-06 |
| Local after | through 2026-10-06 |
| Customer repairs applied | 1 |
| Unrelated customer repairs | 0 |
| Additional charge | NO |
| Webhook before | 308 redirect |
| Webhook after | 400 `invalid-signature` for an unsigned request |
| Stripe endpoint configuration | unchanged; signing secret not rotated |

The repair resynchronized the local projection from Stripe. It created no
subscription, issued no charge, no refund and no cancellation, and preserved the
billing history (first paid 2026-08-05, last paid 2026-09-06).

## Certification

Hosted staging ran the full lifecycle on a Stripe test clock against the
deployed product: trial, first charge, renewals 2, 3 and 4 each keeping access,
a missed renewal webhook repaired on the first page view, a failed renewal into
grace and back, cancellation through the paid period, genuine expiry removing
access, and a replacement subscription winning over an old canceled one.
Duplicate deliveries were idempotent and an out-of-order snapshot returned
`stale_ignored`.

Thirteen deliberate mutations of the fix were all caught by the permanent
tests, including "renewal no longer advances the period", "second renewal
projected as expired", "stale-snapshot rejection removed", "self-healing
removed from the access gate", and "webhook host redirect exemption removed".

## Operational notes

* `MVH_BUILD_ID` is a static project variable, so `/api/health` reports the same
  build string across deployments. Identify a deployment with `vercel inspect`.
* `www.mathnexa.com` redirects at the Vercel domain level, which no application
  change affects; no Stripe endpoint is configured there.
* Deployment-specific URLs on the production project are behind Vercel SSO and
  the project has no automation bypass secret, so a staged deployment is
  promoted and probed immediately with an automatic alias rollback rather than
  probed beforehand.
* The production Supabase project is not visible to the personal access token
  and its direct host is IPv6-only; migrations run over the IPv4 session pooler.
* Two Stripe events from 2026-09-06 may still show `pending_webhooks = 1`. If
  they are redelivered, the stale-snapshot guard ignores them and the repaired
  period cannot regress. They must not be replayed manually to tidy a dashboard.
