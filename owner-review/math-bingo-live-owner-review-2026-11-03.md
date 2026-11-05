# Math Bingo Live — LOCAL OWNER REVIEW (2026-11-03/04)

**Status: DRAFT — local owner review only. Nothing merged, deployed, published or listed. Production not modified.**

- Worktree: `C:\GitHub\mathnexa-bingo-live`
- Branch: `feature/math-bingo-live` (local only, not pushed), base `origin/main` 7a846c4 (v1.2.34 release record)
- Design and operations: [`docs/math-bingo-live-v1.md`](../docs/math-bingo-live-v1.md)

## Run the owner demo

```bash
node scripts/run-math-bingo-live.mjs demo
```

Prerequisites: local Supabase running with the migration applied (`node node_modules/supabase/dist/supabase.js migration up --local`). The runner starts the app on `http://127.0.0.1:3100` (or `$PORT` / `$MATH_BINGO_LIVE_APP_PORT`; on this machine 3100 is used by another project, so set `MATH_BINGO_LIVE_APP_PORT=3102`) in the production-platform rehearsal with the **local owner preview** switched on, and makes sure the local synthetic FREE teacher exists (no subscription, no trial):

| | |
| --- | --- |
| Teacher sign-in (local Supabase only) | `bingo-teacher@example.test` / `BingoTeacher42!` |
| Host | `http://127.0.0.1:3100/games/math-bingo-live/host` |
| Students | `http://127.0.0.1:3100/join` (no account) |

Suggested walkthrough (three student windows: Ava, Zion, Omar — use separate browser windows or a private window per student; each tab is its own player):

1. Host: sign in → setup (MATH / PACE / WINNING / CLASSROOM) → **CREATE GAME**. Lobby shows `JOIN …/join` and the 6-digit `CODE`.
2. Students: open `/join`, type the code, then a name → "You're in!". Names appear live on the host lobby (× removes a player; Lock joining; New code).
3. **START GAME** → 3-second countdown → question. Students tap the matching square (one per question; two wrong taps lock the card for that question). Tap the centre star twice to use Free Space → every screen shows "🎉 OMAR USED FREE SPACE!".
4. Watch the host board: STANDINGS on the left (`4/5 · Row`, "Ava is one away!"), BINGO WINNERS under it, the question top right, CALLED under it, WINNING WAYS across the top. Then a Bingo banner on every screen (on the host, over the left column) (`🎉 AVA — BINGO!`, `FIRST BINGO`, `1 / 3`, `ROW BINGO`, the five winning cells glow once that question is revealed) and the host fanfare.
5. With 3 winners the game ends at the third Bingo: `MATH BINGO COMPLETE` 🥇🥈🥉 → **Play Again** (same players, new cards), **Change Settings**, **End Room**.
6. Fraction Bingo: choose *Fraction Bingo*; the question is `2/3`, the cards show models; open `Called Fractions (n) ▾` on a phone; the host board shows CALLED FRACTIONS lower right, the current one highlighted. Try *Allow Equivalent Fractions*.
7. Refresh a student mid-game (same card, marks, Free Space, rank); refresh the host; open the host in a second window (the first says "open in another window" → Take control here); Pause/Resume.

The e2e, load, thumbnail and host-board layout runs use the same runner: `node scripts/run-math-bingo-live.mjs e2e`, `… load`, `… thumbnail`, `… layout` (always `next dev`; the production build is checked with `npm run build`).

## Host board revision (owner request, 2026-11-04)

The live teacher screen is now one fixed board that never scrolls as a page:

- **Top:** a thin header (Math Bingo Live · mode and level · `JOIN …/join CODE 537 636` · `Winners 1 / 3` · music, sound, full screen), then a slim **WINNING WAYS** strip (`✓ ROW ✓ COLUMN ○ DIAGONAL`) that is always on screen.
- **Left:** **STANDINGS**: one compact row per player (rank or medal, name, `4/5 · Row`), scrolling inside the panel for big classes. Under it, **BINGO WINNERS**: `Waiting for the first Bingo…`, then 🥇 Ava FIRST BINGO, 🥈 Zion, 🥉 Omar with `Winners 2 / 3`.
- **Top right:** the current question (the biggest thing on the screen) with its timer beside it; the answer reveal (`ANSWER · QUESTION 8`, `9 + 9 = 18`, or the fraction with its large model and caption) replaces it in the same place.
- **Lower right:** **CALLED** / **CALLED FRACTIONS**: wrapping chips, the current one highlighted, scrolling inside the panel.
- **Bottom:** Pause · Next · Players — n · Lock join · End game.
- The Bingo and Free Space announcements cover the left column for a few seconds, never the winning ways or the question.

