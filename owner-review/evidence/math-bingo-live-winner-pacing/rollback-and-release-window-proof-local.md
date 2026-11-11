# Rollback, release-window and database-cost proof (local Supabase, 2026-11-11)

Scripts: the suite 42 fixtures plus `setup.sql`, `after-rollback.sql`, `after-rollback-2.sql`, `compat-new-db.sql`,
`bench.sql`, `bench-next.sql` (session scratchpad), run with `psql` inside the local database container.

## 1. Rollback (`supabase/rollback/math_bingo_live_winner_targets.sql`) on a database with live rooms

Rooms committed on the NEW database before the rollback:

| Room | State | Rollback |
| --- | --- | --- |
| 911001 | game in progress under the new rules (COUNTDOWN, no ties) | closed, 0 players left |
| 911002 | game complete, two winners sharing 1st place | closed, 0 players left |
| 911003 | lobby, 2 players, no game | **kept open, 2 players** |

The rollback ran as one transaction (`UPDATE 2`, `COMMIT`). Afterwards: `bingo_first_gate`, `bingo_winner_gap`,
`bingo_first_gate_bounds`, `bingo_new_settings_valid` dropped; unique `bingo_participants_placement_idx` rebuilt; plain
`bingo_participants_room_placement_idx` gone.

Restored functions against each build's calls:

| Call | Result |
| --- | --- |
| this build's Start payload (`{late, reserve}`) | `invalid-game` (refused, hence: redeploy v1.2.44 first) |
| v1.2.44 Start payload, target 2 (inside the v1.2.38 capacity of this 31-question fixture) | `started`, pacing `15 / spacing 10` (fixed, from the payload) |
| v1.2.44 Start payload, target 3 (above that fixture's capacity of 2) | `winners-exceed-capacity` (the v1.2.38 rule, restored) |
| v1.2.44 "Everyone" (0) create | `created` |

v1.2.44's own pgTAP suites (from `main` 299366d) on the rolled-back database:

| Suite | Result |
| --- | --- |
| 37_math_bingo_live | 177/177 |
| 38_math_bingo_live_room_speed | 97/97 |
| 39_math_bingo_live_final_gameplay | 76/76 |
| 40_math_bingo_live_pacing | 72/72 |

## 2. Re-apply and the release window (v1.2.44 screens on the NEW database)

Migration re-applied with `psql --single-transaction` (exit 0). v1.2.44's calls:

| Call | Result |
| --- | --- |
| create with its presets 1, 2, 3, 5, 10 | `created` (each) |
| create with its "Everyone" (0) | `invalid-settings` (the one refusal in the window) |
| its Start payload (`firstWinCall: 15, spacing: 10, …`) | `started`; the database drew its own first gate: **17** (payload ignored) |
| host state / player state | no `pacing`, `firstWinCall`, `nextEligibleCall`, `winnerEvents` or `gaps` anywhere |

Then the full local pgTAP run: 1,600/1,601 (Bingo 37, 38, 39, 40, 42 and Polygon 41 all pass; the one failure is the
known `99_phase7d_suite_cleanup` leftover-rows check, which counts local e2e accounts, not Bingo rows).

## 3. Database cost per request, same 50-player room (A/B, database execution only)

| Step | v1.2.44 functions | new functions |
| --- | --- | --- |
| Start (50 boards) | 144.0 ms | 149.4 ms |
| student full state | 5.39 ms | 5.91 ms |
| ordinary correct tap | 6.28 ms | 6.57 ms |
| line-completing tap at the gate | 10.80 ms (1 winner, 49 kept pending) | 13.81 ms (50 same-call winners) |
| host full state after the gate | 5.32 ms (1 winner) | 9.02 ms (50 winners listed) |
| student full state after the gate | 7.32 ms | 9.21 ms |
| host Next into a new call (scheduler), 50 players | — | mean 24.6 ms, max 32.3 ms (15 calls) |

Staging `pg_stat_statements` (cumulative since 2026-08-03, all staging runs including v1.2.38's): `bingo_player_state`
329,508 calls, mean 9.9 ms; `bingo_mark` 33,401 calls, mean 29.0 ms; the slowest single executions (7.7–8.0 s) sit at the
8 s API statement timeout. The stalls seen in two staging load runs (slowest poll 17.7 s and 39.2 s) therefore include
queueing before the database (the independent one-row Supabase probe stalled in the same windows while Vercel's health route stayed under 1 s).
