# MathNexa v1.2.59 — two-box consent, Subscriber funnel, clearer payment messages, Web Analytics (off)

Released 2026-11-22 (UTC) under explicit owner approval. The owner's brief "Subscriber conversion, analytics and
registration optimization" asked for a staging build and a complete review before any production change; after the
review package (staging preview, screenshots, test results, legal research, costs) the owner approved the release
("Yes, release"). Staging and production were built from the same commit.

What changed:
- **Consent.** The checkout step asked for seven required boxes under a separate list of six terms and never said how
  to cancel. It now states the material terms once (today, when the trial ends with the cancel-by and first-charge
  date in the visitor's time zone, how to cancel, refunds) directly above two separate, unticked, required
  agreements: the automatic-renewal terms on their own, and the Subscription Terms with the cancellation and refund
  policies and the Privacy Notice. A line beside the button says enrolling renews automatically. The server records
  the same seven acceptances as before; the Stripe Checkout session also carries
  `mathnexa_consent_presentation=2026-11-22`.
- **Payment messages.** The past-due and renewal-grace notices name the "Manage or cancel in Stripe" button on the
  Subscription page.
- **Super Admin "Subscriber funnel".** A new section with periods (today, yesterday, 7 and 30 days, this month,
  lifetime, custom) in US Central time, genuine customers only (the Super Admin account and reserved test addresses
  left out), payments and revenue from Stripe invoices (read-only), and "Not recorded" for values that never existed.
- **Vercel Web Analytics, switched off.** `@vercel/analytics` 2.0.1 renders only when a deployment sets
  `MVH_WEB_ANALYTICS=enabled` (not set in production). URLs are cut to their path; private paths are never sent; one
  event (`sign_up_submitted`) carries only the first page and a source class.

These areas are unchanged:
- every migration, the consent tables and their checks, the Checkout binding and activation checks, the webhook,
  entitlement rules, renewal grace, the first-charge policy of v1.2.58, Stripe retry settings and billing policy;
- Google Ads conversions and the Google tag, Supabase data, production environment variables (no `MVH_WEB_ANALYTICS`);
- Authorize Code, Super Admin access (two-hour session, MFA, concealment), the ShowMe Math pass, robots and sitemap.

| | |
| --- | --- |
| Version | `v1.2.59`. Production was built from `404f2fc` (`404f2fcd2fbb9db5add3852307b14e8ad5e50969`). `/api/health` reports build `404f2fc…`, payments `live`. |
| Tag | Annotated tag `v1.2.59` points at `404f2fc`, the production build. Created and pushed after live verification. |
| Branch | `feature/conversion-consent-analytics` from `main` `615ad84` (v1.2.58): `f094e77` consent, `50c1f4d` payment messages, `8acb2f7` Subscriber funnel, `bfb95de` Web Analytics (off), `e813649` consent spacing, `404f2fc` funnel wording, then this record. |
| Merge | `main` was still `615ad84`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `404f2fc`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging | Preview `https://mathnexa-platform-staging-jfthkjxd2-bright-path-ed-tech.vercel.app`, built from `404f2fc` (analytics off); public pages 16/16; signed-in consent step checked at four sizes (axe 0 violations, no sideways scroll at 320 px). |
| Production candidate | `dpl_FXjS9DTqKnk6pWwngVphkSGFnB3m` (`https://mathnexa-platform-production-cenxxqrtn-bright-path-ed-tech.vercel.app`), built from `404f2fc` with `--prod --skip-domain`. |
| Production runtime | `dpl_FXjS9DTqKnk6pWwngVphkSGFnB3m`, promoted 2026-11-22 04:25 UTC. |
| Rollback runtime | `dpl_981iNSb7g11MFPQVzkcy1mZk8wNk` (v1.2.58, build `b7f3478`), retained and Ready: `npx vercel@59 promote dpl_981iNSb7g11MFPQVzkcy1mZk8wNk --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Next.js 16.4.5 and sharp 0.35.5 unchanged; added `@vercel/analytics` 2.0.1 (exact, MIT), inert while the switch is off. `npm audit --omit=dev`: 0 vulnerabilities. |

## Release gates (local, same worktree)

- Unit: platform-core 245/245; platform-web 1,897 + 1 skipped, with the known Math Race traffic timing test failing
  under full-suite load and passing alone (16/16). New: consent form and parser, Subscriber funnel rules (Central-time
  periods across daylight saving, reserved test addresses, Stripe and fallback paths), analytics redaction and source
  classes.
- Lint (0 errors), typecheck, build; security baseline 394/394 (7 new analytics and funnel privacy checks); billing
  security, platform bundle, Number Cross, Phase 7E and Phase 8H audits pass.
- Database: pgTAP 1,833/1,833 on a fresh reset.
- Browser (local Supabase, fixture billing): phase 7b 10/10, phase 7c 16/16, phase 7e 3/3 (two required unticked
  boxes, one box refused by the server, trial-end date shown), phase 8h 1/1 (Subscriber funnel), phase 9 31/31,
  school access 24/24, ads conversions 59/60 then the WebKit and iPhone projects 32/32 after a test waited for the page
  to be running before ticking boxes.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=404f2fc,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_981iNSb7g11MFPQVzkcy1mZk8wNk, RELEASE_PURPOSE=v1.2.59-conversion-consent-analytics):
  preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after
  22/22.
- Live page check (desktop and phone, signed out) 14/14; `/api/health` build `404f2fc`, payments live; 0 responses
  with 5xx and 0 error-level log entries after promotion; Web Analytics not mounted (no `window.va`, no analytics
  request, no "Visit counts" privacy section); Google Ads conversion file 200 with the same 2 rows; live records
  unchanged (6 subscriptions: 5 active, 1 canceled; 16 consent acceptances; 10 Checkout bindings); `/admin` 404 to an
  anonymous visitor; ShowMe still answers 401.

## Open owner decisions (not part of this release)

Enabling Web Analytics (Vercel Enable plus `MVH_WEB_ANALYTICS=enabled`, about $0.03 per 1,000 events from the Pro
credit); a trial-start confirmation email and Stripe's receipt and failed-payment emails (legal gap found in the
review); a lawyer's view on Utah's trial notice, the two-box structure, yearly reminders and Privacy Notice
versioning; the organic video package.
