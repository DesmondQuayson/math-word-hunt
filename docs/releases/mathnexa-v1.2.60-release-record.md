# MathNexa v1.2.60 — subscription confirmation email (released switched off)

Released 2026-11-22 (UTC) under explicit owner approval ("Release, keep off"). The v1.2.59 review found that MathNexa
sent no confirmation when a subscription started; the owner approved building it ("Yes, build it"), a single test
email to the owner's support inbox ("Yes, send test"; Resend accepted it), and then this release with the email still
switched off. Staging and production were built from the same commit.

What changed (all inert until switched on):
- **Confirmation email.** When a completed Checkout starts a trial (or a paid subscription without one), the billing
  webhook hands the route a confirmation request outside the response body, and the route sends one email with
  Next's `after()` once Stripe has its answer, so the email can never delay, change or fail the webhook. Invoices,
  renewals, replays and reviewed events never send it. Content: the trial's exact start and end (Central time plus the
  four mainland US zones), the $5.99 charge when the trial ends and monthly on or about that day until canceled, no
  minimum term, how to cancel before the trial ends to pay nothing ("Manage or cancel in Stripe" on the Subscription
  page), the refund-review rule, the Terms and Privacy versions agreed to, and support. A paid subscription without a
  trial gets the same for a charge made today.
- **Safety.** Off unless `MVH_BILLING_EMAILS=enabled` and a Resend sending key (`RESEND_API_KEY`) are set (neither is
  set in production). Sender `MathNexa <billing@auth.mathnexa.com>` (the Resend-verified domain). The API address may
  only be Resend or a loopback capture stub. Resend's `Idempotency-Key` (`mathnexa-subscription-confirmation/<sub>`)
  prevents duplicates. Sending never throws; outcomes are logged as `confirmation-email-sent/skipped/failed` without
  the address. While switched off, each new subscription logs `confirmation-email-skipped` with reason `disabled`.

These areas are unchanged: every migration and table, consent, Checkout, the webhook's decisions and responses,
entitlement rules, renewal grace, the first-charge policy, Stripe settings, Google Ads conversions and the Google tag,
production environment variables, Web Analytics (still off), Super Admin, Authorize Code and the ShowMe pass.

