# MathNexa subscription lifecycle — owner review record (2026-09-07)

Branch `fix/subscription-renewal-entitlement-lifecycle`, cut from `main` at `097dcad`
(the v1.2.6 runtime). Staging candidate only. **Production unchanged. Not merged. Not tagged.**

The owner reproduced, as an ordinary customer: trial → first payment charged → access →
second recurring payment charged → MathNexa said **"Subscription ended"**.

## Root cause

Three defects combined. The first is architectural and explains why *any* missed renewal
becomes a false "Subscription ended"; the other two are the delivery failures that make
renewal events go missing in this deployment.

1. **Entitlement was a webhook-only projection with no reconciliation.**
   `consumer_game_entitlements.current_period_ends_at` was written only when a signed Stripe
   event was processed. The access gate compared that stored boundary to server time and
   nothing ever re-read Stripe. When a renewal's events did not land, the boundary from the
   previous cycle expired and the gate emitted `subscription-ended` for a customer whose
   renewal had been charged — permanently, because no code path could repair it.
   Evidence: `apply_consumer_billing_projection` (phase 7C) was the only writer;
   `getGameAccessView()` read the row and decided; there was no synchronize/reconcile path,
   no admin sync, no scheduled check.

2. **Webhook deliveries to any host other than the apex were failing with 308.**
   Probed live on 2026-09-07 with unsigned POSTs (rejected before any state change):

   | Host | `POST /api/billing/webhook` |
   | --- | --- |
   | `mathnexa.com` | 400 `invalid-signature` (endpoint alive, configuration valid) |
   | `www.mathnexa.com` | **308** → apex |
   | `mathnexa-platform-production.vercel.app` | **308** → apex |
   | `mathnexa-production.vercel.app` (legacy project) | **308** → apex |

   Stripe does not follow redirects; a 3xx is a failed delivery, retried for up to three
   days, then dropped. The `*.vercel.app` → apex 308 arrived with the v1.2.0 premium pass
   (2026-08-26); the legacy project became redirect-only the same week. The subscriber
   management origin is *required by configuration* to be a `.vercel.app` host, which is
   exactly the kind of "stable" host a webhook endpoint gets pointed at.

3. **Any API-version drift on the endpoint was a permanent, silent outage.** The handler
   returned 400 for every event whose `api_version` differed from the pinned SDK version.
   An endpoint (re)created with another version therefore rejected every renewal event.

Also fixed on the way, each capable of producing a false "ended": an unknown Stripe status
was coerced to `canceled`; an `active` subscription processed after its period end was
projected `subscription-expired`; `unpaid`/`incomplete`/`paused` were described as
"Subscription ended"; `invoice_state_conflict` was not in the receipt failure-class
allowlist (a constraint error turned a manual-review case into an endless retry).

**Which of the delivery failures hit the owner's account is not proven from this machine.**
The Stripe Dashboard and the production database could not be read this session (Chrome
extension not connected; no credentials on disk; Vercel env values hidden; the auto-mode
classifier denied the vault-backed live read). `scripts/invoke-consumer-billing-diagnose.ps1
-Environment live` is a READ-ONLY report the owner can run in seconds that prints the
endpoint URL/API version, undelivered events, and the per-subscriber comparison, redacted.

## Real customer read-only diagnosis

Not performed — see above. Expected shape once run:

```
STRIPE  status=active   latest invoice paid   period through <date>
LOCAL   status=active   period through <older date>   last event <older date>
ENTITLEMENT subscription-active ends <older date>  granted=false
```

## Architecture before

- Setup-mode Checkout → signed `checkout.session.completed` → server creates the
  subscription → `apply_consumer_billing_projection` (SQL) writes `billing_subscriptions`
  and `consumer_game_entitlements`.
- Every other handled event re-fetched the Stripe subscription and called the same
  projection; period boundary compared with `statement_timestamp()` inside SQL.
