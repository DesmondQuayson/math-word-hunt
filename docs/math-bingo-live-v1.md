# Math Bingo Live V1 — DRAFT / OWNER REVIEW

Live classroom bingo: the teacher's screen calls a math question, every student solves it and marks one matching square on their own 5 × 5 card, and the first players to complete an allowed line get Bingo. Free to host with any MathNexa account; students join with a game code and a display name only.

Status: **catalog DRAFT, local owner review only.** Nothing is published, listed or reachable on a hosted deployment (see [Availability gate](#availability-gate)).

| | |
| --- | --- |
| Host | `/games/math-bingo-live/host` (`/games/math-bingo-live` redirects here) |
| Students | `/join` (the teacher's QR code opens `/join?code=482391`: the room is already identified) |
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
- **Database** owns time, phases, mark validation, Free Space, winner placement, leaderboard and events. Every rule a student could try to break is enforced there: wins, broadcasts and phase changes under the room row lock, ordinary taps under the player's own row (see "Room speed" below).
- **Server** does what SQL is poor at: builds the deck/pool from a fresh 128-bit seed per game, deals cards (the database refuses any card that is not exactly the room's pool), and shapes responses.
- **Browsers** render and send intents (tap cell 7 for question 12). They never decide correctness, timing or winners.

## Realtime model

MathNexa has no Supabase Realtime (it is disabled in `supabase/config.toml`, and no game opens a WebSocket). Math Bingo Live therefore uses the established MathNexa pattern: **same-origin HTTPS polling**, which is also the district-network fallback by construction.

- Players poll every 1 s while a game is live (2 s in the lobby, 2.5 s while the tab is hidden); the host polls every 0.8 s.
- Each poll sends the last room/player version; an unchanged room answers `{"result":"unchanged"}` (a few dozen bytes). The host also sends a progress number (the sum of the players' row versions), because ordinary taps change only the players' rows, not the room version.
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

- One **question universe** per game (`engine/pacing.js`, `bingo_room_questions`): every unique question of the level, at most 6 per **answer class** (an answer such as 12, or a fraction value), stored on the server at Start. Classes are split into **early** and **late** classes (about 30 % late) and a small reserve that is on nobody's card.
- **Balanced opportunity, not identical cards.** Each card is dealt from the universe so that every enabled winning line (row, column, diagonal per the room's Winning Ways) holds at least one late-class cell, at most one copy of a class per line (never more copies than the class has questions), and the server balances how often every class is dealt across the class. Cards therefore differ, but every card has the same structure: no line can finish before the late classes are called, and every line can finish once they are. Refresh re-deals the same card; late joiners get a card built from the same universe and late set (`bingo_set_board` checks it).
- **No question is asked twice in a game.** Every question has a canonical identity: `addition:5:7` is both 5 + 7 and 7 + 5 (likewise multiplication), `subtraction:14:6`, `division:36:6` (order kept), `fraction:2:3` (the exact written fraction). Different questions may share an answer: 7 + 5 and 8 + 4 are both 12, which is what makes a second 12 on a card useful.
- The **deck is the Called history**: there is no fixed deck any more. Each call is chosen by the server's scheduler (`private.bingo_schedule`, under the room lock) from the questions not asked yet, one question per call, so no question repeats in a game; a class already asked is asked again (with another question) only when no fresh class fits. Play Again builds a new universe, so a question may come back in the next game.
- The application server builds the universe from the game's secret seed; **Start refuses** a universe in which any identity repeats or disagrees with the question it labels (text, operands, canonical order, answer, mode), a late class outside the universe, a card that breaks the structure above, or more winners than the level can pace (`bingo_host_start_paced`, migration `20261108100000`).
- **One normal mark per question**, even with two matching cells. Two wrong taps lock the card until the next question (no brute force). Free Space never uses the normal mark.
- Ranking (standings): confirmed winners (by placement) → a completed line waiting for its gate → best enabled-line progress (4/5 beats 3/5) → number of enabled lines at that progress (two lines at 4/5 beat one) → correct marks. Players still equal after that **tie** and share the rank (`T-2`); response time, tap order and join order never break a tie. Winners keep their placement for the rest of the game.

## Question generator

All facts are enumerated from whole-number operands, so every answer is exact by construction (tests recompute each from its operands):

| Mode | Levels |
| --- | --- |
| Addition | Facts to 10 (0–10, sums 1–10) · Facts to 20 (addends 1–10) · Within 50 · Within 100 |
| Subtraction | Facts to 10 · Facts to 20 (subtract ≤ 10) · Within 50 · Within 100 — never negative |
| Multiplication | ×0–5 (one factor 0–5, other 0–10) · ×0–10 · ×0–12 · Mixed facts (2–12 × 2–12) |
| Division | Facts to 5 / 10 / 12: dividend = divisor × quotient, divisor ≥ 2, quotient ≥ 1 — never ÷ 0, never a remainder |
| Mixed Operations | Starter (+ − to 10, × ÷ to 5) · Core (+ − to 20, × ÷ to 10, answers ≤ 30) · Challenge (+ − within 100, × ÷ to 12, answers ≤ 100); one operation per question, no order-of-operations |
| Fraction Bingo | Halves to fifths · Halves to sixths · Halves to eighths · Halves to tenths · Halves to twelfths (proper fractions n/d) |

Symbols: `+ − × ÷` (U+2212, U+00D7, U+00F7).

## Fraction Bingo

- The **question is symbolic** (`2/3`, spoken "two thirds"); the **card shows visual models**. Students pick the picture; they never type.
- Models are original SVG geometry (`engine/fractions.js`): circle sectors, horizontal bars, vertical rectangles, square grids (2×2, 2×3, 2×4, 3×3…). Every part is exactly equal (tests check every area and angle), the first *n* parts are shaded as one connected run, every part is outlined, and each model has a text description: "Fraction model: 2 of 3 equal parts shaded." Shapes with many thin parts are limited (bars ≤ 6 parts, rectangles ≤ 5) so they stay countable on a 320 px phone.
- **Exact match is the default**: `1/2` accepts only a 1-of-2 model; a 2/4 model is refused ("That square shows 2/4"). The host may turn on **Allow Equivalent Fractions** (default OFF); then any model of equal value counts, decided by cross-multiplication of integers (`a·d = c·b`), never floating point.
- Validation uses the cell's stored rational value only — never the shape, an SVG id or a file name.
- **Each fraction is called once per game** (`fraction:2:3` is one question), so a Fraction Bingo game has as many questions as different fractions in the level: 10 (halves to fifths), 15 (to sixths), 22 (to eighths), 45 (to tenths), 66 (to twelfths). A card may still hold two models of 2/3; because 2/3 is called only once, cards are dealt so that no row, column or diagonal holds more copies of a fraction than can ever be called (with Equivalent Fractions on, each equivalent form is its own question, e.g. 1/2 and 2/4), so every line stays completable and picking which copy to mark is real strategy. The two larger levels exist so a class can have more than one paced winner (to tenths: 2, to twelfths: 3; see Winner pacing).
- **Called Fractions** keeps every fraction called in this game: the lower-right panel of the host board (the current one highlighted, older ones kept, scrolling inside the panel), and a collapsed `Called Fractions (7) ▾` disclosure on phones/iPads so it never costs card space. Only past questions plus the current one are ever sent; it resets with a new game, rematch or room.
- The reveal shows the fraction, an enlarged correct model and "2 of 3 equal parts shaded".

## Winner rules

- Allowed patterns: any combination of Rows, Columns, Diagonals (at least one). Disabled patterns can never win; the rule strip (`WIN WITH ✓ Row ✓ Column ○ Diagonal`) is on every screen, using symbols and words as well as colour.
- A complete enabled line confirms a Bingo **in the same transaction as the mark**, under the room lock, when the winner gate is open (see Winner pacing). A new winner event is placed after every earlier winner (placement = winners so far + 1); players who complete a line **on the same call** share that placement (competition ranking: Ava 1st, Zion 2nd, Omar and Juliet both 3rd, the next winner 5th). Tap order, network speed and database order never separate them. `has_won`, set under the player's row lock, places a player once (refresh, reconnect, double taps and retries all read it); winners can no longer mark or use Free Space but keep watching.
- **Number of winners** (migration `20261111100000`): one box on the setup form and in Settings, for every mode — any whole number from 1 to 60, typed or stepped with − and +; no presets and no limit from the level's questions. 60 is the room's player capacity, the most winners any room can have. The server refuses 0, negatives, decimals, text, `null` and anything above 60 (`invalid-winners`), whatever the page sends; the database refuses them again for new rooms and settings changes (rooms stored before this release keep their "everyone" until they close).
- **Target and players.** The lobby shows `Players: 24 · Winner target: 15`; a target above the players is a warning ("Winner target exceeds current players. Add more players or reduce the target before starting."), never a reset, and Start is not refused: the game then ends when every player has Bingo. No winner is ever invented.
- **Ending.** The game ends when the winners reach the target, when every active player has won (players who leave or are removed are not waited for), when the questions run out ("Every question was called"), or when the teacher ends it. When the target is reached on a call, the rest of that call still counts — anyone else who completes a line on it wins too and shares the placement, so the count can pass the target (e.g. target 10, nine winners, three same-call winners: 12, the last three sharing 10th) — and the game ends when that call closes (`WINNER_REVEAL` 5 s, then `GAME_COMPLETE`). The host header shows "Winners 10 / 10 · last call" meanwhile.
- Every screen shows `🎉 AVA — BINGO!`, `FIRST BINGO`, `1 / 3` (winners so far / target), `ROW BINGO` and the five winning cells glowing (`· TIE` on a shared place); the winner's own screen keeps "BINGO! You finished 1st" ("(tie)" when shared).

## Winner pacing

Every mode and level follows one server-side contract (`engine/pacing.js`, migrations `20261108100000`, `20261108110000`, `20261111100000`). The gates are **eligibility thresholds only**: they say when a new winner may be accepted, never who wins, and they never complete a line.

- **First winner gate: drawn per game.** At Start the database draws one of calls **14, 15, 16 or 17** (`private.bingo_first_gate`, from the game's secret seed; a level with fewer than 20 questions gets the four calls ending three before its last question: Fraction Bingo halves to fifths 4–7, to sixths 9–12). Before that call no Bingo can be accepted; from it on, a legitimately completed enabled line wins. If nobody completes a line on that call, calls simply continue.
- **Gaps between winner events: drawn after each one.** After every NEW winner event (the first winner on a call) the database draws a fresh gap of **8, 9, 10 or 11** calls (`private.bingo_winner_gap`, from the seed and the event number): no new winner event can come before that call. Every event draws again, so a game reads e.g. 16, +9, +8, +11, +10.
- **Server-side and stable.** Both draws come from the secret game seed (generated with a cryptographic RNG, never sent to a browser) through md5: uniform, independent of any player, and repeatable, so a refresh, a host or player reconnect or a retried request reads the stored value and never draws again. The room keeps the first gate, the next eligible call, the last winner call, the current gap and a log of every event (`bingo_rooms.pacing`: `firstWinCall`, `nextEligibleCall`, `lastWinnerCall`, `spacing`, `gaps`, `winnerEvents`) for release evidence; **no screen is sent any of it** (the countdown shown in v1.2.38 is gone from the host and the student screens, so nobody can predict when a Bingo becomes possible).
- **Pacing by design, not by refusal.** Every enabled line of every card holds a late cell, and the calls before the first gate use early classes only, so no line can be completed before it whatever a student marks, with or without the Free Space (the plan keeps early questions for the latest gate the database may draw). From the gate on, the scheduler calls a class that lets one student (more, only when many winners are still wanted and the questions left would not otherwise allow them, e.g. 30 of 50 on a 51-question level) finish; a wrong or missed answer keeps the gate open. While a gate is closed the scheduler only calls classes that complete nothing. Students at 4/5 keep playing and keep their progress; nobody is told "Bingo locked". The scheduler counts boards, never names: it never favours a player.
- **Lines completed while a gate is closed** (rare: no safe question left, or a Free Space tap) are kept as **pending** — "Line complete! Your Bingo is waiting to be confirmed." on the student's screen, `5/5 · waiting` in the standings — and are all confirmed together when the next gate opens, sharing one placement (none of them could win earlier than the others).
- **No winner cap from the questions.** Any target is played; the scheduler sizes opportunities to the winners still wanted. A target the questions cannot reach ends cleanly with "Every question was called".
- **Fairness.** Cards differ but every card has one late cell per enabled line; the scheduler weighs each class by how many players hold it open (a mix of zero-match, single-player, limited and broad calls), how many it would bring to one away, and a seeded hash, so no seat, join order or response time decides who gets an opportunity.
- Legacy rooms (started before the migration) keep the fixed-deck behaviour until closed.

## Free Space

The centre is **not** pre-marked. Each player uses it once, while a question is live, by tapping the star twice (a stray tap never spends it). It marks and locks the centre, counts toward lines, can complete a Bingo, and broadcasts `🎉 OMAR USED FREE SPACE!` to the host and every player. After the deadline (server clock) or during a pause it is refused. With Free Space off, the centre is a 25th answer cell.

## Reconnect and host recovery

- Student: a random 256-bit seat token in `sessionStorage` (refresh restores the same player, card, marks, Free Space, win, rank and emoji — never a duplicate, never asked again). Opening a QR code or link for a different room in the same tab starts a new join instead. A recent seat is also remembered in `localStorage` and offered as "Rejoin as Ava" on the join screen, never automatically, so a shared iPad does not silently continue someone else's seat.
- Host: the host token lives in `sessionStorage`; a refresh continues. A new window (or device) signed in to the same MathNexa account calls `resume`, which gives it a fresh host token for the newest live room and retires the old one; the old window says "This game is open in another window" and offers "Take control here". A student can never become host: host commands need the teacher's session (matched by a keyed owner hash) **and** the current host token.

## Privacy

- Students: no account, email, password, birthday or school profile. Stored only for the live game: a random participant id, the token hash, the display name (2–20 characters), an optional emoji from a fixed list, the card, marks and connection time. Removing a player clears the name and the emoji.
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
- Lock discipline: every function that locks the room row locks it before any participant row (no deadlocks); refusals that can no longer change (already won, invalid cell, the Free Space cell, already marked, mark used, attempts spent, Free Space used) are answered without the room lock, so one spamming client cannot queue the room.
- Room speed (migration `20261106100000`): a wrong tap, or a correct tap that neither completes a winning line nor makes the player "one away" for the first time, changes nothing the whole room sees, so it updates only the player's row, guarded by that row's version (a concurrent change to the player — Play Again, Change Settings, removal, a second tap — sends it down the locked path, which re-validates everything). It is checked against the room as it was when the tap arrived: the question, its server deadline and the pause state. Bingos, a first "one away" and Free Space are broadcasts and keep the locked path, so placements stay strictly ordered and the cap exact. Replies compute the leaderboard when they are built. Before this change every correct tap took the room lock and bumped the room version, which at 50 students queued taps and turned most polls into full replies.
- Names are rendered with `textContent` only and refused if they contain markup characters; duplicate names become "Ava 2".
- Emoji: optional, one of 33 curated choices (🐶 🐱 🦁 … 🧩), matched exactly by the server (`engine/emoji.js`) and by the database (`private.bingo_emoji_valid` + a check constraint on the column); anything else is refused (`emoji-invalid`). Decorative only: the participant id identifies a player; two students may share an emoji.
- Answer independence: every mark is keyed by the player's own row and validated against the player's own card; nothing is unique per room and question. 50 students marking the same answer at the same instant are all accepted (pgTAP suite 39, `scripts/math-bingo-live-final-gameplay.mjs`, and the staging load's same-answer burst). The student page keeps the newest room state and the newest own-seat state separately (`reconcile` in `api.js`), because replies can arrive out of order; requests time out after 10–12 s instead of freezing the card.
- Limits: 60 players per room; 12 room creations per teacher per 10 min; 40 failed joins per address per 10 min (classmates behind one school address are not limited for successful joins); one live room per teacher.
- Room isolation: a participant token locates exactly one participant row; host tokens are domain-separated from player tokens.
- Documents: `default-src 'none'`, `script-src 'self'`, `connect-src 'self'`, no framing, no inline script, no `<base>`, no third-party URL (a unit test scans the runtime).
- Free hosting cannot open protected games: only `math-bingo-live` is added to the "authenticated-free" policy; a student seat is not a session and grants nothing outside its room (e2e proves the entitled games still redirect for a free teacher and for anonymous visitors).

## Availability gate

`isMathBingoLiveAvailable()` serves the host page, `/join`, room creation and joining only if the catalog entry is `published`, **or** it is `draft` and the local owner preview is on: `MVH_MATH_BINGO_LIVE_PREVIEW=local-owner-review`, a loopback application origin (`http://127.0.0.1` / `http://localhost`), and no Vercel deployment variables. A hosted environment can therefore never expose the draft through the local preview, whatever its variables.

For the owner's **staging review** only, `isStagingOwnerPreview()` also serves the draft when all of these hold: `MVH_MATH_BINGO_LIVE_PREVIEW=staging-owner-review` (passed per deployment with `vercel deploy --env`, never stored as a project variable), `SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_URL` are the isolated staging Supabase project (`gcmuhzxkwvfireyrearl`), the application origin is not mathnexa.com, and the deployment is a staging Preview (behind Vercel Deployment Protection) or enforces the staging access gate. Production fails every condition. Staging tooling: `scripts/invoke-math-bingo-live-staging.ps1 -Stage identify|migrate|smoke|review|load` (vault-loaded, staging-only).

## Catalog registration

Math Bingo Live is a registered internal game (`lib/games/internal-registry.ts`, key `math-bingo-live`), like the other MathNexa games, so the shared catalog machinery treats it the same way:

- The Games catalog (`/games`) and the public games list (`/math-games`) show it **only while the catalog entry is `published`** (`loadPublicGameCatalog` reads published rows only); a draft is never listed. The card opens the host screen, `/games/math-bingo-live/host` (the registration's route).
- Super Admin → Games can publish, put into maintenance and archive it (the status route refuses internal games that are not registered).
- `/games/math-bingo-live` and `/games/math-bingo-live/play` only point at the host screen (307); the host route is the one place that applies the account and availability rules. The generic `/games/<slug>/play` route would refuse a draft or archived entry anyway.
- A Super Admin catalog preview renders the host screen's document under the same headers; starting a room from it still needs a signed-in MathNexa account and an available game.

## Host board (teacher laptop, projector, Smart Board)

The live host screen is one fixed board that never scrolls as a page (owner layout, 2026-11-04):

```
| header: Math Bingo Live · mode · [QR] JOIN mathnexa.com/join CODE 537 636 · Winners 1 / 3 · sound |
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

## Joining: QR code and numeric code

- Lobby: **JOIN MATH BINGO LIVE**, a large QR code, **OR** the address and the 6-digit **CODE**. The live board keeps a compact QR beside the code in the header (tap it for a large one) so late students can still join without costing the board any space. When the teacher locks joining, all of it is replaced by **JOINING LOCKED**.
- The QR encodes this screen's own origin + `/join?code=…` (`join-link.js`): a staging preview's QR opens that preview, a local review the local server, and production always `https://mathnexa.com` (also from www). A hosted screen can never produce a localhost link.
- The QR is drawn in the browser by a small dependency-free ISO 18004 encoder (`engine/qr.js`, byte mode, level M, versions 1–10); no QR service is contacted, so it works on filtered district networks. Unit tests read every symbol back with an independent reader (format/version tables, Reed–Solomon syndromes, all 8 masks); during development the symbols were also decoded by the separate jsQR library.
- Scanning opens the join page with the room already identified: the student types a name, optionally picks an emoji (or 🎲 Random, or none) and presses JOIN GAME. Typing the code by hand at `/join` still works while joining is open.

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

- `lib/games/math-bingo-live/final-gameplay.test.ts` — question identities, no repeats in any mode/level/seed (60 seeds × Free Space × equivalence), canonical addition/multiplication, same answer from different questions, the second-12 strategy, Fraction Bingo line rule, emoji allowlist (and that the database list is identical), join links per environment, the QR reader, and out-of-order replies (`reconcile`).
- `supabase/tests/database/39_math_bingo_live_final_gameplay.test.sql` — deck check (repeats, canonical order, mismatched identity/answer, uncallable values, operations per mode, fractions), Start refusing a repeating deck, emoji (shared, none, refused, constraint, reconnect, removal), 50 players marking the same answer, one mark per question with two 12s and the second 12 on a later question.
- `scripts/math-bingo-live-final-gameplay.mjs` — through the real app: 50 students submitting the same answer in the same tick (all accepted, repeats never counted, cards and leaderboard intact) and a full match per mode with unique Called ids.
- `lib/games/math-bingo-live/engine.test.ts` — every mode/level, 60 seeds × free space on/off × exact/equivalent: pools, decks, passes, adjacency; tens of thousands of questions and fraction cells; every model's equal areas; 50k sampled masks × 5 pattern sets; 60 distinct cards per game.
- `lib/games/math-bingo-live/server.test.ts`, `document.test.ts` — payload whitelisting (no seed/pool/deck/answer), preview gate, codes, tokens, CSP, runtime scan.
- `supabase/tests/database/37_math_bingo_live.test.sql` — 177 pgTAP assertions: privileges, lifecycle, marks, attempts, Free Space, wins, caps, pause, deadlines, rematch, removal, recovery, limiter, close (lobby and in-game), "everyone" completion, the 60-player cap, and the five winning-ways setups (a completed diagonal is not a Bingo when diagonals are off).
- `scripts/math-bingo-live-simulation.mjs` — 40 seeded students through the real database functions, invariants after every question, rematch, identical replay.
- `scripts/math-bingo-live-load.mjs` — 1 room × 50 HTTP players and 3 concurrent rooms × 20.
- `scripts/load-math-bingo-live-staging.mjs` (`invoke-math-bingo-live-staging.ps1 -Stage load -Origin <staging preview>`) — a real host screen and 50 virtual students on a hosted staging preview, all from one address (a class behind one school connection), polling at the student page's pace for several timed games: latency, status codes, rate limits, question coverage.
- `scripts/math-bingo-live-host-layout.mjs` — the host board at four screen sizes across 1–50 players and every board state; winning ways on host and student screens against the room settings.
- `e2e/math-bingo-live/*.spec.ts` — Chromium and WebKit: host + Ava/Zion/Omar (paced: first Bingo at call 15, ten calls apart), Fraction Bingo, reconnect/recovery/pause/removal, security and free access, every target viewport, keyboard/screen-reader/reduced-motion/forced-colours.
- `lib/games/math-bingo-live/pacing.test.ts` — the pacing contract (gate windows for every level, early questions for the latest gate), the winner target validation (1–60 only), universes, paced cards for every level × Free Space × Winning Ways, balanced dealing, late joiners, payloads without any gate.
- `supabase/tests/database/41_math_bingo_live_winner_targets.test.sql` — winner-target validation, the draws (windows, 10,000-seed distributions), exact gate sequences 14/+8/+11/+9/+10 and 17/+11/+8, same-call ties, ties past the target, target above the players, removals, reconnects that never redraw, older "everyone" rooms.
- `e2e/math-bingo-live/winners.spec.ts` — the winner box (typed, stepped, refused values), the lobby target and warning, server refusals, Start with a target above the players.
- `supabase/tests/database/40_math_bingo_live_pacing.test.sql` — access, paced Start refusals, calls before the drawn gate early-only and unique, the gate (call 15 for its seed), a same-call tie of three past a target of two, the ranking and tie contract.
- `scripts/math-bingo-live-pacing-simulation.mjs` (+ `supabase/sim/math_bingo_live_pacing_sim.sql`) — the deterministic simulator: thousands of complete matches through the real database functions across every mode, 10–50 seeded students of mixed accuracy, invariants A–M, coverage mix, 4/5 counts, seat fairness, stuck calls.

Run locally: `node scripts/run-math-bingo-live.mjs e2e`, `node scripts/run-math-bingo-live.mjs load`, `node scripts/run-math-bingo-live.mjs layout`, `node scripts/math-bingo-live-simulation.mjs`.

## Release and rollback plan (requires owner approval)

1. Owner review on this branch (local demo: `node scripts/run-math-bingo-live.mjs demo`).
2. Merge to `main` with the catalog entry still DRAFT; deploy; apply the migration to staging, then production (additive: new tables and functions only, one draft catalog row).
3. Staging verification with real devices on a school network.
4. Publish with Super Admin → Games → Publish (the registered internal game passes the status route's registry check), or by a follow-up migration that sets the catalog entry to `published`.
5. Rollback: set the entry to `archived` (routes stop serving new rooms; existing rooms expire within hours), or redeploy the previous build. The tables can stay; nothing else depends on them. The first migrations do not alter any existing table; the pacing migrations (`20261108100000`: nullable columns, one table, functions; `20261108110000`: the scheduler tune) add nothing else, and `supabase/rollback/math_bingo_live_pacing.sql` restores every function and constraint exactly as before them. The winner-target migration (`20261111100000`: helper functions, replaced function bodies, the unique placement index replaced by a plain one) rolls back with `supabase/rollback/math_bingo_live_winner_targets.sql` (close rooms whose winners share a place first).
