# Math Bingo Live — winner targets and variable winner pacing (OWNER REVIEW, 2026-11-11)

**Status: READY FOR MATH BINGO WINNER-PACING OWNER REVIEW. Production untouched (v1.2.44 live; no production
migration, no deploy). Not pushed, not merged.**

| | |
| --- | --- |
| Branch | `feature/math-bingo-live-winner-pacing` from `main` `299366d` (v1.2.44) |
| Final HEAD | HEAD_COMMIT |
| Migration | `20261111100000_math_bingo_live_winner_targets.sql` (helper functions, replaced function bodies, the unique placement index replaced by a plain one; backward compatible) |
| Rollback | `supabase/rollback/math_bingo_live_winner_targets.sql` |
| Local review | `node scripts/run-math-bingo-live.mjs demo` (http://127.0.0.1:3101/games/math-bingo-live/host) |
| Staging | STAGING_LINE |

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

## Evidence

EVIDENCE

## Known limitations

LIMITATIONS