| | |
| --- | --- |
| Version | `v1.2.60`. Production was built from `0118394` (`01183947c639279b8e7afe86b466bf7594a38eab`). `/api/health` reports build `0118394…`, payments `live`. |
| Tag | Annotated tag `v1.2.60` points at `0118394`, the production build. Created and pushed after live verification. |
| Branch | `feature/subscription-confirmation-email` from `main` `1318677` (v1.2.59): `0118394` (the email), then this record. |
| Merge | `main` was still `1318677`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `0118394`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging | Preview `https://mathnexa-platform-staging-6oss1jkbk-bright-path-ed-tech.vercel.app`, built from `0118394` (email off); public pages 16/16. |
| Production candidate | `dpl_4nq7bQSFMV2Ns28PQVGK6kwoYJwW` (`https://mathnexa-platform-production-4a2f4774g-bright-path-ed-tech.vercel.app`), built from `0118394` with `--prod --skip-domain`. |
| Production runtime | `dpl_4nq7bQSFMV2Ns28PQVGK6kwoYJwW`, promoted 2026-11-22 05:13 UTC. |
| Rollback runtime | `dpl_FXjS9DTqKnk6pWwngVphkSGFnB3m` (v1.2.59, build `404f2fc`), retained and Ready: `npx vercel@59 promote dpl_FXjS9DTqKnk6pWwngVphkSGFnB3m --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged (`MVH_BILLING_EMAILS` and `RESEND_API_KEY` are not set). |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5, @vercel/analytics 2.0.1). `npm audit --omit=dev`: 0 vulnerabilities. |

## Release gates (local, same worktree)

- Unit: platform-core 245/245; platform-web 1,912 + 1 skipped (new: template, sender and webhook confirmation tests).
- Lint, typecheck, build; security baseline 399/399; billing security, platform bundle, Number Cross, Phase 7E and
  Phase 8H audits pass.
- Browser (local Supabase, fixture billing): phase 7c 16/16 with a local Resend capture stub (exactly one confirmation
  per new subscription, attempts 1, none from invoices; a paid re-subscription gets its own); ads conversions
  (Chrome) 16/16 with the email off (`confirmation-email-skipped`, `disabled`); phase 9 31/31, phase 7e 3/3, phase 8h 1/1 and school access 24/24 on the release commit.
- Owner test send: one "[Test] Your MathNexa free trial has started" to the published support address through the
  production Resend key from `billing@auth.mathnexa.com`, accepted (HTTP 200).

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=0118394,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_FXjS9DTqKnk6pWwngVphkSGFnB3m, RELEASE_PURPOSE=v1.2.60-subscription-confirmation-email-off):
  preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after
  22/22.
- Live page check (desktop and phone, signed out) 14/14; `/api/health` build `0118394`, payments live; 0 responses
  with 5xx and 0 error-level log entries after promotion; Web Analytics still not mounted (no analytics request);
  Google Ads conversion file 200 with the same 2 rows; live records unchanged (6 subscriptions: 5 active, 1 canceled;
  16 consent acceptances; 10 Checkout bindings; 53 accounts); `/admin` 404 to an anonymous visitor; Authorize Code
  form live; ShowMe still answers 401. Production environment has neither `MVH_BILLING_EMAILS` nor `RESEND_API_KEY`,
  so no confirmation email can be sent.

## To switch the email on later (owner approval)

Set `MVH_BILLING_EMAILS=enabled` and `RESEND_API_KEY` (the production Resend sending key) in the Vercel production
environment and redeploy; optionally `MVH_BILLING_EMAIL_FROM`. The owner should also turn on Stripe's
successful-payment receipts and failed-payment emails in the Stripe Dashboard, and consider a DMARC record for
`auth.mathnexa.com`.

## Email switched on (2026-11-22, owner: "Switch it on")

| | |
| --- | --- |
| Settings added | Vercel production: `RESEND_API_KEY` (Sensitive; the production Resend sending key, from the owner's DPAPI vault through stdin, never printed) and `MVH_BILLING_EMAILS=enabled`. Sender left at the default `MathNexa <billing@auth.mathnexa.com>`. |
| Production runtime | `dpl_9yGUCxSqGWWqp9Pr3GMWyTm3xzTw` (`https://mathnexa-platform-production-cncrhzaxz-bright-path-ed-tech.vercel.app`), built after the settings were added from `0ab3544` (this record's commit: the same runtime as `0118394`, which the pipeline checks), promoted 2026-11-22 05:27 UTC. `/api/health` reports build `0ab3544…`, payments `live`. |
| Rollback runtime | `dpl_4nq7bQSFMV2Ns28PQVGK6kwoYJwW` (v1.2.60 without the settings, so no email): `npx vercel@59 promote dpl_4nq7bQSFMV2Ns28PQVGK6kwoYJwW --scope bright-path-ed-tech`. Removing either setting and redeploying also switches it off. |
| Pipeline | RELEASE_CERTIFIED_RUNTIME=0118394, RELEASE_ROLLBACK_DEPLOYMENT=dpl_4nq7bQSFMV2Ns28PQVGK6kwoYJwW, RELEASE_PURPOSE=v1.2.60-confirmation-email-enabled: preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after 22/22. |
| Live checks | Pages 14/14; 0 responses with 5xx and 0 error-level logs after promotion; Web Analytics still not mounted; Google Ads conversion file 200 with the same 2 rows; records unchanged (6 subscriptions: 5 active; 16 acceptances; 10 bindings; 53 accounts); `/admin` 404; Authorize Code live; ShowMe 401. |
| Effect | From now on, each new trial (or paid subscription without a trial) gets one confirmation email after Stripe confirms the Checkout. Existing subscribers receive nothing. Each send logs `confirmation-email-sent` (or `-failed`) in the Vercel logs, without the address. No live send could be exercised at switch-on without a real customer Checkout; the owner's test send through the same key and sender was accepted earlier the same night. |
