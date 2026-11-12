# Math Race Champions: local owner review

**11 November 2026.** Everything here is on this computer only. Production was not touched and is still v1.2.45 (build 5dc155f). Nothing was pushed, deployed to staging, or published. The game is a catalog **Draft**.

Branch `feature/math-race-champions`, worktree `C:/GitHub/mathnexa-math-race`, cut from `main` 4686763.

## How to open it

Start the review server and leave it running:

```bash
node scripts/run-math-race-champions.mjs demo
```

Give the review account Race Dollars for the garage (local database only; the script refuses anything else):

```bash
node scripts/math-race-champions-review-grant.mjs
```

Sign in as the review account. Its email and password are in `scripts/run-math-race-champions.mjs` (`ACCOUNTS.owner`); they are synthetic and exist only in local Supabase.

| # | What | Where |
|---|---|---|
| 1 | Main game hub | http://127.0.0.1:3103/games/math-race-champions/play |
| 2 | Classroom Competition | Hub → **Classroom Competition** → Continue to the board → Start the race |
| 3 | Computer Race, Stage 1 | Hub → **Race Computer** → Stage 1 → Start race |
| 4 | Computer Race, Stage 10 | Hub → **Race Computer** → Stage 10 → Start race (the grant script opens all ten stages) |
| 5 | 3D garage and shop | Hub → **Race Computer** → **Garage** |
| 6 | Online room creation | Hub → **Online Race** → Create room |
| 7 | Online player join | http://127.0.0.1:3103/join in a second browser or a private window, with the room code. On a phone on the same network the QR code will not resolve to `127.0.0.1`; use a second window here |
| 8 | Progress and results | Hub → **My Progress**; the results card appears at the end of every race |

The game has one address; the screens inside it are reached from the hub, as in Polygon Showdown.

Screenshots from the automated runs are in `qa-artifacts/math-race-champions/evidence/` (not committed).

## What was built

- **Seven mathematics categories**, two choices each, generated: Missing Addend, Missing Subtrahend, Missing Multiplier, Missing Divisor, Percentage to Decimal, Decimal to Percentage, Evaluating Powers (exponents 0 to 3, never base 0). No Decimal to Fraction. Five difficulties. One skill, several, or Mixed.
- **Classroom Competition:** two teams on one board, both playing at once with different questions. Two winding tracks of 62 numbered spaces, START before 1 and FINISH after 62. A football that moves exactly one space per correct answer, along the track. Counter (`24 / 62`) and `38 STEPS LEFT` per team. Wrong answer: nothing moves.
- **Race Computer:** a 3D race with ten stages, a speedometer, a road minimap, and a computer opponent that answers questions itself. At least 30 correct answers to finish, in every car.
- **Garage:** the free Street Starter and three cars at 2,000, 4,000 and 6,000 Race Dollars (Turbo Sprint, Velocity GT, Thunder X), each a real 3D model on a turntable you can drag, zoom and view from the front, side and rear. TRY CAR, BUY, OWNED, EQUIP, EQUIPPED.
- **Online Race:** create a room, share a six-digit code, QR code or link, race with the same car for everyone, live minimap and leaderboard, reconnect, creator controls.
- Music (Cosmic Candy Catchers, with its credit) and sound effects, each with its own switch.

## What was checked, and the result

