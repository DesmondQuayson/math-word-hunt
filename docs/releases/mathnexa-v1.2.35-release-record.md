# MathNexa v1.2.35 — Math Bingo Live

Released 2026-11-05 (UTC) under explicit owner approval. The owner reviewed the game locally and on staging, approved
the pre-release steps, and answered "Release as is" after the 50-player staging load test (correct at 50 students, about
4× slower than at 30; see below).

**What it is.** A free live classroom Bingo game. A teacher hosts from a signed-in MathNexa account at
`/games/math-bingo-live/host`; students join at `/join` with a six-digit game code and a display name. Students have no
account, there is no chat, the room code only lets a student join (host authority is the teacher's signed-in session),
and future questions and answers never reach a student's browser.

**Release state.** Live and **published** since 2026-11-05 11:43:58 UTC. The code and database went live at
10:19–10:26 UTC with the catalog entry as a draft (every Bingo address hidden); it was published at the owner's
instruction once the deploy had been verified. See "Publish" below.

| | |
| --- | --- |
| Version | `v1.2.35`. Production was built from `1ea2865` (`1ea28652fe75bec9329e76989373f3d79314e4cc`, tree `b7ec5e5abee6170d2c07e8c260710298b628d55b`). `/api/health` reports build `1ea2865…`. |
| Certified runtime | `e0c92a7`, the staged build. `apps`, `packages`, `supabase`, `package.json`, the lockfile, `turbo.json` and `tsconfig.json` are identical between `e0c92a7` and `1ea2865`; the later commits change only scripts and docs. The pipeline enforces this. |
| Tag | Annotated tag `v1.2.35` ("MathNexa v1.2.35: Math Bingo Live") → `1ea2865`, pushed after live verification of the deploy. |
| Branch / PR | `feature/math-bingo-live` from `main` `7a846c4` (v1.2.34 record). PR [#11](https://github.com/DesmondQuayson/math-word-hunt/pull/11). |
| Merge | `main` was still `7a846c4`, so origin `main` was fast-forwarded to `1ea2865` and then to this record, with no merge commit and no force. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-35`, detached at `1ea2865`, tracked files only, `node_modules` junction. Keep it for the rollback commands. |
| Staging | `dpl_LQ5WXz5AgQpTWMhBSESognzwF7sT` (build `e0c92a7`), browser review 40/40. |
| Production candidate | `dpl_AGfpNRezZ5eKqQ7KtyR7VuGAD54G` (`https://mathnexa-platform-production-ak9v8i799-bright-path-ed-tech.vercel.app`), built with `--prod --skip-domain` |
| Production runtime | `dpl_AGfpNRezZ5eKqQ7KtyR7VuGAD54G`, `production-platform`, payments `live`. Promoted 2026-11-05 10:25:39–10:26:01 UTC. |
| Rollback runtime | `dpl_Br4muBiiqyYKayibX3TnYPhjKmpW` (v1.2.34, build `8de8407`), retained and Ready. |
| Migration | `supabase/migrations/20261103100000_math_bingo_live.sql`: additive only (three tables, `bingo_*` functions, one draft catalog row). No existing table is altered. |
| Environment / dependencies | Unchanged / unchanged. No project environment variable was added; production does not set `MVH_MATH_BINGO_LIVE_PREVIEW`. |

## Release gates (on the release runtime, 2026-11-04/05, local Supabase)

| Check | Result |
| --- | --- |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 1126 passed, 1 skipped |
| `test:security` | 322/322; platform bundle and Number Cross audits pass; bypass tests 7/7 |
| Phase 9 / school access / Tug of War free access | 30/30 / 21/21 / 8/8 |
| Math Bingo Live e2e | 15 passed; the WebKit three-Bingo game ran past its 15-minute limit (headless WebKit clicks take about 4 s each on this machine; it timed out the same way before) |
| pgTAP | 1103/1104. The failure is the suite-cleanup check counting rows left in the local test database by earlier runs (6 local runner accounts, 13 webhook events), not a code fault. |

## Staging load test (`scripts/load-math-bingo-live-staging.mjs`)

A real teacher screen plus simulated students, all from one address the way a school network looks. Network round trip
alone: about 0.13 s.

| Students | Joined / errors / rate-limited | Question updates p95 | Taps p95 | Teacher screen p95 / max |
| --- | --- | --- | --- | --- |
| 30 | 30/30 · 0 · 0 | 0.38 s | 0.42 s | 0.9 s / 1.9 s |
| 50 (two runs) | 50/50 · 0 · 0 | 1.4–1.6 s | 2.2–2.6 s | 3.1–3.6 s / 8–13 s |

At 50 students every game finished with 10 winners in order and every student saw at least 95.7% of the questions,
but replies were about 4× slower. Each tap locks the room row and bumps the room version, so taps queue and most polls
get a full reply; the teacher's full-room view is the heaviest request. The owner accepted this for v1.2.35. A follow-up
can stop the version bump per tap and lighten the teacher view, then re-run the 50-student test.

## Production database (`scripts/invoke-math-bingo-live-production.ps1`)

| Stage | UTC | Result |
| --- | --- | --- |
| audit (read only) | 10:17:16–10:17:29 | PASS. Production identity by four signals (vault ref is not staging, pooler user `postgres.<ref>`, REST API matches the database, the 8 production Grade 6 quiz ids). 37 history rows; pending exactly `20261103100000`; no remote-only versions; no Bingo object. |
| migrate | to 10:19:16 | PASS. The dry run listed only `20261103100000_math_bingo_live.sql`; applied with the Supabase CLI. History 37 → 38 with the other 37 rows unchanged; catalog 5 → 6 and catalog versions 12 → 13; the five existing games, accounts (37), auth users (37), entitlements (4), subscriptions (4) and content resources (225) unchanged. Catalog row: `draft`, internal, route `/games/math-bingo-live/host`, display order 34, grades 1–6. Tables RLS-forced with no anon/authenticated grants; every `bingo_*` function SECURITY DEFINER, EXECUTE for `service_role` only. |
| smoke | 10:19:29–10:19:31 | PASS. Synthetic hashes only, no account: create, join, duplicate name ("release ava 2"), unknown code `not-found`, host view LOBBY with the chosen patterns, a stranger's host view `not-found`, player view, close, seat gone after close. The publishable (browser) key is refused on the table and the function. 0 synthetic rooms and 0 join-failure rows left. |

Evidence JSON: `qa-artifacts/math-bingo-live/production/` (git-ignored).

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` from `C:/GitHub/mathnexa-v1-2-35` with `RELEASE_CERTIFIED_RUNTIME=e0c92a7`,
`RELEASE_ROLLBACK_DEPLOYMENT=dpl_Br4muBiiqyYKayibX3TnYPhjKmpW`, `RELEASE_PURPOSE=v1.2.35-math-bingo-live`. Logs:
`qa-artifacts/math-bingo-live/production/release/`; evidence JSONs under `%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 10:20:12–10:20:51 | PASS. The apex served `dpl_Br4mu…` (the rollback target), retained. |
| deploy-preview | 10:21:31–10:23:20 | PASS. `dpl_AGfpNRez…` Ready and protected; Next 16.4.2, sharp 0.35.5, tree `b7ec5e5`. |
| probe-preview | 10:23:28–10:24:32 | PASS, 7/7. Candidate `/api/health` reported build `1ea2865`. |
| promote | 10:25:39–10:26:01 | PASS. The alias moved from `dpl_Br4mu…` to `dpl_AGfpNRez…`. |
| probe-live | 10:26:01–10:26:16 | PASS, 22/22 |

## Live production verification (anonymous, read only)

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `1ea28652…`, `production-platform`, search indexing `enabled`, payments `live` |
| 32 public routes vs a capture just before the deploy | 24 identical. The 8 differences are all Bingo addresses, as designed for a draft: `/join` (and `?code=`) is still 404, now the game's own plain "Not Found"; `/games/math-bingo-live` and `/play` now redirect to the host screen; the host screen sends signed-out visitors to sign in (a signed-in teacher gets 404 while draft); the game API answers GET with 405; the game's static script `/internal-games/math-bingo-live/src/host.js` is served (engine code only, no answers or deck). Sitemap and `robots.txt` unchanged. |
| Game hidden while draft | `GET /join` 404; `POST /api/games/math-bingo-live/play` (join and state, same-origin headers) 404 `{"error":"not-available"}` |
| Runtime logs for `dpl_AGfpNRez…` since promotion | 5xx, error, fatal: 0, 0, 0 |

## Publish (2026-11-05 11:43:58 UTC, owner instruction)

Two attempts from Super Admin did not reach production: the catalog stayed `draft`, and the production admin tables
showed no Super Admin session since 2026-10-07 and no admin action that day. The owner then said "Publish it for me".

`scripts/invoke-math-bingo-live-production.ps1 -Stage publish` called `transition_game_catalog_entry`, the database
function behind Super Admin's Publish button, with the only active MFA-enrolled admin (the owner) as the actor. The
result is the same as a click:

| Check | Result |
| --- | --- |
| Catalog entry | `draft` → `published`, lock version 1 → 2 |
| Catalog version history | 13 → 14 (one row) |
| Super Admin audit log | `admin.game.publish` at 11:43:58Z, status `published` |
| Everything else | The five other games, migration history, accounts (37), auth users, entitlements, subscriptions and content resources unchanged |

Live checks afterwards (anonymous, read only):

| Check | Result |
| --- | --- |
| `/join` | 200 "Join Math Bingo Live · MathNexa", `noindex, nofollow`, `Cache-Control: private, no-store`, `X-Frame-Options: DENY`, CSP `connect-src 'self'`, `frame-ancestors 'none'`. At 375 px the code screen renders and every game file loads (200). |
| `/math-games` | Lists 6 games; Math Bingo Live is the sixth |
| 32 public routes vs the capture taken while draft | 29 identical; only `/join`, `/join?code=…` (404 → 200) and the `/math-games` text (the new card) changed. Sitemap and `robots.txt` unchanged. |
| Game API (`POST /api/games/math-bingo-live/play`) | Unknown code → 404 `room-not-found`; no seat → 404 `seat-not-found`; a cross-site request without the game header → 403 `forbidden` |
| Host | `/games/math-bingo-live/host` signed out → 307 to `/access?next=/games/math-bingo-live/host`; host API signed out → 401 `host-sign-in-required` |
| Runtime logs for `dpl_AGfpNRez…` | 5xx, error, fatal: 0, 0, 0 |

Not done on production: a full game with a teacher account, because that needs a sign-in to mathnexa.com. The owner's
first real classroom game (or one hosted from the owner's account) is the end-to-end check.

Students join at `/join`; signed-in teachers host from `/games/math-bingo-live/host` or the subscriber catalog. Free
teachers cannot open `/games`, so they reach it by direct link (no product page or homepage card in this release).

## Rollback

- **Game only (no deploy):** Super Admin → Games → Math Bingo Live → Archive, or
  `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-bingo-live-production.ps1 -Stage archive`
  (same function, owner's instruction). New rooms and joins are refused; open rooms expire within hours.
- **Whole app:**

  ```powershell
  Set-Location C:\GitHub\mathnexa-v1-2-35
  $env:RELEASE_CERTIFIED_RUNTIME = 'e0c92a7'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_Br4muBiiqyYKayibX3TnYPhjKmpW'
  node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
  node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_Br4muBiiqyYKayibX3TnYPhjKmpW
  ```

  Fallback: `npx vercel@59 promote dpl_Br4muBiiqyYKayibX3TnYPhjKmpW --scope bright-path-ed-tech`. v1.2.34 does not know
  the Bingo routes, so they return 404 there.
- **Database:** nothing to undo. The tables and the catalog row can stay (archive the row); nothing else depends on them.

## Known limitations and follow-ups

- 50-student classes work but are about 4× slower than 30 (above).
- Load: each student sends about one request per second during a game (about 110,000 requests per class-hour for 30
  students). Worth checking against the Vercel and Supabase plan limits once classes use it.
- No product page, homepage card, QR code or profanity filter in this release.
- Carried over: Math Vocabulary Hunt grade minimum 6 in Super Admin; Search Console; the Firefox "Zoom text only" check.
