# MathNexa v1.2.47 release record: Math Race Champions, Smart Board tracks and overtaking

Released 2026-11-13 03:12Z (2026-11-12 evening, US Central). Owner instruction (2026-11-12): a focused Production hotfix for two things found in real classroom use of v1.2.46. The two 62-step tracks were missing on a physical Promethean Smart Board, and the 3D race needed visible overtaking drawn from the real race. Reproduce first, fix, test locally, put it on a staging preview, have the physical board confirmed, then candidate, probe, Production and live QA. No change to the mathematics, questions, two-answer system, Race Dollars, prices, rewards, the 30-answer rule, Classroom scoring, the computer's pace, online fairness, music, free access or the homepage card.

| | |
| --- | --- |
| Version | `v1.2.47` (annotated tag on the build commit) |
| Build | `e5decd7`. `/api/health` reports it. Its runtime is the staging-certified `0f1cec5`: `git diff 0f1cec5 e5decd7 -- apps packages supabase package*.json` is empty (the later commit is a test recorder). |
| Source branch | `fix/math-race-smart-board-overtaking`, on `42469a5` (v1.2.46 record), PR #22 |
| Staging deployment | `dpl_7NJ86fVJFqE1KuwgSrFgXwTiFLhC` (build `0f1cec5`) |
| Production runtime | `dpl_DiosYG4hwQRKatbtfS5SoEbyiEwu`, promoted 2026-11-13 03:11:55Z |
| Rollback runtime | `dpl_33jeWHshBDSdmrsdUwWGM8ACFpUD` (v1.2.46, build `436988e`), retained |
| Database | No migration. History unchanged at 49. Catalog untouched. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-47`, detached at `e5decd7`. Keep it for the rollback commands. |

Evidence: `docs/releases/evidence/mathnexa-v1.2.47/`.

## 1. The tracks on the Smart Board

**Cause.** The classroom board's height was written as `100dvh` with nothing older beside it. `dvh` is a 2022 unit. A browser that does not know it drops the whole rule, so the board had no stated height; the two tracks take what is left of that height, and were given none. The team names, counters, questions and answer buttons were there and the lower half of the board was empty. A phone, with a current browser, was right. It was not screen size.

**Reproduced first.** Serving the game's stylesheet the way an older Chromium parses it (`scripts/math-race-champions-legacy-css.mjs`) gives, at 1920×1080, a board 416 px tall with both tracks 920×0 px and no spaces drawn: the owner's description.

**Fix.**

| | |
| --- | --- |
| Height | The board and the race screen are sized from `--app-h`, the window's real inner height in pixels, which `shell.js` keeps current on resize, rotation and full screen; `100vh` stands behind it. This also fits what is actually visible when the browser is not in full screen. |
| Other newer features | No dynamic viewport units, container units or `inset` anywhere the board depends on. Team-name sizes that used container units are computed from the panel's width instead. `:has()` is used only beside a class that does the same job. |
| A check on the board itself | `classroom.js` measures both tracks when the board opens and whenever the window changes. If either is under 96 px it states every height outright from the window's own measurements. This is for a browser nobody has tested. |
| Identifying a board | How to Play ends with a line such as "This screen: 1920 × 1080, Chrome 96 on Android 11." |

Nothing was hidden, replaced by a progress bar, moved to another screen or made to scroll. Tile sizes: 61 px at 1920×1080, 85 px at 2560×1440, 43 px at 1366×768, 19 px on a 320 px phone.

**Physical board.** The owner tested the staging preview on the physical Promethean board and reported "Board passed" (2026-11-12). This is the owner's report; no photograph and no browser read-out from the board were received. The board's actual browser version is therefore still not known.

## 2. Overtaking

`race/traffic.js` (new, pure) decides where each nearby car is drawn, frame by frame. Every car's place comes from its authoritative race distance: the number the minimap, the leaderboard and the place read-out use. Nothing in it is sent anywhere, stored, or fed back into the race. No request was added and nothing is written to the database.

| | |
| --- | --- |
| Lanes | Five, 2.6 m apart on the 13 m road. The player's car holds the centre lane; rivals drive in the lanes beside it. A car that gets ahead is seen coming up, drawing alongside a lane away, and going by. |
| Rival against rival | A rival that catches another pulls out one lane to pass and drifts back when it is 13 m clear. A boxed-in car falls in behind the car beside it and goes round, or crosses behind the player's car to the other side. |
| No car through another | A last check keeps any two cars that share road width a car's length apart. The car that was behind waits behind; it is never pulled back. |
| No teleporting | A standings row that arrives late is driven off: at most 34 m/s over the car's own speed where the camera can see it. A car that is ahead of its place is seen braking. Lane changes are steered at 3.4 m/s. |
| Standing cars | Racers standing at their 30-answer limit, or on the grid before their first answer, keep to the kerb lanes so the lanes beside the player stay open. |
| The finish | A rival that crosses before the player rolls on past the line; one that crosses after the player's car has stopped there stops there too. |
| Camera | A car coming up within 26 m behind eases the camera back and up and turns it a little towards that side. It eases back when the car is clear. It does not move otherwise. |
| Mirror | A chip at the foot of the road names the closest car behind and its side ("Computer 12 m behind ▶"). |
| Words | "YOU MOVED INTO 2ND!" / "RIVAL MOVED AHEAD", once, for under two seconds, over the road. The question and answer buttons are in a separate panel below the road and are never covered. |
| Place | "2nd of 6" as before, and now also on upright phones (v1.2.46 hid it there). |
| Sound | Rivals are heard where they are drawn and on the side of the road they are on. Still only the two nearest within 45 m. No audio asset or mix level changed. |
| Slow devices | A frame longer than a twentieth of a second is walked in shorter steps, so the cars behave the same at 12 frames a second as at 60. |

**Known limit.** Positions come from the race, not from the road. In a room of ten or more, several racers can be within a metre of one another, which is more cars than there are lanes. They are drawn in a queue, never inside one another, so a car can be drawn behind slower cars for a few seconds while the leaderboard already has it ahead. Worst cases in simulation: about 7 s as a full room leaves the grid, about 5 s mid-race with 20 to 50 racers bunched. With two to five racers the order on the road matches the race to within the moment a late standings row takes to arrive.

## Gates

| Gate | Result |
| --- | --- |
| Lint, typecheck | Pass (8 warnings, all in an untouched file) |
| Unit | 1,734 web (1 skipped) and 245 core. 16 new in `traffic.test.ts`: scenarios A to E with the real race engine, the grid, standing cars, late rows, 2 to 50 racers, 4 to 60 frames a second. |
| Database (pgTAP) | 1,771 in 44 files on a clean reset |
| Security baseline | 326 |
| Production build, bundle audit | Pass |
| Audio audit | 66/66 in Chromium |
| Board layouts | 39/39: 1366×768, 1600×900, 1920×1080, 1920×1200, 2560×1440, 1920×940 and 1366×640 (browser bars taking height), 1024×768, 768×1024, 430×932, 390×844, 360×740, 320×568, each as a current browser, as an older Chromium parses the stylesheet, and with the board's height rule removed |
| Race browser suite, Chromium | 51/51. One test (Stage 1) failed on the first pass, while other browser jobs were running on the same machine, and passed alone. |
| Race browser suite, WebKit | 50 pass, 1 skipped (that build has no Web Audio). Two failed on the first pass for reasons outside the game (a trace-recording timeout and a test-account lookup) and passed alone. |
| Other games | Math Bingo Live 10/10, Polygon Showdown 28/28, Math Tug of War 47 (+1 skipped), Number Logic 2/2, Number Cross 1/1, CrossCalc 2/2, game suite 6/6, Math Vocabulary Hunt runtime 40/40. Shared `/join`: Bingo to Bingo, Polygon to Polygon, Race to Race (in the Bingo, Polygon and Race suites). |

### Overtaking scenarios on the real race screen (`overtaking.spec.ts`)

| Scenario | Result |
| --- | --- |
| A, the player passes the computer | 1 pass in the race, 1 drawn, a lane to the side; "2nd of 2" then "1st of 2"; "YOU MOVED INTO 1ST!" |
| B, the computer passes the player | 1 and 1; the mirror names the computer before it is alongside; "RIVAL MOVED AHEAD" |
| C, pass and re-pass | 2 and 2, in order |
| D, several lead changes | 4 and 4, in order; the place read-out changes each time |
| E, near-simultaneous finish | under 0.4 s apart; the car that crossed first is drawn ahead |
| From the grid | lights out, the computer away first, the player passes it |
| Upright phone, 390×844 | the pass is drawn and said |
| Online, 2, 5 and 10 racers | passes drawn; no car inside another, off the road, backwards or moved by a jump |

In every scenario: the order on the road, the place read-out, the minimap and the leaderboard agree with the race.

### Frame rate (real GPU, picture tier "high", 12 s of racing each)

| Race | Frames a second | Frame time, mean / 95th / worst | Cars drawn | Memory | Requests added |
| --- | --- | --- | --- | --- | --- |
| Computer Race, 1 rival | 60 | 16.7 / 16.8 / 17.6 ms | 2 | 24 MB | 0 |
| Online, 2 racers | 60 | 16.7 / 17.0 / 18.0 ms | 2 | 23 MB | 0 |
| Online, 5 racers | 60 | 16.7 / 16.8 / 17.3 ms | 5 | 25 MB | 0 |
| Online, 10 racers | 60 | 16.7 / 16.8 / 17.5 ms | 10 | 28 MB | 0 |
| Online, 20 in the room | 60 | 16.7 / 16.8 / 17.6 ms | 10 | 47 MB | 0 |
| Online, 30 in the room | 60 | 16.7 / 16.8 / 17.5 ms | 10 | 43 MB | 0 |
| Online, 40 in the room | 60 | 16.7 / 16.8 / 17.9 ms | 10 | 60 MB | 0 |
| Online, 50 in the room | 60 | 16.7 / 16.8 / 17.6 ms | 10 | 45 MB | 0 |

Measured on the development machine, not on a Smart Board or a phone.

## Staging

| Check | Result |
| --- | --- |
| Database | No pending migration; identify PASS |
| Classroom and overtaking browser tests on the hosted preview | 19/19, including the board as an older panel browser parses it |
| Guest QA | 95/95 on the original script; 101/101 with the overtaking checks added afterwards |
| Physical Promethean board | Owner: "Board passed" |

## Production

preflight → non-aliased candidate → candidate probe → promote → live probe → guest QA → logs.

| Check | Result |
| --- | --- |
| Preflight | The apex was serving `dpl_33jeWHshBDSdmrsdUwWGM8ACFpUD` (v1.2.46), as expected |
| Candidate probe | PASS |
| Live probe | PASS; `/api/health` ready, build `e5decd7` |
| Guest QA on mathnexa.com | 101/101 |
| Online Race, live | Four racers in one room: two phones (Chromium and WebKit) and two racers over the public API. The two phones changed places twice by answering: one was 345 m behind, went 30 m ahead, and was passed again. On the phone: 3 passes drawn, each a lane to the side; 0 cars inside another, 0 off the road, 0 moved by a jump; "RIVAL MOVED AHEAD" and "YOU MOVED INTO 3RD!" over the road. |
| Logs | From promotion onwards: no 5xx, no error, fatal or warning entries |
| Wallets | Agree with their ledgers; no open synthetic room |

### Signed-in checks on Production (after the owner signed in to the review browser)

| Check | Result |
| --- | --- |
| Classroom Competition, 1920×1080 | Both tracks 920×624 px, 64 spaces each on the screen (START, 1 to 62 in order, FINISH), smallest space 61 px, nothing to scroll, both answer buttons of both teams on the screen. Two teams pressed in the same instant: each moved exactly one space (`1 / 62`, `61 STEPS LEFT`). |
| Computer Race, Stage 5, Velocity GT, server-run | Four lead changes made on purpose by answering and then not answering. The computer passed the player at 48.4 s and 116.2 s; the player passed the computer at 55.2 s and 122.1 s. Every pass was drawn a lane to the side with the other car in the picture. Place read-out 1st, 2nd, 1st, 2nd, 1st. "RIVAL MOVED AHEAD" and "YOU MOVED INTO 1ST!" twice each, over the road. The mirror named the computer from 39 m behind. Over 7,958 frames: 0 cars inside one another, 0 off the road, 0 moved by a jump, 0 drawn backwards, 0 ms on the wrong side of the player. 60 frames a second. |
| Account | The race was left unfinished; the wallet was R$ 5,750 before and after. |

Details: `15-signed-in-qa.json` and the `live-*.jpg` pictures in the evidence folder.

### Not done on Production

| | |
| --- | --- |
| Physical Smart Board and iPhone on Production | The owner's to do. Production serves the same stylesheet and scripts as the staging preview the owner tested on the board. |

## Rollback

Not needed. If it is, from `C:/GitHub/mathnexa-v1-2-47`:

```bash
RELEASE_CERTIFIED_RUNTIME=0f1cec5 RELEASE_ROLLBACK_DEPLOYMENT=dpl_33jeWHshBDSdmrsdUwWGM8ACFpUD HOTFIX_VERCEL_CLI='npx --yes vercel@59' node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

There is no database change to undo.
