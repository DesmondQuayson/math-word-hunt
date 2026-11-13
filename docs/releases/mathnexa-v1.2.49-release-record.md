# MathNexa v1.2.49 release record: Math Race Champions, a more natural 3D race

Released 2026-11-13 17:31Z. Owner instruction (2026-11-13): "now polish 3D to look natural and real", then, after seeing it on a staging preview, "Release it". Picture only: no change to the race, the rules, the questions, the sound, the wording or the data, and no migration.

| | |
| --- | --- |
| Version | `v1.2.49` (annotated tag on the build commit) |
| Build | `8f69eb1`. `/api/health` reports it. |
| Source branch | `feature/math-race-3d-polish`, three commits on `c5ac343` (v1.2.48 record), PR #24 |
| Staging deployment | `dpl_3KCPvwU6675PYyGfyx82AgBFkxW1` (build `40de960`, the build the owner looked at) |
| Production runtime | `dpl_26XMr1XGLZTQ69vSU8TrRXbsM45L`, promoted 2026-11-13 17:31:50Z |
| Earlier Production runtime of this release | `dpl_GFfAsiH1M3unTf7Zx8SQtxW6Kspj` (build `40de960`), promoted 17:09:25Z and replaced 22 minutes later: see "A correction after the first promotion" |
| Rollback runtime | `dpl_DVTiEDA6FhpgEN67g5q9m9XqZBm3` (v1.2.48, build `af26e11`), retained |
| Database | No migration. Catalog untouched. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-49`, detached at `8f69eb1` |

Evidence: `docs/releases/evidence/mathnexa-v1.2.49/`.

## What changed

| | |
| --- | --- |
| The road | Painted as it is driven: five lanes with dashed lines at the lanes the cars really use (three were painted before, so rivals drove on a line), solid edge lines, 2 m kerb blocks. A used surface: broad lighter and darker areas, darker bands where wheels run, faint cracks, a repair, oil. One tile is 32 m long and its tone drifts along the road, so no repeat shows. |
| A verge | Packed earth and gravel between the kerb and the land, under the guard rail. Not drawn on the lightest picture tier. |
| Light | Sunlight comes from where the sun (or moon) is drawn, so shadows fall away from it. The fill light takes a little of the sky's colour. The sky pales to a band of haze at the horizon. |
| Cars on their springs | A car's speed changes in steps, when an answer lands. The body shows the step over about a third of a second: the tail squats under power, the nose dips under braking, and it settles. Bends and lane changes lean the body. The front wheels point where the car is going. Every car, not only the player's. |
| Lamps | Tail lamps rest dull red and light when a car slows hard or stands. On the night circuit they are on all the time and each car throws a soft pool of light on the road ahead. |
| Camera | Turns into a bend a moment after the car does; a little road feel at speed, none with reduced motion set. |

Not attempted: the cars' shapes were not redesigned, and the road is still flat.

## A correction after the first promotion

The first build of this release (`40de960`) was promoted at 17:09Z. The live phone picture from the guest QA then showed the night circuit's light pool with its edges visible: a pale rectangle on the road ahead of the car. On the wider desktop picture used for the review it had been faint enough to miss. The pool was redrawn as an ellipse that is brightest just ahead of the car and gone before the far end and both sides (`8f69eb1`), checked on a phone-sized picture locally, and promoted at 17:31Z. Nothing else differs between the two builds.

## Gates

| Gate | Result |
| --- | --- |
| Lint, typecheck | Pass (8 warnings, all in an untouched file) |
| Unit | 1,740 web (1 skipped) and 245 core |
| Database (pgTAP) | 1,771 in 44 files on a clean reset |
| Security baseline | 327 |
| Production build, bundle audit | Pass |
| Board layouts | 39/39 |
| Race browser suite, Chromium | 51/51. The Stage 1 test lost to the computer on the first pass: a headless browser draws the full picture at about two and a half frames a second, slow enough to decide a whole race. It now runs on the lightest picture tier, as the Stage 10 test does. |
| Race browser suite, WebKit | 50 pass, 1 skipped (no Web Audio in that build). Two tests timed out on the first pass while lint, unit tests and a deployment were running on the same machine, and passed alone. |
| Other games | Math Bingo Live 10/10, Polygon Showdown 28/28, Math Tug of War 47 (+1 skipped), Number Logic 2/2, Number Cross 1/1, CrossCalc 2/2, game suite 6/6, Math Vocabulary Hunt runtime 40/40. Number Logic, Number Cross and CrossCalc each failed at least once first, right after a local database reset (an aborted admin page request; the local API not yet ready), and passed when run again; the same Number Cross test passed on the untouched v1.2.48 build in between. |
| After the correction | Race unit tests 312/312 and two browser tests (upright phone, five racers at night) on `8f69eb1` |

### Frame rate (real GPU, picture tier "high")

| Picture | Race | Frames a second | Frame time, mean / 95th |
| --- | --- | --- | --- |
| 742×630 | 1 rival | 60 | 16.7 / 16.9 ms |
| 742×630 | 10 cars drawn | 60 | 16.7 / 16.8 ms |
| 1366×768 | 1 rival | 60 | 16.7 / 16.8 ms |
| 1366×768 | 10 cars drawn | 60 | 16.7 / 16.8 ms |

The same as before the polish. With 16× texture filtering on the road the 1366×768 picture ran at 30; it stays at 8×. Measured on the development machine, not on a Smart Board or a phone.

## Staging

| Check | Result |
| --- | --- |
| Guest QA | 101/101 (the first attempt stopped on a page that took over 30 s to load; the link from the test machine was running at 10 to 20 KB/s) |
| Overtaking browser tests on the hosted preview | 8/8 |
| Device browser tests on the hosted preview | 4 pass, 3 timed out waiting for pages on the same slow link. All of them pass locally in Chromium and WebKit. Not rerun on staging. |

## Production

| Check | Result |
| --- | --- |
| Preflight | The apex was serving `dpl_DVTiEDA6FhpgEN67g5q9m9XqZBm3` (v1.2.48), as expected |
| Candidate probe, live probe | PASS, for both builds |
| `/api/health` | ready, build `8f69eb1` |
| Google tag (v1.2.48) | Still on the homepage |
| Guest QA on mathnexa.com | 101/101 on `40de960` and again on `8f69eb1`: four racers in an Online Race, two phones changing places twice, no car inside another or moved by a jump |
| Logs | From the first promotion onwards: no 5xx, no error, fatal or warning entries |
| Wallets | Agree with their ledgers; no open synthetic room |

### Not done on Production

| | |
| --- | --- |
| A signed-in Computer Race or the garage, looked at by eye | Not done: the review browser was no longer signed in to mathnexa.com. The live picture was seen through the guest QA's Online Race (night circuit, phone). |
| Real phone, tablet and Smart Board | The owner's to do. |

## Rollback

Not needed. If it is, from `C:/GitHub/mathnexa-v1-2-49`:

```bash
RELEASE_CERTIFIED_RUNTIME=8f69eb1 RELEASE_ROLLBACK_DEPLOYMENT=dpl_DVTiEDA6FhpgEN67g5q9m9XqZBm3 HOTFIX_VERCEL_CLI='npx --yes vercel@59' node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

There is no database change to undo.