| Check | Result |
|---|---|
| Unit tests for this game | 232 of 232 passed |
| Whole unit suite (both workspaces) | platform-core 245 passed; platform-web 1,653 passed, 1 skipped (that skip was there before) |
| Database tests for this game | 170 of 170 passed |
| Every database suite, after a clean reset from migrations | 44 files, 1,771 tests, all passed |
| Rollback, run on the local database | Removed all 10 tables and every function; the other 43 suites still passed; reset restored everything |
| Browser tests, Chromium | 26 of 26 passed (classroom 9, computer 2, shop 2, guest 2, online 2, devices 9) |
| Browser tests, WebKit (Safari's engine) | 26 of 26 passed: 24 in the final full run, and the other 2 on a re-run after their own timing assumptions were corrected (test files only; no game code changed between) |
| Math Bingo Live against this build (Chromium) | 7 of 7 passed |
| Polygon Showdown against this build (Chromium) | 9 of 9 passed |
| Typecheck, lint | Typecheck clean. Lint: 0 errors (8 warnings, all in an older file this work did not touch) |
| Security baseline suite, media audit | 326 of 326 passed; media audit passed |

Sizes covered: 320×568, 390×844, 768×1024, 1024×768, 1366×768 and 1920×1080, in both engines, plus keyboard-only and reduced-motion runs.

### Load (whole races, every racer over the real API)

Local `next dev` on this one machine. These numbers show what the code costs; they are not a forecast for hosted infrastructure.

| Racers | All joined | All finished | Poll, 95th percentile | Answer, 95th percentile | Errors | Reconnects | Finish order consistent |
|---:|---|---|---:|---:|---:|---|---|
| 10 | yes | yes | 0.08 s | 0.10 s | 0 | 1 of 1 | yes |
| 20 | yes | yes | 0.15 s | 0.17 s | 0 | 2 of 2 | yes |
| 30 | yes | yes | 0.27 s | 0.32 s | 0 | 3 of 3 | yes |
| 40 | yes | yes | 0.36 s | 0.37 s | 0 | 4 of 4 | yes |
| 50 | yes | yes | 0.53 s | 0.55 s | 0 | 5 of 5 | yes |

Rows 10 to 30 are from the first run. Rows 40 and 50 are from a second run after two changes prompted by the first (0.6 s and 1.2 s before): the server now keeps each racer's question stream instead of rebuilding it on every poll, and a bigger room polls a little less often. The database's own share stayed near 0.13 s at 50 racers throughout, so the remaining time is the local development server. **50 racers work correctly here. Whether 50 is comfortable on hosted infrastructure is not proven** and needs a hosted load test, as it did for Math Bingo Live and Polygon Showdown. Supabase was not upgraded or changed.

## Decisions I made that you should know about

1. **A wrong answer in a race lifts the throttle.** It adds no speed, cuts the speed above idle to two fifths, and rests the buttons for 2 seconds. Without this, pressing at random as fast as possible beat careful answering. With it, random pressing wins Stage 1 about half the time and nothing above it.
2. **Classroom wrong-answer pause is 2.5 seconds**, with the correct answer shown. Your brief said "a short answer-transition lock". With two choices, a shorter pause lets a guessing team move as fast as a thinking one. Progress rules are exactly as you wrote them: +1 or 0, never back.
3. **Ten achievements at 250 Race Dollars each.** Your brief asked for a small legitimate bonus so the first car is reachable. Stage rewards total 9,500 and the three cars cost 12,000, so I set the achievements to make up the difference exactly: everything earnable buys exactly the three cars. After Stages 1 to 3 a player has 1,800 plus First Win, 2,050.
4. **The player chooses the question difficulty in Race Computer**; each stage only suggests one. What rises with the stage is the computer: it answers faster and more accurately. This is what lets the starter car win Stage 10 with fast, accurate answers.
5. **The computer always drives the Street Starter.** It never has a better car than a new player.
6. **Online Race pays no Race Dollars** and counts only races played and won for signed-in racers.
7. **Joining an Online Race closes at the start**, so everyone has the whole race.
8. **A tie in the classroom** is two finishes within a tenth of a second.
9. **The name of the free car** ("Street Starter") and of the online car ("Circuit Standard") are mine.

## Known limitations

- **The 3D art is simple.** The cars are original models built in code, with four different shapes, and the scenery is basic shapes with five themes. It is a real 3D race, but it is not at the level of the reference video. If you want richer cars and scenery, that is an art task of its own.
- **Not tested on real devices.** Everything ran in Chromium and WebKit on this computer. A real iPhone, iPad, Chromebook and the Promethean board have not been tried. Two-finger simultaneous touch was tested with synthetic touch events only.
- **Frame rate was not measured on real hardware.** The automated browsers draw 3D in software, which is far slower than a real graphics chip. The game steps its picture quality down if frames are slow, and draws at most 9 other cars however many are racing.
- **50 racers on hosted infrastructure is unproven** (above).
- **A phone cannot scan the local QR code**, because it points at this computer's own address. That is the local review only; on a real deployment the QR is the site's address.
- **Race against a human-typed Polygon code:** a Math Race code typed on the Math Bingo Live join screen is handed over correctly. Polygon Showdown's own join screen was left untouched, so a Math Race code typed there (reachable only if Bingo is unavailable) is reported as not found.
- **The name has not had a trademark review.**
- The catalog artwork is a frame from a real race; you may want something more designed.

## Not done, waiting for you

Staging, a hosted load test, real-device checks, publishing, any Production migration, and pushing the branch.
