# MathNexa v1.2.54 — Next.js 16.4.5 security patch

Released 2026-11-20 (UTC) under explicit owner approval. The owner approved staging ("Yes, to staging"), the push
and pull request ("Yes, push + PR"), asked for a full verification before any merge, and then wrote "do not stop
until everything is finish and live. chose recomended", which is the approval this release ran under. The release
ships the staged runtime unchanged: staging and production were both built from the same runtime commit.

**Why.** Seven advisories published on 2026-11-03 name `next` 16.0.0 – 16.4.4, all rated Moderate, all fixed in
16.4.5. None of them reaches MathNexa in production (the app has no `"use cache"`, no Cache Components, no Edge
runtime route, and runs on Vercel), but the patch clears the audit finding and covers the two code paths that sit
next to an advisory. The analysis is in `docs/security/nextjs-16.4.5-security-patch.md`.

These areas are unchanged:
- every page, route, redirect, header, robots rule and sitemap entry (139 routes, identical route table);
- Sign In, Sign Out, Authorize Code, authentication and every access rule;
- Pricing, Stripe, free trials and entitlements;
- Supabase, Super Admin, databases, API contracts, environment variables and `proxy.ts`;
- games, Online Math Prep, Homework and Quiz PDFs, the Worksheet Generator entry and the ShowMe Math pass;
- the Google tag, Consent Mode and the Google Ads conversion file.

| | |
| --- | --- |
| Version | `v1.2.54`. Production was built from `f46c364` (`f46c364f2104a300d14d5ee55b2c8c68aa8f4569`), whose runtime is `5cec655`. `/api/health` reports build `f46c364…`. |
| Tag | Annotated tag `v1.2.54` ("MathNexa v1.2.54: Next.js 16.4.5 security patch") points at `f46c364`, the production build. Created and pushed after live verification. |
| Branch | `security/nextjs-16-4-5` from `main` `e5d16b0` (v1.2.53): `5cec655` (the upgrade), `16758f3` and `f46c364` (the patch record). Pull request #30. |
| Merge | `main` was still `e5d16b0`, so origin `main` was fast-forwarded through `f46c364` to this record, with no merge commit and no force. Pull request #30 closed as merged by that push. |
| Certified runtime | `5cec655`. The release ran from the clean worktree `C:/GitHub/mathnexa-next-16-4-5` (tracked files only; its own `node_modules` from `npm ci`, then the upgrade). |
| Staging | `dpl_EoAnXQ1YHkEka3c4ZZ9WV7sDZC6Y` on the staging alias since 2026-11-20 02:55 UTC (built from `16758f3`, the same runtime). Two staging previews of `f46c364` carried the hosted reviews. |
| Production candidate | `dpl_BCHbDA5j4D17ikYBRcvHob3yj3Hd` (`https://mathnexa-platform-production-kt1uraviz-bright-path-ed-tech.vercel.app`), built from `f46c364` with `--prod --skip-domain` |
| Production runtime | `dpl_BCHbDA5j4D17ikYBRcvHob3yj3Hd`, `production-platform`, payments `live`. Promoted 2026-11-20 10:55 UTC. |
| Rollback runtime | `dpl_EmpK6W9AgXMzNSJzBAp9AufM2ysH` (v1.2.53, build `7f6fe87`, Next.js 16.4.2), retained and Ready. |
| Migration / environment | None / unchanged. |
| Dependencies | `next` and `eslint-config-next` 16.4.2 → 16.4.5 (exact). Twelve lockfile entries, all 16.4.2 → 16.4.5. `react`, `sharp` 0.35.5 and the `overrides` block unchanged. |

## What changed

Files (5 against v1.2.53, 6 with this record):
- `apps/platform-web/package.json`, `package-lock.json`: the upgrade.
- `scripts/run-nextjs-hotfix-staging.mjs`, `scripts/run-nextjs-hotfix-production.mjs`: the release pipelines refuse a
  tree whose installed Next.js is not the expected version; both now expect 16.4.5.
