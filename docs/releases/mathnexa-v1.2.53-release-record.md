# MathNexa v1.2.53 — search engines can read noindex on sign-in, account and billing pages

Released 2026-11-16 (UTC) under explicit owner approval ("Approve release", given after the staging review). The owner
had forwarded Search Console's "New reason preventing your pages from being indexed" email and asked to solve it. The
release ships the staged runtime unchanged: staging and production were both built from `7f6fe87`.

**Why.** Search Console (`sc-domain:mathnexa.com`) reported "Indexed, though blocked by robots.txt" for
`/homework`, `/games` and `/worksheets` (first detected 13 Nov 2026). The same report listed six "Blocked by robots.txt"
URLs that were not indexed: `/sign-up`, `/play`, `/sign-up?next=/subscription`, `/cancellation`, `/sign-in` and
`/map-prep`.

- **The links.** The header of every public page links to gated routes: `/homework`, `/games`, `/worksheets`,
  `/quizzes`, `/map-prep`, `/play`, `/account`, `/subscription` and `/sign-up?next=/subscription`. Signed out (which
  Googlebot always is), they answer 307 to `/access?next=…` or `/sign-in?next=…`.
- **The block.** `robots.txt` disallowed `/access`, `/sign-in` and 11 more sign-in, account and billing prefixes.
- **The result.** Google could not fetch the redirect targets, so it never read the `noindex` those pages already
  declare. It indexed the gated URLs from the links alone.

Google's guidance is that `robots.txt` is not a way to keep a page out of search results. `noindex` is, but only on a page
crawlers may fetch. The `/status` page already followed this rule.

These areas are unchanged:
- every page, redirect, `noindex` tag, canonical, title, sitemap entry and structured data item;
- Sign In, Sign Out, Authorize Code, authentication and every access rule;
- Pricing, Stripe, free trials and entitlements;
- Supabase, Super Admin, databases, API contracts, environment variables and `proxy.ts`;
- games, Online Math Prep, Homework and Quiz PDFs, the Worksheet Generator and ShowMe Math;
- in `robots.txt`: the AI-training crawler group, `Allow: /accessibility` and the `Sitemap` line.

| | |
| --- | --- |
| Version | `v1.2.53`. Production was built from `7f6fe87` (`7f6fe875d5b2a69dd2e3324e548c568a01d25b70`, tree `2aee71d184decb25eb2f71d5ec6b87efabbaa524`). `/api/health` reports build `7f6fe87…`. |
| Tag | Annotated tag `v1.2.53` ("MathNexa v1.2.53: search engines can read noindex on sign-in, account and billing pages") points at `7f6fe87`, the production build. Created and pushed after live verification. |
| Branch | `fix/robots-noindex-crawlable` from `main` `ca68df3` (v1.2.52 runtime `df7f4da` plus its record): `7f6fe87`. |
| Merge | `main` was still `ca68df3`, so origin `main` was fast-forwarded through `7f6fe87` to this record, with no merge commit and no force. The runtime on `main` equals the production build. |
| Certified runtime | `7f6fe87`. The release ran from the clean worktree `C:/GitHub/mathnexa-robots-noindex` at that commit (tracked files only; its own `node_modules` from `npm ci`). |
| Staging | `dpl_8LxQV93HNEBqs7cG3bFHSGMtLp7J` (`https://mathnexa-platform-staging-okcnxya4u-bright-path-ed-tech.vercel.app`), build `7f6fe87`. The staging alias served `dpl_576zFXNoRjPFDp6X4nueQVPQ5WxF` (the v1.2.52 build) before it. |
| Production candidate | `dpl_EmpK6W9AgXMzNSJzBAp9AufM2ysH` (`https://mathnexa-platform-production-6598c3qbw-bright-path-ed-tech.vercel.app`), built from `7f6fe87` with `--prod --skip-domain` |
| Production runtime | `dpl_EmpK6W9AgXMzNSJzBAp9AufM2ysH`, `production-platform`, payments `live`. Promoted 2026-11-16 03:41:39–03:41:53 UTC. |
| Rollback runtime | `dpl_GrToXUMK37z4dSN4QCxGmcWTQTFZ` (v1.2.52, build `df7f4da`), retained and Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged. `package.json`, the lockfile and `next.config.mjs` are identical to v1.2.52. |

## What changed

The `*` group of `robots.txt` loses 13 `Disallow` lines and now denies only Super Admin and the API (632 → 329 bytes):

```diff
 User-Agent: *
 Allow: /
 Allow: /accessibility
-Disallow: /access
-Disallow: /confirmation-required
-Disallow: /sign-in
-Disallow: /sign-up
-Disallow: /forgot-password
-Disallow: /update-password
-Disallow: /account
-Disallow: /my-account
-Disallow: /subscription
-Disallow: /pricing
-Disallow: /checkout
-Disallow: /game-access
-Disallow: /subscriber-management
 Disallow: /admin
 Disallow: /api
```

Every unblocked route family consists of pages only (no route handlers). Each page declares
`robots: { index: false, … }`, or only redirects to a page that does: `/my-account` redirects to `/account`.

Files (4):
- `apps/platform-web/lib/environment/crawl-policy.ts`: `PLATFORM_CRAWL_DISALLOW = ["/admin", "/api"]`, with the reason
  in its comment. `PLATFORM_CRAWL_ALLOW` is kept so a future prefix can never hide `/accessibility` again.
- `apps/platform-web/lib/environment/crawl-policy.test.ts`:
  - the pinned rules;
  - an RFC 9309 check that 25 sign-in, account, billing and gated paths are open to Googlebot and Bingbot and closed to
    GPTBot, and that `/admin`, `/admin/sign-in`, `/admin/mfa`, `/api/health` and `/api/stripe/webhook` stay closed;
  - a guard that every `page.tsx` under a formerly denied route family declares `index: false` or only redirects.

  On the v1.2.52 policy, 3 of the 13 tests fail, the first with "Googlebot /access: expected false to be true".
