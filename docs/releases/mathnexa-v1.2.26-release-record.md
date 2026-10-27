# MathNexa v1.2.26 — homepage redesign: online math prep

Released 2026-10-27 (UTC) under explicit owner approval ("I approve the MathNexa homepage redesign in PR #2 for a
controlled production release, provided the final preflight checks pass. Use only the reviewed staging candidate at
commit 1f24bba."). It ships the redesigned public homepage reviewed on staging in PR #2: a worked ratio problem in
the hero, the Online Math Prep toolkit card first, and the owner's round-3 corrections and final-acceptance wording.

Only the homepage changed. There is no database migration, no environment change and no dependency change. Sign In,
Authorize Code, account navigation, subscriptions and checkout, entitlements, Super Admin, games, the PDF pages, the
Worksheet Generator and ShowMe Math Lab are unchanged. The Featured games section is byte-identical to v1.2.25.
Design decision closed by the owner on 2026-10-26: **Keep Featured Games unchanged.** The proposal to swap the
toolkit's Math Games image was not applied.

The change control and every review round are in `docs/releases/mathnexa-homepage-online-prep-redesign.md`.

| | |
| --- | --- |
| Version | `v1.2.26`. Production was built from `1f24bba` (`1f24bbae5a7cfe6269a05a74ad630cd1a5098f6a`, tree `b9334f14798586f2f95ab11ec74f50253507ecd0`): `/api/health` reports `build` `1f24bba…`. |
| Tag | Annotated tag `v1.2.26` (tag object `c40fcae2dd18868548737af24c174cca4a0ad855`, message "MathNexa v1.2.26: homepage redesign for online math prep") points at `1f24bba`, the production build. Created and pushed 2026-10-27 11:02 UTC on the owner's word. |
| Branch / PR | `feature/homepage-online-prep-redesign` from `main` `bcc0106` (v1.2.25 + record); PR #2 MERGED 2026-10-27 05:32:38 UTC by fast-forwarding `main` (GitHub records `bec755f` as the merge commit; all 12 PR commits are on `main`) |
| Certified runtime | `1f24bba`, the reviewed staging candidate. The pipeline's runtime diff from it is empty; the release ran from a clean worktree at that exact commit (`C:/GitHub/mathnexa-v1-2-26`, tracked files only), so no local or QA files were uploaded. |
| Staging | `dpl_HhRQNtRTFKBKo9aTwF5uB3E7kakW` (`https://mathnexa-platform-staging-qb8jdznv1-bright-path-ed-tech.vercel.app`), build `1f24bba`; unchanged between the owner's review and the release |
| Production candidate | `dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7` (`https://mathnexa-platform-production-8e47xxnu6-bright-path-ed-tech.vercel.app`), built from `1f24bba` with `--prod --skip-domain` |
| Production runtime | `dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7`, `production-platform`, payments `live`. Promoted 2026-10-27 05:23:11–05:23:34 UTC. |
| Rollback runtime | `dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y` (v1.2.25, build `6769f15`), retained and READY. `dpl_FMypQGtyH77iytSB8mVukfeANhUX` (v1.2.24) is also READY. |
| Main | Fast-forwarded from `bcc0106` to the release record `bec755f` with no force, which merges PR #2. The production Vercel project has no Git link, so this did not deploy production; it rebuilt the staging project from `main`. `main` contains `1f24bba` and every commit since v1.2.25 on a linear history; `1f24bba..bec755f` changes docs only. |
| Migration / environment / dependencies | None / unchanged / unchanged (the lockfile is identical to v1.2.25) |

## Commits

| Commit | Change |
| --- | --- |
| `34d2505`, `de5ce60`, `511a199` | Round 1: the online-prep homepage, its e2e updates and the change-control record |
| `f7e7d94`, `06621c2`, `165b4ac` | P1 round: play-when-seen board, "Your turn", self-hosted handwriting font, phase 9 baselines |
| `d1b8dbe`, `7d7de04`, `d3eb3e2` | Round 3: two sections removed, the "Online Math Prep" preview, phase 9 baselines |
| `cc81f83`, `1f24bba` | Final acceptance: the margin note reads "find the unit rate"; the results record. `1f24bba` is the production build. |
| `bec755f` | Docs only: this file, and the change-control record closes the Featured Games decision |
| post-release reconciliation | Docs only: the tag, PR #2 status and the post-release reconciliation below |

## Preflight (2026-10-27, on `1f24bba`)

- Branch, PR #2 head and the staging deployment were unchanged at `1f24bba`; PR checks (Vercel) passed; PR mergeable.
- Full regression re-run on `1f24bba` (`qa-artifacts/homepage-redesign/release/gates/`, local Supabase):

| Check | Result |
| --- | --- |
| Protected-page screenshots (90) vs the v1.2.25 baseline | 82 pixel-identical (Super Admin included); 8 homepage, each pixel-identical to the reviewed round-4 image |
| Functional facts (sign-in, Authorize Code, trial and checkout entry, product reach, navigation) | 343/343 identical to the reviewed run |
| phase 9 / school access (Authorize Code) / Tug of War free access | 17/17 / 21/21 / 8/8 (no snapshot updated) |
| Quiz PDFs / Number Cross | 20/20 / 1/1 |
| Unit core / web | 245/245 / 908 passed, 1 skipped |
| `test:security`, bundle audit, Number Cross launch audit, protection bypass | 321/321, pass, pass, 7/7 |
| Phase 11 and Quiz PDF audits, typecheck, lint, build | pass, pass, clean, 0 errors (8 pre-existing warnings), pass |

- Production preflight with `RELEASE_CERTIFIED_RUNTIME=1f24bba`: PASS (the apex served `dpl_8yXvDHZc…`, the rollback).
- Live baseline before the change: `probe-live` 22/22; Stripe vs DB (read-only, restricted key) 4/4 matched.

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-v1-2-26` with these values:

- `RELEASE_CERTIFIED_RUNTIME=1f24bba`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y`
- `RELEASE_PURPOSE=v1.2.26-homepage-online-prep-redesign`

Logs are in `qa-artifacts/homepage-redesign/release/release-*.log` (git-ignored). The evidence JSONs are under `%TEMP%`.

| Stage | UTC | Result | Evidence |
| --- | --- | --- | --- |
| preflight | 05:19:16–05:19:27 | PASS: the apex served `dpl_8yXvDHZc…` = rollback | `…-preflight-1793078367874.json` |
| deploy-preview | 05:19:40–05:21:33 | PASS: `dpl_4RKPWVDWd6…` Ready, no domain; next 16.4.2, sharp 0.35.5 | `…-deploy-preview-1793078493999.json` |
| probe-preview | 05:21:47–05:22:53 | PASS, 7/7. Health shows build `1f24bba`, payments live. The webhook answers 400. Every other path 308s. The scheduler reaches the route and fails closed. No 5xx. | `…-probe-preview-1793078573659.json` |
| promote | 05:23:11–05:23:34 | PASS: alias `dpl_8yXvDHZc…` → `dpl_4RKPWVDWd6…` | `…-promote-1793078614446.json` |
| probe-live | 05:23:43–05:23:58 | PASS, 22/22 | `…-probe-live-1793078638194.json` |

## Post-release checks (read-only, anonymous)

| Check | Result |
| --- | --- |
| `/api/health` | `ready`, build `1f24bbae5a7cfe6269a05a74ad630cd1a5098f6a`, `production-platform`, payments `live`; the apex `data-dpl-id` is `dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7` |
| 25 public and protected routes at 1440 and 390 px vs the same capture of v1.2.25 just before the release | 50/50 identical in final URL, status, visible text, form controls, links and height (Sign In, Sign Up, Access, account, subscription, every product, Tug of War, info pages) |
| Homepage | 200, no console errors, no horizontal overflow at 1440, 390 and iPhone (WebKit); "find the unit rate" and Online Math Prep present; "find 1 cup first", "Missouri" and both removed sections absent |
| Authorize Code card, account buttons, Featured games | Markup identical to v1.2.25 at both widths (only the per-build server-action id and key differ) |
| Animations | 24 at 1440 and 390 px, every name, target, duration, delay, easing and fill identical to the reviewed build; board frames at 600, 1500, 2600 and 5000 ms pixel-identical to the review; phone hold 22/22; reduced motion 0 running |
| Homepage links | 19 links: every one answers 200; product links reach `/access?next=…` when signed out, as before |
| Image optimizer harness | 14 probes, 0 failed |
| Runtime logs for the new deployment (first hour) | 5xx, error, fatal: 0, 0, 0 |
| Stripe vs DB (read-only, restricted key) | 4/4 subscriptions matched; entitlements unchanged (3 active, 1 expired) |
| ShowMe Math Lab | `https://showme.mathnexa.com` still serves `dpl_6FowgYkkos68t6b5Q3pBqK8yLpL3` (v1.2.18): same ETag and Last-Modified, no new deployment |

## Post-release reconciliation (2026-10-27, 11:06–11:12 UTC, after the tag)

Read-only and anonymous, as above: no sign-in, no form submission, no checkout session, no payment. Evidence is in
`qa-artifacts/homepage-redesign/release/` (`live-reconcile/`, `anim-reconcile/`, `subscriber-readonly-reconcile.log`;
git-ignored).

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `1f24bbae5a7cfe6269a05a74ad630cd1a5098f6a`, `production-platform`, payments `live`. `vercel inspect mathnexa.com`: `dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7`, Ready; every `dpl` reference in the apex HTML is that id. `www` 308s to the apex. |
| Deployments since the release | Production project: the newest deployment is still `dpl_4RKPWVDWd6…` (no deployment after it). Staging project: two builds at 05:32:36 and 05:32:39 UTC from the `bec755f` pushes (branch preview `dpl_7gE7TaqWGdBpAUp2wT3Vd6SJNLLk`, `main` `dpl_Cb1Z8Vp1kwmwoub3RGebw3Q6CgnW`), none since; the tag push started no build. |
| Pages (26 routes at 1440 and 390 px) | 52/52 identical to the post-release capture; the 50 non-home pages identical to v1.2.25 (final URL, status, visible text, form controls, links, height). No horizontal overflow. The only console error is `/teacher`'s 404, the same as on v1.2.25. |
| Homepage content | H1 "Online math prep that shows the thinking, not just the answer." under "Online Math Prep · Grades 3–8"; "find the unit rate" present; "Inside Online Math Prep", "Made for the kitchen table", "find 1 cup first" and "Missouri" absent. The "Online Math Prep" preview (`online-math-prep-preview.webp`) is served byte-identical to the reviewed file at `1f24bba` (SHA-256 `ce3b08c04b6b38e0…`). WebKit (iPhone 13): 200, no errors, no overflow. |
| Authorize Code card, account buttons, Featured games | Markup identical to v1.2.25 at both widths after normalising per-build tokens, and byte-identical to the post-release capture |
| Animations | 24 at 1440 and 390 px with timings identical to the reviewed build; board frames at 600, 1500, 2600 and 5000 ms: 0 changed pixels; phone hold 22/22; reduced motion 0 running |
| Sign In, subscription and checkout entry | `/sign-in` 200 with form controls identical to v1.2.25 (not submitted). The trial button goes to `/sign-up?next=/subscription` (200); `/subscription` and `/pricing` reach `/access?next=/subscription` signed out, as on v1.2.25 |
| Product links | All 19 homepage links answer 200. Homework PDFs (`/homework`), Quiz PDFs (`/quizzes`), Worksheet Generator (`/worksheets`), Math Games, Online Math Prep (`/map-prep`), Tug of War and account reach `/access?next=…` signed out, as on v1.2.25 |
| Paid subscribers | Stripe vs DB (read-only, restricted key): 4/4 matched; entitlements 3 active, 1 expired; output identical to the post-release run |
| Runtime logs since the release | 5xx, error, fatal: 0, 0, 0 |
| ShowMe Math Lab | `vercel inspect showme.mathnexa.com`: `dpl_6FowgYkkos68t6b5Q3pBqK8yLpL3` (v1.2.18), still the newest ShowMe production deployment; ETag `"7e686cff57eb2b157144fa0128084aab"`, Last-Modified Sun, 25 Oct 2026 21:10:03 GMT |
| Rollback | `dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y` (v1.2.25) is Ready |
| Git | `main` `bec755f` contains `1f24bba` (the tag's commit), `bcc0106` and v1.2.25. No merge, fast-forward, reset or tag change is needed for the release itself. |

## Known limitations (not verified by this release)

- **Firefox.** It cannot run on the review machine (Windows App Control); the owner checks it.
- **Signed-in production use.** Nothing here signs in to production. Signed-in behaviour was proven on local
  production builds against v1.2.25 (identical), and the anonymous surfaces above are identical. The owner's own
  sign-in, an Authorize Code entry and a subscriber's product access remain the owner's manual checks.
- **Checkout.** Checked only as far as the signed-out entry routes; no Stripe Checkout session was opened in
  production.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-26
$env:RELEASE_CERTIFIED_RUNTIME = '1f24bba'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y
```

Fallback: `npx vercel@59 promote dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y --scope bright-path-ed-tech`. A rollback brings
back the v1.2.25 homepage only; it touches no data, billing or access rule.
