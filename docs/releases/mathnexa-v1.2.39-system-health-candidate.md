# MathNexa v1.2.39 candidate — truthful System Health

Branch `fix/v1.2.39-system-health-truthfulness` (local, not pushed), cut from the production source `093f5a6` (v1.2.38,
`dpl_BrcgEH24X3AaoFqdteCqdaXfF38o`). Staging only: nothing in production was written, replayed, resent, released or
reconfigured. Companion records: `mathnexa-v1.2.39-system-health-diagnosis.md` (first read-only diagnosis) and
`mathnexa-v1.2.39-history-email-monitoring.md` (incident timeline, email delivery investigation, monitoring review).

## Decision

**GO, on the owner's explicit approval.** No blocking issue. No migration, no environment variable, no billing,
webhook, entitlement, game, homepage, MAP Prep or PDF-delivery change. The panel changes are independently safe and do
not wait on the email investigation: every row is now derived from evidence, and the Email row's verdict rests on a
confirmed delivery (2026-11-07 15:47 UTC), with the three earlier unconfirmed sign-ups listed in its details.

## Commits (on `093f5a6`)

| Commit | Change |
|---|---|
| `d65156d` | Read-only production diagnosis tooling (cherry-pick of `a4b9a76`). |
| `d893cbb` | First diagnosis record. |
| `d2b01c3` | Truthful System Health model (cherry-pick of `187ddc7`): per-row state from evidence; last checked / success / failure, reason, freshness, action; Application from named child states; Subscription sync row. |
| `95f6355` | Resend countdown starts at sign-up; provider pacing recorded as `unavailable`, never as failure (cherry-pick of `75673fb`). |
| `d20eb43` | Rules aligned with the evidence and Super Admin V2: same-environment supersession for manual reviews only; lease-ended and never-claimed receipts; unconfirmed sign-ups since the last confirmed delivery; quarantine awaiting / replaced / historical; one shared evidence loader. |
| `7ed3d2d` | Test: phase 7B asserts the "Access status" region renamed by `6837607`. |
| `0119847` | Tooling: lifecycle harness reads the renamed account "Access" row. |
| `77b293b` | First candidate record. |
| `07e7037`, `18802ca`, `2dffd78` | Cherry-picks of `fix/staging-scripts-confined-bypass` (`7533217`, `f5585c0`, `3820458`): Tug review, hosted runners, admin probe and lifecycle harness confine the staging bypass secret. |
| `18895f6` | The harnesses written after that fix (Math Bingo Live review, load test and QA; Tug 3D review) and the phase 5/6B configs confined too; Phase 7D requests never follow redirects; a failed bootstrap no longer prints the secret (Playwright's call log lists request headers); repository-wide guard test. |
| `9d4b9a7` | Plan-first rotation tool for the staging bypass secret (read-only plan verified; `-Apply` awaits approval). |
| `93c14d0` | `install()` hands an app-level gate (the staging alias, which Standard Protection does not cover) to `unlock()`; proven by the hosted lifecycle. |
| `e95e8e1` | Diagnosis gains the sign-up link timeline, sending-domain DNS and provider-access checks; new Vercel request/runtime-log companion. |

Runtime scope (unchanged since `0119847`; `git diff 7ed3d2d HEAD -- apps packages supabase package.json
package-lock.json turbo.json tsconfig.json` is empty): the admin System Health panel and its Analytics/Settings
evidence, and the sign-up confirmation resend countdown. Every commit after `7ed3d2d` is tests, scripts or docs.

## Results by system

Status with the fix is the candidate's evaluator run read-only on live production data at 2026-11-07 17:44 UTC.

| System | Original status | Verified root cause | Fix implemented | Test evidence | Status with the fix |
|---|---|---|---|---|---|
| Application | DEGRADED | Not an application check: mirrored the all-time webhook manual-review count. 0 HTTP 5xx and 0 runtime errors in 7 days. | Aggregates named child states; neutral and historical rows never lower it. | Unit tests; local before/after (Chromium, WebKit) | HEALTHY — "Core services verified" |
| Email | ATTENTION | Two provider-refused resends inside the 60-second limit (10-04, 10-22), counted forever. Separately, 3 sign-ups after 10-15 never opened their link (provider log unreadable). | Failure = outcome `failure` only; pacing = `unavailable`; countdown from sign-up; row reports confirmations vs sign-ups since the last confirmed delivery. | Unit tests; phase 7B 10/10 Chromium + 10/10 WebKit (local mail capture) | HEALTHY — "Email delivery verified: last confirmed Nov 7, 2026" (details: 15 sign-ups in 30 days, 4 not confirmed) |
| Webhooks | ATTENTION | Three `trial_shape_conflict` reviews (09-28, 09-28, 10-15) overtaken 1–2 s later; obsolete `failed` state counted; stuck receipts never counted. | Same-environment supersession; open states only; lease-ended and never-claimed receipts counted. | Unit tests; staging lifecycle 11/11 with signed replays (twice) | HEALTHY — last processed 11-07 15:51; 3 reviews listed as historical |
| Subscription sync | (new row) | Reconcile cron answered 308 until v1.2.25; 200 daily since 10-19. | New row: every live subscription re-read within 72 h. | Unit tests; runtime logs 7/7 sweeps | HEALTHY — 4 of 4 live subscriptions re-read within 72 h |
| Private storage | HEALTHY | Correct. | Same rule, with evidence fields. | Unit tests | HEALTHY |
| Game package validation | NO PACKAGES | Correct: every game ships with the platform. | Shown as neutral. | Unit tests | NO PACKAGES |
| PDF quarantine | 10 | Legitimate August structural-policy quarantines; none published; 0 downloads. | Split into awaiting a decision / replaced / historical; informational. | Unit tests; local review | 10 — 3 awaiting a decision, 7 historical; none blocks a published resource |
| ZIP quarantine | 0 | Correct. | Unchanged. | Unit tests | 0 |

Today's production evidence also closes an older risk: the 15:46 sign-up confirmed in 20 s, checked out at 15:51, and
`customer.subscription.created` for its 24-hour trial was **processed** (no `trial_shape_conflict`) — the first
production trial since the v1.2.25 fix.

## Email delivery

No outage and no application defect: links are generated, the provider accepts them, the callback works, and a
confirmation was delivered and clicked today. The three sign-ups of 10-22, 10-27 and 11-07 14:04 were accepted by the
provider but never opened (no verify, no callback request at all within 24 hours); two of those people pressed resend
or tried to sign in, so mailbox-level delivery for them is **UNKNOWN** until the provider log is read. Sending-domain
DNS is in place (Resend DKIM; SPF and bounce MX on `send.auth.mathnexa.com`); DMARC is missing (recommended, not
required at this volume). Details and evidence: the history record.

## Staging secret handling

| Requirement | Status | Evidence |
|---|---|---|
| Never in URLs or query parameters | Met | Repository-wide guard (scripts, e2e, Playwright configs): 0 offenders; the four harnesses that did it are converted |
| Never in screenshots or logs | Met | Helper rethrows a failed bootstrap without the header-listing call log (reproduced, fixed, tested); hosted Bingo review and lifecycle logs, evidence file and screenshots scanned: 0 occurrences |
| Never forwarded to unrelated origins | Met | One redirect-free request to the trusted origin; then Vercel's host-only cookie; no context-wide headers; direct requests never follow redirects (guarded) |
| Not exposed to client-side JavaScript | Met | On the protected preview the only bypass material is `_vercel_jwt`: host-only, HttpOnly, Secure; page script sees no cookie; the secret is not in the page |
| Only approved, scoped mechanisms | Met | `scripts/vercel-protection-bypass.mjs` for every consumer; PowerShell probes refuse redirects |
| Rotation | Prepared, **awaiting approval** | `scripts/rotate-staging-protection-bypass.ps1` plan (read-only): staging project and team confirmed, one automation-bypass entry, equal to the vault and to the deployment env-var entry. `-Apply` revokes it, has Vercel generate a new one, stores it in the vault, verifies on a preview |

Rotation is recommended because the pre-fix harnesses sent the staging secret in URL queries and to third-party origins
during staging runs since v1.2.21, including this investigation's first Bingo run. Staging only; production deployments
have no bypass and no production secret was involved.

## Gates

- Typecheck clean; lint 0 errors (8 existing warnings in `public/game-suite/natural-voice.js`).
- Unit: core 245; web 1,260 passed, 1 skipped. pgTAP: 41 files, 1,349 tests.
- Security: vitest 326; bundle and Number Cross audits; protection-bypass suite 47 (incl. the repository-wide guard);
  `test:security:deep` 250 with `npm audit` 0 vulnerabilities; 25/25 security audits. Phase 7D contract 22.
- Production build: 72 pages.
- Local e2e: Super Admin 8C 1/1, 8A 5/5, 8H 1/1; authentication and email confirmation/resend 7B 10/10 Chromium +
  10/10 WebKit; billing 7C 11/11; Authorize Code 21/21 (Chromium, WebKit, Pixel 7); Quiz PDFs 20/20; Homework PDF
  workflow 8D 1/1; product pages incl. `/worksheets` (phase 9) 30/30; production-public 7/7; game suite 6/6. System
  Health review before 2/2 and after 2/2 (Chromium, WebKit).
- Local Math Bingo Live (dev server): Chromium 9/9; WebKit join-emoji 1/1 and Fraction Bingo 2/2 (re-run alone). In the
  combined run, WebKit ran about 8 times slower than Chromium with 1.7 GB of 14 GB RAM free and two specs hit their
  10-minute timeout with no assertion failing; the run was stopped there and the remaining WebKit/device specs were
  not repeated. The Bingo code is byte-identical to production v1.2.38 (suite recorded 19/19 there), and the hosted
  staging review below played the full paced game in WebKit.
- Staging: hotfix deploy + certify PASS; lifecycle certify PASS; subscription lifecycle 11/11 with signed replays
  (out-of-order `stale_ignored`, duplicate processed once, entitlement unchanged) — run again at 17:46 with the confined
  harness; Math Bingo Live review 42/42 (Chromium host, WebKit and Chromium students) on a preview with the
  per-deployment owner-review flag; Quiz PDFs review 277/277 in Chromium (WebKit's 24 flags are Vercel preview-toolbar
  storage keys, not the app).
- Worksheet Generator: lives in MAP Prep (ShowMe), unchanged by this candidate; the platform's `/worksheets` entry
  pages are covered by phase 9.

## Staging identity

| Deployment | Commit | Notes |
|---|---|---|
| Alias `https://mathnexa-platform-staging.vercel.app` → `dpl_DhJ68gHjTXa6mRU7ViNtqLiBY1Cy` | `7ed3d2d` | Staging-certified runtime (behind the app's staging gate) |
| Preview `https://mathnexa-platform-staging-7imw2qco8-bright-path-ed-tech.vercel.app` → `dpl_9FZf7H4wqApk9BTK8CBrh5qVK3dZ` | `9d4b9a7` | Same runtime; Math Bingo Live owner-review flag; behind Vercel login |
| Preview `https://mathnexa-platform-staging-h393tb6vb-bright-path-ed-tech.vercel.app` | `0119847` | Same runtime; Quiz PDFs review |

## Production release (on approval) and rollback

The existing pipeline (`scripts/run-nextjs-hotfix-production.mjs`) accepts a branch tip that differs from the
staging-certified runtime only in docs and scripts:

```bash
RELEASE_CERTIFIED_RUNTIME=7ed3d2d RELEASE_ROLLBACK_DEPLOYMENT=dpl_BrcgEH24X3AaoFqdteCqdaXfF38o RELEASE_PURPOSE=v1.2.39-system-health node scripts/run-nextjs-hotfix-production.mjs --stage=preflight
```

Then `deploy-preview`, `probe-preview`, `promote`, `probe-live`, and the read-only subscriber check. **Rollback:**
`--stage=rollback` moves `mathnexa.com` back to `dpl_BrcgEH24X3AaoFqdteCqdaXfF38o`. Nothing to undo in data: no
migration, no environment change, and the only rows v1.2.39 writes (paced resends as outcome `unavailable`) use an
outcome the existing schema already accepts.

## Remaining risks (none blocking)

1. Mailbox-level delivery of the three unconfirmed sign-ups is unknown until the owner reads the provider log.
2. The staging bypass secret should be rotated (tool ready).
3. Staging's webhook ledger carries 33 unresolved reviews from harness cleanups, so the staging panel stays amber.
4. Super Admin V2 replaces these panel files when it is rebased (same rules as V2 subsystem G).
5. The Quiz PDFs staging review counts the Vercel preview toolbar's WebKit storage keys; the harness should ignore them
   before WebKit is a release gate.
6. Nothing pushes an alert to the owner; problems are visible only when the panel is opened (proposal P1).

## Owner actions

1. Approve or decline the production release of this candidate.
2. Approve or decline `scripts/rotate-staging-protection-bypass.ps1 -Apply -VerifyOrigin <staging preview>`.
3. Read the Resend email log (and domain status) and the Supabase Auth log for 10-22 20:34, 10-27 00:22 and
   11-07 14:04 UTC; optionally store a fresh Supabase access token in the vault so the diagnosis reads them itself.
4. Add a DMARC record for `mathnexa.com` (`p=none` with aggregate reports to the owner mailbox).
5. Decide on the 3 quarantined uploads attached to non-archived resources (archive, or re-upload clean files).
6. Optional: resend confirmation to the three unconfirmed sign-ups from Super Admin (sends customer email).
7. Decide on the monitoring proposals P1 (daily digest email) and P2 (record sign-up send failures) for a later release.
