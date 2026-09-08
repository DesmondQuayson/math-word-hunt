# Subscription lifecycle: staging activation and live diagnosis runbook

Companion to `docs/subscription-lifecycle.md` (design) and
`docs/subscription-lifecycle-owner-review.md` (evidence). This runbook is the
operator sequence for activating the lifecycle candidate on **staging only**
and then running the **read-only** production diagnosis. Nothing here deploys
production, migrates production, changes live Stripe configuration, or writes to
a customer account.

## 0. Boundaries

| Action | Allowed here |
| --- | --- |
| Staging Supabase migration `20260907130000` | yes (with preflight + rollback file present) |
| Staging Vercel deploy / alias move | yes (`mathnexa-platform-staging` only) |
| Stripe **test-mode** webhook endpoint event fix / create | yes |
| Stripe **live** configuration change | **no** |
| Production migration, deploy, reconciliation apply, account repair | **no** |
| Refund, cancellation, new charge on any real customer | **no** |

The pipeline refuses to run if a live Stripe key, a `*_LIVE_*` / `*_PRODUCTION_*`
variable, or the legacy production project ref is present in its environment.

## 1. Credentials (owner, foreground PowerShell window)

Credentials live only in the DPAPI-encrypted vault
`%USERPROFILE%\.mathnexa-secrets\phase7d-credentials.clixml`. Never paste a
secret into chat, a commit, `.env`, or a ticket.

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\invoke-subscription-lifecycle-credential-refresh.ps1
```

Prompts (masked; Enter keeps the current value). Each value is format-checked and
then verified with a **read-only** call before it is stored:

| Prompt | Where it comes from | Used for |
| --- | --- | --- |
| Supabase personal access token `sbp_…` | supabase.com/dashboard/account/tokens | staging link, `db push`, remote pgTAP, management queries |
| Staging Supabase secret key | project `gcmuhzxkwvfireyrearl` → Settings → API keys | lifecycle DB reads, synthetic rehearsal account, drift audit |
| Staging Supabase publishable key (optional) | same page | capability report only |
| Staging DB password (optional) | only if reset since 2026-08-02 | `db push` / `test db --linked` |
| Stripe **sandbox** secret key `sk_test_…` | Stripe → TEST mode → Developers → API keys | test clocks, webhook endpoint check, drift audit |
| Stripe sandbox publishable key `pk_test_…` (optional) | same page | not used by the pipeline |
| Stripe **live restricted** key `rk_live_…` (optional, recommended) | Stripe → LIVE → Developers → API keys → Create restricted key with **read** on Customers, Subscriptions, Invoices, Events, Webhook Endpoints | read-only production diagnosis |
| Production Supabase project ref (optional) | production project dashboard URL (`https://supabase.com/dashboard/project/<ref>`) | read-only production diagnosis; the legacy ref `ioodoktlxvvmghyvevgn` no longer resolves |
| Production Supabase secret key (optional) | production project → Settings → API keys | read-only production diagnosis |

Then verify by capability only:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\check-credential-capabilities.ps1 -IncludeLive
```

Expected: `SUPABASE_STAGING_MANAGEMENT_TOKEN = PASS`, `SUPABASE_STAGING_SERVICE_KEY = PASS`,
`STRIPE_TEST_MODE_AUTH = PASS … livemode=False`, `STRIPE_SANDBOX_PRICE = PASS … unit_amount=599 usd interval=month`,
`VERCEL_PROTECTION_BYPASS = PASS`, `STAGING_GATE_BOOTSTRAP_TOKEN = PASS`, and with `-IncludeLive`
`STRIPE_LIVE_READONLY_AUTH = PASS`, `SUPABASE_PRODUCTION_SERVICE_KEY = PASS`.

## 2. Staging pipeline (one command per stage, or `-Stage all`)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\invoke-subscription-lifecycle-staging.ps1 -Stage all -Alias
```

Stages, in order, each printing redacted JSON evidence and a final `EVIDENCE_FILE` path:

1. `migrate`: confirms the token sees the staging project (name/region/status), records the
   migration versions before/after, pushes with `--include-all`, verifies the synchronizer, throttle,
   wrapper and admin operation functions, the five new columns, the event alias and failure-class
   constraints, the `sync-billing` admin allowlist, RLS on every billing table, runs the remote pgTAP
   suite once, and proves billing row counts are unchanged. Refuses if `20260907130000` is already
   recorded (pass `--allow-reapply` deliberately).