- Access: `getGameAccessView()` → entitlement row → `decideGameAccess` (server time).
- Account/Subscription UI: raw status + `getLatestSubscription()` ordered by `updated_at`.
- No reconciliation, no admin sync, no scheduled check, no drift detection.

## Architecture after

- **One synchronizer**: `synchronize_consumer_billing_subscription(source, …, observed_at)`
  in SQL, used by webhook (`source='webhook'`, `observed_at=event.created`), on-access
  reconciliation, admin sync, the daily sweep and the CLI (`source='reconciliation'|'admin'`,
  `observed_at=now`). `apply_consumer_billing_projection` is a thin compatibility wrapper.
- **Out-of-order / replay**: a snapshot older than the newest applied for that subscription
  is `stale_ignored`. Duplicate deliveries are acknowledged from the receipt ledger.
- **Precedence**: historical subscriptions synchronize first; a terminal snapshot never
  overrides a live subscription (`superseded_ignored`); two live subscriptions are refused
  for review. Display selection prefers the live row, then furthest period — never
  "most recently updated".
- **Self-healing gate**: a denial that exists only because a stored boundary passed
  consults Stripe (throttled per customer, 5 min, atomic DB claim, 6 s time box) before it
  is shown. If still unverified: **"We couldn't verify your subscription right now"**, not
  "Subscription ended".
- **Honest states**: `unpaid`/`incomplete`/`paused` → "Payment requires attention";
  unknown status → refused + reviewed, entitlement untouched; `active` always projected
  active (the gate does the clock).
- **Webhook**: `invoice.payment_succeeded` alias; API-version drift is a warning event, not
  a 400; structured PII-free failure/manual-review events; every customer subscription
  re-fetched per event.
- **Host redirect exemption** for `/api/billing/webhook` and `/api/health`.
- **Reconciliation surfaces**: admin "Sync with Stripe" (audited, CSRF, idempotent) plus
  paid-through / last-sync / consistency columns; daily `GET /api/internal/billing/reconcile`
  behind `CRON_SECRET` (fails closed); `npm run billing:consumer:reconcile` dry-run report
  with `--apply` (live requires `--environment=live --owner-approved`).
- **Legacy prices**: `STRIPE_LEGACY_PRICE_IDS_MATHNEXA_MONTHLY` keeps retired-price
  subscribers entitled without a new Checkout.
- Cache/session: entitlement is never in JWT claims or user metadata; pages are dynamic
  and personalized responses are `no-store`; per-request React cache only.

## Subscription state matrix

| State | Access | UI copy | Reconciliation |
| --- | --- | --- | --- |
| trialing | yes, to exact 24 h trial end | Trial active · Trial ends *date* | trial passed locally → verify with Stripe |
| active | yes, to period end | Active · Renews *date* | period passed locally → verify before any denial |
| active + cancel_at_period_end | yes, to period end | Active until period end · Cancels *date* | same |
| past_due (prior payment) | yes, inside one 7-day grace | Payment requires attention | grace passed → verify |
| past_due (no prior payment) | no | Payment requires attention | verify on access |
| unpaid / incomplete / paused | no (recoverable) | Payment requires attention | verify on access |
| canceled / incomplete_expired | no | Ended · Ended *date* | verify on access (throttled) |
| unknown Stripe status | unchanged | Status under review | refused, manual review |
| verification failed on a clock-expired record | no | We couldn't verify your subscription right now | retry next request |

## Renewal certification (deterministic, this build)

pgTAP `33_subscription_lifecycle_reconciliation.test.sql` (98 assertions) and
`e2e/phase7c/renewal-lifecycle.spec.ts` (real sign-in, Checkout, product launch):

