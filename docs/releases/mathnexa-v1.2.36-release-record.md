# MathNexa v1.2.36 — Math Bingo Live final gameplay

Released 2026-11-06 (UTC) under explicit owner approval ("FINAL STAGING OWNER REVIEW APPROVED … Proceed to prepare the
FINAL PRODUCTION RELEASE … Do not upgrade Supabase"). Supabase was not changed or upgraded.

**What changed for teachers and students**

- **No repeated questions in a game.** Every question has a canonical identity (`5 + 7` and `7 + 5` are one question;
  subtraction and division keep their order; Fraction Bingo calls each fraction once). The database refuses to start a
  game whose deck repeats or mislabels a question; the Called list is that deck. Different questions may still share an
  answer (`7 + 5`, later `8 + 4`), so a second 12 on a card is useful.
- **Every student's answers are independent.** Fixed a student-page state merge that could blank a student's own mark
  when another player's announcement arrived at the same time (the database never shared answers).
- **QR joining**, numeric code kept: large QR in the lobby, compact QR on the live board (tap for a large one), JOINING
  LOCKED when locked; production QR → `https://mathnexa.com/join?code=…`.
- **Optional emoji** beside student names (33 curated choices, Random, none), everywhere names appear.
- **50-student speed** (from the staged speed round): ordinary taps touch only the student's row, adaptive polling,
  smaller replies, host sign-in reuse, every card dealt at Start.

Math Bingo Live stays a **free** game: catalog `published`, access policy `authenticated-free` (any signed-in MathNexa
account hosts, no subscription), students join with a code and a name only.

| | |
| --- | --- |
| Version | `v1.2.36`. Production built from `52568df` (`52568dfb5641d16ea015fdfe03317707ceb54413`, tree `cf0a4b55e6321cf00dd21c55d80d65be5c2d681d`). `/api/health` reports build `52568df…`, `production-platform`, payments `live`. |
| Certified runtime | `4993dee` (staged, owner-reviewed). `apps`, `packages`, `supabase`, `package.json`, the lockfile, `turbo.json` and `tsconfig.json` are identical between `4993dee` and `52568df` (0 diff lines); later commits change only tests, scripts and docs. The pipeline enforces this. |
| Tag | Annotated `v1.2.36` → `52568df`, pushed after live verification. |
| Branch / PR | `feature/math-bingo-live-final-gameplay` (includes `perf/math-bingo-live-50`) from `main` `86beab1`. PR [#12](https://github.com/DesmondQuayson/math-word-hunt/pull/12), CI 2/2. |
| Merge | `main` was still `86beab1`; origin `main` fast-forwarded to `52568df` (08:05:43Z) and then to this record. No merge commit, no force. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-36`, detached at `52568df`, tracked files only, `node_modules` junction. Keep it for the rollback commands. |
| Staging | `dpl_4pfXr32LH5NaUbW5PxwvPiEA5b6n` (build `4993dee`), owner review approved. |
| Production runtime | `dpl_5WiDy4qAJEkU5qHCWwubiWPtiSBN` (`https://mathnexa-platform-production-cps72kh9z-bright-path-ed-tech.vercel.app`), built `--prod --skip-domain`, promoted 08:02:46Z. |
| Rollback runtime | `dpl_AGfpNRezZ5eKqQ7KtyR7VuGAD54G` (v1.2.35, build `1ea2865`), retained and Ready. |
| Environment / dependencies | Unchanged / unchanged. |

## Release evidence carried into this release (preserved)

`docs/releases/evidence/mathnexa-v1.2.36/` holds the staging load reports verbatim with SHA-256 sums; the narrative is in
`owner-review/math-bingo-live-final-gameplay-2026-11-06.md`.

| Staging load (build `4993dee`) | Polls p95 | Taps p95 | Teacher p95 | Same-answer burst | Checks |
| --- | --- | --- | --- | --- | --- |
| 30 students | 0.53 s | 0.65 s | 0.81 s | 30/30 accepted | 17/17 |
| 50 students, run 1 | 1.09 s | 1.37 s | 1.62 s | 50/50 | 15/17 |
| 50 students, run 2 (Supabase slowdown) | 1.70 s | 1.98 s | 3.00 s | 50/50 | 14/17 |
| 50 students, run 3 | 1.09 s | 1.46 s | 1.61 s | 50/50 | 15/17 |
| 50 students, run 4 (Supabase slowdown) | 2.01 s | 4.10 s | 3.06 s | 50/50 | 14/17 |

Targets ≤ 1.0 / 1.5 / 1.5 s. 30 students meet every target; at 50 students polls and the teacher view stay about 0.1 s
over even on good runs and slow down further with the Supabase API tier (the open capacity question; no upgrade made).

Gates on the release runtime: unit core 245/245, web 1,184 passed / 1 skipped; pgTAP 1,274/1,275 (the known local
leftover-data check); `test:security` 322/322 with both audits and bypass tests 7/7; typecheck clean; lint 0 errors;
Math Bingo Live browser tests 19/19 (Chromium, WebKit, devices); host layout 50 checks. Release-candidate build of
`52568df`: pass (72 pages), bundle and Number Cross audits pass, Bingo + access-policy unit tests 181/181.

## Production database (`scripts/invoke-math-bingo-live-production.ps1`)

| Stage | UTC | Result |
| --- | --- | --- |
| audit (read only) | 07:57:20 | PASS. Production identity proven; pending exactly `20261106100000`, `20261106110000`, `20261106120000`, `20261107100000` in that order; no remote-only versions; Bingo objects present; catalog row `published`. |
| migrate | 07:57:35–07:58:10 | PASS. Dry run listed exactly the four files; applied in order with the Supabase CLI. History 38 → 42 with the other 38 rows unchanged (digest); catalog 6 / catalog versions 14 unchanged; accounts 37, auth users 37, entitlements 4, subscriptions 4, resources 225 and the five other games unchanged. Speed functions and final-gameplay objects (emoji column + check, 5-argument join, deck and emoji checks) locked to the server. The CLI printed a cosmetic warning about caching its own catalog (a temp certificate file), after applying. |
| verify | ~07:58:20 | PASS. RLS forced, no browser grants, every `bingo_*` function definer + service-role only; catalog `published`; other games unchanged. |
| smoke | ~07:58:25 | PASS. Synthetic room contract; the browser key is refused on the table and the functions; 0 synthetic rows left. |

Order rationale: every migration is backward compatible with the v1.2.35 application (new functions and a nullable
column; the seven-argument Start used by v1.2.35 is untouched), so the database went first and the old app kept working
until the new one was promoted.

## Release pipeline (`scripts/run-nextjs-hotfix-production.mjs`, from `C:/GitHub/mathnexa-v1-2-36`)

`RELEASE_CERTIFIED_RUNTIME=4993dee`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_AGfpNRezZ5eKqQ7KtyR7VuGAD54G`,
`RELEASE_PURPOSE=v1.2.36-math-bingo-live-final-gameplay`. Logs: `qa-artifacts/math-bingo-live/production/release-v1.2.36/`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 07:56:31 | PASS. Apex served `dpl_AGfpNRez…` (the rollback target), retained. |
| deploy-preview | 07:58:55–08:00:56 | PASS. `dpl_5WiDy4qA…` Ready and protected; Next 16.4.2, sharp 0.35.5, tree `cf0a4b5`. |
| probe-preview | 08:01:27 | PASS, 7/7. Candidate `/api/health` build `52568df`. (A first attempt only failed its own usage check: missing `--url`/`--deployment`.) |
| promote | 08:02:46 | PASS. Alias `dpl_AGfpNRez…` → `dpl_5WiDy4qA…`. |
| probe-live | 08:03:17 | PASS, 22/22. |

## Live production verification

| Check | Result |
| --- | --- |
| 27 public routes vs a capture just before the release | **27/27 identical** (status, redirect, title, robots, canonical, visible text) |
| Free access | Host screen signed out → 307 `/access?next=/games/math-bingo-live/host`; host API signed out → 401 `host-sign-in-required`; policy `authenticated-free` unchanged; students join with no account (below) |
| Security | Cross-site game request → 403; `/join` `Cache-Control: private, no-store`, CSP `default-src 'none'`, `X-Frame-Options: DENY`; browser key refused on room tables/functions |
| Music | `/media/audio/cosmic-candy-catchers.mp3` 200 `audio/mpeg` |
| Runtime logs for `dpl_5WiDy4qA…` since promotion | 5xx, error, fatal: 0, 0, 0 |

**Production gameplay QA** (`-Stage qa`, 08:04Z, 33/33): no account and no password — a synthetic room driven through
the room's own service-role functions (what the host API calls after its sign-in check), 50 students through the public
`https://mathnexa.com` API, and two real phone browsers (WebKit as iPhone 13, Chromium as Pixel 7) opening the join link
the teacher's QR encodes. Every synthetic room deleted (0 left).

- `/join` serves this release's runtime; the served QR helper sets production to `https://mathnexa.com`; a production
  teacher screen's QR encodes `https://mathnexa.com/join?code=…` (also from www).
- Phones: the QR link opened name + emoji directly (no code to type) and joined as "🦁 QA Phone" / "🚀 QA Droid";
  each marked its own square; no script errors. The numeric code typed by hand still joins.
- Emoji off the list → 400 `emoji-invalid`; a name with markup → 400 `name-invalid`; 50 students kept their emoji (shared
  and none allowed).
- Start refused a deck repeating a question; the real deck (45 questions) none repeated; every card (53) dealt at Start.
- **50 students submitted the same answer at the same instant: 50/50 accepted; the 50 repeats counted 0.** Every card
  held exactly its own marks.
- Free Space announcements carried emoji; winners in distinct places 1, 2; a winner tapping again → `already-won`; the
  winner limit (2) ended the game and later taps were refused; leaderboard ranked 53 players once each.
- Called history 15/15 unique (never both `a + b` and `b + a`); reconnect restored seat, card and emoji; Play Again dealt
  new cards with a fresh history; closing ended every seat.
- Fraction Bingo (to eighths): 22 questions, 22 different fractions, then "every question was called".

**Not done by Claude on production:** a game hosted from a real teacher account and a QR scan from a real phone —
both need a person (the host needs a sign-in to mathnexa.com). Those are the owner's checks.

## Rollback

- **Whole app (immediate):**

  ```powershell
  Set-Location C:\GitHub\mathnexa-v1-2-36
  $env:RELEASE_CERTIFIED_RUNTIME = '4993dee'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_AGfpNRezZ5eKqQ7KtyR7VuGAD54G'
  node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
  node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_AGfpNRezZ5eKqQ7KtyR7VuGAD54G
  ```

  Fallback: `npx vercel@59 promote dpl_AGfpNRezZ5eKqQ7KtyR7VuGAD54G --scope bright-path-ed-tech`. v1.2.35 runs on the
  migrated database unchanged (compatible functions), so no database step is needed for an app rollback.
- **Game only:** `scripts/invoke-math-bingo-live-production.ps1 -Stage archive` (owner's instruction).
- **Database (only if ever required, after the app rollback):** `supabase/rollback/math_bingo_live_final_gameplay.sql`
  (tested: restores the previous functions, removes the emoji column, the 5-argument join and the deck check), then
  `supabase/rollback/math_bingo_live_room_speed.sql` for the three speed migrations.

## Known limitations and follow-ups

- 50-student classes: polls and the teacher view about 0.1 s over target on good runs, worse when the Supabase API tier
  slows (owner chose no upgrade now).
- Fraction Bingo games are as long as the number of different fractions at the level (10 / 15 / 22).
- Carried over: Math Vocabulary Hunt grade minimum 6 in Super Admin; Search Console; Firefox "Zoom text only" check.
