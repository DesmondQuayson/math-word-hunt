# MathNexa v1.2.39 — truthful System Health

Released 2026-11-07 (UTC) under explicit owner approval ("GO. I approve … Release v1.2.39 to production using the
certified artifact, full release gates, live verification, release tag and rollback plan" and "Rotate the STAGING-ONLY
Vercel bypass secret using the reviewed rotation script"), after the decision record
`mathnexa-v1.2.39-system-health-candidate.md` and the investigation `mathnexa-v1.2.39-history-email-monitoring.md`.

**What changed.** The Super Admin System Health panel reports verified state instead of all-time counters: every row
is derived from evidence (last checked / last success / last failure, reason, freshness, action); Application
aggregates named child states; Email counts provider failures only (provider pacing is `unavailable`, not a failure)
and reports confirmations against sign-ups since the last confirmed delivery; Webhooks counts open reviews and stuck
receipts only, with same-environment supersession; a new Subscription sync row; PDF quarantine split into awaiting a
decision / replaced / historical. The sign-up confirmation resend countdown starts at sign-up. Staging harnesses
confine the Vercel protection-bypass secret (rotation tool included); the System Health diagnosis gained email-link,
sending-domain and provider-access evidence. No billing, webhook, entitlement, game, homepage, MAP Prep or
PDF-delivery change.

| | |
| --- | --- |
| Version | `v1.2.39`. Production built from `428514b`; its runtime (`apps`, `packages`, `supabase`, manifests) is identical to the staging-certified `7ed3d2d` — every later commit is tests, scripts or docs. `/api/health` reports `428514b`. |
| Certified runtime | `7ed3d2d` (staging alias certify PASS and subscription lifecycle 11/11 with signed replays). |
| Tag | Annotated `v1.2.39` (object `2ff8d0e`) → `428514b`, pushed after live verification. |
| Branch | `fix/v1.2.39-system-health-truthfulness`, cut from the production source `093f5a6` (v1.2.38): 16 commits `d65156d..428514b`, listed in the decision record. Not pushed as a branch; reachable from the tag and from `main`. Runtime files changed against v1.2.38: 18, all under `apps/platform-web` (admin System Health, auth confirmation dialog and resend cooldown). |
| Merge | origin `main` `39bd8c4` → merge commit `e0b5149` ("Merge branch 'fix/v1.2.39-system-health-truthfulness' for v1.2.39"), then this record. `main` held two commits the branch lacked (`5abdf08` Bingo QA ties, scripts; `39bd8c4` v1.2.38 record, docs), so this follows the v1.2.27 precedent (`fec7762`) instead of a fast-forward. No conflict, no force. The merge tree's runtime is identical to `7ed3d2d`; the one file both sides changed (`scripts/qa-math-bingo-live-production.mjs`) keeps the v1.2.38 tie check and the bypass confinement (protection-bypass suite 47/47 on the merge). |
| Release worktree | `C:/GitHub/mathnexa-v1-2-39`, detached at `428514b`, `node_modules` junction. Keep it for the rollback commands. |
| Production runtime | `dpl_3ozmqjmDboK1fYShWL7BQUe5zPca` (`https://mathnexa-platform-production-51fp9d9s2-bright-path-ed-tech.vercel.app`), created 21:29:12Z, promoted 21:32:56Z. |
| Rollback runtime | `dpl_BrcgEH24X3AaoFqdteCqdaXfF38o` (v1.2.38, build `093f5a6`), retained. |
| Database | No migration: production history 44, latest `20261108110000`, unchanged. |
| Environment / dependencies | Unchanged / unchanged (only the deployment-scoped `MVH_SOURCE_REVISION` stamp every release carries). |

## Gates

Run on `e95e8e1`; `428514b` adds two docs files only (`git diff e95e8e1 428514b`). Typecheck clean; lint 0 errors;
unit core 245, web 1,260 passed / 1 skipped; pgTAP 41 files / 1,349 tests; `test:security` 326 + bundle and Number
Cross audits + protection-bypass suite 47; production build 72 pages; local e2e: Super Admin 8C 1/1, 8A 5/5, 8H 1/1,
authentication and email confirmation/resend 7B 10/10 Chromium + 10/10 WebKit, billing 7C 11/11, Authorize Code 21/21,
Quiz PDFs 20/20, Homework PDF workflow 8D 1/1, product pages incl. `/worksheets` (phase 9) 30/30, production-public 7/7,
game suite 6/6, Math Bingo Live Chromium 9/9 and WebKit join-emoji 1/1 + Fraction 2/2 (run alone; see the decision
record for the RAM-bound combined WebKit run). Staging: hotfix deploy + certify, lifecycle 11/11 with signed replays,
Math Bingo Live review 42/42, Quiz PDFs review 277/277.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=7ed3d2d`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_BrcgEH24X3AaoFqdteCqdaXfF38o`,
`RELEASE_PURPOSE=v1.2.39-system-health`, Vercel CLI 65.12.1. Logs: `docs/releases/evidence/mathnexa-v1.2.39/`
(`preflight.txt` was captured through PowerShell, which prints node's stderr deprecation warning as a
`NativeCommandError` record; the stage exited 0 with `PASS preflight`).

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 21:28:36–21:28:45 | PASS. Apex served `dpl_BrcgEH24…` (the rollback target), health 200, both webhook hosts 400 `invalid-signature`; runtime equal to `7ed3d2d`, tree clean, Next 16.4.2, sharp 0.35.5. |
| deploy-preview | 21:28:59–21:30:55 | PASS. `dpl_3ozmqjmD…` Ready, candidate commit `428514b` / tree `bf5926b`, not aliased, protected. |
| probe-preview | 21:31:17–21:32:17 | PASS, 7/7 (health `ready` with build `428514b` and payments `live`, unsigned webhook 400, canonical host 308s, scheduler 401 fail-closed, image optimizer, remote image refused). |
| promote | 21:32:33–21:32:56 | PASS. `dpl_BrcgEH24…` → `dpl_3ozmqjmD…`. |
| probe-live | 21:33:05–21:33:19 | PASS, 22/22 (apex HTML names `dpl_3ozmqjmD…`; webhook hosts; health; `www` and browser-host redirects; public pages; product surfaces and private pages redirect with `no-store`; admin 404; scheduler and fixture closed; game runtime and forged access denied; Tug sign-in; security headers; images; optimizer refusals; no 5xx). |
| subscriber-readonly | 21:33:29–21:33:30 | PASS. 5/5 live-mode subscriptions match Stripe (3 active, 1 trialing, 1 canceled); entitlements unchanged by the release (latest update 15:51:40Z). Read-only: restricted Stripe key and GET requests. |

## Live verification

| Check | Result |
| --- | --- |
| `/api/health` | `{"status":"ready","environment":"production-platform","build":"428514b9292cb5750c7cecbf854268fe37c4be8d","searchIndexing":"enabled","payments":"live"}` |
| System Health on live production (21:35:32Z; the deployed evaluator read-only against production data) | Application HEALTHY ("Core services verified"); Email HEALTHY ("Email delivery verified: last confirmed Nov 7, 2026"; details: 15 sign-ups in 30 days, 4 not confirmed); Webhooks HEALTHY (last processed 15:51Z, none awaiting review or retry; 3 historical reviews listed); Subscription sync HEALTHY (4 of 4 live subscriptions re-read within 72 h); Private storage HEALTHY; Game package validation NO PACKAGES; PDF quarantine 10 (3 awaiting a decision, 0 replaced, 7 historical; none blocks a published resource); ZIP quarantine 0; Settings webhook queue open 0 / historical 3. Same verdicts as the pre-release evaluation at 17:44Z. File: `panel-production-after-release.json`. |
| Production evidence behind it (diagnosis 21:33:46Z) | 0 webhook receipts pending, 0 expired leases, last processed 15:51:40Z; Stripe endpoint enabled, 0 undelivered events in 30 days; migrations 44; no runtime error signals; Supabase management and Resend logs still unreadable with the vault's keys (owner action below). |
| Request and runtime logs since promotion (21:32:30–21:36:22Z) | 41 requests, all served by `dpl_3ozmqjmD…`; HTTP 5xx 0; runtime `error` 0 and `fatal` 0; `webhook-processing-failed`, `webhook-manual-review`, `entitlement-mismatch-unresolved`, `security-config-error`, `security-dependency-unavailable`, `rate-limiter-unavailable` 0. Positive control: the same window's ≥ 400 filter returns the pipeline's own 8 probes. File: `post-release-logs.json`. |
| Untouched | ShowMe / MAP Prep production still `dpl_E3BrVrNoRmmQmtrxEHC4tXbe5DFF` (Nov 3); staging alias still `dpl_DhJ68gHj…` (`7ed3d2d`) until the `main` push rebuilds staging. No production database write, environment change, Stripe change, quarantine release or customer email. |
| Not verifiable without the owner | The panel page itself behind the admin sign-in (the owner's credentials), and a real sign-up's resend countdown on production (would create an account and send email). Both are covered by the local e2e above (8C/8A/8H, 7B Chromium + WebKit). |

## Staging protection-bypass rotation (staging project only)

| Step | UTC | Result |
| --- | --- | --- |
| Plan (read-only) | during deploy-preview | Staging project `prj_O61Cyx9WMjc0jljpM9erCiSXsJA0` / team `team_qhdZ6TvnEA6BYjjfAiwJBAp9`; 1 automation-bypass entry; the vault value is that entry and the deployment env-var entry. |
| Apply (`scripts/rotate-staging-protection-bypass.ps1 -Apply -VerifyOrigin <preview>`) | 21:38:18–21:38:36 | Old secret revoked, Vercel generated a new one (the env-var entry), stored in the DPAPI vault through `update-phase7d-vault.ps1`; the Vercel-protected preview `dpl_9FZf7H4w…` accepts the new secret and refuses the revoked one. Output: `rotation-apply.txt`. |
| Plan again | 21:38–21:39 | 1 entry; the vault value is that entry and the env-var entry. Output: `rotation-plan-after.txt`. |
| Lifecycle certify on the staging alias | 21:40:00–21:40:04 | PASS: gate bootstrap 204 with cookie, health `ready` (`7ed3d2d`), webhook 400, scheduler 401, fixture 404. |
| Math Bingo Live review on the protected preview | 21:39:35–21:43:32 | 48/48 with the vault's new secret (`scripts/invoke-math-bingo-live-staging.ps1 -Stage review`, preview `dpl_9FZf7H4w…`, build `9d4b9a7`): Chromium host, WebKit and Chromium students, Bingos at calls 15, 26, 36, synthetic account and room deleted. The earlier run counted 42 because the review checks every correct tap and this game's path had six more (Zion won first). Output: `bingo-review-after-rotation.txt`. |
| Secret scan | after the runs | 0 occurrences of the new secret (plain or URL-encoded) in 80 files: every rotation, pipeline and harness log, the evidence JSON files, the 7 review screenshots, the 1,042 staging request records Vercel kept for 21:38–21:44 (paths and query strings; no 2,000-record chunk limit hit), and this session's own transcript. Only counts were printed. |

Production has no bypass secret and was not involved. Not changed: production payment secrets, customer data,
subscriptions, quarantined PDFs.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-39
$env:RELEASE_CERTIFIED_RUNTIME = '7ed3d2d'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_BrcgEH24X3AaoFqdteCqdaXfF38o'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_BrcgEH24X3AaoFqdteCqdaXfF38o
```

- **App only.** Nothing to undo in data: no migration, no environment change; the only rows v1.2.39 writes (paced
  resends as outcome `unavailable`) use an outcome v1.2.38's schema already accepts. After a rollback the panel shows
  v1.2.38's all-time counters (the misleading amber states) again.
- **Staging bypass:** the revoked secret cannot be restored (by design). If the vault and the project ever disagree,
  `scripts/rotate-staging-protection-bypass.ps1 -Resync` stores the project's current secret; rotate again with
  `-Apply` at any time.

## Open owner actions (none blocks this release)

1. Read the Resend email log (and domain status) and the Supabase Auth log for the three unconfirmed sign-ups of
   10-22 20:34, 10-27 00:22 and 11-07 14:04 UTC, or store a fresh `SUPABASE_ACCESS_TOKEN` in the vault so the
   diagnosis reads them itself.
2. Add a DMARC record for `mathnexa.com` (`p=none` with aggregate reports to the owner mailbox).
3. Decide on the 3 quarantined uploads attached to non-archived resources.
4. Optional: resend confirmation to the three unconfirmed sign-ups from Super Admin (sends customer email).
5. Decide on the monitoring proposals P1 (daily digest email) and P2 (record sign-up send failures).
6. Optional cleanup: the staging previews `dpl_9FZf7H4w…` (`7imw2qco8`, Math Bingo Live owner-review flag) and
   `h393tb6vb` (Quiz PDFs review), and the local branch/worktree `mathnexa-system-health`.