2. `webhook-config`: proves the key is test mode (`STAGING_LIVE_CHARGES_POSSIBLE = NO`), verifies the
   sandbox product/price/portal contract, lists every webhook endpoint (host, path, API version, enabled
   events vs required), adds missing required events on the staging endpoint, re-enables it if disabled,
   and probes the configured URL (must answer `400 invalid-signature`, never a redirect). With no staging
   endpoint it stops unless `-AllowEndpointCreate` is passed; creation stores the new signing secret in the
   vault and in the staging Vercel project.
3. `staging-env`: re-proves the vault's Stripe key is TEST mode, then writes `STRIPE_SECRET_KEY` and
   `STRIPE_PUBLISHABLE_KEY` to the staging Vercel project. Needed whenever the sandbox key is rotated: the
   hosted webhook otherwise records every event as `retryable_failure (provider_unavailable)` because its
   authoritative Stripe read fails. A redeploy must follow.
4. `cron-secret`: generates a staging-only scheduler secret, stores it as `CRON_SECRET` on the staging Vercel
   project (production target of that project only) and as `CRON_SECRET_STAGING` in the vault. Never copies
   a production value.
5. `deploy`: refuses unless the runtime tree (`apps`, `packages`, `supabase`, lockfiles) is identical to the
   certified candidate commit `1e707ee`, deploys, waits for health (through the staging gate on the alias),
   and with `-Alias` promotes the stable alias and verifies the alias serves the new deployment id.
6. `certify`: unsigned webhook 400 with no redirect, locked gate 404/0 bytes without the cookie, then through
   the gate cookie: health 200, scheduler 401 (fails closed), fixture route 404, no-store personalized pages.
   The locked staging gate exempts only the Stripe webhook path, so Vercel's scheduler cannot reach the
   reconcile route on the locked alias; the `sweep` stage proves the route contract through the gate
   cookie instead. Production has no such gate.
7. `lifecycle` (pass `-LogFile <path>` to follow `STEP`/`ROW` lines live): Stripe test clock against the hosted staging product with a synthetic
   `@example.invalid` account (all objects tagged `rehearsal_id`, removed at the end):
   trial → payment 1 → renewals 2, 3, 4 → stale local projection repaired by the access gate on first view →
   drift audit dry run (MATCHED) → controlled `--apply --owner=<synthetic>` repair → signed out-of-order
   (`stale_ignored`) and duplicate replays when the staging webhook secret is available → failed renewal with
   7-day non-extending grace → recovery → cancel at period end → genuine expiration → old canceled + new
   active. Every step records `STRIPE_STATUS`, `STRIPE_PERIOD_END`, `LOCAL_STATUS`, `LOCAL_PERIOD_END`,
   `ENTITLEMENT`, `ACCOUNT_UI`, `SUBSCRIPTION_UI`, `PRICING_CTA`, `GAME_ACCESS`, `MAP_PREP_ACCESS`,
   `SUBSCRIPTION_ENDED_MESSAGE`.
8. `sweep`: scheduler route fails closed without/with wrong bearer (401) and returns aggregates with the
   staging secret.
9. `reconcile-dry-run`: read-only drift audit of every staging subscriber.

Admin "Sync with Stripe" needs an AAL2 admin session and is verified manually by the owner on the
staging alias (Admin → Accounts → Sync with Stripe); unit tests cover the handler.

## 3. Read-only production diagnosis (only after staging is green)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts\invoke-consumer-billing-diagnose.ps1 -Environment live -Hours 720
```

Uses the restricted read-only Stripe key and the production Supabase secret key for reads only. Output is
redacted (last six characters of provider ids, no emails). It reports webhook endpoint hosts/API
versions/redirect probes, recent failed receipts, per-subscriber Stripe-vs-local comparison, and the
repair preview. It never writes.

Root-cause determination for the owner's account uses three questions, each answered from evidence:

* **A. stale projection**: does Stripe show the renewal invoice paid and the period advanced while the local row
  still carries the previous period end? Then no webhook for that renewal was recorded (`billing_webhook_events`
  has no `invoice.paid` / `customer.subscription.updated` receipt for that invoice id).
* **B. redirecting host**: is the live webhook endpoint URL on `www.` or a `*.vercel.app` host that answers
  `308` to the unsigned probe? Then Stripe's deliveries were redirected and the signed body never reached the
  handler (Stripe does not follow redirects).
* **C. API-version 400**: does the endpoint's `api_version` differ from `2026-07-29.dahlia` and do receipts show
  `api-version-mismatch`?

The diagnosis prints all three; the cause that matches the receipts and the endpoint report is the one to
name. Production repair remains owner-gated.
