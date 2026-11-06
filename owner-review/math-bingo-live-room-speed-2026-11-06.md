# Math Bingo Live — 50-student speed (STAGING ONLY, 2026-11-05/06)

**Status: on staging only. Production untouched (v1.2.35, game published). Nothing pushed or merged.**
Branch `perf/math-bingo-live-50` (from `main` `86beab1`), latest build `4ef3a61` on staging preview
`dpl_5ombzwsgyArmYnsdh5Zm9ikxQq5Y`. Staging database has migrations `20261106100000`, `20261106110000` and
`20261106120000`.

## What we found

The slowdown at 50 students is not in the game's database work. Every game request now reports where its time goes
(`Server-Timing`), and Postgres statistics were read during the runs:

| Where the time goes (50 students) | Typical | Notes |
| --- | --- | --- |
| Network + Vercel (outside our handler) | ~105 ms (p95 ~175 ms) | Same as a request that does no database work |
| Postgres running the game's functions | 4 ms per poll, 13–16 ms per tap, 23 ms per Free Space | `pg_stat_statements` delta per run; 1–3 active connections, no lock waits |
| Waiting on the Supabase API in front of Postgres | p50 ~300 ms, p95 1.5–2 s, spikes to 9–12 s | Nearly all of the remaining time |

During the same run, a trivial Supabase read (one catalog row, sent straight from the test machine to Supabase every
2 s) slowed down too: p50 255 ms, p95 1.46 s, worst 9 s. Its spikes line up with the game's spikes. The Supabase API
layer of this project slows down for everything once a class of ~50 polls it, and it varies a lot from run to run:
the same build gave poll p95 1.03 s in one run and 1.8 s in another.

**Staging and production are the same database size** (`max_connections` 60, `shared_buffers` 224 MB: the smallest
Supabase compute tier). Production would behave the same way at 50 students.

## What changed on this branch

1. **Ordinary taps no longer lock or rewrite the room** (migration `20261106100000`). A wrong tap, or a correct tap that
   neither wins nor makes the student "one away" for the first time, updates only that student's row, guarded by the
   row's version. Bingos, a first "one away" and Free Space still take the room lock, so winner order and the winner cap
   are unchanged. Final refusals (already marked, mark used, out of attempts, …) need no lock. The teacher's standings
   still update on every tap (a progress number in the host's "unchanged" check). The leaderboard is computed when a
   reply is built.
2. **Smaller student replies** (migration `20261106110000`): the top five plus the student's own row instead of the
   whole class, and the card-dealing data only when a card is needed. In the database: 3.7 ms instead of 4.5 ms, and
   2.6 KB instead of 10.4 KB per reply (local benchmark, 50 players).
3. **Big classes poll less often.** Up to 30 players nothing changes (1 s for students, 0.8 s for the teacher). Larger
   classes poll proportionally less often, up to 2× at 60, so a class makes about as many requests as 30 players.
   Timed questions still change exactly at the deadline (every screen also polls at the deadline, now spread over
   0.3 s so 50 phones do not arrive in the same instant). Requests per second at 50 students: 35 → 27.
4. **The teacher's screen reuses its sign-in check for 15 seconds** on read-only polls (same session cookies, same
   server instance). Every command (start, next, pause, remove, close, …) still checks in full and the host token is
   still required. The sign-in check was ~0.6 s of every teacher poll.
5. **Every card is dealt in the teacher's Start / Play Again call** (migration `20261106120000`; owner chose "Fix
   game-start burst", 2026-11-06). Before, each student's first poll asked the server to deal and store a card (50
   extra requests in a few seconds, each taking the room lock), which caused the 2–9 s spikes at the start of every
   game. Now the server deals every joined student's card from the new game's secret seed (the same deal as before)
   and the database stores each one only if it is exactly the game's pool with the Free Space in place. A refused card
   or a student who joins after Start falls back to the old path. One request instead of 50.
6. Tooling: `Server-Timing` on the game API (durations only), a load test that polls exactly like the student page and
   records the timing breakdown, a no-database probe, a trivial Supabase probe and a 10-second timeline; the staging and
   production database runners apply the new migrations in order (production not run). Rollback SQL:
   `supabase/rollback/math_bingo_live_room_speed.sql`.

## Staging load results (p95; targets: polls ≤ 1.0 s, taps ≤ 1.5 s, teacher ≤ 1.5 s)

