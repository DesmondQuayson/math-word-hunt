# MathNexa v1.2.25 — exact 24-hour trial event and the daily reconciliation cron

Released 2026-10-18 (UTC) under explicit owner approval ("Authorized: release v1.2.25 (certified runtime ceb362b,
branch fix/v1.2.25-trial-shape-reconcile-cron) to production with the established pipeline. Rollback
dpl_FMypQGtyH77iytSB8mVukfeANhUX"). It ships two billing reliability fixes:

- **The 24-hour trial is requested as a duration** (`trial_period_days: 1`). Stripe derives `trial_end` from its own
  `trial_start`, so `customer.subscription.created` is exactly 24 h. Before this, every new trial's created event was
  1–2 s short and parked in `manual_review` / `trial_shape_conflict`.
- **The daily reconciliation cron reaches its route.** `/api/internal/billing/reconcile` is exempt from the
  `*.vercel.app` → apex 308. The Vercel scheduler calls that host and does not follow redirects, so production's
  daily sweep had never run; it ended at 308 every day.

There is no database migration, no production environment change and no dependency change. Validation is not
loosened: the database still refuses any trial that is not exactly 24 h, and the route still fails closed without
the scheduler's `CRON_SECRET` bearer. Checkout amounts, plans, games, accounts, authentication, admin and ShowMe Math
Lab are unchanged. Super Admin V2 stays paused.

The candidate review is in `docs/releases/mathnexa-v1.2.25-trial-shape-reconcile-cron-hotfix.md`.

| | |
| --- | --- |
| Version / tag | `v1.2.25` (annotated) → `6769f15` (`6769f1513afb56b44b1da1e816d9475c4cc95514`, tree `90fd6864643b7679c11b47203b8eb5a5758092f1`). This is the commit production was built from: `/api/health` reports `build` `6769f15…`. |
| Branch | `fix/v1.2.25-trial-shape-reconcile-cron` from `main` `ae9f54f` (v1.2.24 + record) |
| Certified runtime | `ceb362b`. The pipeline's runtime diff from `ceb362b` over `apps`, `packages`, `supabase` and the manifests is empty for `6769f15` and for the tip. Later commits are docs and release tooling only. |
| Staging | `dpl_HEUPV8GVjq2cSUd2Ke9HQD9LUjKQ`, certification PASS. The production-origin rehearsal `dpl_DDTg56N3ZS5NNd9MtoNFWVg8kYy7` proved the cron path reaches the route while every other path still 308s. |
| Production candidate | `dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y` (`https://mathnexa-platform-production-ge4jlxcbd-bright-path-ed-tech.vercel.app`), built from `6769f15` with `--prod --skip-domain` |
| Production runtime | `dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y`, `production-platform`, payments `live`. Promoted 2026-10-18 22:26:49–22:27:18 UTC. |
| Rollback runtime | `dpl_FMypQGtyH77iytSB8mVukfeANhUX` (v1.2.24, build `30de166`), retained and READY. `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` (v1.2.23) is also READY. |
| Main | Fast-forwarded from `ae9f54f` to the branch tip with no force, on the owner's word. The production Vercel project has no Git link, so this did not deploy production; it rebuilds the staging project from `main`. |
| Migration / environment / dependencies | None / unchanged / unchanged (the lockfile is identical to v1.2.24) |

## Commits

| Commit | Change |
| --- | --- |
| `3c2753f` (from `baa362c`) | The reconcile path joins `PLATFORM_HOST_REDIRECT_EXEMPT_PATHS`. |
| `7ad592d` (from `a1bba53`) | Tests: the route stays closed; the proxy exempts only that path; the sweep is read-only at Stripe. |
| `5b8f2e7` (from `e928ca9`) | `trial_period_days: 1`; the exact-end correction is kept as a fallback; fixture provider; pgTAP cases; Stripe TEST verifier. |
| `ceb362b` (from `0e1bff1`) | A one-line test typing fix (typecheck and `next build` need it). **The owner approved keeping it.** It is the certified runtime. |
| `7b59809`, `6769f15` | Docs: the candidate record and the owner's approval note. `6769f15` is the production build and the tag. |
| `78080eb` | Release tooling, owner-approved during the release: `probe-preview` expects the scheduler to reach the route (401 `unauthorized`, no redirect). All other paths must still 308. |
| this record | Docs only |

## Pre-release review (2026-10-18)

- **Gates** (clean `npm ci`):
  - typecheck and lint clean;
  - unit: core 245/245; web 902 passed, 1 skipped;
  - `test:security`: 321/321, plus the bundle, Number Cross launch and bypass audits;
  - the build;
  - pgTAP 33: 111/111;
  - Stripe TEST trial shape: 86,398 s with the old request, **86,400 s** with the new one, and cleaned up.