| Stage | Stripe (fixture) status | Period end | Database status | Entitlement | Product access |
| --- | --- | --- | --- | --- | --- |
| Trial | trialing | trial end | trialing | trial-active | yes (runtime 200, MAP Prep launch) |
| Payment 1 | active | P1 | active | subscription-active P1 | yes |
| Payment 2 | active | P2 (advanced) | active P2 | subscription-active P2 | yes |
| Payment 3 (invoice first, update late) | active | P3 | active P3 | subscription-active P3 | yes |
| Payment 4 (duplicate + old replay) | active | P4 unchanged | active P4 | unchanged | yes |
| Renewal with **no webhook** | active | P5 | repaired by reconciliation | subscription-active P5 | yes |

Real Stripe test clocks were **not** run: the vault's sandbox key is expired
(`api_key_expired`). `npm run test:stripe:sandbox-lifecycle` remains the credential-gated
external rehearsal once the owner refreshes the sandbox key.

## Failure / recovery (pgTAP + e2e)

- payment failed after a prior payment → `subscription-grace-period`, grace = exactly 7 days,
  retries never extend it; payment recovered → active, evidence cleared.
- failure discovered by reconciliation without its event → grace starts at first observation.
- cancel at period end → access to the paid boundary; provider-confirmed end → "Ended",
  runtime 401 `subscription-ended`, Pricing hides Checkout.
- missing webhook → self-heal on the next request (`last_synchronization_source =
  reconciliation`), never "Subscription ended".
- duplicate webhook → idempotent (1 row, 1 entitlement, payment evidence unchanged).
- out-of-order / old replay → `stale_ignored`, period never regresses.
- old canceled + new active → new subscription wins; late old event `superseded_ignored`;
  second live subscription refused.

## Existing customer drift audit

Not run against production (no authorized read path this session). Tooling delivered:
`npm run billing:consumer:reconcile` (dry run, redacted: MATCHED / MISMATCHED (self-repairable)
/ AMBIGUOUS / REQUIRES HUMAN REVIEW) and `scripts/invoke-consumer-billing-diagnose.ps1`.

## Owner account

Real account changed: **NO**. Additional real charge: **NO**. After the production
migration and deploy, the first request from that account triggers the self-heal (or the
owner presses "Sync with Stripe"); if Stripe still reports the subscription active, access
is restored from the stored renewal — no purchase, no manual row edit.

## Security

- Webhook signature: verified over the raw body before any write; new provider-level test
  proves a forged/unsigned/altered body throws (mutation "signature disabled" caught).
- Cross-user isolation: owner mapping by `user_id ↔ stripe_customer_id`, event metadata never
  trusted for identity (mutation caught); browser roles cannot call the synchronizer or the
  throttle (pgTAP 42501).
- Client forgery: decisions recomputed from server evidence only (gate test); fixture
  control route is 404 unless the fixture provider is configured (loopback rehearsal only).
- AESM: untouched; separate cookie session, no Stripe coupling.

## Mutations (all restored, all caught)

A period_end not advancing · B invoice success not synchronizing · C old event overwriting
newer period · D cancel_at_period_end revoking immediately (SQL) · E canceled old overriding
active · F client/provider metadata trusted for identity · G signature verification
disabled · H duplicate event re-processed · I self-heal removed · J second renewal projected
expired · K cancel_at_period_end immediate in the gate · L stale live period described as
Ended · M webhook host redirect exemption removed. Results in `test-results/mutations-*.json`.

## Gates (commit `1e707ee`, 2026-09-07)

| Gate | Result |
| --- | --- |
| platform-core unit | 35 files, 245 passed |
| platform-web unit | 76 files: 547 passed, 1 skipped, 1 failed (`canonical-assets` sha256 — the documented Windows CRLF checkout artifact, untouched by this branch, green in CI) |
| pgTAP (local Supabase, all migrations from empty) | 34 files, 752 assertions, all successful (98 new in `33_subscription_lifecycle_reconciliation`) |
| Playwright phase 7C lifecycle (fixture provider, real sign-in / Checkout / launch) | 11 passed (6 new renewal-lifecycle, 5 repaired existing) |
| security suite (`test:security`) | 22 files, 278 tests + bundle audit + Number Cross audit, green |
| typecheck | clean (both workspaces) |
| lint | 0 errors, 8 pre-existing warnings (`natural-voice.js` `catch (_)`) |
| build | `Compiled successfully` |
| `npm audit --omit=dev` | 0 vulnerabilities (after fflate 0.8.3) |
| mutations | 13/13 caught (A–M above) |

