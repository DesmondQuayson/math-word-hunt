# MathNexa v1.2.56 — price and trial on Stripe's page; success leads with Online Math Prep

Released 2026-11-22 (UTC) under explicit owner approval: "Yes, next fixes" for the staging build, then "Yes,
release". Staging and production were built from the same commit.

**Why.** Follow-up to v1.2.55 from the 2026-11-21 funnel audit. Checkout runs in Stripe's setup mode, which has no
line items, so Stripe's card page named no price and no trial; a third of the people who reached that page left it.
After activation, the "You're all set!" panel offered only "Go to Math Games", although the ads and the trial lead
with Online Math Prep.

These areas are unchanged:
- the Checkout mode, payment methods, customer, success and cancel URLs, consent binding, webhook activation,
  trials, entitlements and billing logic;
- Supabase, databases, migrations, environment variables, API contracts and `proxy.ts`;
- every public page, Authorize Code, Super Admin, the ShowMe Math pass, robots, sitemap, the Google tag and the
  Google Ads conversion file.

| | |
| --- | --- |
| Version | `v1.2.56`. Production was built from `ec4d314` (`ec4d314d85bd9f5176b5019500d61b7f91a1c439`). `/api/health` reports build `ec4d314…`, payments `live`. |
| Tag | Annotated tag `v1.2.56` points at `ec4d314`, the production build. Created and pushed after live verification. |
| Branch | `feature/checkout-clarity` from `main` `5fcb8cc` (v1.2.55): `ec4d314` (the change), then this record. |
| Merge | `main` was still `5fcb8cc`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `ec4d314`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit` (tracked files only, its own `node_modules` from `npm ci`). |
| Staging | Preview `D7X52bYp4FF74ZDBfni5TXMtL6mv` (`https://mathnexa-platform-staging-8ez0bnl1r-bright-path-ed-tech.vercel.app`), built from `ec4d314`; public pages 16/16 OK. |
| Production candidate | `dpl_318LTG1c2Nn1Uon2hv9D4RkmfMDA` (`https://mathnexa-platform-production-6sh8y13ih-bright-path-ed-tech.vercel.app`), built from `ec4d314` with `--prod --skip-domain`. |
| Production runtime | `dpl_318LTG1c2Nn1Uon2hv9D4RkmfMDA`, promoted 2026-11-22 00:57 UTC. |
| Rollback runtime | `dpl_ATBm1Hkuum1zFuaC55n3ikw4H6Ma` (v1.2.55, build `97b2526`), retained and Ready: `npx vercel@59 promote dpl_ATBm1Hkuum1zFuaC55n3ikw4H6Ma --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5). |

## What changed

1. **Stripe's card page states the offer.** `setupCheckoutSubmitMessage()` (`lib/commercial/checkout-copy.ts`), built
   from the commercial policy, is sent as Checkout `custom_text.submit.message` by `createConsumerSetupCheckout`
   (after the Stripe price has been verified against the policy):
   - an account whose one trial is unused: "Saving your card starts your 24-hour free trial. After the trial, MathNexa
     renews at $5.99 USD a month until you cancel. Cancel before the trial ends and you won't be charged.";
   - an account that used its trial: "MathNexa is $5.99 USD a month and renews until you cancel. This account has
     already used its free trial." (no trial is promised).
2. **The success panel leads with Online Math Prep.** `/subscription?activated=1` offers "Open Online Math Prep"
   (`/map-prep`, access re-checked) first and "Go to Math Games" (`/games`) second. A trial started from a product
   still goes straight to that product through `/checkout/status`.

## Release gates (local, same worktree)

- Unit: platform-core 245/245, platform-web 1,854 + 1 skipped (new: `lib/commercial/checkout-copy.test.ts`, Stripe
  provider and consumer-service checks); the Math Race traffic test timed out once under load and passed 16/16 alone.
  Lint, typecheck and the production build clean.
- Security: baseline 386/386, platform bundle audit, Number Cross launch audit, billing security audit.
- Browser (local Supabase, fixture billing): phase 7c 11/11, phase 9 31/31, ads conversions 60 + WebKit rerun 16/16
  (the first WebKit run hit a "Frame load interrupted" navigation flake on `/game-access`).
- Stripe test mode (sandbox key): a setup-mode Checkout Session with `custom_text` and managed payments off is
  accepted, and the hosted page shows the line above "Save" on desktop and phone for both wordings; the test sessions
  were expired.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=ec4d314,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_ATBm1Hkuum1zFuaC55n3ikw4H6Ma, RELEASE_PURPOSE=v1.2.56-checkout-clarity): preflight
  PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after 22/22.
- Live page check (desktop and phone, signed out) 14/14; Google tag present; `/api/health` build `ec4d314`, payments
  live. Logs since promotion: 0 responses with 5xx, 0 error-level entries. Google Ads conversion file 200 with the
  same 2 rows. Live subscriptions unchanged (6: 5 active, 1 canceled). ShowMe still answers 401 to an anonymous
  visitor.

## Known limits

- Neither change can be seen signed out: the Stripe line appears on a live Checkout page and the panel after a real
  activation. Both were proven in Stripe test mode and the local browser suites; no live Checkout was created.