Checked with `node scripts/run-math-bingo-live.mjs layout` (or `scripts/math-bingo-live-host-layout.mjs` against a running app) at 1280×720, 1366×768, 1440×900 and 1920×1080. It covers 1, 5, 10, 30 and 50 players; 0, 1 and 3 winners; long arithmetic and Fraction histories; question, reveal, paused and celebration states; and the five winning-ways setups on the host and a student phone. Result: **PASS, 50 board checks, 5 setups**. Screenshots are in `qa-artifacts/math-bingo-live/host-layout/`.

| Screen | Page scroll | Standings rows fully visible (50 players) | Question type (arithmetic / fraction) |
| --- | --- | --- | --- |
| 1280×720 | none | 9 | 137 px / 115 px |
| 1366×768 | none | 9–10 | 148 px / 124 px |
| 1440×900 | none | 11 | 162 px / 155 px |
| 1920×1080 | none | 9–10 (larger names) | 216 px / 182 px |

## Staging (owner approved 2026-11-04)

- Staging database (`gcmuhzxkwvfireyrearl`): migration `20261103100000` applied with `scripts/invoke-math-bingo-live-staging.ps1 -Stage migrate`. Result: 3 tables with forced RLS and no browser grants, 11 functions callable by the server only, one **DRAFT** catalog row, and every other row count unchanged. `-Stage smoke` PASS (create/join/state/close; a browser key is refused).
- Staging preview `dpl_5pnYwTMrYMkW3acyWYXDakEWGaDe`: https://mathnexa-platform-staging-apx635wo3-bright-path-ed-tech.vercel.app (build b1a6260, deployed from a clean worktree with `--env MVH_MATH_BINGO_LIVE_PREVIEW=staging-owner-review`). This was not `--prod`, so the shared staging alias was not moved. The preview sits behind Vercel Deployment Protection (team sign-in or a Vercel share link).
- `-Stage review` **43/43**: build identity; production `/join` still 404; a free staging account hosts; three students (WebKit iPhone with real taps, Chromium phone, Chromium tablet) join with code + name; identical answer sets on different cards; winning ways (rows + columns, no diagonals) match on host and student; the host board at 1280×720 and 1920×1080 never scrolls and has every panel in place; Bingo Winners `Winners 1 / 3`; winners Ava → Zion → Omar, all rows/columns; MATH BINGO COMPLETE. The synthetic account and room were deleted.
- Production: not modified (no migration, no deploy, no env).

## Results