- `docs/security/nextjs-16.4.5-security-patch.md`: the advisory analysis and the review.

No application source file changed.

## Release gates (local, same worktree, before and after the upgrade)

| Check | 16.4.2 (`e5d16b0`) | 16.4.5 |
| --- | --- | --- |
| Typecheck / lint | Clean / 0 errors | Clean / 0 errors |
| Unit core / web | 245/245; 1,823 passed, 1 skipped | the same |
| `test:security` | 372/372; bundle audit (39 client assets, 47 core files), Number Cross launch audit, 47/47 | the same |
| `node --test scripts/*.test.mjs` | 143/145 | 143/145 (the same two CrossCalc provenance tests) |
| Build | compiles, 139 routes; exits 1 on Next's notice to AI agents | exits 0; 139 routes, identical route table |
| `npm audit` | 15 findings | 14; `next` gone, the rest is development tooling |
| `npm audit --omit=dev --audit-level=high` | passes | passes |

## End-to-end suites on the patched tree (local Supabase, 2026-11-20)

| Area | Suite | Result |
| --- | --- | --- |
| Sign-up, sign-in redirects, 24-hour trial, forged entitlement | `test:e2e:phase7b` | 10/10 |
| Access flows, entitled navigation, Sign out | `test:e2e:phase9` | 31/31 |
| School access codes, the ShowMe pass for a code holder | `test:e2e:school-access` | 24/24 |
| Billing against the fixture provider (no Stripe call) | `test:e2e:phase7c` | 11/11 |
| Google Ads conversion funnel | `run-ads-conversions-e2e.mjs` | 64/64 |
| Super Admin: sign-in, TOTP, non-admin 404, session limits, revocation | `test:e2e:phase8a` | 5/5 |
| Admin PDF resource upload | `test:e2e:phase8d` | 1/1 |
| Quiz PDFs | `test:e2e:quiz-pdfs` | 20/20 (second run; the first stopped in its own setup, before any test, on a local storage restart) |
| Game suite | `test:e2e:game-suite` | 6/6 |
| Number Cross / Number Logic / CrossCalc V2 | their e2e runners | 1/1, 2/2, 2/2 (CrossCalc on its second run; the first met the local database restarting) |
| Math Vocabulary Hunt | session, audio, real runtime | 4/4, 8/8, 40/40 |
| Math Race Champions | `run-math-race-champions.mjs e2e` | 98 passed, 1 skipped, 3 failed while another long suite was running; the three passed when run again alone (8/8 and 13/13 for their files) |
| Polygon Showdown | `run-polygon-showdown.mjs e2e` | 91/91 |
| Mobile gameplay contract | `test:e2e:mobile-gameplay` | 151 passed, 41 skipped by project design |
| Public production mode on `next start` | `test:e2e:production-public` | 7/7 |
| Math Tug of War | `run-math-tug-of-war-e2e.mjs` | 146 passed, 15 skipped, 2 failed (WebKit 3D); see below |
| Math Bingo Live | `run-math-bingo-live.mjs e2e` | 19 passed, 1 failed, 1 not run (WebKit); see below |

The 16.4.2 review's "finding A" (the client aborting the tail of a redirecting Server Action response in the
Number Cross and Number Logic suites) did not occur: both suites passed.

### Two suites that did not finish green

**Math Tug of War, WebKit 3D.** Two tests failed in the first run and two (not the same pair) in a second run of the
WebKit 3D project alone, 11 of 13, each time with "Target page, context or browser has been closed": the WebKit
page is lost during the 3D scene. The 16.4.2 review recorded the same result (11 of 13) and v1.2.23 one page loss
per run. That runner serves the shipped game document from a static harness, with no Next.js server involved, so
the upgrade cannot be its cause. The hosted classic review on the patched build passed 102 of 102.

**Math Bingo Live, one WebKit test.** "host + Ava, Zion, Omar: paced cards, live marks, Free Space, hidden
variable gates, three or more Bingos, game complete, rematch" did not pass in WebKit in three attempts: once a
banner was not seen within 20 seconds, twice the test reached its 30-minute limit waiting for a player's mark
request that the page never sent. The server answered every request it received in 50–200 ms.

