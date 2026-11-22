# MathNexa v1.2.65 — analytics guard: an analytics failure stays inside analytics

Released 2026-11-22 (UTC) under explicit owner approval ("Yes, release v1.2.65"), after the guard was checked on
staging previews ("Yes, add it"). Staging and production were built from the same commit.

Why: while v1.2.64 was verified, a staging preview with Web Analytics switched on was given an analytics script whose
every call throws. After sign-in, the client-side move to `/subscription` replaced the page with "This page couldn't
load". Vercel's `<Analytics>` component calls the analytics script (`window.va`) from its effects, when it registers
and on every client-side page change, without catching errors. The component was added in v1.2.59 and is rendered
only when `MVH_WEB_ANALYTICS=enabled`, so the live site (analytics off) was never exposed.

What changed (`9151843`):
- `components/analytics/site-analytics.tsx`: `SiteAnalytics` renders `<Analytics>` inside `AnalyticsBoundary`, an
  error boundary that renders nothing after a failure, for the rest of the visit. Pages, forms and checkout carry on.
- `components/analytics/site-analytics.test.tsx` (new): a working script receives every page change; a script that
  starts throwing on a client-side page change, and one broken from the start, leave the page in place. Against the
  previous component the two failure tests fail ("analytics down", "window.va is not a function").
- `test/security/web-analytics-redaction.test.ts`: the analytics component is only ever rendered inside the guard.

These areas are unchanged: everything in v1.2.64, including Web Analytics (still off in production, so the guarded
component is still not rendered there), the homepage buttons, both sign-up pages, trial eligibility, the
confirmation emails, pricing, Checkout, the webhook, entitlements, Super Admin, migrations, environment variables,
Stripe settings and Google Ads.

| | |
| --- | --- |
| Version | `v1.2.65`. Production was built from `9151843` (`9151843b8583146c33375913098fa7bdc1282409`). `/api/health` reports build `9151843…`, payments `live`. |
| Tag | Annotated tag `v1.2.65` points at `9151843`, the production build. Created and pushed after live verification. |
| Branch | `fix/analytics-guard` from `main` `9a803d5` (v1.2.64): `9151843`, then this record. |
| Merge | `main` was still `9a803d5`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `9151843`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging A (analytics off) | `https://mathnexa-platform-staging-rkyxvy4hu-bright-path-ed-tech.vercel.app` (`dpl_951yzpjKx4rC3HsfwSCPMPr9cLQk`), built from `9151843`. |
| Staging B (analytics on) | `https://mathnexa-platform-staging-km01lgs3a-bright-path-ed-tech.vercel.app` (`dpl_7sarptTKJmHEK74hpKVNvMPCBSFr`), built from `9151843` with `MVH_WEB_ANALYTICS=enabled`. |
| Production candidate | `dpl_8nAChNG4XvAKgwWqJG5PAkA9DDh2` (`https://mathnexa-platform-production-dq5eqi2ol-bright-path-ed-tech.vercel.app`), built from `9151843` with `--prod --skip-domain`. |
| Production runtime | `dpl_8nAChNG4XvAKgwWqJG5PAkA9DDh2`, promoted 2026-11-22 21:17 UTC. |
| Rollback runtime | `dpl_6pZRv6Qx9vRdDk1w7iSeuRZ4Kbq4` (v1.2.64, build `4e5dd49`), retained and Ready: `npx vercel@59 promote dpl_6pZRv6Qx9vRdDk1w7iSeuRZ4Kbq4 --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5, @vercel/analytics 2.0.1). |

## Release gates (local, same worktree)

- Typecheck, lint (0 errors), build; security baseline 401/401 and 47 Node tests; platform bundle and phase 8H audits.
- Unit: platform-core 245/245; platform-web 1,941 + 1 skipped passed, plus the known Math Race traffic test, which
  timed out under load and passed alone (16/16).
- The browser suites (homepage, sign-up, trial and email, ads conversions, school access, Super Admin) were not run
  again: they run with analytics off, where the changed component is not rendered, and they passed for v1.2.64
  earlier the same day.

## Staging

Each check intercepts the sign-up and checkout requests before the server, so no account, email or Stripe object is
created; each synthetic account is deleted.
- Staging A, analytics off: 22/22 (nine public pages on desktop and phone, the three homepage buttons, Create
  account sends its request, a synthetic account signs in, Start free trial sends the checkout request).
- Staging B, analytics on: script unavailable (404) 22/22; working analytics script 23/23 (exactly one
  `trial_checkout_submitted`, with only `landing` and `source`); analytics script that throws on every call 22/22.
  Before the guard, the throwing case failed: after sign-in the page showed "This page couldn't load". With the
  guard it shows "Start your free trial" with the trial end, and checkout still sends its request.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=9151843,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_6pZRv6Qx9vRdDk1w7iSeuRZ4Kbq4, RELEASE_PURPOSE=v1.2.65-analytics-guard):
  preflight PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after
  22/22.
- Live, signed out, nothing submitted: homepage buttons and both sign-up presentations 80/80; "Continue to" checks
  32/32; page check 14/14; `/api/health` build `9151843`, payments live; 0 responses with 5xx and 0 error-level log
  entries after promotion; Web Analytics still not mounted (no analytics requests); Google Ads conversion file 200
  with the same 2 rows; live records unchanged (6 subscriptions: 5 active, 1 canceled; 6 entitlements; 16 consent
  acceptances; 10 Checkout bindings; 3 conversion events; 53 accounts; 1 admin); `/admin` 404 to an anonymous
  visitor and `/admin/sign-in` 200; Authorize Code form live; ShowMe still answers 401.
