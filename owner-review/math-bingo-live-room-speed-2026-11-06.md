# Math Bingo Live — 50-student speed (STAGING ONLY, 2026-11-05/06)

**Status: on staging only. Production untouched (v1.2.35, game published). Nothing pushed or merged.**
Branch `perf/math-bingo-live-50` (from `main` `86beab1`), latest build `7675389` on staging preview
`dpl_ExcpR7wvQJmy6oZhHTcR8AYieyCR`. Staging database has migrations `20261106100000` and `20261106110000`.

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
5. Tooling: `Server-Timing` on the game API (durations only), a load test that polls exactly like the student page and
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

Every run: all students joined, 0 rate-limited, games completed with winners in distinct places, every student saw
≥ 95% of the questions. The `7675389` runs came after the `b166486` runs on a busier staging Supabase: the local
benchmark shows its database work is cheaper, and the trivial Supabase probe shows the whole API slowing down in those
runs. One run (`7a8e7a7`) had 3 requests fail with "live-unavailable" when the Supabase API timed out.

The 10-second timeline of the last run: between bursts, polls ran at p95 0.8–1.2 s. The worst windows were the first
20 seconds of a game (50 cards dealt, 50 Free Space claims) and the Play Again burst, when even the trivial Supabase
read took 2–9 s.

## Checks so far

- pgTAP: 1,174/1,175 (both Bingo files pass; the one failure is the local leftover-rows cleanup check, as before).
- Unit (Bingo): 120/120. Typecheck clean. Lint clean on changed files.
- Staging review (real browsers): 42/42 on `6e8e5ab` and `b166486`, 43/43 on `7675389`.
- Not yet run on the final commit: the full release gates (build, all unit suites, security suite, Bingo e2e).

## Options

1. **Larger Supabase compute for production (and staging to verify).** The direct fix: the database is idle and the API
   layer in front of it is what runs out at 50 students. This is a Supabase plan/billing decision.
2. **One more app change for the game-start burst:** deal every student's card inside the teacher's Start / Play Again
   call (one request instead of 50), which removes the worst spike. It helps the bursts, not the steady ~1 s.
3. **Release what is here** as an improvement (30 students comfortably inside the targets; 50 students no worse than
   v1.2.35 and better on a calm day), and leave the plan question for later.

Nothing goes to production without your approval.
