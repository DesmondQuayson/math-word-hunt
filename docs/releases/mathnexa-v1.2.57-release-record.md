# MathNexa v1.2.57 — charge the saved card when a returning customer subscribes

Released 2026-11-22 (UTC) under explicit owner approval: "Yes, run checks" (Stripe test-mode checks of two billing
paths), "Yes, fix it" (staging build), then "Yes, release". Staging and production were built from the same commit.

**Why.** An account whose one 24-hour trial is used subscribes again without a trial. MathNexa created that
subscription with `payment_behavior: "default_incomplete"`, which waits for a client-side confirmation of the first
invoice that nothing in MathNexa performs. In Stripe test mode the subscription stayed `incomplete` with the $5.99
invoice never attempted, and became `incomplete_expired` after 23 hours: the customer saved a card and never got
access, and MathNexa was never paid. No live customer had hit it (every live subscription began with a trial).

These areas are unchanged:
- the trial path (`default_incomplete`, first invoice $0), Checkout, consent, the webhook, trials, entitlements and
  every billing rule in the database;
- Supabase, migrations, environment variables, API contracts and `proxy.ts`;
- every page, Authorize Code, Super Admin, the ShowMe Math pass, robots, sitemap, the Google tag and the Google Ads
  conversion file.

| | |
| --- | --- |
| Version | `v1.2.57`. Production was built from `a3def48` (`a3def48a96eceb3491eec94fd658de58d9398285`). `/api/health` reports build `a3def48…`, payments `live`. |
| Tag | Annotated tag `v1.2.57` points at `a3def48`, the production build. Created and pushed after live verification. |
| Branch | `feature/resubscribe-charge` from `main` `8825dc7` (v1.2.56): `a3def48` (the fix), then this record. |
| Merge | `main` was still `8825dc7`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `a3def48`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging | Preview `https://mathnexa-platform-staging-7hrj8mm61-bright-path-ed-tech.vercel.app`, built from `a3def48`; public pages 16/16 OK. |
| Production candidate | `dpl_2bxDPGjMA87xW1MnqGuFk4dHqh8H` (`https://mathnexa-platform-production-e03d4yawj-bright-path-ed-tech.vercel.app`), built from `a3def48` with `--prod --skip-domain`. |
| Production runtime | `dpl_2bxDPGjMA87xW1MnqGuFk4dHqh8H`, promoted 2026-11-22 01:30 UTC. |
| Rollback runtime | `dpl_318LTG1c2Nn1Uon2hv9D4RkmfMDA` (v1.2.56, build `ec4d314`), retained and Ready: `npx vercel@59 promote dpl_318LTG1c2Nn1Uon2hv9D4RkmfMDA --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5). |

## What changed

`lib/billing/consumer-stripe-provider.ts` `createSubscription`: `payment_behavior` is `"default_incomplete"` when a
trial is requested (unchanged) and `"allow_incomplete"` when it is not, so Stripe charges the saved default payment
method at once. A declined or authentication-bound first payment leaves the subscription `incomplete`, which grants
no access.

## Evidence

- Stripe test mode, MathNexa's exact request on test clocks (all clocks deleted):
  - before: no trial, good card → `incomplete`, invoice open and unattempted; after 24 h `incomplete_expired`, void;
  - after: no trial, good card → `active`, $5.99 paid at once; declined card → `incomplete`; trial path → `trialing`,
    then `active` with $5.99 paid at the trial end.
- Unit: platform-core 245/245, platform-web 1,856 + 1 skipped (new provider test for the no-trial request); lint,
  typecheck and build clean. Security baseline 386/386; billing security and platform bundle audits pass.
- Browser (local Supabase, fixture billing): phase 7c 12/12, including the new `e2e/phase7c/resubscribe.spec.ts`
  (an account whose trial was used goes Pricing → consent → Checkout → webhook and ends with an active, paid period,
  no second trial and real product access).

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=a3def48,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_318LTG1c2Nn1Uon2hv9D4RkmfMDA, RELEASE_PURPOSE=v1.2.57-resubscribe-charge): preflight
  PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after 22/22.
- Live page check (desktop and phone, signed out) 14/14; `/api/health` build `a3def48`, payments live; 0 responses
  with 5xx and 0 error-level log entries after promotion; Google Ads conversion file 200 with the same 2 rows; live
  subscriptions unchanged (6: 5 active, 1 canceled); ShowMe still answers 401 to an anonymous visitor.

## Known limits

- No live Checkout was created to verify the charge; the behaviour was proven in Stripe test mode with the same
  request.
- Still open (owner policy choice): a failed first $5.99 charge after the trial receives renewal grace, because the
  $0 trial invoice counts as the first payment.
