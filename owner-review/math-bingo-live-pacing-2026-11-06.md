# Math Bingo Live — strategic Bingo pacing (STAGING ONLY, 2026-11-06)

**Status: READY FOR STRATEGIC BINGO PACING OWNER REVIEW on staging. Production untouched (v1.2.37 live; no production
migration, no catalog change, no Supabase upgrade). Not promoted, not merged.**

| | |
| --- | --- |
| Branch | `feature/math-bingo-live-pacing` — commits `3054af4` (pacing), `db0fee3` (header chip fix, review assertions), `298602c` (scheduler urgency, migration 2) from `main` `eb9bd40` = v1.2.37; not pushed, not merged |
| Staging preview | **`dpl_AAqbivFsTCJUDj16f2isqVYdGQoR`** — https://mathnexa-platform-staging-raou8vviv-bright-path-ed-tech.vercel.app (build `db0fee3`, `MVH_MATH_BINGO_LIVE_PREVIEW=staging-owner-review`); NOT promoted. Earlier preview `dpl_BdbBUUtNkGemVSYdXJPW1vPUKyR1` (build `3054af4`) superseded: its header pushed the pacing chip off screen with the long preview hostname |
| Staging database | `20261103100000` … `20261107100000`, **`20261108100000` and `20261108110000` applied 2026-11-06 (`-Stage migrate` PASS twice: universe table, pacing column, scheduler with the urgency term, paced Start present, browsers have no access; row counts unchanged; `-Stage smoke` PASS)** |
| Production database | `20261103100000` … `20261107100000` (unchanged) |
| Rollback | `supabase/rollback/math_bingo_live_pacing.sql` (restores every function and constraint exactly as `20261107100000` left them; drops the new table, columns and the scheduler whatever its version) |
| Migrations | `20261108100000_math_bingo_live_pacing.sql` (additive: table, columns, functions) + `20261108110000_math_bingo_live_pacing_tune.sql` (scheduler only: urgency near a gate so a class of three reaches one away by call 15, and a gate-open fallback that builds 3/5 lines) |

Everything released in v1.2.35–v1.2.37 is kept: QR joining and the numeric code, emoji identities, no exact question
repeat per game, participant-independent marking, the duplicate-answer strategy, Fraction Bingo (symbolic question,
visual models, exact match / Allow Equivalent Fractions), Called history, Free Space (two taps, once per game), Winning
Ways, one Bingo per student, the configurable number of winners, announcements and sounds, music, reconnect and host
recovery, the leaderboard, the host dashboard, free hosting, no-account joining, the security model, and the 30/50-player
speed work (cards dealt at Start, unlocked taps, adaptive polling).

## The problem you saw, and the design

Bingos came too early and too close together: with a fixed deck drawn from the card values, a line could finish on call
5, and the next winners followed within a call or two. The fix is a **server-authoritative pacing contract** that every
mode and level follows, achieved by how cards are dealt and how questions are chosen — never by refusing a visibly
complete line.

**Contract** (`engine/pacing.js` `PACING`, one shared module; nothing mode-specific):

- `MIN_FIRST_BINGO_CALL = 15` — no Bingo before call 15, a real opportunity from call 15.
- `MIN_CALLS_BETWEEN_NEW_WINNERS = 10` — after a winner at call N, nobody can become the next winner before N + 10.
- Room state (server only, `bingo_rooms.pacing`): called count, confirmed winners, first-opportunity call (15, or the
  scaled value for tiny levels), last winner call, next eligible call, coverage counts, the call log.

**How it is achieved**

1. **Question universe.** At Start the server stores every unique question of the level (at most 6 per answer class:
   "12", or a fraction value) in `bingo_room_questions`. Classes are split into *early* (~70 %), *late* (~30 %) and a
   small *reserve* that is on nobody's card.