## Staging

- Project: `mathnexa-platform-staging` (`prj_O61Cyx9WMjc0jljpM9erCiSXsJA0`, team `bright-path-ed-tech`).
- Deployment: **preview** `dpl_8GxnMWQbiFL2hMo5HxfDVCW4PUg3` from commit `1e707ee` —
  `https://mathnexa-platform-staging-6662og3oe-bright-path-ed-tech.vercel.app` (behind Vercel
  SSO; the owner opens it signed in to Vercel). The staging **alias** was deliberately not
  moved and the production project was not touched.
- Route certification through the protection bypass (2026-09-07 17:21 UTC): `/api/health` 200
  (`production-platform`, build `89daec9b…`); unsigned `POST /api/billing/webhook` → 400
  `invalid-signature`; `GET /api/internal/billing/reconcile` → 503 `scheduler-secret-missing`
  (fails closed, `no-store`); `POST /api/internal/billing/fixture` → 404; `/account` signed out →
  307 with `private, no-cache, no-store, max-age=0, must-revalidate`. Without the bypass every
  route answers 302 to Vercel SSO.
- **Blocked: the staging database migration.** The pipeline (`scripts/invoke-subscription-lifecycle-staging.ps1
  -Stage all -Alias`) needs the vault's Supabase access token and the Stripe sandbox key; both are
  expired (`401` / `api_key_expired`, vault dated 2026-08-02). Until the owner refreshes the vault
  (`scripts/update-phase7d-vault.ps1`) and runs that pipeline, the lifecycle behaviour on the
  hosted staging stack cannot be exercised end to end; the deterministic local certification above
  is the evidence for it. Do not point the staging alias at this build before the migration lands:
  the synchronizer RPC would be missing and every webhook would 503 (retryable).
- Stripe mode on staging remains TEST (`STRIPE_MODE=test` in the project configuration).

## Production

`mathnexa.com` unchanged (still `dpl_…2y3rqpimi`, v1.2.6). Live Stripe configuration
unchanged. Live customer rows unchanged. ShowMe / MAP Prep unchanged.

## Production repair plan

1. Apply `20260907130000_subscription_lifecycle_reconciliation.sql` to the production
   database (additive; rollback file provided). Verify `synchronize_consumer_billing_subscription`
   exists and billing row counts are unchanged.
2. Deploy this candidate to `mathnexa-platform-production`; certify health, webhook 400 on
   unsigned, `/api/billing/webhook` no longer 308s on the `.vercel.app` host.
3. Run the READ-ONLY diagnosis and the dry-run drift audit; record the mismatch list.
4. Owner approves the mutation list.
5. `npm run billing:consumer:reconcile -- --environment=live --apply --owner-approved`
   (or let the self-heal / admin "Sync with Stripe" repair each account on first contact).
6. Owner signs in with the affected customer account: Account shows Available, Subscription
   shows Active · Renews *date*, MAP Prep launches.
7. No additional charge is required at any step.
8. Set `CRON_SECRET` on the production project so the daily sweep runs; confirm the Stripe
   endpoint URL is the apex and its API version matches `2026-07-29.dahlia` (or leave it —
   drift is now tolerated and reported).


## Defects found by the certification itself (fixed in this branch)