| Build | Students | Polls | Taps | Teacher | Checks |
| --- | --- | --- | --- | --- | --- |
| v1.2.35 (`e0c92a7`) | 30 | 0.38 s | 0.42 s | 0.90 s | all pass |
| v1.2.35 (`e0c92a7`), two runs | 50 | 1.43–1.57 s | 2.20–2.56 s | 3.14–3.62 s | 3 fail |
| Room lock change (`6e8e5ab`), four runs | 50 | 1.13–1.84 s | 1.58–2.80 s | 2.34–3.97 s | 3 fail |
| + big classes poll less (`b166486`), two runs | 50 | 1.03–1.07 s | **0.85–0.96 s** | 1.96–2.01 s | 2 fail |
| + teacher sign-in reuse, smaller replies (`7675389`), three runs | 50 | 1.65–1.81 s | 2.10–3.81 s | 2.18–3.04 s | 3 fail |
| `7675389` | 30 | 0.56 s | 0.53 s | 0.91 s | **all 13 pass** |
| **+ cards dealt at Start (`4ef3a61`), run 1** | 50 | 1.06 s | **0.80 s** | 1.60 s | 2 fail (just over) |
| **`4ef3a61`, run 2** (Supabase slowdown: the one-row probe hit 3.7 s) | 50 | 1.20 s | **1.13 s** | 1.71 s | 2 fail |
| **`4ef3a61`** | 30 | 0.56 s | 0.47 s | 0.97 s | **all 13 pass** |

Every run: all students joined, 0 rate-limited, games completed with winners in distinct places, every student saw
≥ 95% of the questions. The `7675389` runs came after the `b166486` runs on a busier staging Supabase: the local
benchmark shows its database work is cheaper, and the trivial Supabase probe shows the whole API slowing down in those
runs. One run (`7a8e7a7`) had 3 requests fail with "live-unavailable" when the Supabase API timed out.

On `4ef3a61` no student poll had to deal a card (0 in every run), the worst single poll in run 1 was 2.0 s (it had
been 9–12 s), and the first 20 seconds of the game ran at poll p95 0.98–1.11 s, the same as the rest of the game.
The Free Space claims at the first question are now the busiest moment (p95 1.2 s in run 1, 6.6 s in run 2 during
the Supabase slowdown).

The 10-second timeline of the `7675389` run (before cards were dealt at Start): between bursts, polls ran at p95 0.8–1.2 s. The worst windows were the first
20 seconds of a game (50 cards dealt, 50 Free Space claims) and the Play Again burst, when even the trivial Supabase
read took 2–9 s.

## Checks

- pgTAP: 1,174/1,175 (both Bingo files pass; the one failure is the local leftover-rows cleanup check, as before).
- Unit (Bingo): 120/120. Typecheck clean. Lint clean on changed files.
- Staging review (real browsers): 42/42 on `6e8e5ab` and `b166486`, 43/43 on `7675389`, 34/34 on `4ef3a61` (the count
  depends on how many questions Ava needs for her Bingo).
- pgTAP on `4ef3a61`: 1,199/1,200 (the same local cleanup check). Bingo unit tests 121/121.
- Full release gates on `4ef3a61` (local): typecheck clean; lint 0 errors (8 pre-existing warnings); build pass; unit
  core 245/245 and web 1,140 passed, 1 skipped; `test:security` 322/322 with the platform bundle and Number Cross
  audits passing; Math Bingo Live browser tests 17/17 in Chromium, WebKit and the device projects (the WebKit
  three-Bingo test, which timed out in the v1.2.35 gates, passed in 14 minutes).

## Options

1. **Larger Supabase compute for production (and staging to verify).** The direct fix: the database is idle and the API
   layer in front of it is what runs out at 50 students. This is a Supabase plan/billing decision.
2. **Release what is here** (as v1.2.36): 30 students comfortably inside the targets, and 50 students clearly better than
   v1.2.35 — polls 1.06–1.20 s instead of 1.43–1.57 s, taps 0.80–1.13 s instead of 2.20–2.56 s (inside the target),
   the teacher's screen 1.60–1.71 s instead of 3.14–3.62 s, and no more multi-second stalls at the start of a game —
   though polls and the teacher's screen are still 0.1–0.2 s over target. The plan question can follow.
3. **Two smaller app changes** could close the last ~0.1–0.2 s: make the Free Space announcement not lock the room
   (it would need its own small events table), and send the teacher's screen a lighter standings list. Each is a
   database change with its own staging round.

Nothing goes to production without your approval.