2. **Paced cards.** Every card is dealt from that universe so that **every enabled winning line holds at least one late
   cell** (rows, columns and diagonals as the room's Winning Ways say), at most one copy of a class per line, and
   dealing is balanced across the class. Cards differ (balanced opportunity, not identical cards) but share the
   structure, so **no line can be completed during calls 1–14 whatever a student marks, with or without the Free
   Space**: calls 1–14 use early classes only. Late joiners get a card built from the same universe and late set, and
   `bingo_set_board` refuses any other card.
3. **Scheduler** (`private.bingo_schedule`, under the room lock, one question per call, never a repeat). Each call it
   scores every callable class by who holds it open (zero-match / single / limited / broad — a deliberate mixture),
   how many students it would bring to one away, and a seeded hash:
   - calls 1–14: early classes only, building 4/5 progress toward the gate;
   - gate open (call 15, or N + 10): the class that lets the **fewest** students (at least one) finish — a real
     opportunity every call until a student takes it; a wrong or missed answer just keeps the gate open; if nobody
     is one away yet (a very small class), the class that brings the fewest to one away, then the one building the
     most 3/5 lines; within five calls of a gate with nobody one away, progress outweighs the call mixture
     (`20261108110000`);
   - gate closed (cooldown): only classes that complete nothing for anyone; students at 4/5 keep their progress.
4. **Two complete lines on the same call** (two cards share the completing class): the first correct mark under the
   lock is the winner; the other line is **pending** — kept, shown as `5/5 · waiting` under the winners and as "Line
   complete! Your Bingo is confirmed at the next opportunity" on the student's screen — and it is confirmed as the next
   winner when the gate reopens (one per gate, earliest first). A pending line is never announced as a Bingo.
5. **Capacity.** A level must hold `15 + 10 × (winners − 1)` + buffer unique questions (a class with a single
   question — every fraction — cannot be asked again, so 28 % of such classes are kept out of the count), enough
   distinct answer classes for cooldowns to stay safe, and — once the class size is known — late classes enough for
   the students expected to be one away at a gate (more than about 2.2 students per late class means one call would
   finish several lines at once, so such a class is paced to a single winner). The setup form says how many winners
   each level can pace and greys out the rest; the lobby says it again for the actual class size; Start refuses more
   (`winners-exceed-capacity`) with the numbers. Tiny levels (Fraction Bingo halves to fifths / sixths) run a
   **scaled** contract (first Bingo from call 7 / 10, one winner) and say so. Two new fraction levels (halves to
   tenths: 45 fractions, up to 2 winners; halves to twelfths: 66, up to 3) give Fraction Bingo multi-winner games
   without repeating a fraction.
6. **Standings.** Winners (by placement) → pending line → best line progress → number of lines at that progress →
   correct marks; equal students **tie** and share the rank (`T-2`); response time, tap order and join order never
   break a tie. Winners keep their placement.
7. **Indicators.** Host header chip: "First Bingo opportunity in N calls" / "Next Bingo opportunity in N calls" /
   "Bingo opportunity OPEN". Student footer: the same in short form. Called history unchanged; its count is the server's
   called count. Play Again resets the pacing (gate 15 again, new universe, new cards).

Capacity by level (unique questions · classes → winners allowed; "≤ N students" where more students mean one winner):
Addition facts to 10 35·10→1, facts to 20 51·16→2 (≤ 18 students), within 50 240·41→22, within 100 486·81→47;
Subtraction facts to 10 45·10→1, facts to 20 99·19→2 (≤ 22), within 50 273·48→25, within 100 555·95→54;
Multiplication ×0–5 46·29→3 (≤ 48), ×0–10 61·43→3, ×0–12 84·60→5, mixed facts 66·53→4; Division facts to 5/10/12
40/60/72 · 10/10/12 → 1; Mixed starter 60·10→1, core 120·26→3 (≤ 42), challenge 600·100→58; Fraction Bingo to fifths
10→1 (scaled, gate 7), to sixths 15→1 (scaled, gate 10), to eighths 22→1, to tenths 45→2, to twelfths 66→3.

## Security (unchanged model, new objects covered)

Students call only `bingo_player_state`, `bingo_mark`, `bingo_free_space` and `bingo_set_board` through the server:
none reads or writes `pacing`, the universe or the call log; `bingo_set_board` only accepts a card that fits the room's
universe and late set. The scheduler, the paced Start and the card check are `private`/service-role only (pgTAP checks
anon/authenticated have no EXECUTE or SELECT); the universe table has RLS forced. A student cannot change the called
count, open a gate, skip a cooldown, choose the next question, declare a winner or manipulate coverage: every one of
those is computed inside `bingo_schedule` / `bingo_apply_progress` under the room lock.

## Evidence

### Pacing simulator (deterministic, through the real database functions)

`node scripts/math-bingo-live-pacing-simulation.mjs --matches 10 --players 10,20,30,40,50 --winners 1,2,3,5` —
report in `qa-artifacts/math-bingo-live/pacing-simulation-full2/`. 240 scenario groups (12 levels across every mode ×
5 class sizes × 4 winner counts × 10 seeded matches = 2,400 matches): **1,554 complete matches played**, 84 groups
refused at Start by the capacity rule (reported as such, e.g. Division = 1 winner; Facts to 20 with 20+ students = 1
winner), 6 matches of Mixed Core · 30 students not created in that run (rooms from the earlier, timed-out run still held
their host token); re-run after cleanup: 40/40 matches, 0 violations (`pacing-simulation-run2-mixed-30-rerun`). Reports:
`owner-review/evidence/math-bingo-live-pacing/`. Students: a third each of *perfect* (100 %, Free Space late), *strong* (80 %, misses 5 % of calls, Free Space
early) and *mixed* (60 %, misses 10 %, never uses the Free Space), rotated by seat per match.

- **A. No Bingo before call 15**: 0 violations (earliest Bingo in 1,554 matches: call 15; no line completed before
  the first gate in any match, by any student model).
- **B. Opportunity at/after 15**: first Bingo mean call 15.2, median 15, max 21 (students who miss their chance); the
  first completable call was 15 in every level except two matches at 16–19 where nobody was one away yet.
- **C. ≥10 calls between winners**: 0 violations; gap min 10, mean ≈10.2, max 18.
- **D. Same-call races**: 69 pending lines in 1,554 matches (0.04 per match overall; worst group ×0–12, 50 students,
  5 winners: 1.8 per match); every one confirmed at the next gate or left unconfirmed when the configured winners were
  reached, never announced as a Bingo. 27 "stuck" cooldown calls (no safe class left; 5 of 156 groups, all ×0–12 or
  ×0–10 with 40–50 students and 3–5 winners).
- **E. Configured winners reached** in every played match; **no question repeated** in any match (checked on the
  Called history of every match).
- **F. Coverage mixture** (share of calls that match nobody / one student / a few / many): arithmetic levels 2–22 % /
  0–5 % / 5–54 % / 21–87 %; Fraction Bingo nearly all broad (every card holds most fractions) — the mixture is a goal
  the scheduler meets where the level allows. Longest run of zero-match calls: 9 (×0–12), typically 2–4.
- **G. Progress before the gate**: students at 4/5 when the gate opens — 2–5 per class on large levels, 11–18 on small
  ones (Facts to 20, Division, to-eighths: the 14 early calls cover every early class); 3/5: 3–14. Nobody waits with
  nothing to do: by call 8 most students have a line at 2/5 or better.
- **H. Fairness by seat**: within the perfect-student seats, join order does not predict wins (earlier-joined half
  1,023 wins, later-joined half 1,034); per-seat variation is card luck (max/mean 1.2–1.9 by class size). Wins by model:
  perfect 2,057 · strong 1,138 · mixed 213 (accuracy decides, not the seat).
- **I–M**: no legitimate line was refused; the Free Space never created a Bingo before 15; winners kept placements;
  enabled Winning Ways drove every late-cell check (rows / columns / diagonals and every combination are dealt and
  checked by the same rule); Play Again rebuilt universe, cards and pacing in every rematch test.

The first full run (same seed) exposed two things the second run fixed: the scheduler had been repeating an already
called answer class to manufacture zero-match calls (now a fresh class is always preferred), and small levels with big
classes piled up pending lines — that run is what calibrated the class-size bound above (Facts to 20 at 20–50
students: 2–7 pending lines per match before; refused now).

### Unit, database, security and build gates

- Unit (vitest): platform-core 245/245, platform-web 1,200 passed + 1 skipped (includes `pacing.test.ts` 9/9: contract
  numbers, capacity for every level and class size, universes, paced cards for every level × Free Space × Winning Ways,
  balanced dealing, invalid cards, late joiners, payload fields).
- pgTAP: `40_math_bingo_live_pacing.test.sql` 72/72 (access, paced Start refusals, calls 1–14 early-only and unique,
  4/5 before the gate, the gate at 15, Ava first, Zion's same-call line pending, cooldown 16–24, confirmation at the
  gate of call 25, the tie-ranking contract: Ava/Zion/Omar 4/5 one line tie at T-2, Juliet 4/5 two lines ranks above,
  response time never breaks a tie); legacy suites 37/38/39: 177/177, 97/97, 76/76; full `supabase test db`: 41
  files, 1,349 tests, the one known pre-existing 99_phase7d cleanup leftover only.
- Rollback: `supabase/rollback/math_bingo_live_pacing.sql` applied to the local database — scheduler, paced Start,
  universe table, pacing and pending columns gone — then the **v1.2.37 versions** of suites 37/38/39 pass against it
  (177/177, 96/96, 75/75); the migration re-applied cleanly and 37–40 pass again (177, 97, 76, 72).
- Security: `npm run test:security` 322/322 (27 files), platform bundle audit and Number Cross launch audit passed;
  anon/authenticated have no EXECUTE on the scheduler, the card check or the paced Start and no SELECT on the universe
  table (pgTAP).
- Typecheck, lint (root + web), content audit, production build: clean.

### Browser (local preview, Chromium)

Setup capacity line and greyed winner chips (Division → 1 winner); lobby note with 19 students on Facts to 20 ("paces
up to 1 winner … with more than 18 students …"); Start refused with the class-size message; host chip "First Bingo
opportunity in 14 calls" → "Bingo opportunity OPEN" at call 15 (green); student footer line; standings `T-1`.

### e2e (Playwright)

`node scripts/run-math-bingo-live.mjs e2e` (local `next dev` + local Supabase, four projects, one worker):

- Chromium: fractions (symbolic question, models, exact match, Called Fractions; Equivalent Fractions) ✓, QR join /
  numeric code / Lock Join / late join / emoji ✓, reconnect & host recovery & takeover ✓, security (API boundaries;
  escaping, hidden answers, isolation, code guessing; free access) ✓, **live paced game ✓** (paced cards of 24 different
  answers, pacing contract on every screen, chip "First Bingo opportunity in N calls" → "Bingo opportunity OPEN" →
  "Next Bingo opportunity in N calls", three Bingos at least ten calls apart starting at call 15, winner ribbons by
  placement, winners cannot mark again, game complete at the third, Play Again resets the pacing) and the one-winner
  timed columns-only game ✓.
- WebKit: fractions ✓ ✓, join-emoji ✓, reconnect ✓, live paced game ✓ (22.7 min on the 30-minute budget; same checks as Chromium).
- Devices (Chromium + WebKit): every target screen (card fits, touch-sized cells, no sideways scroll; paced cards
  differ, so the host moves on until each player holds the live answer) ✓, keyboard / screen reader / reduced motion /
  forced colours ✓.
- First full matrix: 14 passed, 3 failed — the two live runs on the first version of the spec (it expected the room's
  `maxWinners` to be the 3 configured winners, not the level's capacity of 22) and the free-access security test's
  "Math Bingo Live is not on /math-games", stale since v1.2.37 put the game on the Math Games page (the test now
  expects it there). Re-runs: Chromium live ✓ (15 min), free access ✓; WebKit live first ran out of its 15-minute
  budget mid-game (no assertion failed; a paced three-winner game is 35+ calls) — its timeout is now 30 minutes.

### Staging

- `-Stage identify` PASS (pending: `20261108100000`), `-Stage migrate` PASS (universe table, pacing column, scheduler, paced
  Start present; no browser access; row counts unchanged), `-Stage smoke` PASS (room contract through the service-role
  functions, browser reads/RPC refused), then `-Stage migrate` PASS again for `20261108110000` (scheduler with the urgency term).
- `-Stage review` (real Chromium + WebKit against the preview, synthetic free teacher, Ava on a WebKit phone 390×844,
  Zion on an Android-sized Chromium, Omar on a 1024×768 Chromium; Addition within 50, rows + columns, 3 winners, manual
  pace): on `db0fee3` + tuned scheduler **52/52 checks** — build is `db0fee3`; every card 24 different answers in its
  own layout; room paced (first Bingo from 15, 10 between, up to 22 winners at this level); host chip and student line
  count down; **Bingos at calls 16, 26, 36** (Omar, Zion, Ava); "Bingo opportunity OPEN" and "Next Bingo opportunity in
  N calls" both seen on the chip; Winners 1 / 3; board layouts at 1280×720 and 1920×1080 with every panel on screen;
  MATH BINGO COMPLETE. Earlier runs on the same preview: 51/51 (Bingos 15, 25, 35) and 47/47 (Bingos 20, 30, 40 — the
  run that motivated the urgency tune). Screenshots: `qa-artifacts/math-bingo-live/staging-pacing-review-tuned/`.
- `-Stage load` (50 and 30 virtual students + a real host screen, timed 10 s questions / 3 s reveal, Addition within
  50, 2 winners): exact p95 (client-measured from this machine, one shared address; Server-Timing db p95 in brackets):

  | Class | Run | Polls (state) | Changed polls | Taps (mark) | Free Space | Teacher (host: Start, Next, Reveal, Play Again, calls) | Same-answer burst | Errors | Pacing |
  | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
  | 30 | 1 | **689 ms** [559] | 946 ms | **1,001 ms** [844] | 1,147 ms [1,039] | **1,029 ms** [532] | 18/18 accepted, p95 1,946 ms | 0 of 12,190 | Bingos 16 / 26 |
  | 50 | 1 | 1,319 ms [1,177] | 1,706 ms | 2,166 ms [2,056] | 1,222 ms [1,119] | 1,989 ms [981] | 31/31 accepted, p95 3,214 ms | 6 of 12,713 (4 × 503 live-unavailable polls, 2 aborted host requests) | Bingos 15 / 25 |
  | 50 | 2 | 1,477 ms [1,346] | 1,656 ms | 1,809 ms [1,683] | 1,391 ms [1,198] | 2,032 ms [1,029] | 31/31 accepted, p95 3,337 ms | 0 of 12,737 | Bingos 15 / 25 |

  Limits in the harness: polls 1,000 ms, taps 1,500 ms, host 1,500 ms, burst 1,500 ms. **30 students: every limit met**
  (17/18 checks; the burst p95 is the one miss). **50 students: the poll, tap and host limits are missed by 0.3–0.7 s**
  (13/18 and 14/18) — the same shape as before pacing, and better than the v1.2.36 staging baseline of 2026-11-05 (polls
  2,005 ms, taps 4,104 ms, host 3,061 ms at 50 students): the staging database itself slows under 50 polling students
  (an unrelated one-row read from this machine measured p95 1,061–1,245 ms during play, 567 ms with 30). Every
  functional check passed at both sizes: all students joined (≈10 s for the class) and got a card, every student saw
  ≥ 95 % of the questions (worst 96.6 %), no rate limiting, no question repeated, every Bingo at call 15 and at 25,
  Play Again worked, standings carry the emoji. Call generation (the scheduler) is inside the host request: db p95
  981–1,029 ms at 50 students, 532 ms at 30. Reports: `owner-review/evidence/math-bingo-live-pacing/staging-load-*.json`.

## Game-logic coherence audit

Every rule that touches winning, marking or ordering was read against the pacing contract. Nothing conflicts; what
changed and what was only noted:

- **Win confirmation** (`bingo_apply_progress`): a complete enabled line is a Bingo only when the gate is open; otherwise
  it is kept as a pending line. Both paths run in the mark's own transaction under the room lock, so the same-call race
  is still decided by lock order, and the `(room_id, placement)` unique index still backs every placement.
- **Free Space**: still two taps, once per game, any live question; it counts toward lines and can complete one. Before
  call 15 it cannot create a Bingo (every line still needs its late cell); later it can, and a line it completes while a
  gate is closed is simply pending. The scheduler counts the Free Space as already marked (optimal use), which is the
  conservative side for the contract.
- **"X is one away!"** on the host board still fires at 4/5, before the gate too; the pacing chip beside it says when the
  opportunity comes, so the two read together. No change.
- **Winners = Everyone**: still allowed when the level can pace the whole class (within 50 / within 100 / challenge for
  most classes); otherwise the lobby and Start say how many it can.
- **Timed questions**: a gate-open call the student does not answer in time keeps the gate open; the next call is again
  a real opportunity. The question clock is untouched.
- **Pause / resume, reconnect, host takeover, remove player, lock joining**: unchanged; removing a player clears any
  pending line; pacing state lives on the room row that these already protect.
- **Late joiners**: get a card from the same universe and late set; questions called before they joined cannot be
  marked (as before), so they start behind. Noted, not changed.
- **Deck exhaustion**: a paced game ends with "Every question was called" only if the universe runs out; capacity keeps
  this rare (buffer of unused questions). Unchanged message.
- **Legacy rooms** created before the migration keep their fixed deck until closed; nothing migrates mid-game.

Unrelated ideas noticed (not done, for a later brief): a short sound when the gate opens; the "one away" ticker could
mention the opportunity ("Ava is one away — opportunity in 4 calls"); a Division level with more quotients (Facts to
15/20) so Division can pace more than one winner; a lobby hint suggesting the smallest level that paces the chosen
winners for the class size.

## How to review on staging

1. Open the staging preview URL above and sign in with the staging free-teacher account you use for reviews.
2. Host → Math Bingo Live. In Setup choose **Addition · Within 50** (240 questions; paces up to 22 winners), **3
   winners**, manual or 15 s questions; note the capacity line under "Number of winners" (try Division to see it drop
   to 1 and the chips grey out). CREATE GAME.
3. Have 3+ students join (QR or code). The lobby shows "PLAYERS — N"; with a small level and a big class it also says how
   many winners the level can pace. START GAME.
4. Host header chip: "First Bingo opportunity in 14 calls" counting down; every student's footer says the same. Calls
   1–14: nobody can finish a line (a 4/5 is normal). Call 15: chip turns green "Bingo opportunity OPEN"; the first
   correct mark on a completing call is Bingo; the chip then says "Next Bingo opportunity in 10 calls".
5. Standings: equal progress shows `T-2`; a line completed on the winner's call shows `5/5 · waiting` under the winners
   and is confirmed as the next winner when the gate reopens.
6. Play Again: the chip starts at 14 calls again; new cards; Called history empty.