| # | Item | Result |
| --- | --- | --- |
| 1 | Branch | `feature/math-bingo-live` (local only, not pushed), worktree `C:\GitHub\mathnexa-bingo-live` |
| 2 | HEAD | see `git log -1` (final review commit on the branch) |
| 3 | Base main HEAD | `7a846c4` (origin/main, v1.2.34 release record) |
| 4 | Repository cleanliness | Clean after the final commit; generated `next dev` files restored/removed |
| 5 | Game title | Math Bingo Live |
| 6 | Catalog slug | `math-bingo-live` (stable key `math-bingo-live`, launch `internal`, status **draft**) |
| 7 | Free-access status | Host: any signed-in MathNexa account ("authenticated-free"); students: code + name only |
| 8 | Host URL | `/games/math-bingo-live/host` (`/games/math-bingo-live` redirects) |
| 9 | Join URL | `/join` (`/join?code=482391` prefills) |
| 10 | Player URL | `/join` — the same document switches to the player screen; refresh restores the seat |
| 11 | Catalog URL | None while draft (the catalog lists published entries only); card copy and thumbnail registered for release |
| 12 | Room code | 6 digits, never a leading 0, crypto-random, unique among open rooms (index + retry + race-safe); the code grants joining only |
| 13 | Name join | Trim, collapse spaces, 2–20 characters of letters/numbers/space/`.'-_`; markup refused; duplicates become "Ava 2" |
| 14 | Lobby | `JOIN …/join` + giant `CODE` + `PLAYERS — n`; names live; remove ×, lock joining, new code |
| 15 | 5×5 board | 25 cells, centre FREE, 24 values (25 with Free Space off), B I N G O header |
| 16 | Shared answer-pool fairness | Same multiset for every player, distinct layouts (60/60 per game in tests; e2e and simulation) |
| 17 | Duplicate-answer strategy | 2–4 deliberate repeats; each cell independent; one mark per question; repeats get different facts (9 + 9, 12 + 6) |
| 18 | Addition | Facts to 10/20, Within 50/100 — every fact recomputed and in range |
| 19 | Subtraction | Same ranges, never negative |
| 20 | Multiplication | ×0–5, ×0–10, ×0–12, Mixed facts (2–12) |
| 21 | Division | Facts to 5/10/12: exact, divisor ≥ 2, no ÷ 0, no remainders |
| 22 | Mixed | Starter/Core/Challenge, all four operations, one operation per question |
| 23 | Fraction Bingo | Halves to fifths / sixths / eighths; exact match by default; Equivalent Fractions option (default OFF) |
| 24 | Symbolic question → visual model | Question `2/3`; cards show SVG models; e2e verified |
| 25 | Fraction visual validation | Equal areas/angles for every model, exactly n of d shaded, outlined parts, descriptions; validation by integer rationals, never by shape |
| 26 | Called Fractions history | Whole-game history, current highlighted, nothing future; phone disclosure, host side panel |
| 27 | Free Space | Not pre-marked; two-tap confirm; once per game; live question only; counts toward lines |
| 28 | Free Space global alert | "🎉 OMAR USED FREE SPACE!" on the host and every player (e2e) |
| 29 | Row win | Pass (unit, pgTAP, e2e) |
| 30 | Column win | Pass (columns-only timed e2e) |
| 31 | Diagonal win | Pass (unit, pgTAP, simulation; diagonals through the Free Space) |
| 32 | Winning-rules display | `WIN WITH ✓ Row ✓ Column ○ Diagonal` (symbol, strike-through and dashed border, not colour alone) |
| 33 | Winner-count control | 1/2/3/5/10/Everyone/custom 1–60 |
| 34 | One-win-per-player | `has_won` + unique `(room, placement)` index; winner taps return `already-won` |
| 35 | Question-duration control | 5/10/15/20/30/45/60 s/Manual (default 15); server clock |
| 36 | Answer reveal | 2/3/5 s/Manual (default 3); `9 + 9 = 18`; fractions show the enlarged model and caption |
| 37 | Leaderboard | Winners by placement → best line → correct marks → average response time; host full list, players top 5 + own rank |
| 38 | Best-line progress | `4/5 · Row`; "Ava is one away!" on the host (the square is never named) |
| 39 | Bingo broadcast | `🎉 AVA — BINGO!` `FIRST BINGO` `1 / 3` `ROW BINGO` on every screen; winning cells shown once the question is revealed |
| 40 | Bingo sound | Original synthesized fanfare, distinct from every other effect, music ducks; Host only (default) / All / Off |
| 41 | Multiple winners | Ava 1st, Zion 2nd, Omar 3rd (e2e); 5 winners × 2 games (simulation) |
| 42 | Maximum-winner game end | Immediate WINNER_REVEAL → GAME_COMPLETE; no further question, mark or placement |
| 43 | Rematch | Same roster, no code re-entry, new cards and seed, everything reset |
| 44 | Player reconnect | Same player, card, marks, Free Space, win and rank; no duplicate player |
| 45 | Host recovery | Refresh continues; a second window takes over (the old one says so and can take it back); students cannot become host (401) |
| 46 | Realtime | Supabase Realtime is not used by MathNexa (disabled in config); same-origin polling, version-checked, aligned to server deadlines |
| 47 | Polling/fallback | Polling is the transport: plain HTTPS to mathnexa.com, no WebSocket to block |
| 48 | 40-player simulation | PASS — invariants after every question, 2 games, identical deterministic replay |
| 49 | 50-player load | PASS — 1 × 50 and 3 × 20 concurrent rooms (numbers below) |
| 50 | Race conditions | Row-locked marks, deterministic placement, consistent lock order, deadline/pause/stale/simultaneous paths tested |
| 51 | Server-authoritative validation | The database validates phase, question, deadline, cell, value, attempts and wins |
| 52 | Privacy | No student account, email or birthday; names deleted on close/expiry; hashed identifiers only |
| 53 | RLS/security | RLS forced, no anon/authenticated grants, service_role-only functions; pgTAP 177/177 (163 + 14 winning-ways checks, 2026-11-04); e2e security 3/3; independent review findings fixed |
| 54 | Music | Shared same-origin Cosmic Candy Catchers; one element, started inside a gesture |
| 55 | Host-only music default | Yes — players play no music unless "All devices" (asserted in e2e) |
| 56 | Audio attribution | "Cosmic Candy Catchers (Looping)" — Eric Matyas, soundimage.org, CC BY 3.0 (credited on the host setup screen) |
| 57 | Chromium | 10/10 e2e |
| 58 | WebKit | 7/7 e2e (live ×2, fractions ×2, reconnect, devices ×2) |
| 59 | iPhone portrait | 390×844 (+ 320×568, 360×740): card fits, cells ≥ 44 px (≥ 40 px at 320), touch marks |
| 60 | iPad portrait | 768×1024 pass |
| 61 | iPad landscape | 1024×768 pass (card left; question, rules and top three right) |
| 62 | Smart Board | 1920×1080 and 1366×768 host: question ≥ 180/120 px, timer, leaderboard, rules and controls on screen |
| 63 | Accessibility | Labelled card and cells, live regions, native dialogs, visible focus, forced colours, reduced motion (WCAG 2.2 AA target) |
| 64 | Keyboard | Arrow keys/Home/End move, Enter marks (e2e) |
| 65 | Touch | `tap()` marks on touch contexts (e2e) |
| 66 | Reduced motion | Animations and confetti off (asserted in e2e) |
| 67 | Thumbnail | Real game capture: Ava's screen right after a real Bingo |
| 68 | Thumbnail dimensions/size | 1200×675 (16:9); webp 58.8 KB, avif 40.9 KB |
| 69 | Thumbnail math audit | Pass: live `3 × 9` with 27 on the card; complete glowing row; every revealed question re-solved |
| 70 | Free Games catalog | Registered as draft (not listed); the "Free to play" badge follows the access policy once published |
| 71 | District-network readiness | Students need only `https://mathnexa.com`; documented in the game doc and the classroom network doc |
| 72 | Production build | `next build` PASS (bingo routes dynamic); bundle audit PASS (38 client assets, no secrets) |
| 73 | Dependency/security audit | No dependency added; production `npm audit` 0; 20 dev-only advisories already on main |
| 74 | Existing-game regressions | Unit suites pass (core 245, web 1113+); Number Logic 26 + 7 native, Number Cross 5, CrossCalc 5, CrossCalc V2 22 unit + 7/9 native (2 need the external `C:\crosscalc` source: environmental), MVH redirect 15; other game engines untouched |
| 75 | Known limitations | See below |
| 76 | Production modified | **NO** |
| 77 | Final status | **READY FOR MATH BINGO LIVE OWNER REVIEW** |