- The same test passed in Chromium. In WebKit the other five Bingo tests passed on the patched tree, among them
  join by code and QR, marking, Free Space, a win, refresh and host takeover.
- The Bingo pages are a game document served by a route handler; the upgrade does not change its script.
- Earlier work on Bingo records this test as needing a 30-minute budget in WebKit (22.7 minutes then) and a banner
  race, and passing after re-runs.
- The hosted Bingo review, run after the release on a staging preview of this runtime, passed 41 of 41: a real
  game to three Bingos with the host in Chromium, one student in WebKit at 390 × 844 (nine correct taps and the
  first Bingo) and two in Chromium. See the correction below.
- **Not done:** the same WebKit test was not run on 16.4.2 today. An agent cannot start the 16.4.2 development
  server (Next's notice stops it every time on this repository), and running it with the agent markers removed was
  refused by the permission system.

It is recorded as open. A person can settle it by running
`node scripts/run-math-bingo-live.mjs e2e --project=webkit live.spec.ts` on `v1.2.53` and on `v1.2.54`.

## Hosted verification on staging (patched build)

| Check | Result |
| --- | --- |
| Staging certification (`invoke-nextjs-hotfix-staging.ps1 -Stage certify`) | PASS: gate locked (5 paths), unsigned webhook 400, 19 routes with no 5xx, six security headers, scheduler 401 twice, images and optimizer, 8 pages with 0 console errors |
| Vercel build | `Next.js 16.4.5 (Turbopack)`, no security stop |
| ShowMe pass review (4 browser profiles) | 64/64; 0 synthetic accounts left. The same count as the v1.2.52 release |
| Google Ads conversion review (4 profiles) | 128/128: Consent Mode defaults, the tag loading once, Global Privacy Control, the click cookie, Checkout reaching Stripe's test page, the conversion file behind its credential, the Privacy switch; 0 accounts left |
| Google tag Content Security Policy probe | 108 page loads, 0 requests refused |
| Subscription certification | PASS |
| Stripe test-clock lifecycle (test mode only; live keys refused by the script) | 11/11 stages: trial, four payments, a missed webhook healed, a failed payment with grace and recovery, cancel at period end, expiry denying games and Online Math Prep, a new subscription. Cleanup left 0 rows |
| Math Tug of War classic review | 102/102; 4 synthetic users and 2 rooms removed |
| Quiz PDFs review | 240 ok, 37 failed, and exactly the same 37 on the unpatched v1.2.53 build (below). With the review corrected afterwards: 277 ok, 0 failed |
| Math Bingo Live review | Before the release: 5 of 6 on the patched and the unpatched build alike, on previews that could not serve the game (below). After it, on a preview that could: 41/41 |
| Super Admin session contract (staging database) | `verify` PASS, `contract` PASS |

**The 37 Quiz PDF review failures are not from this release.** Run against the unpatched v1.2.53 preview
(`mathnexa-platform-staging-l97j341ta`), the review gives the same 240 and the same 37, line for line. Thirty-six
say the preview page holds one web-storage entry where the review expects none; the application writes none there,
and the Google tag (added in v1.2.48, after the review was written) does. One says the Worksheet Generator entry
sends a subscriber to `/access?next=/map-prep`; on a staging host that is what the ShowMe gate (v1.2.52) does,
because the pass cookie cannot leave `vercel.app`. No page changed. The review was corrected on 2026-11-20
(`75c356d`): it names what is in web storage, allows the tag's own `_gcl_ls` entry and nothing else, and reads
MathNexa's own redirect for the Worksheet Generator entry. It then gave 277 ok, 0 failed on the patched runtime.

**Correction, 2026-11-20: the Bingo review script was not out of date.** The first version of this record said
it was. On the staging database the Bingo catalog entry is a draft (it was published on production only), and a
draft is served only by a preview deployed with `MVH_MATH_BINGO_LIVE_PREVIEW=staging-owner-review`
(`docs/math-bingo-live-v1.md`, "Availability gate"). The previews used before the release were not deployed that
way, so the host page answered 404 once the teacher had signed in, on the patched and the unpatched build alike,
and the review timed out without saying why. On a preview deployed with that setting
(`mathnexa-platform-staging-e6wn8qe53`, built from `75c356d`, the released runtime plus the review scripts) it
passed 41 of 41. The review now reports the screen it is on and names the missing setting when the page is a 404.

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-next-16-4-5` with these values:

- `RELEASE_CERTIFIED_RUNTIME=5cec655`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_EmpK6W9AgXMzNSJzBAp9AufM2ysH`
- `RELEASE_PURPOSE=v1.2.54-nextjs-16.4.5-security-patch`

Logs and the check results are in `C:/GitHub/_artifacts/mathnexa-nextjs-16-4-5-qa/release/` (outside the repository).

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 10:50:59 | PASS. The apex served `dpl_EmpK6W9AgXMz…` (the rollback target), retained. |
| probe-live (before) | 10:51 | PASS, 22/22 |
| deploy-preview | 10:51:58 | PASS. `dpl_BCHbDA5j4D17…` is Ready and holds neither the production alias nor the webhook host. Next 16.4.5, sharp 0.35.5. |
| probe-preview | 10:54:04 | PASS, 7/7 |
| promote | 10:55:34 | PASS. The alias moved from `dpl_EmpK6W9AgXMz…` to `dpl_BCHbDA5j4D17…`. |
| probe-live | 10:56 | PASS, 22/22 |

## Live production verification (2026-11-20 from 10:56 UTC; read-only and anonymous)

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `f46c364f2104a300d14d5ee55b2c8c68aa8f4569`, `production-platform`, search indexing `enabled`, payments `live`. The apex serves `dpl_BCHbDA5j4D17ikYBRcvHob3yj3Hd`. |
| Image optimizer harness | 14/14: shipped assets served, a shipped SVG through the optimizer refused (400) |
| 23 signed-out routes | No 5xx. Public pages 200; `/games`, `/map-prep`, `/worksheets`, `/quizzes`, `/homework`, `/account`, `/subscription` and `/pricing` 307 to `/access`; `/admin` 404; `/admin/sign-in` 200 |
| Google tag | `GTM-53VDQ6ZL` and `gtm.js` on the home page, as before the release; no `X-Powered-By` header |
| ShowMe Math | `/map-prep/pass` with no session → 307 to `/access?next=/map-prep`; a ShowMe grade page with no pass ends on the same page |
| Runtime logs | No `error` and no `fatal` entry on the new deployment in the minutes after promotion |

No synthetic account was created in production, so no sign-in, checkout or admin session was exercised there.

## Known limitations and owner follow-ups

- **The local Bingo WebKit test above** has still not passed on this computer. The hosted review (41/41, with a
  WebKit student) shows the game working in WebKit on this runtime; the local test itself is open until a person
  runs it on both versions.
- **The Quiz PDFs review** was out of date with the product (the Google tag's storage entry, the ShowMe gate) and
  is corrected in `75c356d`. The Bingo review needs a preview deployed with the staging owner preview on.
- **Not checked by hand:** a real customer's sign-in, a real checkout, the owner's Super Admin session with a real
  authenticator, and any physical phone or tablet.
- **Next.js 16.4.6** adds automatic compression of route handler responses and was left out on purpose.
- **Development-tooling audit findings** (14: `vite`, `vitest`, `zod`, `minimatch` and their dependents) are
  unchanged. The release gate, production packages at high severity, passes.
- **ShowMe Math** (a separate repository) is still on Next.js `~16.4.2`; none of the seven advisories reaches a
  static export, and its patch belongs in a branch of its own.

## Rollback

`npx vercel@59 promote dpl_EmpK6W9AgXMzNSJzBAp9AufM2ysH --scope bright-path-ed-tech` puts v1.2.53 back. Nothing
else needs undoing: no migration, no environment variable and no ShowMe change belongs to this release.
