# MathNexa v1.2.39 candidate — truthful System Health

Branch `fix/v1.2.39-system-health-truthfulness` (local, not pushed), cut from the production source `093f5a6` (v1.2.38,
`dpl_BrcgEH24X3AaoFqdteCqdaXfF38o`). Staging only. Nothing in production was written, replayed, released or
reconfigured. The read-only diagnosis is `docs/releases/mathnexa-v1.2.39-system-health-diagnosis.md`.

## Commits

| Commit | Change |
|---|---|
| `d65156d` | Read-only production diagnosis tooling (cherry-pick of `a4b9a76`): SELECT-only database reads, retrieve/list-only Stripe calls with the restricted key, redacted output. |
| `d893cbb` | Phase 1 diagnosis report. |
| `d2b01c3` | Truthful System Health model (cherry-pick of `187ddc7`): per-row state from evidence, last checked / success / failure, reason, freshness and action; Application aggregated from named child states; new Subscription sync row; quarantine informational. |
| `95f6355` | Resend countdown starts at sign-up; provider pacing recorded as `unavailable`, never as a failure (cherry-pick of `75673fb`). |
| `d20eb43` | Rules aligned with the evidence and the Super Admin V2 contract: same-environment supersession for manual reviews only; stopped (lease ended) and never-claimed (5 min) receipts; Email names unconfirmed sign-ups since the last confirmed delivery; PDF quarantine split into awaiting / replaced / historical; Analytics and Settings read the same evidence (`lib/admin/system-health-evidence.ts`). |
| `7ed3d2d` | Test only: phase 7B asserts the "Access status" region renamed by `6837607`. |
| `0119847` | Tooling only: the staging lifecycle harness reads the renamed account "Access" row. |

Runtime scope: the admin System Health panel and its Analytics/Settings evidence, and the sign-up confirmation resend
countdown. No migration, environment variable, billing, webhook, entitlement, game, homepage, MAP Prep or PDF-delivery
code changed.

## Results by system

| System | Original status | Verified root cause | Fix implemented | Test evidence | Status with the fix (live production evidence, read-only) |
|---|---|---|---|---|---|
| Application | DEGRADED | Not an application check: it mirrored the all-time webhook manual-review count (3 superseded rows). 0 HTTP 5xx and 0 runtime errors in 7 days. | Aggregates named child states; superseded reviews and neutral rows never lower it. | Unit tests; local before/after review (Chromium, WebKit) | ATTENTION — "Core services are up; needs attention: Email." |
| Email | ATTENTION | Trigger: two throttled resends (7 s and 10 s after sign-up) counted forever. Separately, no sign-up has confirmed since 2026-10-15 (3 unconfirmed, each accepted by the SMTP provider); provider delivery logs UNKNOWN. | Failures = outcome `failure` only; pacing recorded as `unavailable`; countdown starts at sign-up; the row names unconfirmed sign-ups since the last confirmed delivery. | Unit tests; phase 7B 10/10 Chromium and 10/10 WebKit | ATTENTION — "3 sign-ups since the last confirmed delivery (Oct 15) have not confirmed … Delivery to inboxes is unverified." (genuine, owner check) |
| Webhooks | ATTENTION | Three `trial_shape_conflict` reviews (09-28, 09-28, 10-15) overtaken 1–2 s later by processed updates; the obsolete `failed` state; retryable/stuck receipts never counted. Stripe: 0 undelivered events in 30 days. | Same-environment supersession; open states only; lease-ended and never-claimed receipts counted. | Unit tests; staging lifecycle 11/11 with signed replays; staging certify | HEALTHY — last processed 2026-11-06 23:19 UTC; 3 reviews listed as historical |
| Subscription sync | (new row) | The daily reconciliation was broken until v1.2.25 (308); now 200 daily at 06:17 UTC. | New row: every live subscription re-read within 72 h. | Unit tests; production log evidence | HEALTHY — 3 of 3 live subscriptions re-read within 72 h |
| Private storage | HEALTHY | Correct: the four required private buckets exist. | Unchanged rule, now with evidence fields. | Unit tests | HEALTHY |
| Game package validation | NO PACKAGES | Correct: 0 packages; all games ship with the platform. | Shown as neutral. | Unit tests | NO PACKAGES |
| PDF quarantine | 10 | Legitimate structural-policy quarantines from August (embedded JavaScript, automatic actions, bad thumbnail dimensions); none linked to a published resource; 0 downloads. | Split into awaiting a decision / replaced / historical; informational. | Unit tests; local review | 10 — 3 awaiting a decision, 7 historical; none blocks a published resource |
| ZIP quarantine | 0 | Correct: 0 package quarantine events. | Unchanged. | Unit tests | 0 |

