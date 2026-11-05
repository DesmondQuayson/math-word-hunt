# Math Bingo Live V1 — DRAFT / OWNER REVIEW

Live classroom bingo: the teacher's screen calls a math question, every student solves it and marks one matching square on their own 5 × 5 card, and the first players to complete an allowed line get Bingo. Free to host with any MathNexa account; students join with a game code and a display name only.

Status: **catalog DRAFT, local owner review only.** Nothing is published, listed or reachable on a hosted deployment (see [Availability gate](#availability-gate)).

| | |
| --- | --- |
| Host | `/games/math-bingo-live/host` (`/games/math-bingo-live` redirects here) |
| Students | `/join` (optionally `/join?code=482391`) |
| APIs | `POST /api/games/math-bingo-live/host`, `POST /api/games/math-bingo-live/play` |
| Store | `supabase/migrations/20261103100000_math_bingo_live.sql` |
| Runtime | `apps/platform-web/public/internal-games/math-bingo-live/` (vanilla ES modules, like the other internal games) |
| Server authority | `apps/platform-web/lib/games/math-bingo-live/server.ts` |

## Architecture

```
teacher browser ── /games/math-bingo-live/host (document) ── host.js ─┐
                                                                     │ POST same-origin JSON
student browser ── /join (document) ── player.js ────────────────────┤ (polling, version-checked)
                                                                     ▼
                       app/api/games/math-bingo-live/{host,play}/route.ts
                         • access (host: signed-in account, owner hash + host token)
                         • builds games (pool + deck) and deals cards from the secret seed
                         • whitelists every browser payload field by field
                                                                     ▼
                       Postgres functions (SECURITY DEFINER, service_role only)
                         • state machine + server clock, row-locked marks and wins
```

- **Engine** (`src/engine/*.js`, shared by browser, server and tests): settings, question generators, fraction rationals and model geometry, cards and the 12 line masks.
- **Database** owns time, phases, mark validation, Free Space, winner placement, leaderboard and events. Every rule a student could try to break is enforced there, under the room row lock.
- **Server** does what SQL is poor at: builds the deck/pool from a fresh 128-bit seed per game, deals cards (the database refuses any card that is not exactly the room's pool), and shapes responses.
- **Browsers** render and send intents (tap cell 7 for question 12). They never decide correctness, timing or winners.

## Realtime model

MathNexa has no Supabase Realtime (it is disabled in `supabase/config.toml`, and no game opens a WebSocket). Math Bingo Live therefore uses the established MathNexa pattern: **same-origin HTTPS polling**, which is also the district-network fallback by construction.

- Players poll every 1 s while a game is live (2 s in the lobby, 2.5 s while the tab is hidden); the host polls every 0.8 s.
- Each poll sends the last room/player version; an unchanged room answers `{"result":"unchanged"}` (a few dozen bytes).
- Every client also schedules a poll for the exact moment the current phase ends (from the server deadline), so all screens flip together.
- Countdowns render from server deadlines and a server-clock offset estimated from low-latency round trips; the device clock is never trusted.
- No transient event is pushed: Free Space, Bingo and "one away" are appended to a capped (20) event list on the room row and picked up by the next poll.

## Room state machine

Explicit phases (`bingo_rooms.phase`): `LOBBY`, `COUNTDOWN`, `QUESTION_ACTIVE`, `ANSWER_REVEAL`, `LEADERBOARD_UPDATE`, `WINNER_REVEAL`, `GAME_COMPLETE`, plus `PAUSED` (with `paused_phase` and the frozen remaining time).

```
LOBBY ─start→ COUNTDOWN(3s) → QUESTION_ACTIVE(question s | manual) → ANSWER_REVEAL(reveal s | manual)
                ↑                    │  final winner                   → LEADERBOARD_UPDATE(3s) → next question
                │                    ▼                                      (deck exhausted → GAME_COMPLETE)
     Play Again └── GAME_COMPLETE ← WINNER_REVEAL(5s)
any of COUNTDOWN..LEADERBOARD_UPDATE ⇄ PAUSED (pause / unpause); End Game → GAME_COMPLETE; Change Settings → LOBBY
```

- Transitions are **lazy and deterministic**: any call that finds a deadline passed advances the room under `FOR UPDATE` (no cron, no worker). Each new phase starts "now", so an unwatched room never races through questions.
- Host **Next** carries the phase and question the host screen shows; a double click is `stale`, never a skipped question.
- **Pause** freezes the remaining milliseconds. Marks and Free Space during a pause are refused with `paused` (the student sees "Paused — your tap wasn't counted"). Resume restores exactly the remaining time.

## Fairness

- One **answer pool** per game: 24 values (25 with Free Space off), the same multiset for every player, with 2–4 deliberate repeats on large ranges (e.g. two 18s) so choosing which match to mark is real strategy. A value appears at most 3 times; 0 at most once.
- Each card is the pool in that player's own order (seeded by game seed + player id; Fraction Bingo also picks each model's shape). Refresh re-deals the same card; late joiners get the same pool.
- The **deck** is 3 passes over the pool: each pass calls every pool instance once, in a fresh order where the same answer never comes twice in a row, choosing the least-used fact for repeated values (9 + 9, then 12 + 6). A perfect player can fill the whole card within one pass, so winners are always reachable; 72 questions maximum.
- **One normal mark per question**, even with two matching cells. Two wrong taps lock the card until the next question (no brute force). Free Space never uses the normal mark.
- Ranking: confirmed winners (by placement) → best enabled-line progress → correct marks → average response time (tertiary only) → join order.

## Question generator

All facts are enumerated from whole-number operands, so every answer is exact by construction (tests recompute each from its operands):

| Mode | Levels |
| --- | --- |
| Addition | Facts to 10 (0–10, sums 1–10) · Facts to 20 (addends 1–10) · Within 50 · Within 100 |
| Subtraction | Facts to 10 · Facts to 20 (subtract ≤ 10) · Within 50 · Within 100 — never negative |
| Multiplication | ×0–5 (one factor 0–5, other 0–10) · ×0–10 · ×0–12 · Mixed facts (2–12 × 2–12) |
| Division | Facts to 5 / 10 / 12: dividend = divisor × quotient, divisor ≥ 2, quotient ≥ 1 — never ÷ 0, never a remainder |
| Mixed Operations | Starter (+ − to 10, × ÷ to 5) · Core (+ − to 20, × ÷ to 10, answers ≤ 30) · Challenge (+ − within 100, × ÷ to 12, answers ≤ 100); one operation per question, no order-of-operations |
| Fraction Bingo | Halves to fifths · Halves to sixths · Halves to eighths (proper fractions n/d) |

Symbols: `+ − × ÷` (U+2212, U+00D7, U+00F7).

## Fraction Bingo

- The **question is symbolic** (`2/3`, spoken "two thirds"); the **card shows visual models**. Students pick the picture; they never type.
- Models are original SVG geometry (`engine/fractions.js`): circle sectors, horizontal bars, vertical rectangles, square grids (2×2, 2×3, 2×4, 3×3…). Every part is exactly equal (tests check every area and angle), the first *n* parts are shaded as one connected run, every part is outlined, and each model has a text description: "Fraction model: 2 of 3 equal parts shaded." Shapes with many thin parts are limited (bars ≤ 6 parts, rectangles ≤ 5) so they stay countable on a 320 px phone.
- **Exact match is the default**: `1/2` accepts only a 1-of-2 model; a 2/4 model is refused ("That square shows 2/4"). The host may turn on **Allow Equivalent Fractions** (default OFF); then any model of equal value counts, decided by cross-multiplication of integers (`a·d = c·b`), never floating point.
- Validation uses the cell's stored rational value only — never the shape, an SVG id or a file name.
- **Called Fractions** keeps every fraction called in this game: the lower-right panel of the host board (the current one highlighted, older ones kept, scrolling inside the panel), and a collapsed `Called Fractions (7) ▾` disclosure on phones/iPads so it never costs card space. Only past questions plus the current one are ever sent; it resets with a new game, rematch or room.
- The reveal shows the fraction, an enlarged correct model and "2 of 3 equal parts shaded".

## Winner rules

- Allowed patterns: any combination of Rows, Columns, Diagonals (at least one). Disabled patterns can never win; the rule strip (`WIN WITH ✓ Row ✓ Column ○ Diagonal`) is on every screen, using symbols and words as well as colour.
- A complete enabled line confirms a Bingo **in the same transaction as the mark**, under the room lock: placement = winners so far + 1. A unique index `(room_id, placement)` backs the rule up; `has_won` stops a second placement for the same player; winners can no longer mark or use Free Space but keep watching.
- Number of winners: 1, 2, 3, 5, 10, custom 1–60, or Everyone (until every active player has won, or the deck/teacher ends it). When the configured number is reached the room goes straight to `WINNER_REVEAL` (5 s) then `GAME_COMPLETE`: no further question, mark, Free Space or placement is accepted. Near-simultaneous wins are ordered by lock acquisition: deterministic, never duplicated.
- Every screen shows `🎉 AVA — BINGO!`, `FIRST BINGO`, `1 / 3`, `ROW BINGO` and the five winning cells glowing; the winner's own screen keeps "BINGO! You finished 1st".

## Free Space

The centre is **not** pre-marked. Each player uses it once, while a question is live, by tapping the star twice (a stray tap never spends it). It marks and locks the centre, counts toward lines, can complete a Bingo, and broadcasts `🎉 OMAR USED FREE SPACE!` to the host and every player. After the deadline (server clock) or during a pause it is refused. With Free Space off, the centre is a 25th answer cell.

## Reconnect and host recovery

- Student: a random 256-bit seat token in `sessionStorage` (refresh restores the same player, card, marks, Free Space, win and rank — never a duplicate). A recent seat is also remembered in `localStorage` and offered as "Rejoin as Ava" on the join screen, never automatically, so a shared iPad does not silently continue someone else's seat.
- Host: the host token lives in `sessionStorage`; a refresh continues. A new window (or device) signed in to the same MathNexa account calls `resume`, which gives it a fresh host token for the newest live room and retires the old one; the old window says "This game is open in another window" and offers "Take control here". A student can never become host: host commands need the teacher's session (matched by a keyed owner hash) **and** the current host token.

## Privacy

- Students: no account, email, password, birthday or school profile. Stored only for the live game: a random participant id, the token hash, the display name (2–20 characters), the card, marks and connection time.
- Display names are ephemeral: closing the room deletes every participant row immediately; expired rooms (4 h, extended to 3 h after a start) and closed rooms are deleted with their participants on the next room creation or join. Removed players' names are replaced by "Removed player".
- The code-guessing limiter stores an HMAC of the caller's address, never the address. The host's account id is stored only as a keyed hash.
- No names reach analytics; the documents set `noindex` and `no-store`.
- No chat. No profanity filter was added (MathNexa has no existing moderation mechanism); the teacher removes a player and can lock joining.

**Known limitation (by design of anonymous joining):** a determined student could open several extra seats and use their wrong-tap attempts to probe the answer. Extra seats are visible to the teacher as extra names in the roster and the live player count; the teacher can remove them and lock joining once the class is in. Successful joins are not rate-limited because a whole class shares one school address.

## Security

- Tables: RLS forced, no grants to `anon`/`authenticated`; every function is `SECURITY DEFINER`, `search_path=''`, EXECUTE for `service_role` only (pgTAP proves it).
- APIs: same-origin only (custom header + Fetch Metadata / Origin), JSON only, 1–4 KB bodies, `no-store`; integers range-checked; unknown actions refused.
- Hidden answers: the deck and pool never leave the server; the current question's answer is sent only after the room reveals it; future questions are never sent (only 1..current). A Bingo's five winning cells (which include the open question's answer) are sent only once that question is revealed. Token and owner hashes never leave the database.
- Unpredictable decks: each game is built from 128 secret random bits through a generator with a 128-bit state (sfc32 seeded by cyrb128), so the deck cannot be recovered by trying seeds even though a student knows the settings, the pool (their own card) and the questions asked so far. It is not a cryptographic generator; its strength is the secret seed and the state size.
- Lock discipline: every function locks the room row before any participant row (no deadlocks); refusals that can no longer change (already won, mark used, attempts spent, Free Space used) are answered without the room lock, so one spamming client cannot queue the room.
- Names are rendered with `textContent` only and refused if they contain markup characters; duplicate names become "Ava 2".
- Limits: 60 players per room; 12 room creations per teacher per 10 min; 40 failed joins per address per 10 min (classmates behind one school address are not limited for successful joins); one live room per teacher.
- Room isolation: a participant token locates exactly one participant row; host tokens are domain-separated from player tokens.
- Documents: `default-src 'none'`, `script-src 'self'`, `connect-src 'self'`, no framing, no inline script, no `<base>`, no third-party URL (a unit test scans the runtime).
- Free hosting cannot open protected games: only `math-bingo-live` is added to the "authenticated-free" policy; a student seat is not a session and grants nothing outside its room (e2e proves the entitled games still redirect for a free teacher and for anonymous visitors).

## Availability gate

`isMathBingoLiveAvailable()` serves the host page, `/join`, room creation and joining only if the catalog entry is `published`, **or** it is `draft` and the local owner preview is on: `MVH_MATH_BINGO_LIVE_PREVIEW=local-owner-review`, a loopback application origin (`http://127.0.0.1` / `http://localhost`), and no Vercel deployment variables. A hosted environment can therefore never expose the draft, whatever its variables.

## Host board (teacher laptop, projector, Smart Board)

The live host screen is one fixed board that never scrolls as a page (owner layout, 2026-11-04):

```
| header: Math Bingo Live · mode · JOIN mathnexa.com/join CODE 537 636 · Winners 1 / 3 · sound |
| WINNING WAYS  ✓ ROW  ✓ COLUMN  ○ DIAGONAL                                                    |
| STANDINGS (≈36 % wide, ≈68 % high)  | QUESTION n + timer (≈64 % wide, ≈62 % high);          |
|   one compact row per player        |   the answer reveal replaces it in place              |
| BINGO WINNERS (≈32 % high)          | CALLED / CALLED FRACTIONS (≈38 % high)                |
| Pause | Next | Players — n | Lock join | End game                                            |
```

- Standings: one row per player (rank or medal, name, `4/5 · Row`), 9–10 rows fully visible at 1280×720 and 1366×768, 11 at 1440×900 and 9–10 at 1920×1080 (where the names are larger); larger classes scroll inside the panel with the heading fixed. "Ava is one away!" sits under the heading.
- Bingo Winners: `Waiting for the first Bingo…`, then 🥇 Ava (FIRST BINGO), 🥈 Zion, 🥉 Omar, … with `Winners 2 / 3`; winners stay listed for the rest of the game. The Free Space and Bingo announcements appear for a few seconds over the left column only, so the winning ways, the question and the controls stay in view.
- Winning ways: drawn from the room settings the server returns (`state.settings.patterns`), the same values the database checks lines against (`private.bingo_lines`); there is no second copy. Players keep their compact `WIN WITH ✓ Row ✓ Column ○ Diagonal` strip.
- Question: the strongest element; the type is sized to the panel (container query units, shorter questions bigger) with a viewport fallback for browsers without container queries; the ring timer sits beside it.
- Only Standings, Bingo Winners and Called scroll (keyboard-focusable regions). Scales with `--u` = min(1 vw, 1.78 vh), so 1280×720 through 1920×1080 keep the same layout; below 900 px wide the board stacks and the page may scroll.
- `scripts/math-bingo-live-host-layout.mjs` (runner mode `layout`) checks 1/5/10/30/50 players, 0/1/3 winners, long arithmetic and fraction histories, question/reveal/paused/celebration and the five winning-ways setups at 1280×720, 1366×768, 1440×900 and 1920×1080.

## Accessibility (WCAG 2.2 AA target)

- Card: a labelled group of 25 real buttons; arrow keys/Home/End move between squares (roving tabindex); Enter/Space mark. Each square's label says row, column letter, value (or the fraction-model description) and state ("Marked."). `aria-pressed` reflects marks; unusable squares are `aria-disabled` but stay focusable.
- Marked = colour + check badge + heavy border + diagonal stripes; winning line = gold glow + outline; forced-colours mode uses a double border and system colours; fraction parts keep outlines.
- Live regions: polite (new question with its spoken form, "10 seconds left", "5 seconds left", "Time's up. 9 + 9 = 18", roster joins) and assertive (Free Space, Bingo). Timer has `role="timer"` and a spoken label.
- Winning ways never rely on colour: ✓ / ○, words, strike-through and dashed borders, and labels such as "Row wins enabled" / "Diagonal wins disabled". Host board panels are labelled sections with headings; their scrolling lists are focusable regions.
- Dialogs are native `<dialog>` with titles; focus is visible (3–4 px gold outline); reduced motion removes all animation and confetti.

## District network requirements

Students need **only `https://mathnexa.com`** (the documents, scripts, styles, API and the shared music file are same-origin; students never contact Supabase directly). Teachers additionally need the configured MathNexa Supabase HTTPS endpoint for sign-in, as for every MathNexa product. No WebSocket, no third-party realtime host, no CDN, no iframe, no remote audio or images. Ordinary HTTPS requests every ~1 s per device; an unchanged room costs a tiny reply. Nothing circumvents filtering: if `mathnexa.com` is blocked, the game is blocked.

## Audio

- Music: **"Cosmic Candy Catchers (Looping)" by Eric Matyas (www.soundimage.org), CC BY 3.0** — the existing verified same-origin MathNexa copy (`/media/audio/cosmic-candy-catchers.mp3`, also used by Math Tug of War); nothing downloaded or hotlinked. Credit is shown on the host setup screen.
- Default **Host only**; options All devices / Off. Thirty student devices never play music unless the teacher chooses All devices.
- One `HTMLAudioElement` started inside a gesture (Safari/iPad rule), paused while hidden, released on `pagehide`; one lazily created `AudioContext`.
- Effects are synthesized (original, no files): correct (two-note pop), wrong (one soft low note), Free Space (sparkle), final 3-2-1 ticks (host), new-question chime, winner announcement chord, and a distinct **Bingo fanfare** (arpeggio + held chord + sparkle) that ducks the music for 2.6 s. Celebration sounds: Host only (default) / All devices / Off.

## Test evidence

See `owner-review/math-bingo-live-owner-review-2026-11-03.md` for the run-by-run results. Suites:

- `lib/games/math-bingo-live/engine.test.ts` — every mode/level, 60 seeds × free space on/off × exact/equivalent: pools, decks, passes, adjacency; tens of thousands of questions and fraction cells; every model's equal areas; 50k sampled masks × 5 pattern sets; 60 distinct cards per game.
- `lib/games/math-bingo-live/server.test.ts`, `document.test.ts` — payload whitelisting (no seed/pool/deck/answer), preview gate, codes, tokens, CSP, runtime scan.
- `supabase/tests/database/37_math_bingo_live.test.sql` — 177 pgTAP assertions: privileges, lifecycle, marks, attempts, Free Space, wins, caps, pause, deadlines, rematch, removal, recovery, limiter, close (lobby and in-game), "everyone" completion, the 60-player cap, and the five winning-ways setups (a completed diagonal is not a Bingo when diagonals are off).
- `scripts/math-bingo-live-simulation.mjs` — 40 seeded students through the real database functions, invariants after every question, rematch, identical replay.
- `scripts/math-bingo-live-load.mjs` — 1 room × 50 HTTP players and 3 concurrent rooms × 20.
- `scripts/math-bingo-live-host-layout.mjs` — the host board at four screen sizes across 1–50 players and every board state; winning ways on host and student screens against the room settings.
- `e2e/math-bingo-live/*.spec.ts` — Chromium and WebKit: host + Ava/Zion/Omar, Fraction Bingo, reconnect/recovery/pause/removal, security and free access, every target viewport, keyboard/screen-reader/reduced-motion/forced-colours.

Run locally: `node scripts/run-math-bingo-live.mjs e2e`, `node scripts/run-math-bingo-live.mjs load`, `node scripts/run-math-bingo-live.mjs layout`, `node scripts/math-bingo-live-simulation.mjs`.

## Release and rollback plan (requires owner approval)

1. Owner review on this branch (local demo: `node scripts/run-math-bingo-live.mjs demo`).
2. Merge to `main` with the catalog entry still DRAFT; deploy; apply the migration to staging, then production (additive: new tables and functions only, one draft catalog row).
3. Staging verification with real devices on a school network.
4. Publish by a follow-up migration that sets the catalog entry to `published` (and adds the card copy to the Free Games presentation).
5. Rollback: set the entry to `archived` (routes stop serving new rooms; existing rooms expire within hours), or redeploy the previous build. The tables can stay; nothing else depends on them. The migration does not alter any existing table.
