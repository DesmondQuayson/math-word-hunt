# MathNexa v1.2.25 candidate — exact 24-hour trial event and the daily reconciliation cron

**Status: on protected staging, 2026-10-18. Not merged. Not in production.** Production and merge need the
owner's personal approval. The owner approved this preparation: "prepare a v1.2.25 candidate on a new branch from
main ae9f54f with the trial-shape fix (e928ca9 only) and the reconcile-cron host fix (baa362c + a1bba53), run the
gates, and deploy to protected staging only. No production, no merge."

| | |
| --- | --- |
| Branch | `fix/v1.2.25-trial-shape-reconcile-cron` (local, not pushed) from `main` `ae9f54f` (v1.2.24 + release record) |
| Certified runtime | `ceb362b` (`ceb362b68142aed7ff2001f26e00f503c07ef441`) |
| Staging alias | `https://mathnexa-platform-staging.vercel.app` → `dpl_HEUPV8GVjq2cSUd2Ke9HQD9LUjKQ` (`mathnexa-platform-staging-m7bsarxt3`), built from `ceb362b` |
| Staging restore point | `dpl_c22kT3SLZWhNtVAsFdo1R7VSjHgN`: the automatic `main` build of `ae9f54f` that held the alias before |
| Production-origin rehearsal | `dpl_DDTg56N3ZS5NNd9MtoNFWVg8kYy7` (`mathnexa-platform-staging-4jvluuwfg`): staging project, unaliased build of `ceb362b`, deployment-scoped `MVH_APPLICATION_ORIGIN=https://mathnexa.com` |
| Production | Unchanged: `dpl_FMypQGtyH77iytSB8mVukfeANhUX` (v1.2.24, build `30de166`) |
| Migration | None. Under `supabase/`, only `tests/` changed (pgTAP 33). |
| Dependencies / environment | Unchanged. The manifests and lockfile are identical to `main`. No project environment variable was created or changed. |

## Why

**1. Every new trial parked a webhook for manual review.** The activation created the Stripe subscription with
`trial_end` set to the checkout event time + 24 h. Stripe stamps `trial_start` when it creates the subscription, 1–2
seconds later, so `customer.subscription.created` carried a trial 1–2 s short of 24 h. The synchronizer refuses
that shape by design, recording `manual_review` / `trial_shape_conflict`. The code's exact-end correction then
arrived about 1 s later as `customer.subscription.updated` and was applied.

Production holds three such rows: two from 2026-09-28 and one from 2026-10-15. The 2026-10-18 read-only
investigation found:

- **No customer impact.** All 4 Stripe subscriptions match the local projection, no event is undelivered, and no
  subscriber has paid without access. The 2026-10-15 subscriber is `active` and was charged on 2026-10-16, and their
  entitlement runs to 2026-11-16.
- The rows inflate the admin dashboard's "failed / manual review" count, and they can hide a real conflict.

**2. The daily reconciliation never runs in production.** The Vercel scheduler calls the deployment's `*.vercel.app`
host, and production normalizes that host to `https://mathnexa.com` with a 308. The scheduler does not follow
redirects, so the run ends there. Production logs show `GET /api/internal/billing/reconcile` → **308** at 06:17 UTC on
2026-10-16, 10-17 and 10-18.

The webhooks and the on-visit reconciliation are doing all the work. If a webhook were ever lost, no daily sweep
would repair it.

## Commits

Each pick is patch-identical to its source commit (`git patch-id --stable`) and applied cleanly.

| Commit | Source | Change |
| --- | --- | --- |
| `3c2753f` | `baa362c` | `/api/internal/billing/reconcile` joins `PLATFORM_HOST_REDIRECT_EXEMPT_PATHS` (with the webhook and health). Pages and every other path still 308 to the apex. The route still fails closed without the scheduler's `CRON_SECRET` bearer. |
| `7ad592d` | `a1bba53` | Tests only. The route stays closed: no bearer, wrong bearer and wrong scheme are all refused. The proxy exempts only that path. Reconciliation is read-only at Stripe. |
| `5b8f2e7` | `e928ca9` | The subscription is created with `trial_period_days: 1`, so Stripe derives `trial_end` from its own `trial_start` in the same call. The exact-end correction stays as a defensive fallback. Validation is unchanged: the database still refuses any trial that is not exactly 24 h. The fixture provider now models Stripe the same way. Adds pgTAP cases and the Stripe TEST verifier. |
| `ceb362b` | `0e1bff1` | **Added beyond the approved list, test-only (one line):** it types the subscription-create mock in the test that `e928ca9` added. Without it, `typecheck` and the production build (Next type-checks the test file) fail with TS2493. It was written 6 minutes after `e928ca9` as part of the same fix. It can be dropped if the owner prefers, but then the build fails. |

Not included: `75673fb` (the sign-up confirmation resend change on the same source branch).

The billing code that `e928ca9` touches is unchanged on `main` since it was written (`cbc7121`). The caller checks the
trial's *duration* (exactly 24 h), not a specific end instant, so Stripe's own end is accepted.

