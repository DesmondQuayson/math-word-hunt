# MathNexa v1.2.63 — Create account without the plan card; no refunds section in the free-trial email

Released 2026-11-22 (UTC) under explicit owner approval ("Yes, release v1.2.63"), after the owner's brief "CREATE
ACCOUNT UX + FREE-TRIAL EMAIL CLEANUP" (presentation only) was checked on a staging preview. Staging and production
were built from the same commit.

What changed (`f4ec113`):
- **Create account (`/sign-up?entry=account`).** Registration first: "Create your MathNexa account", the lead "Set up
  your account to access MathNexa.", the same form, the button "Create account", and one short, secondary line under
  it: "After creating your account and confirming your email, you can start your 24-hour free trial. A payment method
  is required to begin the trial. After the trial, MathNexa renews at $5.99/month unless canceled." (values from the
  commercial policy). The Plan heading, the MathNexa monthly card with its price and its trial, renewal and
  cancellation bullets, the header offer line and the lead's second sentence are gone from this path. Start free trial
  (`/sign-up?next=/subscription`) keeps its plan card and wording.
- **Free-trial confirmation email.** The Refunds section ("Ask within seven days of your first charge and we review a
  refund by hand. Refunds are not automatic or guaranteed.") is removed from the free-trial email only. It still states
  the 24-hour trial with its exact start and end, the $5.99 USD charge when it ends and monthly after, automatic
  renewal, how to cancel before the trial ends, and the Terms, Privacy and Support links. The paid-subscription email
  is byte-for-byte unchanged and keeps its Refunds section.

These areas are unchanged: the refund policy itself (Subscription Terms, the Refunds page, Pricing, Support, the
consent form, Super Admin, Stripe), refund review and processing, the sign-up form, its destination and action, email
confirmation, trial eligibility (`consumer_accounts.trial_redeemed_at`), the trial, the price, the payment-method
requirement, Checkout, the webhook, the email sending path and its switch (still on), entitlements, Authorize Code,
billing records, every migration and table, production environment variables, Web Analytics (still off), Google Ads
conversions and the Google tag.

| | |
| --- | --- |
| Version | `v1.2.63`. Production was built from `f4ec113` (`f4ec1135007fdc5ab2f912bf3cc039db00e86010`). `/api/health` reports build `f4ec113…`, payments `live`. |
| Tag | Annotated tag `v1.2.63` points at `f4ec113`, the production build. Created and pushed after live verification. |
| Branch | `fix/create-account-plan-and-trial-email` from `main` `9eaff3e` (v1.2.62): `f4ec113`, then this record. |
| Merge | `main` was still `9eaff3e`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `f4ec113`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging | Preview `https://mathnexa-platform-staging-61a244cov-bright-path-ed-tech.vercel.app` (`dpl_CNw3FVmxF6fzH3byC1Q9KLJUmNeb`), built from `f4ec113`; homepage and both sign-up presentations 80/80, "Continue to" 32/32. |
| Production candidate | `dpl_BTgLdkQu6F9x8GFd2qfS1Dj2Jy7E` (`https://mathnexa-platform-production-fs2z8inz2-bright-path-ed-tech.vercel.app`), built from `f4ec113` with `--prod --skip-domain`. |
| Production runtime | `dpl_BTgLdkQu6F9x8GFd2qfS1Dj2Jy7E`, promoted 2026-11-22 18:44 UTC. |
| Rollback runtime | `dpl_CPQPxqxgrQc4T7dkotzpE8kB7stD` (v1.2.62, build `212c605`), retained and Ready: `npx vercel@59 promote dpl_CPQPxqxgrQc4T7dkotzpE8kB7stD --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5, @vercel/analytics 2.0.1). |

## Release gates (local, same worktree)

- Unit: platform-core 245/245; platform-web 1,932 + 1 skipped.
- Typecheck, lint (0 errors), build; security baseline 401/401 and 47 Node tests; platform bundle and Number Cross
  audits pass.
- Browser (local Supabase, fixture billing): phase 9 35/35 (the large-text check hit a dev-server "Unexpected end of
  JSON input" during a page load on the first run and passed alone), phase 7B 10/10 (account creation and email
  confirmation), phase 7C 16/16 (trial Checkout and confirmation emails through the local capture stub), ads
  conversions 64/64, school access 24/24.
- Email: rendered with the app's template before and after; only the three Refunds lines left the free-trial email;
  the paid-subscription email is identical; the four links resolve; the layout fits 375 px and 760 px email widths.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=f4ec113,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_CPQPxqxgrQc4T7dkotzpE8kB7stD, RELEASE_PURPOSE=v1.2.63-create-account-plan-card-trial-email):
  preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after
  22/22.
- Live, signed out, nothing submitted: homepage buttons and both sign-up presentations 80/80 at desktop, tablet, phone
  and 320 px (Create account shows no plan card and the short line under its button; Start free trial keeps its plan
  card); "Continue to" checks 32/32; page check 14/14; `/api/health` build `f4ec113`, payments live; 0 responses with
  5xx and 0 error-level log entries after promotion; Web Analytics still not mounted; Google Ads conversion file 200
  with the same 2 rows; live records unchanged (6 subscriptions: 5 active, 1 canceled; 16 consent acceptances; 10
  Checkout bindings; 53 accounts); `/admin` 404 to an anonymous visitor; Authorize Code form live; ShowMe still
  answers 401.
- The new free-trial email cannot be exercised live without a real customer Checkout; the next trial receives it.