## Gates

- Typecheck clean; lint 0 errors (8 existing warnings in `public/game-suite/natural-voice.js`).
- Unit: core 245/245; web 1,260 passed, 1 skipped (v1.2.38: 1,200 + 1).
- pgTAP: 41 files, 1,349 tests (same as v1.2.38).
- `test:security` 326; `test:security:deep` 250, `npm audit` 0 vulnerabilities; 25/25 security audits.
- Production build: pass, 72 pages.
- Local e2e: 8C 1/1, 8A 5/5, 8H 1/1, 7B 10/10 (Chromium) and 10/10 (WebKit), 7C 11/11, school access 21/21
  (Chromium, WebKit, Pixel 7), Quiz PDFs 20/20, production-public 7/7, game suite 6/6.
- System Health review on a production-shaped local seed: before 2/2 (Chromium, WebKit) reproduces the production
  panel exactly; after 2/2 (Chromium, WebKit), no horizontal scroll at 390 px.

## Staging

| Item | Result |
|---|---|
| Staging alias | `https://mathnexa-platform-staging.vercel.app` → `dpl_DhJ68gHjTXa6mRU7ViNtqLiBY1Cy` (commit `7ed3d2d`, Next 16.4.2), behind the app's staging gate |
| Staging preview | `https://mathnexa-platform-staging-h393tb6vb-bright-path-ed-tech.vercel.app` (commit `0119847`, same runtime), behind Vercel login |
| Hotfix deploy + certify | PASS: routes, headers, unsigned webhook 400, scheduler fails closed, admin concealed, images, browser console clean |
| Subscription lifecycle certify | PASS |
| Subscription lifecycle (Stripe test clocks) | 11/11 steps: trial, four renewals, missed-webhook self-heal, failed payment with grace and recovery, cancel at period end, genuine expiration (access denied), new subscription; signed replays: out-of-order event `stale_ignored`, duplicate processed once; entitlement unchanged by both |
| Quiz PDFs | database verification: every quiz ok; browser review 277/277 (Chromium); with WebKit added 314 ok, 24 flagged: every flagged check is the WebKit preview page holding three sessionStorage keys written by Vercel's preview toolbar (`vc-dt-src`, `vc-mfe-session-cleared`, `__vtkb-hide-key`), not by the app (no app code writes web storage; production deployments carry no toolbar); every page drew and fitted |
| Math Bingo Live review | 4/6: the preview has no staging owner-preview setting, so `/join` is 404 (configuration, not code; this branch changes no Bingo code) |
| System Health on staging evidence | Webhooks ATTENTION: 33 manual reviews ("customer ownership did not match" / "no owner") created by lifecycle-harness cleanups since September; processing itself succeeds (last today). |

## Remaining risks

1. Email deliverability since 2026-10-15 is unverified: the application cannot read the provider's delivery log.
2. The staging Vercel protection-bypass secret went into a URL query (Math Bingo Live review harness) and into
   context-wide browser headers (subscription lifecycle harness) during this run. Both are v1.2.38 harness behaviour,
   fixed on the unmerged branch `fix/staging-scripts-confined-bypass`. Staging only; no production secret was used.
3. Staging's webhook ledger carries 33 unresolved reviews from harness cleanups, so the staging panel stays on attention.
4. The fix uses the same rules as Super Admin V2 subsystem G; V2 replaces these files when it is rebased.
5. The staging quiz review counts Vercel's preview-toolbar sessionStorage keys in WebKit as app storage; the harness
   should ignore the toolbar's keys (or the toolbar should honour the skip header) before WebKit is a release gate.
6. The trial-shape fix (v1.2.25) is proven on staging (a new trial's `customer.subscription.created` processed) but no
   production trial has started since 2026-10-15.

## Owner actions

1. Check the email provider's delivery log and the Supabase Auth logs for the confirmation emails of 2026-10-22,
   2026-10-27 and 2026-11-07 (delivered, bounced, missing), and the sending domain's verification.
2. Rotate the staging Vercel protection-bypass secret and adopt `fix/staging-scripts-confined-bypass`.
3. Optional: refresh the vault's Supabase management token so Auth logs can be read by the diagnosis tooling.
4. Approve or decline the production release of this candidate.