## Gates (worktree `C:/GitHub/mathnexa-v1-2-25`, clean `npm ci`, Node 24.18.0)

| Gate | Result |
| --- | --- |
| `npm ci` | clean; next 16.4.2, sharp 0.35.5, source-map-js 1.2.2 |
| `typecheck` | clean (after `ceb362b`) |
| `lint` | clean |
| `test:unit` | core 245/245; web 902 passed, 1 skipped (110 files) |
| `test:security` | 321/321; platform bundle audit passed (37 client assets, 47 core sources); Number Cross launch audit passed; Vercel bypass tests passed |
| Production build | built |
| Provider + environment suites | `consumer-stripe-provider.test.ts` and `lib/environment`: 75/75 |
| pgTAP 33, subscription lifecycle (local DB, inside `begin … rollback`) | **111/111**. It includes: an exact-shape created event is claimed and projected; trial access ends exactly 24 h after Stripe's start; 24 h − 2 s is still refused for review; a refused shape grants nothing. |
| Stripe **TEST** mode (`invoke-trial-shape-stripe-test.ps1`, `sk_test_` only) | **PASS**. The old checkout-clock request gives **86,398 s** in Stripe's own `created` event (the production defect reproduced). The duration request gives **86,400 s** in the subscription and the event, and the synchronizer would project it. Cleanup: both subscriptions canceled, test customer deleted. |

## Staging

- **`invoke-nextjs-hotfix-staging.ps1 -Stage all`: PASS** (evidence
  `%TEMP%\mathnexa-nextjs-hotfix-evidence-1792337853045.json`).
  - The deploy refused any production or live variable, and the tree was clean.
  - Gated health returned 200, with no 5xx on 19 routes.
  - The unsigned webhook got 400 `invalid-signature`, and the security headers are intact.
  - The scheduler refused an anonymous caller and a wrong bearer (401). Admin is concealed. Images and the
    optimizer answered.
  - The real browser showed no console errors. It saw 6 aborted Next.js RSC prefetches (`?_rsc=`,
    `net::ERR_ABORTED`) while navigating; v1.2.24's certification saw 1. This is the known Chromium navigation quirk
    (cancelled prefetches), and the gate tolerates it.
- **Reconcile-cron verification**: the 10-07 `verify-reconcile-cron-staging.mjs` from
  `ops/reconcile-cron-verification`, run with the sweep forced off, so no sweep ran and nothing was written. **PASS**.
  - Staging alias:
    - anonymous: 404;
    - the scheduler secret without the gate: 404;
    - through the gate, no bearer, wrong bearer and wrong scheme: 401 each.
  - Production-origin rehearsal (`dpl_DDTg56N3…`):
    - `/` → 308 to `https://mathnexa.com/`;
    - `/api/internal/billing/fixture`, `/api/internal/billing`, `/api/internal/staging-access/bootstrap` and
      `/admin` → each 308 to the apex;
    - `/api/internal/billing/reconcile` **reaches the route**: 401 `unauthorized` without and with a wrong bearer.
      Production answers 308 here today.
- Vercel attached the staging project's secondary team URL (`mathnexa-platform-staging-bright-path-ed-tech.vercel.app`,
  behind Vercel login) to the rehearsal build. The main staging alias stays on the candidate.

## Not changed / still open

- **The three parked production rows stay as they are.** The fix prevents new ones and does not touch old receipts.
  - Redelivery would do nothing: `claim_billing_webhook_event` only claims `received`/`retryable_failure`, and the
    handler acknowledges duplicate `manual_review` receipts.
  - Closing them as superseded is a separate owner decision: an audited write, or the Super Admin V2
    superseded-review rule.
- The next renewals are due 2026-10-29, 11-06 and 11-16. They run through webhooks, as today.

## Proposed production procedure (owner's word only)

1. **Read-only, before release:** preview what the first production sweep would do, using
   `reconciliation-sweep-preview.mjs` from `ops/reconcile-cron-verification` with the restricted read-only live key.
   The 10-07 preview found 1 candidate, local equal to Stripe, and bookkeeping-only writes.
2. Run `scripts/run-nextjs-hotfix-production.mjs` stages `preflight`, `deploy-preview`, `probe-preview`, `promote` and
   `probe-live`, with these environment values:
   - `RELEASE_CERTIFIED_RUNTIME=ceb362b`
   - `RELEASE_ROLLBACK_DEPLOYMENT=dpl_FMypQGtyH77iytSB8mVukfeANhUX`
   - `RELEASE_PURPOSE=v1.2.25-trial-shape-reconcile-cron`
3. **After the release:**
   - the next 06:17 UTC cron call must return **200** with a sweep summary. Check it in the Vercel logs, not by
     calling the route.
   - The next real trial's `customer.subscription.created` must be `processed`, not `manual_review`.
4. Then tag `v1.2.25` on the deployed commit and fast-forward `main`.
