# Math Bingo Live — LOCAL OWNER REVIEW (2026-11-03/04)

**Status: DRAFT — local owner review only. Nothing merged, deployed, published or listed. Production not modified.**

- Worktree: `C:\GitHub\mathnexa-bingo-live`
- Branch: `feature/math-bingo-live` (local only, not pushed), base `origin/main` 7a846c4 (v1.2.34 release record)
- Design and operations: [`docs/math-bingo-live-v1.md`](../docs/math-bingo-live-v1.md)

## Run the owner demo

```bash
node scripts/run-math-bingo-live.mjs demo
```

Prerequisites: local Supabase running with the migration applied (`node node_modules/supabase/dist/supabase.js migration up --local`). The runner starts the app on `http://127.0.0.1:3100` (or `$PORT`) in the production-platform rehearsal with the **local owner preview** switched on, and makes sure the local synthetic FREE teacher exists (no subscription, no trial):

| | |
| --- | --- |
| Teacher sign-in (local Supabase only) | `bingo-teacher@example.test` / `BingoTeacher42!` |
| Host | `http://127.0.0.1:3100/games/math-bingo-live/host` |
| Students | `http://127.0.0.1:3100/join` (no account) |

Suggested walkthrough (three student windows: Ava, Zion, Omar — use separate browser windows or a private window per student; each tab is its own player):

1. Host: sign in → setup (MATH / PACE / WINNING / CLASSROOM) → **CREATE GAME**. Lobby shows `JOIN …/join` and the 6-digit `CODE`.
2. Students: open `/join`, type the code, then a name → "You're in!". Names appear live on the host lobby (× removes a player; Lock joining; New code).
3. **START GAME** → 3-second countdown → question. Students tap the matching square (one per question; two wrong taps lock the card for that question). Tap the centre star twice to use Free Space → every screen shows "🎉 OMAR USED FREE SPACE!".
4. Watch the host leaderboard (`4/5 · Row`, "Ava is one away!"), then a Bingo banner on every screen (`🎉 AVA — BINGO!`, `FIRST BINGO`, `1 / 3`, `ROW BINGO`, the five cells glowing) and the host fanfare.
5. With 3 winners the game ends at the third Bingo: `MATH BINGO COMPLETE` 🥇🥈🥉 → **Play Again** (same players, new cards), **Change Settings**, **End Room**.
6. Fraction Bingo: choose *Fraction Bingo*; the question is `2/3`, the cards show models; open `Called Fractions (n) ▾` on a phone; the host side panel shows CURRENT/CALLED. Try *Allow Equivalent Fractions*.
7. Refresh a student mid-game (same card, marks, Free Space, rank); refresh the host; open the host in a second window (the first says "open in another window" → Take control here); Pause/Resume.

The e2e, load and thumbnail runs use the same runner: `node scripts/run-math-bingo-live.mjs e2e`, `… load`, `… thumbnail` (add `--production` to build and serve `next start`).

## Results

RESULTS_PLACEHOLDER