- **Next.js request memoization defeated read-after-write.** PostgREST reads are GETs; inside one
  server render Next.js memoizes identical GETs, so the reconciliation saw `before === after` and
  the access gate re-read the stale entitlement it had just repaired. The first e2e run "passed"
  only because the assertion `toContainText("Available")` also matches "Unavailable". Fixed with an
  uncached fetch (per-call `AbortController` signal + `no-store`) on the service client and on the
  gate's client (`lib/supabase/fetch.ts`); the assertion is now exact. This would have made the
  self-heal a no-op in production.
- The phase 7C Playwright suite carried expectations from before v1.2.2 / v1.2.6 (post-sign-in
  landing, checkout status copy, pricing copy, raw canonical hash of the now-enhanced game
  document, un-stamped launch URL) and a "tampered local row" test written for a world without
  reconciliation. Repaired to the current product; the tampered-row test now also ends the trial
  at the provider and expects the honest "Subscription ended".
- `fflate` 0.8.2 → 0.8.3 (moderate advisory GHSA-px8p-9vwx-vf98, present on `main` too): the
  `npm audit --omit=dev` gate is clean again.

## Phase 2: staging activation and live diagnosis (2026-09-07, credential gate)

Automation stopped at the human authentication gate. The vault's Supabase management token,
staging service key, and Stripe sandbox key are expired (HTTP 401 on read-only probes), and the
legacy production Supabase ref no longer resolves. Vercel CLI auth, the automation bypass, the
staging gate token, and a read-only call with the live Stripe key all PASS. Nothing was deployed,
migrated, or written anywhere in this phase. The owner-run refresh and the one-command staging
pipeline are documented in `docs/subscription-lifecycle-staging-runbook.md`.

| Capability | Result |
| --- | --- |
| `VERCEL_AUTH` (CLI whoami) | PASS |
| `VERCEL_PROTECTION_BYPASS` | PASS (HTTP 200) |
| `STAGING_GATE_BOOTSTRAP_TOKEN` | PASS (HTTP 204) |
| `SUPABASE_STAGING_AUTH` (management token) | FAIL (HTTP 401, expired) |
| `SUPABASE_STAGING_AUTH` (service key) | FAIL (HTTP 401, rotated) |
| `STRIPE_TEST_MODE_AUTH` | FAIL (HTTP 401, `api_key_expired`) |
| `STRIPE_LIVE_READONLY_AUTH` | PASS (read-only balance call with the full live key; a restricted `rk_live` key is requested) |
| `SUPABASE_PRODUCTION_AUTH` | FAIL (legacy ref `ioodoktlxvvmghyvevgn` does not resolve; current ref required) |
| `STAGING_LIVE_CHARGES_POSSIBLE` | NO by construction: `consumer-config.ts` refuses live mode unless `MVH_APPLICATION_ORIGIN` is `https://mathnexa.com`, and the launcher refuses non-`sk_test_` keys |

## Hosted staging certification (2026-09-08)

Stable alias `https://mathnexa-platform-staging.vercel.app` serves deployment `dpl_5BkR1XvfQDVPVFjib6SP8CWCx7gc`
(runtime tree identical to certified commit `1e707ee`; locked staging gate; Stripe TEST mode).

