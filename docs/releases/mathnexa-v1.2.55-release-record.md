# MathNexa v1.2.55 — trial-first sign-up, public offer, confirmation fixes

Released 2026-11-22 (UTC) under explicit owner approval. The owner approved building the top three
subscriber-funnel fixes on staging ("Yes, top three"), reviewed the staging preview, and approved the release
("Yes, release") after being reminded of the earlier request to leave the live site unchanged while Google's ad
policy re-review is pending. Staging and production were built from the same commit.

**Why.** A read-only funnel audit on 2026-11-21 found that 8 of the 11 accounts confirmed in the previous 30 days
never opened the trial step: after confirming, a new account landed back on the homepage, which stated neither the
price nor the trial. The ad landing pages (homepage, Online Math Prep) never showed the offer, /pricing sat behind
sign-in, and email-confirmation failures (a link opened on another device, an expired link, signing in before
confirming) ended on pages that explained nothing. Everyone who did start a trial went on to pay.

These areas are unchanged:
- pricing, Stripe, Checkout, the consent form, trials, entitlements and billing logic;
- Supabase, databases, migrations, environment variables, API contracts and `proxy.ts`;
- Authorize Code (school access), Super Admin, the ShowMe Math pass and every access rule;
- robots, sitemap and indexing (/pricing stays noindex), the Google tag and the Google Ads conversion file;
- games, Homework and Quiz PDFs, the Worksheet Generator entry and the local teacher pilot flows.

| | |
| --- | --- |
| Version | `v1.2.55`. Production was built from `97b2526` (`97b25260777000ed7dede0e16212877bbcbcdb97`). `/api/health` reports build `97b2526…`, payments `live`. |
| Tag | Annotated tag `v1.2.55` points at `97b2526`, the production build. Created and pushed after live verification. |
| Branch | `feature/trial-funnel-top3` from `main` `bfad10b` (v1.2.54): `97b2526` (the change), then this record and the probe update. |
| Merge | `main` was still `bfad10b`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `97b2526`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit` (tracked files only, its own `node_modules` from `npm ci`). |
| Staging | Preview `HG8fZiVFS1XUEhHLgP6orZdHvK1Z` (`https://mathnexa-platform-staging-kwyjvtkfu-bright-path-ed-tech.vercel.app`), built from `97b2526`. 16/16 page loads (desktop and phone) 200, no console errors, no sideways scroll. |
| Production candidate | `dpl_ATBm1Hkuum1zFuaC55n3ikw4H6Ma` (`https://mathnexa-platform-production-2etcvks42-bright-path-ed-tech.vercel.app`), built from `97b2526` with `--prod --skip-domain`. |
| Production runtime | `dpl_ATBm1Hkuum1zFuaC55n3ikw4H6Ma`, promoted 2026-11-22 00:16 UTC. |
| Rollback runtime | `dpl_BCHbDA5j4D17ikYBRcvHob3yj3Hd` (v1.2.54, build `f46c364`), retained and Ready: `npx vercel@59 promote dpl_BCHbDA5j4D17ikYBRcvHob3yj3Hd --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5). |

## What changed

1. **New accounts continue to the trial step.** `signUpDestination()` (lib/auth/access-intent.ts): a sign-up that
   asked for nothing, or for the homepage, confirms into `/subscription` (the "Start your free trial" step); a free
   game, a product, `/subscription` or `/account` is kept. Signing in still ends on `/`. Every consumer `/sign-up`
   except a free game shows the trial onboarding (plan summary, form first); a signed-in, confirmed visitor is sent
   on to the destination. `/sign-in`'s "Start free trial" keeps a requested product.
2. **The offer is stated where people land.** `TrialOfferNote` (from the commercial policy): "24-hour free trial,
   then $5.99 USD a month. A card is needed to start, and you won't be charged if you cancel before the trial ends.
   See pricing". The homepage hero's first button is "Start free trial" with that line (signed out, and for an
   account whose one trial is unused, by the header's own rule). `/online-math-prep` adds "Start free trial"
   (account creation that returns to Online Math Prep) above "Open Online Math Prep". `/pricing` is readable signed
   out: the plan, the six subscription terms, Start free trial and Sign in; it starts nothing and stays noindex.
3. **Confirmation dead ends.** `/auth/callback` reports why a link failed (`link-other-browser`, `link-expired`,
   `link-unusable`) and keeps the destination; `/sign-in` explains each case and points a failed password reset to a
   new link (the teacher pilot keeps `/sign-in?error=callback`). A sign-in whose password matched an unconfirmed
   account (Supabase `email_not_confirmed`, reported only after the password check) opens the confirmation dialog
   with a resend; a wrong password keeps the one generic answer. "I've confirmed my email" in a browser with no
   session offers sign-in.

Also: `scripts/run-nextjs-hotfix-production.mjs` counts `/pricing` as a public page (200) instead of an access
redirect.

## Release gates (local, same worktree)

- Unit: platform-core 245/245, platform-web 1,850 + 1 skipped (27 new checks in `lib/auth/trial-funnel.test.ts` and
  `components/forms/sign-pages.test.tsx`); lint clean; typecheck clean; production build OK.
- Security: baseline 386/386, platform bundle audit, Number Cross launch audit, protection-bypass tests.
- Browser (local Supabase, fixture billing): phase 9 31/31 (homepage visual baselines refreshed: mobile, mobile-390,
  tablet, desktop, smartboard), phase 7b 10/10 (including the unconfirmed sign-in and no-enumeration checks),
  ads conversions 64/64 across four browsers, school access 24/24.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=97b2526,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_BCHbDA5j4D17ikYBRcvHob3yj3Hd, RELEASE_PURPOSE=v1.2.55-trial-funnel): preflight PASS;
  probe-live before PASS; deploy-preview PASS; probe-preview PASS (health 200, unsigned webhook 400, no 5xx);
  promote PASS; probe-live after: 21/22 on the first run, the one failure being the old expectation that `/pricing`
  redirects to sign-in; with the probe updated, 22/22 PASS.
- Live page check (desktop and phone, signed out): homepage, Online Math Prep, pricing, sign-up (trial and free-game
  variants) and the two new sign-in notices 14/14; Google tag GTM-53VDQ6ZL present; no console errors.
- Logs since promotion: 0 responses with 5xx, 0 error-level entries. Google Ads conversion file 200 with the same 2
  rows. Live subscriptions unchanged (6: 5 active, 1 canceled). ShowMe still answers 401 to an anonymous visitor.

## Known limits

- The staging preview could not send confirmation emails or open Stripe Checkout (preview environment), so the full
  sign-up → email link → trial step path was proven in the local browser suites, not on staging.
- The post-trial grace behaviour after a failed first charge and the trial-used re-subscribe path were noted in the
  funnel audit and are unchanged by this release.
