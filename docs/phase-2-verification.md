# Phase 2 verification

Run `npm run phase2:verify` from the dedicated repository with Docker and local Supabase available. The gate executes Phase 2A regression, Phase 2 billing unit/integration coverage, reset-from-empty and all pgTAP assertions, Phase 2 browser flows, production-default and security scans, build and client-bundle scan, dependency audit, diff whitespace validation, and protected-file diff/hash checks.

The Phase 2 browser runner uses a deterministic local provider. It still crosses real Next.js server actions, Supabase Auth/cookies, service-role repository calls, RLS-protected tables, account lifecycle restrictions, responsive UI, and the official Stripe SDK signature implementation. The signed-webhook integration test does not mock signature verification.

The canonical v7 and historical v5 commands remain separate explicit protected gates and are also run in the final complete regression:

```powershell
npm run test:e2e:canonical
npm run test:e2e -- e2e/math-word-hunt-v5.spec.mjs
```

External Stripe sandbox provisioning, hosted Checkout completion, portal interaction, CLI forwarding, and Test Clock advancement cannot be claimed by deterministic fixtures. Follow `stripe-test-mode-setup.md` when authenticated test credentials are available.