| Gate | Result |
| --- | --- |
| Staging migration `20260907130000` | applied to project `gcmuhzxkwvfireyrearl` (mathnexa-platform-staging, ACTIVE_HEALTHY); functions, 5 columns, event alias, failure classes, `sync-billing`, RLS verified; billing row counts unchanged |
| Remote pgTAP on staging | Files=34, Tests=752, all pass |
| Stripe TEST webhook endpoint | host `mathnexa-platform-staging.vercel.app/api/billing/webhook`, enabled, API `2026-07-29.dahlia`, 7/7 required events, unsigned POST → 400 `invalid-signature`, no redirect |
| Hosted lifecycle (test clock) | trial → payments 1–4 → self-heal → drift audit dry run + controlled apply → signed out-of-order (`stale_ignored`) + duplicate (idempotent) → failed renewal (7-day grace, non-extending) → recovery → cancel at period end → genuine expiry → old canceled + new active (`superseded_ignored` on late old event) |
| SECOND SUCCESSFUL RECURRING RENEWAL | ENTITLED (payments 2, 3 and 4 all retain access) |
| Missed-webhook self-heal | first `/account` view: claim 04:13:10.826, row repaired 04:13:11.548 (source `reconciliation`), same render decided Available |
| Scheduler route | 401 without / with wrong bearer; 200 aggregates with the staging-only `CRON_SECRET` |
| Drift audit (read-only) | 0 persistent staging subscribers after cleanup; MATCHED / MISMATCHED / APPLY paths proven in-harness on the synthetic subscription |
| Admin `sync-billing` | 404 to unauthenticated callers with and without foreign Origin (fails closed) |
| Local gates | typecheck 0 errors; lint 0 errors (8 warnings); build OK; core 245/245; web 547 passed + 1 skipped + 1 pre-existing CRLF artifact (`canonical-assets.test.ts`); security 278/278 + bundle and launch audits; e2e 11/11; mutations 13/13 caught; npm audit 0 |

Harness realism notes: the API-created trial mirrors the Checkout activation's trial-redemption claim (frozen clock at the
claim instant); the staging Vercel project's Stripe TEST keys must be refreshed (`-Stage staging-env`) after a sandbox key
rotation; the locked gate hides every route but the webhook without its cookie, so the scheduler cannot reach the
reconcile route on the locked alias (production has no gate).

## Production read-only diagnosis (2026-09-08, restricted live key, no writes)

| Evidence | Value |
| --- | --- |
| Live webhook endpoint | `…waa9FJ`, enabled, host `mathnexa-platform-production.vercel.app/api/billing/webhook`, API `2026-07-29.dahlia` (= pinned SDK), 7/7 events |
| Live probe of that URL (unsigned POST) | HTTP 308 → `https://mathnexa.com/api/billing/webhook`; `www.` host also 308; apex answers 400 `invalid-signature` (handler alive) |
| Stripe events, last 45 days | 16; the two renewal events of 2026-09-06 (`customer.subscription.updated` 22:18:34Z, `invoice.paid` 23:18:52Z) still carry `pending_webhooks=1` (never acknowledged) |
| Owner subscription (`…BhAsSa`, owner `04f1391b…`) | created 2026-08-05, trial to 2026-08-06, cycle invoices paid $5.99 on 2026-08-06 and 2026-09-06, Stripe `active` through 2026-10-06T22:17:50Z, no cancel |
| Local projection | `active`, period end 2026-09-06T22:17:50Z, last authoritative event 2026-08-06; entitlement `subscription-active` ends 2026-09-06 → denied since then ("Subscription ended") |
| Local receipts | 7, all 2026-08-05/06 (processed/ignored); nothing received for the 2026-09-06 renewal |
| Drift audit (live, dry run) | TOTAL 1, MATCHED 0, MISMATCHED 1, SELF-REPAIRABLE 1, AMBIGUOUS 0, HUMAN REVIEW 0; schema predates migration `20260907130000`, apply unavailable |

**Proven root cause: B → A.** The renewal events were sent to a host that answers 308 (Stripe does not follow
redirects), so payment 2 never reached the webhook-only projection, which then expired on the previous period end.
C (API-version rejection) did not occur: the endpoint pins the SDK version and no production receipt was ever
rejected; the renewal events never arrived at all. Payment 1 (2026-08-06) was processed because the `vercel.app`
host still served the webhook before the canonical-host redirect shipped on 2026-08-26.

**Repair preview (no write):** synchronize `…BhAsSa` from Stripe → local `active`, period end 2026-10-06T22:17:50Z,
latest invoice paid 2026-09-06; entitlement `subscription-active` through 2026-10-06 → access YES. No charge, no refund,
no new checkout. Requires the production migration and deployment first (the synchronizer RPC does not exist in
production yet); on the deployed fix the customer's first page view self-heals the row even without the CLI.
