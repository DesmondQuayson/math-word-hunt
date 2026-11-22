# MathNexa v1.2.62 — Create account on the "Continue to" page

Released 2026-11-22 (UTC) under explicit owner approval ("Yes, release v1.2.62"), after the owner asked for the
follow-up offered with v1.2.61 ("Yes, do it") and it was checked on a staging preview. Staging and production were
built from the same commit.

What changed:
- **"Continue to …" page (`212c605`).** A signed-out visitor who chooses a product lands on `/access?next=<product>`.
  Its Create account button opened `/sign-up?next=<product>`, headed "Start your free trial". It now opens
  `/sign-up?next=<product>&entry=account`, the account wording released in v1.2.61 ("Create your MathNexa account",
  the offer line with the card requirement, the button "Create account"), keeping the product as the destination.
  `createAccountHref()` in `lib/auth/access-intent.ts` builds the link. A free game keeps its link exactly as before:
  it already opens "Create a free account to play".

These areas are unchanged: the destination after email confirmation, the sign-up action, trial eligibility
(`consumer_accounts.trial_redeemed_at`), the trial, the price, the card requirement, Stripe, consent, entitlements,
Authorize Code, billing records, every migration and table, production environment variables, Web Analytics (still
off), the subscription confirmation email (still on), Google Ads conversions and the Google tag.

| | |
| --- | --- |
| Version | `v1.2.62`. Production was built from `212c605` (`212c605685ba276503eab4b87b6d2b1198d76c85`). `/api/health` reports build `212c605…`, payments `live`. |
| Tag | Annotated tag `v1.2.62` points at `212c605`, the production build. Created and pushed after live verification. |
| Branch | `fix/access-create-account-wording` from `main` `b906632` (v1.2.61): `212c605`, then this record. |
| Merge | `main` was still `b906632`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `212c605`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging | Preview `https://mathnexa-platform-staging-10iyfg7v2-bright-path-ed-tech.vercel.app` (`dpl_6Y7d8zWHwM5nbRvjX6VuRZ46DJP9`), built from `212c605`; "Continue to" checks 32/32 and homepage checks 72/72. |
| Production candidate | `dpl_CPQPxqxgrQc4T7dkotzpE8kB7stD` (`https://mathnexa-platform-production-5sgy8uhom-bright-path-ed-tech.vercel.app`), built from `212c605` with `--prod --skip-domain`. |
| Production runtime | `dpl_CPQPxqxgrQc4T7dkotzpE8kB7stD`, promoted 2026-11-22 17:32 UTC. |
| Rollback runtime | `dpl_7LYJMDsQoAqE6urLwr1pYmsqF9ts` (v1.2.61, build `aa90180`), retained and Ready: `npx vercel@59 promote dpl_7LYJMDsQoAqE6urLwr1pYmsqF9ts --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5, @vercel/analytics 2.0.1). |

## Release gates (local, same worktree)

- Unit: platform-core 245/245; platform-web 1,930 + 1 skipped. The Math Race traffic test timed out once while other
  suites ran and passed alone (16/16).
- Typecheck, lint (0 errors), build; security baseline 401/401 and 47 Node tests; platform bundle and Number Cross
  audits pass.
- Browser (local Supabase, fixture billing): phase 9 35/35 (the six product links and a click through to the account
  wording with `next=/map-prep`), school access 24/24, Math Tug of War 147 passed and 15 skipped (one WebKit browser
  crash in the 3D scene's accessibility check, "Target page, context or browser has been closed", passed on rerun),
  Tug of War free-game access 8/8.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=212c605,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_7LYJMDsQoAqE6urLwr1pYmsqF9ts, RELEASE_PURPOSE=v1.2.62-access-create-account-wording):
  preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after
  22/22.
- Live, signed out, nothing submitted: "Continue to" checks 32/32 at desktop and phone (all seven destinations, the
  free game unchanged, the click through and the kept destination); homepage buttons and both sign-up wordings 72/72;
  page check 14/14; `/api/health` build `212c605`, payments live; 0 responses with 5xx and 0 error-level log entries
  after promotion; Web Analytics still not mounted; Google Ads conversion file 200 with the same 2 rows; live records
  unchanged (6 subscriptions: 5 active, 1 canceled; 16 consent acceptances; 10 Checkout bindings; 53 accounts);
  `/admin` 404 to an anonymous visitor; Authorize Code form live; ShowMe still answers 401.