- **Read-only first-sweep preview** against production (SELECT-only database reads; Stripe GETs with the restricted
  `rk_live_` key):
  - 3 owners and 3 live subscriptions inspected;
  - **0 substantive changes and 0 access changes**. Only bookkeeping would be written: sync timestamps, source
    `reconciliation`, and an entitlement version bump;
  - the canceled subscription is excluded;
  - the sweep runs the synchronizer with source `reconciliation`, so webhook receipts are never touched.
- **Production preflight** with `RELEASE_CERTIFIED_RUNTIME=ceb362b`: PASS.

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-v1-2-25` with these values:

- `RELEASE_CERTIFIED_RUNTIME=ceb362b`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_FMypQGtyH77iytSB8mVukfeANhUX`
- `RELEASE_PURPOSE=v1.2.25-trial-shape-reconcile-cron`

Logs are in the worktree's `qa-artifacts/v1.2.25/release-*.log`. The evidence JSONs are under `%TEMP%`.

| Stage | UTC | Result | Evidence |
| --- | --- | --- | --- |
| preflight | 22:09:01–22:09:13 | PASS: the apex served `dpl_FMypQG…` = rollback | `…-preflight-1792361353643.json` |
| deploy-preview | 22:09:13–22:11:06 | PASS: `dpl_8yXvDHZc…` Ready, no domain; next 16.4.2, sharp 0.35.5 | `…-deploy-preview-1792361466384.json` |
| probe-preview | 22:11:06–22:12:38 | **FAIL**: `canonicalHost`. The check still required the scheduler path to 308; it answered 401 `unauthorized` (the intended change). Nothing was promoted. | `…-probe-preview-1792361558715.json` |
| probe-preview, after `78080eb` | 22:25:00–22:26:32 | PASS, 7/7. Health shows build `6769f15`. The webhook answers 400. Every other path 308s. The scheduler reaches the route and fails closed. No 5xx. The optimizer works. | `…-probe-preview-1792362392072.json` |
| promote | 22:26:49–22:27:18 | PASS: alias `dpl_FMypQG…` → `dpl_8yXvDHZc…` | `…-promote-1792362438767.json` |
| probe-live | 22:27:19–22:27:35 | PASS, 22/22 | `…-probe-live-1792362455999.json` |

## Post-release checks

| Check | Result |
| --- | --- |
| `/api/health` | `ready`, build `6769f1513afb56b44b1da1e816d9475c4cc95514`, `production-platform`, payments `live`; the apex `data-dpl-id` is `dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y` |
| Cron host | On `https://mathnexa-platform-production.vercel.app`, `/api/internal/billing/reconcile` answers **401 `unauthorized`** (it answered 308 before the release), while `/pricing` still 308s to `https://mathnexa.com/pricing`. Deployment-specific URLs sit behind Vercel Authentication, which Vercel cron requests bypass. |
| Image optimizer harness | 14 probes, 0 failed |
| Runtime logs for the new deployment | 5xx, error, fatal: 0, 0, 0 |
| Stripe vs DB (read-only, restricted key) | Endpoint enabled, 0 undelivered events, 4/4 subscriptions matched, 0 paid but locally denied |

## Still to verify

- **The first scheduled sweep at 2026-10-19 06:17 UTC.** The Vercel logs must show `GET
  /api/internal/billing/reconcile` → **200**, with a `RECONCILIATION_SWEEP_COMPLETED` event. The preview predicts 3
  checked, 3 synchronized, 0 repaired, 0 manual review. Check the logs; do not call the route.
- **The next real trial**: its `customer.subscription.created` receipt must be `processed`, not `manual_review`.

## Open items

- The three parked receipts (2026-09-28 ×2, 2026-10-15) stay parked. Neither fix touches existing receipts, and their
  subscriptions and entitlements are correct. Closing them as superseded is a separate owner decision.
- The rehearsal `dpl_DDTg56N3…` (staging project, behind Vercel login) holds the staging team URL. Whether to clean it
  up is the owner's call.
- Carried over:
  - the hosted-review fixture fix `82c7344` (local branch `test/fixture-clock-skew`);
  - the vault's expired Supabase management token;
  - the owner's manual acceptance checks.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-25
$env:RELEASE_CERTIFIED_RUNTIME = 'ceb362b'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_FMypQGtyH77iytSB8mVukfeANhUX'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_FMypQGtyH77iytSB8mVukfeANhUX
```

Fallback: `npx vercel@59 promote dpl_FMypQGtyH77iytSB8mVukfeANhUX --scope bright-path-ed-tech`. A rollback brings back
the cron 308 and the old trial request. Rows the sweep has written stay valid: they hold Stripe's state at the time.
