# Phase 5 owner-supervised execution runbook

These commands are prepared, not executed. They assume separately installed/authenticated provider CLIs and owner-controlled environment variables. Run one section only after its matching checklist approval. Never paste a secret into chat, source, command history, screenshots, or logs.

## Preflight and local evidence

```powershell
git status --short
git rev-parse HEAD
npm run phase5:verify
Get-FileHash -Algorithm SHA256 docs/index.html, docs/vocab.js
```

Expected protected digests are recorded in `scripts/verify-phase5.mjs`. Do not proceed if the tree is dirty unexpectedly or any gate fails.

## Supabase preview — after separate creation and link approvals

Create the project in the owner dashboard so its database password never appears in shell history. Select the approved organization, region, plan, spend cap, and exact name `mvh-preview`. Then expose only the project reference through the owner shell and run:

```powershell
supabase link --project-ref $env:MVH_PREVIEW_SUPABASE_REF
supabase db push --linked --dry-run
supabase db push --linked
supabase db lint --linked --level warning
```

Before hosted changes, prove empty migration locally with `npm run db:reset` and `npm run db:test`. In the dashboard set Site URL to `$env:MVH_PREVIEW_URL`; allow only `/auth/callback` and `/auth/callback?next=/update-password` at that exact origin. Require confirmation; keep anonymous sign-in and manual linking off. Do not load `seed.sql` or real data. Review every public table for RLS, grants, functions, private schema exposure, and extensions. Record results without IDs or keys in UI/log output.

## Vercel preview — after separate project/link/deploy approvals

Create `math-vocabulary-hunt-preview` in the owner account, select `apps/platform-web` as the application root, and do not attach a production domain. Then:

```powershell
vercel link --project math-vocabulary-hunt-preview
vercel env add MVH_APP_ENVIRONMENT preview
vercel env add MVH_APPLICATION_ORIGIN preview
vercel env add MVH_SUPABASE_PROJECT_REF preview
vercel env add MVH_STRIPE_MODE preview
vercel env add MVH_EMAIL_DELIVERY preview
vercel env add MVH_MONITORING_MODE preview
vercel env add MVH_FIXTURE_POLICY preview
vercel env add MVH_DELETION_MODE preview
vercel env add MVH_BUILD_ID preview
vercel deploy
```

Add connectivity and server secrets through the provider’s encrypted Preview environment UI, never as `NEXT_PUBLIC_*` except the Supabase URL and publishable key. Set registry values to preview, test, capture, console, allowed, and dry-run. Keep all billing feature flags false initially. Enable Vercel Authentication with Standard Protection before sharing the URL. Create a separate automation bypass for Playwright, keep it owner-controlled, and revoke it at shutdown. Never run `vercel --prod`.

## Stripe Sandbox — after separate resource and webhook approvals

Prefer a Stripe Sandbox. Confirm the key starts with `sk_test_` and the Dashboard shows sandbox/test mode. Existing tooling denies live keys:

```powershell
npm run billing:provision:test:dry-run
npm run billing:provision:test
stripe listen --forward-to "$env:MVH_PREVIEW_URL/api/billing/webhook"
```

The webhook command is suitable only when the approved protected-preview access method supports Stripe delivery; otherwise use the owner-approved bypass query mechanism and treat the URL as a secret. Review all proposed creates before the non-dry-run command. Record test resource labels and evidence, not secrets or raw personal payloads. Enable checkout, portal, or webhook flags one at a time only for the approved sandbox test; emergency deny stays available. Never use `sk_live_`, create live resources, or accept real payment details.

## Read-only hosted verification — after its separate approval

Set the following only in the owner process: `PHASE5_HOSTED_APPROVAL=owner-approved`, `PHASE5_HOSTED_READ_ONLY_APPROVAL=owner-approved`, `PHASE5_HOSTED_CHECKS_ENABLED=true`, `PHASE5_EXTERNAL_MUTATIONS=false`, `PHASE5_PREVIEW_CLASSIFICATION=isolated-preview`, exact `MVH_PREVIEW_URL`, and the Vercel automation bypass. Then run:

```powershell
npm run phase5:readiness
npm run phase5:hosted:check
```

The runner first requests `/status` without a bypass and fails if it is public. Only then does Playwright use the bypass header. Auth, cross-account, and Stripe tests remain pending until their disposable fixtures receive separate approval.

## Rollback and shutdown

Stop pilot access first; do not delete evidence or provider resources impulsively. Disable billing flags, apply emergency deny, revoke the automation bypass and pilot access, remove the Stripe test webhook, remove Supabase preview redirects, rotate server secrets, and restore the last verified build only if needed. Reset the database by recreating the isolated preview from migrations, never by importing production. Final provider pause/deletion requires explicit owner approval and must follow provider retention/export policy.
