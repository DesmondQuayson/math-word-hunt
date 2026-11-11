# Math Bingo Live — winner targets and variable winner pacing (OWNER REVIEW, 2026-11-11)

**Status: READY FOR MATH BINGO WINNER-PACING OWNER REVIEW. Production untouched (v1.2.44 live; no production migration, no deploy). Not pushed, not merged.**

| | |
| --- | --- |
| Branch | `feature/math-bingo-live-winner-pacing` from `main` `299366d` (v1.2.44) |
| Commits | `29d01fd` (feature; the staging preview's build) + one record commit on top (rollback hardening, suite renamed 41 → 42, this record and its evidence) |
| Migration | `20261111100000_math_bingo_live_winner_targets.sql` (helper functions, replaced function bodies, the unique placement index replaced by a plain one; backward compatible) |
| Rollback | `supabase/rollback/math_bingo_live_winner_targets.sql` (redeploy v1.2.44 first, then run it) |
| Local review | `node scripts/run-math-bingo-live.mjs demo` (http://127.0.0.1:3101/games/math-bingo-live/host) |
| Staging | migration applied and verified on staging; preview https://mathnexa-platform-staging-21fi3d0k6-bright-path-ed-tech.vercel.app (`dpl_7f4JyjbevwmqupAkMizdPeMjP6yr`, build `29d01fd`) |

## What changed

1. **Number of winners — any whole number.** One box with − and + on the setup form and in Settings, for every mode
   (Addition, Subtraction, Multiplication, Division, Mixed, Fraction Bingo). Any number from 1 to 60 (60 = the most
   players a room holds); typed or stepped. No presets, no "up to N winners" from the level, no greyed-out choices. The
   server refuses 0, negatives, decimals, text, `null` and anything above 60, whatever the page sends.
2. **Target and players.** The lobby shows `Players: 24 · Winner target: 15`. A target above the players shows "Winner
   target exceeds current players. Add more players or reduce the target before starting." — a warning, never a reset;
   Start is not refused, and the game then ends when every player has Bingo. No winner is invented.
3. **First winner gate, drawn per game.** At Start the database draws one of calls 14, 15, 16 or 17 from the game's secret
   seed. No Bingo before it; from it on, a legitimate line wins. Fraction Bingo halves to fifths (10 fractions) and to
   sixths (15) cannot reach call 14, so they draw from 4–7 and 9–12.
4. **Gaps, drawn after every new winner event.** After each new winner event the database draws a fresh gap of 8, 9, 10
   or 11 calls; the next new winner cannot come sooner (e.g. 16, +9, +8, +11, +10).
5. **Same-call ties.** Everyone who completes a line on the call of a winner event wins and shares the placement (Ava 1st,
   Zion 2nd, Omar and Juliet both 3rd, the next winner 5th); tap order, network and database order never separate them.
   If that passes the target, every such winner counts (target 10, nine winners, three on one call: 12 winners, the last
   three sharing 10th). Once the target is reached the rest of that call still counts; the game ends when the call closes.
6. **Hidden pacing.** The gates and gaps live only in the database (with a log for evidence). The v1.2.38 countdown
   ("First/Next Bingo opportunity in N calls", "Bingo opportunity OPEN") is gone from the host and student screens and from
   both payloads, so nobody can predict when a Bingo becomes possible.
7. **Unchanged:** paced cards (every enabled line holds a late cell), unique questions, QR and numeric joining, emoji,
   independent marking, Free Space, Winning Ways, one Bingo per player, reconnect, late join, standings with ties, music,
   sounds, the 30/50-player speed work, free hosting, no-account joining, security.

## Release and rollback order

- **Release:** apply the migration, then deploy at once. In between, the v1.2.44 screens keep working against the new
  database (its Start payload is accepted and the database draws the gate itself; its pacing chip simply disappears),
  except that its "Everyone" winner choice (0) is refused.
- **Rollback:** redeploy v1.2.44 first, then run the rollback SQL. It closes, exactly as the host's Close does, every room
  with a game in progress under the new rules and every room whose winners share a place (the unique index cannot be
  rebuilt over them); every other room keeps playing.

## Evidence

Files: `owner-review/evidence/math-bingo-live-winner-pacing/` (draw distributions, simulation summary and reports, staging
review transcript, staging load summary, rollback / release-window / database-cost proof).

### Local (worktree `C:/GitHub/mathnexa-bingo-live`, local Supabase)

| Gate | Result |
| --- | --- |
| Unit | core 245/245; web 1,421 passed, 1 skipped (pre-existing skip) |
| Typecheck / lint / content | clean / 0 errors (8 pre-existing warnings in `public/game-suite/natural-voice.js`, untouched) / pass |
| Production build / security gate | pass / pass (326 tests, platform bundle audit, Number Cross audit, bypass test) |
| pgTAP (full) | 1,600/1,601 — Bingo 37 (179), 38 (97), 39 (76), 40 (74), 42 (147) and Polygon 41 pass; the one failure is the known `99_phase7d_suite_cleanup` leftover-rows check (local e2e accounts) |
| Playwright, Chromium | 10/10 (Fraction Bingo ×2, QR/numeric join + late join + emoji, paced game with hidden gates, target 1 + timed questions, reconnect, security ×3, winner box) |
| Playwright, WebKit | 7/7 — `live.spec` failed once on the 2.2 s "OMAR USED FREE SPACE!" banner while the unit suite ran in parallel (assertion unchanged since v1.2.44; the leaderboard had the update); rerun on a quiet machine 2/2 |
| Playwright, devices | Chromium 2/2, WebKit 2/2 (phones 320/360/390, iPad portrait/landscape, desktop; host on Smart Board 1920×1080 and laptop) |
| Polygon Showdown `/join` regression | 2/2 (Chromium, WebKit): a Showdown code reaches the Showdown, a Bingo code reaches Bingo |
| Draws, 10,000 rooms | first gate 14: 2,478 (24.78%), 15: 2,555 (25.55%), 16: 2,479 (24.79%), 17: 2,488 (24.88%), χ² 1.64 (df 3); gaps over 50,000 draws (5 per room) 8: 12,624 (25.25%), 9: 12,444 (24.89%), 10: 12,366 (24.73%), 11: 12,566 (25.13%), χ² 3.27 (df 3); each event position balanced (χ² 0.27–3.15); first gate and next gap independent (χ² 4.73, df 9) |
| Simulation (real database functions) | 913 games, 0 violations, 0 failures: no Bingo before its drawn gate (earliest − gate = 0), no new winner before its drawn gap (smallest event gap − drawn = 0); exact sequences forced 14/+8/+11/+9/+10 (15 games) and 17/+11/+8 (20); 3,803 winner events, 1,220 with same-call ties (largest 33); seats: 0.284 vs 0.278 wins per seat (earlier vs later joined half); target above players: 105 games, 0 invented winners |
| Rollback | closes the in-progress and tied rooms, keeps the lobby room; v1.2.44's suites pass on the rolled-back database (177/97/76/72); re-applied cleanly |
| Release window | v1.2.44's calls on the new database: presets 1/2/3/5/10 created, its Start accepted (the database drew 17, ignoring the payload's 15), no pacing in either state; only "Everyone" (0) refused |
| Database cost (50-player room, A/B) | student state 5.4 → 5.9 ms, ordinary tap 6.3 → 6.6 ms, line-completing tap 10.8 → 13.8 ms (1 vs 50 winners), scheduler 24.6 ms mean per new call |

### Staging (database `gcmuhzxkwvfireyrearl`, preview `dpl_7f4JyjbevwmqupAkMizdPeMjP6yr`, build `29d01fd`)

- Migration `20261111100000` applied and verified (first gate, window, gaps in range, gap function, new settings check,
  plain placement index, unique index dropped, capacity refusal gone, draws not executable by browser roles); row counts
  unchanged. Smoke: PASS.
- Real-browser review 41/41: first gate drawn 16; Bingos at calls 16, 26, 35 (gaps drawn 10, 9, 11), none before its
  gate; no screen shows or receives the gates; layouts at 1280×720 and 1920×1080; production `/join` still serves the
  published game.
- Load (virtual students from this one machine, 10 s questions; p95 limits 1,000 / 1,500 / 1,500 ms):

| Players | Target | Level | Winners | Gates and winner events (call×winners) | p95 polls / taps / host (ms) | Notes |
| --- | --- | --- | --- | --- | --- | --- |
| 10 | 2 | Within 50 | 2 | first 16; 16×1, 24×1; gaps 8, 11 | 420 / 379 / 822 | harness burst check wants 9 of 10 holding one answer: 6 did, 6/6 accepted |
| 20 | 5 | Facts to 20 | 13 | first 14; 14×3, 23×1, 31×9; gaps 9, 8, 8 | 532 / 755 / 867 | one host poll aborted by the page itself |
| 30 | 10 | Facts to 20 | 19 | first 14; 14×2, 23×2, 34×15; gaps 9, 11, 11 | 731 / 1,422 / 1,139 | one Supabase stall (one-row probe 9.5–11.4 s): 8 polls answered 503 |
| 40 | 20 | Facts to 20 | 21 | first 16; 16×3, 24×1, 32×17; gaps 8, 8, 9 | 1,286 / 3,051 / 2,094 | Supabase stall 90–150 s into play, before any gate (probe up to 36.6 s; Vercel health < 1 s): 503s |
| 50 | 30 | Facts to 20 | 38 | first 14; 14×5, 25×4, 36×29; gaps 11, 11, 9 | 1,323 / 1,775 / 1,953 | inside v1.2.38's 50-student range (1,090–2,010 / 1,370–4,100 / 1,610–3,060) |
| 50 (rerun, quiet machine) | 30 | Facts to 20 | 36 | first 15; 15×5, 23×18, 34×13; gaps 8, 11, 10 | 1,494 / 1,594 / 2,165 | staging database time during the run (pg_stat_statements delta): 18 ms per poll, 35 ms per tap, 0 lock waits; 4 polls reset (ECONNRESET) |

  Every run: all students joined and got a card, every game kept its drawn gates, each winner once, same-call winners
  sharing the place, no question repeated, no rate limiting, no invented winner.

## Known limitations

1. **50 students and Supabase.** Above ~30 students the poll, tap and host p95s exceed the harness limits, as they did in
   v1.2.38 (traced then to queueing in the Supabase API layer; Supabase is not to be upgraded now). This branch adds
   about 0.3–3 ms of database time per request. Two staging runs also hit Supabase stalls (slowest poll 17.7 s and 39.2 s) in
   which even an unrelated one-row read stalled (up to 36.6 s) while Vercel's health route stayed under 1 s.
2. **Small levels, big classes: many share a place.** With few distinct answers (Facts to 20: 51 questions) and 30–50
   players, most cards complete together; a target-1 game ended with several tied 1st in 12 of 12 simulated games, and
   the 50-player staging game confirmed 29 winners at one gate (all 10th). By design: same-call winners count.
3. **Targets near the class size on small levels can run out of questions** ("Every question was called"): Facts to 20,
   ×0–10 (61), ×0–12 (84) and the Fraction levels (22/45/66); in the simulation 77 of 225 Fraction and 33 of 150
   multiplication games ended that way. Winners are never invented.
4. **Over-target winners** happen when several finish on the target's call (target 1: 100 extra winners over 168 games).
5. **Target above the players:** Start is allowed with the warning; the game ends when every player has Bingo.
6. **Release window:** between the migration and the deploy, v1.2.44's "Everyone" choice is refused (other choices work).
7. **Rollback** closes rooms with a game in progress under the new rules and rooms with tied places.
8. **Lines finished while the gate is closed** are confirmed at the start of the gate call; if that reaches the target the
   game ends before that call's question is shown (the record gives the gate call as the winning call). Same as v1.2.38.
9. **Draws are deterministic from the game's secret seed** (md5): unknowable to players (the seed never leaves the
   database), reproducible for audit; not re-drawn on reconnect or retry.
10. **Browsers:** WebKit on Windows stands in for Safari; real iPhone/iPad/Smart Board checks are the owner's.
11. **Free-space banner e2e assertion** reads three screens in turn against a 2.2 s banner and can miss under heavy CPU
    (test-only; unchanged since v1.2.44).
