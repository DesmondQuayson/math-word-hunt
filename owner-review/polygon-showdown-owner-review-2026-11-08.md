# Polygon Showdown: owner review, 2026-11-08

Status: **ready for local owner review.** Catalog DRAFT. Nothing is on staging or production. Design detail is in `docs/polygon-showdown-v1.md`.

## Open it

The review server runs at `http://127.0.0.1:3102` (start it again with `node scripts/run-polygon-showdown.mjs demo`). Sign in with the synthetic account `polygon-owner@example.test`; its password and the other test accounts are at the top of `scripts/run-polygon-showdown.mjs`. It holds some local-only review coins so the shop can be tried.

| Screen | Address |
| --- | --- |
| Landing | `/games/polygon-showdown/play` |
| Solo (new or current run) | `/games/polygon-showdown/play#solo` |
| Continue Solo | `/games/polygon-showdown/play#continue` |
| Create Showdown | `/games/polygon-showdown/play#create` |
| Showdown lobby and active game | `/games/polygon-showdown/play#showdown` (same screen, same tab) |
| Player join | `/join?code=<the code on the lobby>`, or `/join` and type it |
| Shop | `/games/polygon-showdown/play#shop` |
| Avatar editor | `/games/polygon-showdown/play#avatar` |
| Catalog preview | `/games/polygon-showdown/play#catalog` |

## Decisions taken automatically

You asked for the recommended option each time, so these are mine to flag rather than yours to have picked:

- **Pause is left out.** A paused board could be studied by whoever paused it, which would be a creator advantage.
- **School access sessions are guests for progression**: they can open the game, create a room, and play a practice run that exists only in their tab. No wallet is ever created.
- **Anonymous visitors are sent to sign in**, matching every other free game. No anonymous Solo.
- **Coins run higher than your examples.** With only four shapes, falling pieces line up often: about 0.7 to 0.9 cascades per move. A five-minute Showdown pays about 215 / 430 / 720 coins for a beginner / average / skilled player, against your example of 184. I kept your example prices at the low end and stretched the top tiers.
- **Permanent reward from a Showdown** is half the Showdown's coins, capped at 40 per minute of its length. Solo stays the main earner.
- **Daily banking limit** of 15,000 coins per account, to stop a modified client from farming the shop.

## Economy simulation

Real engine, including animation time, 40 sessions per row (`scripts/polygon-showdown-economy-simulation.mjs`).

| Coins earned | 5 min | 10 min | 30 min | 1 hour |
| --- | --- | --- | --- | --- |
| Beginner | 215 | 422 | 1,269 | 2,523 |
| Average | 428 | 876 | 2,628 | 5,244 |
| Skilled | 719 | 1,449 | 4,292 | 8,538 |

| Solo play to earn | Typical price | Beginner | Average | Skilled |
| --- | --- | --- | --- | --- |
| Cheap item | 45 | 1 min | 1 min | under 1 min |
| Mid-tier item | 200 | 5 min | 2 min | 1 min |
| Premium item | 600 | 14 min | 7 min | 4 min |
| Rare item | 1,600 | 38 min | 18 min | 11 min |
| Luxury item | 4,000 | 95 min | 46 min | 28 min |
| Prestige item (legendary) | 12,000 | 4.8 h | 2.3 h | 1.4 h |
| The whole shop | 183,425 | 73 h | 35 h | 21 h |

## Evidence

| Check | Result |
| --- | --- |
| Unit tests | 1,586 passed, 1 skipped, across the platform |
| Database (pgTAP) | 1,448 passed, including 99 for this game |
| Browser, Chromium | Solo 4, shop 2, Showdown and join 6, accessibility 5, touch 1, school access 1, every device size 21 |
| Browser, WebKit | Solo 4, shop 2, Showdown and join 6, every device size 21 |
| Lint, types, production build | Pass |
| Security audits (baseline 326, platform bundle, Number Cross launch, deployment bypass) | Pass |
| Fairness (300 rooms, 8 seats, `polygon-showdown-fairness-simulation.mjs`) | Creator within 1.3 standard errors of the average; no seat out of line |
| Performance (`polygon-showdown-performance.mjs`) | 59 fps average on a CPU slowed 4×; 132 KB of game script on the join path; 3D renderer not loaded |
| Avatar | 49,400 triangles, 24 draw calls at the heaviest; about 23,000 by default |

### Load: 30 seconds of real play, one room, one address

Local `next dev` on one machine with local Supabase. Treat these as relative: a hosted run with a real network is still to be done.

| Players | Requests/s | p50 | p95 | p99 | Max | Errors | Moves | Resyncs | Scores matched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 8 | 74 ms | 140 ms | 190 ms | 261 ms | 0 | 204 | 0 | all |
| 20 | 15 | 76 ms | 218 ms | 307 ms | 659 ms | 0 | 406 | 0 | all |
| 30 | 23 | 86 ms | 161 ms | 273 ms | 474 ms | 0 | 601 | 0 | all |
| 40 | 30 | 94 ms | 207 ms | 377 ms | 420 ms | 0 | 802 | 0 | all |
| 50 | 36 | 133 ms | 322 ms | 616 ms | 689 ms | 0 | 995 | 0 | all |

### Existing games

| Suite | Result |
| --- | --- |
| Math Bingo Live, Chromium | 9 of 9, including live play, reconnect, security and join with emoji |
| Math Bingo Live, WebKit (join and reconnect) | 2 of 2 |
| Math Tug of War, Chromium desktop | 24 of 24 |
| Math Vocabulary Hunt and game suite | 6 of 6 |
| Number Logic | 2 of 2 |
| Number Cross | 1 of 1 on the third run. The first run failed on an aborted `/admin/mfa` request; the second crashed starting up when the database schema cache was reloading. Neither touches this game's code. |
| CrossCalc V2 | 2 of 2 on the second run. The first could not start: local Supabase was not ready between runners. |

## Known limits

- Hosted performance is unmeasured. Math Bingo Live ran several times slower on hosted infrastructure than locally.
- Real phones, iPads and Smart Boards were not used: sizes and engines were emulated in Chromium and WebKit, and the 3D avatar was only rendered in software GL.
- A determined player could play at the maximum legal rate with a script: the rules cap that rate and the daily limit caps the reward, but a fast bot can still be first in a Showdown.
- A guest could open several seats in one room, as in Math Bingo Live. The creator sees them and can remove them.
- A client offline for more than 45 seconds loses the moves it made while offline, and resumes from the server's board.
- Avatar: every eye is the same dark brown (no eye-colour slot); a visor on the two afros reads more like a headband.
- Name: "Polygon Showdown" needs a final trademark and branding review before release.