- `apps/platform-web/app/robots.ts`: comment only.
- `e2e/phase9/teacher-first-access-flow.spec.ts`: the "SEO boundaries" test follows `/homework`, `/games`,
  `/worksheets`, `/account`, `/subscription` and `/pricing` to a `noindex` page. It now checks that `robots.txt` still
  denies `/admin` and `/api` and no longer denies the sign-in, account and billing routes.

## Release gates (on `7f6fe87`, 2026-11-16 02:46–03:05 UTC, local Supabase)

| Check | Result |
| --- | --- |
| Change control vs `main` `ca68df3` | 4 files |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings in `public/game-suite/natural-voice.js`) / pass |
| Unit core / web | 245/245; 1,823 passed, 1 skipped |
| `test:security` | 372/372; the platform bundle audit (39 client assets, 47 core source files), the Number Cross audit and the Vercel protection-bypass tests pass. A first run, before any build existed, stopped at the bundle audit because `.next/static` was missing; it passed after the build. |
| Phase 9 | 31/31, including the updated "SEO boundaries" test |

Not rerun for this robots-only change: the screenshot harness, the school access, Tug of War, Quiz PDF and Number
Cross browser suites. No page, route, script or style changed.

## Staging verification

| Check | Result |
| --- | --- |
| Staging certification (`scripts/invoke-nextjs-hotfix-staging.ps1 -Stage all`) | PASS. Gate locked for anonymous callers; unsigned webhook 400; routes through the gate; security headers; scheduler fails closed; images and optimizer; no console errors |
| `robots.txt` | 329 bytes: production's 632 minus exactly the 13 removed `Disallow` lines |
| robots.txt rules (RFC 9309) | All 12 sitemap URLs and 28 sign-in, account, billing and gated paths are crawlable by Googlebot and Bingbot. `/admin`, `/admin/sign-in` and `/api/health` stay closed, and GPTBot is closed everywhere. On production before the release, 18 of those paths were blocked for both crawlers (36 failures). |
| 28 signed-out redirect chains vs production | Identical. Every chain ends on a page with `noindex, nofollow, noarchive, nocache`, or on the 404 page, which carries the same. |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-robots-noindex` with these values:

- `RELEASE_CERTIFIED_RUNTIME=7f6fe87`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_GrToXUMK37z4dSN4QCxGmcWTQTFZ`
- `RELEASE_PURPOSE=v1.2.53-robots-noindex-crawlable`

Logs and the check results are in `qa-artifacts/seo-audit/robots-noindex/` (git-ignored).

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 03:38:28–03:38:35 | PASS. The apex served `dpl_GrToXUMK37z4…` (the rollback target), retained. |
| probe-live (before) | 03:38:35–03:38:44 | PASS, 22/22 |
| deploy-preview | 03:38:44–03:40:24 | PASS. `dpl_EmpK6W9AgXMz…` is Ready and holds neither the production alias nor the webhook host. Next 16.4.2, sharp 0.35.5. |
| probe-preview | 03:40:24–03:40:57 | PASS, 7/7 |
| promote | 03:41:39–03:41:53 | PASS. The alias moved from `dpl_GrToXUMK37z4…` to `dpl_EmpK6W9AgXMz…`. |
| probe-live | 03:41:53–03:42:04 | PASS, 22/22 |

The candidate's own host redirects to the apex (canonical host), so its `robots.txt` could only be read after
promotion. Staging, built from the same commit, had already shown it.

## Live production verification (2026-11-16 from 03:42 UTC; read-only and anonymous)

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `7f6fe875d5b2a69dd2e3324e548c568a01d25b70`, `production-platform`, search indexing `enabled`, payments `live`. The apex serves `dpl_EmpK6W9AgXMzNSJzBAp9AufM2ysH`. |
| `robots.txt` | 632 → 329 bytes, by exactly the 13 removed `Disallow` lines. Byte-identical to staging. |
| robots.txt rules (RFC 9309) | 36 → 0 paths blocked for search crawlers. All 12 sitemap URLs and the 28 sign-in, account, billing and gated paths are crawlable; `/admin` and `/api` are closed; GPTBot is closed. |
| 28 signed-out routes vs the capture before the release | Redirect chains and robots meta identical |

## Known limitations and owner follow-ups

- **Search engines re-read `robots.txt` on their own schedule**; Google caches it for up to a day.
  - The three URLs should move from "Indexed, though blocked by robots.txt" to "Page with redirect" or "Excluded by
    'noindex' tag".
  - The sign-in pages should move from "Blocked by robots.txt" to "Excluded by 'noindex' tag". That is the intended
    state, not an error.
  - Search Console's validation of the fix can take up to about two weeks.
- **Crawl traffic.** Crawlers may now fetch the sign-in, account and billing pages and follow the gated links to them.
  `noindex` keeps them out of results.
- **`robots.txt` is advisory.** It does not keep anything private; the sign-in wall does.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-robots-noindex
$env:RELEASE_CERTIFIED_RUNTIME = '7f6fe87'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_GrToXUMK37z4dSN4QCxGmcWTQTFZ'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_GrToXUMK37z4dSN4QCxGmcWTQTFZ
```

Fallback: `npx vercel@59 promote dpl_GrToXUMK37z4dSN4QCxGmcWTQTFZ --scope bright-path-ed-tech`.

A rollback returns v1.2.52's `robots.txt`, which blocks the sign-in, account and billing pages again, so the Search
Console warning would return. It touches no data, billing or access rule.