### Load (next dev on a laptop with local Docker Supabase — slower than production)

| Metric | 1 room × 50: p50 / p95 | 3 rooms × 20: p50 / p95 |
| --- | --- | --- |
| Join (all at once) | 1.23 s / 1.56 s | 0.96 s / 1.20 s |
| Question delivery (1 s polling) | 0.64 s / 1.28 s | 1.14 s / 2.15 s |
| Mark validation (all tap at the same instant) | 1.55 s / 1.99 s | 1.50 s / 1.93 s |
| Leaderboard update (host sees it) | 1.39 s / 2.15 s | 1.99 s / 3.78 s |
| Winner confirmation | 1.52 s / 1.79 s | 1.68 s / 4.46 s |
| Reconnect | 0.68 s / 1.02 s | 1.17 s / 1.45 s |

Every room ended with exactly 3 unique placements; no request failed.

### Known limitations

- QR code not implemented: MathNexa has no same-origin QR library and a hand-written encoder could not be independently verified with local tools; joining is by URL + 6-digit code.
- No profanity filter (MathNexa has no moderation mechanism); the teacher removes players and locks joining.
- A student opening several extra seats could use wrong-tap attempts to probe an answer; extra seats are visible in the roster and count (remove + lock joining).
- Polling, not push: events reach screens within about 1 s. When a whole class taps at the same instant the room lock serializes the marks (≈1.5 s p50 on the local dev stack); production latency must be measured on staging.
- Local `next start` cannot run the production-platform rehearsal (by design), so e2e and load ran on `next dev`; the production build was verified with `next build` and the bundle audit.
- WebKit e2e needed harness accommodations: each device's page is brought to front, background-page frame pausing in headless WebKit is tolerated, and WebKit's report of fetches cancelled by deliberate reloads is ignored.
- Host takeover from a second window works per sign-in; with a shared school-access session, anyone signed in to that same session could take over.
- The draft is served only with `MVH_MATH_BINGO_LIVE_PREVIEW=local-owner-review` on a loopback origin; staging and production return 404 until the owner publishes.

