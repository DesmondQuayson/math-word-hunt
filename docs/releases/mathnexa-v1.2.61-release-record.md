# MathNexa v1.2.61 — homepage Create account and sign-up wording

Released 2026-11-22 (UTC) under explicit owner approval ("Yes, release v1.2.61"). The owner first approved the
homepage account-state logic ("OWNER APPROVAL — HOMEPAGE CTA LOGIC ACCEPTED", commit `fe5bcad`), asked for one narrow
wording change before deployment, and reviewed it on a staging preview. Staging and production were built from the
same commit.

What changed:
- **Homepage hero (`fe5bcad`).** Logged out: Start free trial (primary, `/sign-up?next=/subscription`), Create account
  (secondary, `/sign-up?entry=account`) and Sign in (lighter, `/sign-in`), in that order. Signed in, the hero shows the
  header's server-decided action (`resolveHeaderCta`): Start free trial only while the account's one trial is unused;
  Subscribe (Pricing, Checkout without a trial) after a used trial or an ended subscription; Manage subscription when a
  payment is past due; Trial status while a trial is activating; and no commercial action with access. Create account
  and Sign in never show to a signed-in account.
- **Create account wording (`aa90180`).** `/sign-up?entry=account` leads with "Create your MathNexa account", the lead
  "Set up your account to access MathNexa. After you confirm your email, new eligible accounts can start the free trial
  before the monthly subscription begins.", the existing offer line (24-hour free trial, then $5.99 USD a month; a card
  is needed to start; no charge if canceled before the trial ends) and the button "Create account". Start free trial
  keeps "Start your free trial". The page reads `entry` for its heading, lead and button label only; the form never
  carries it, so the sign-up action, the post-confirmation destination (`/subscription`), trial eligibility, pricing,
  Checkout and the webhook cannot see it. Any value other than exactly `account` keeps the trial wording.

These areas are unchanged: trial eligibility (`consumer_accounts.trial_redeemed_at`, read by the access decision,
Checkout and the webhook's `trial-ineligible` refusal), the 24-hour trial, the $5.99 price, the card requirement,
Stripe, consent, entitlements, cancellation, the billing portal, Authorize Code, billing records, every migration and
table, production environment variables, Web Analytics (still off), the subscription confirmation email (still on),
Google Ads conversions and the Google tag.

| | |
| --- | --- |
| Version | `v1.2.61`. Production was built from `aa90180` (`aa901806cbecf1bc2f5594aa029ca3b37507721f`). `/api/health` reports build `aa90180…`, payments `live`. |
| Tag | Annotated tag `v1.2.61` points at `aa90180`, the production build. Created and pushed after live verification. |
| Branch | `fix/homepage-cta-trial-eligibility` from `main` `d2a4de8` (v1.2.60): `fe5bcad` (homepage hero), `aa90180` (Create account wording), then this record. |
| Merge | `main` was still `d2a4de8`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `aa90180`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging | Preview `https://mathnexa-platform-staging-9h27pi30i-bright-path-ed-tech.vercel.app` (`dpl_BAtqghRsfP7HMypt2qZarc2TFSGZ`), built from `aa90180`; signed-out checks 72/72 at 1366, 820, 390 and 320 px. |
| Production candidate | `dpl_7LYJMDsQoAqE6urLwr1pYmsqF9ts` (`https://mathnexa-platform-production-b335asd5s-bright-path-ed-tech.vercel.app`), built from `aa90180` with `--prod --skip-domain`. |
| Production runtime | `dpl_7LYJMDsQoAqE6urLwr1pYmsqF9ts`, promoted 2026-11-22 16:27 UTC. |
| Rollback runtime | `dpl_9yGUCxSqGWWqp9Pr3GMWyTm3xzTw` (v1.2.60 with the confirmation email on, build `0ab3544`), retained and Ready: `npx vercel@59 promote dpl_9yGUCxSqGWWqp9Pr3GMWyTm3xzTw --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5, @vercel/analytics 2.0.1). |

## Release gates (local, same worktree)

- Unit: platform-core 245/245; platform-web 1,929 + 1 skipped. The Math Race traffic test timed out once while other
  suites ran and passed alone (16/16).
- Lint (0 errors), typecheck, build; security baseline 400/400 and 47 Node tests; platform bundle and Number Cross
  audits pass.
- Browser (local Supabase, fixture billing): phase 9 35/35 (account states A to F; the two sign-up wordings send an
  identical sign-up request; a used trial gets no trial from six entry addresses; both wordings at eight widths from
  320 to 1920 px with overflow, clipping, heading order, labels, keyboard order, focus ring and axe; 320 px at 200%
  text), phase 7B 10/10, school access 24/24, ads conversions 64/64.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=aa90180,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_9yGUCxSqGWWqp9Pr3GMWyTm3xzTw, RELEASE_PURPOSE=v1.2.61-homepage-create-account-wording):
  preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after
  22/22.
- Live, signed out, nothing submitted: the three hero buttons, their destinations and both sign-up wordings 72/72 at
  desktop, tablet, phone and 320 px; page check 14/14; `/api/health` build `aa90180`, payments live; 0 responses with
  5xx and 0 error-level log entries after promotion; Web Analytics still not mounted; Google Ads conversion file 200
  with the same 2 rows; live records unchanged (6 subscriptions: 5 active, 1 canceled; 16 consent acceptances; 10
  Checkout bindings; 53 accounts); `/admin` 404 to an anonymous visitor; Authorize Code form live; ShowMe still
  answers 401.

## Follow-up offered (not in this release)

On the "Continue to …" page that a signed-out visitor sees after choosing a product, Create account still opens the
trial wording. Adding `entry=account` there is a one-line change if the owner wants it.
