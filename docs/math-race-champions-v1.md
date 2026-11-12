# Math Race Champions V1

**Solve. Accelerate. Win.**

Status: **DRAFT, local owner review.** Registered in the game catalog as a draft; never listed, and served only under an owner preview. Nothing here has been applied to staging or Production.

One game, three experiences:

| | Who | Where it runs | What is saved |
|---|---|---|---|
| **Classroom Competition** | Two teams, one Smart Board | Entirely on the board | Nothing |
| **Race Computer** | One player against the computer, 10 stages | Judged by the server | Race Dollars, cars, stage wins, achievements (accounts only) |
| **Online Race** | Up to 60 racers in a room | Judged by the server | The room, until it expires; a signed-in racer's race count |

Route: `/games/math-race-champions/play` (the game), `/join` (racers joining a room). Free for any signed-in MathNexa account or school session, like Math Tug of War, Math Bingo Live and Polygon Showdown.

## 1. Mathematics

Seven categories, all generated, never a fixed bank (`src/engine/questions.js`):

| Category | Example | Wrong choice is |
|---|---|---|
| Missing Addend | `14 + ? = 23` | off by 1, 2 (or 10) |
| Missing Subtrahend | `25 − ? = 17` | off by 1, 2 (or 10) |
| Missing Multiplier | `7 × ? = 42` | off by 1 or 2 |
| Missing Divisor | `48 ÷ ? = 8` | off by 1 or 2, or the quotient |
| Percentage to Decimal | `35% = ?` | the decimal point one or two places out |
| Decimal to Percentage | `0.72 = ?` | the decimal point one or two places out |
| Evaluating Powers | `6² = ?` | the base doubled or tripled, or the wrong exponent |

- Exactly two choices; exactly one is correct. An independent validator (`validateQuestion`) reads each question as shown and tests both choices against it; the unit suite runs it over 10,000 questions for each of the 35 category and difficulty pairs.
- Decimals are an integer with a decimal exponent. No floating point is used for a question or an answer, so `29%` is `0.29`, never `0.29000000000000004`.
- Exponents are 0, 1, 2 and 3 only. The base is never 0, so `0⁰` cannot be asked. There is no Decimal to Fraction.
- Five difficulties (Beginner, Easy, Medium, Hard, Expert) change the size of the numbers and how close the wrong choice is.
- One category, several, or Mixed Skills (all seven). In mixed play each category comes up equally often.
- The correct answer is on each side about half the time and never more than three times running on one side. The last six questions are not repeated.
- **Fairness between opponents:** question *n* is the same category for everyone in a race (shared order seed), with different numbers (own stream seed).

## 2. Classroom Competition

`src/engine/classroom.js`, `src/engine/track.js`, `src/classroom/*`.

- Two halves of one board: Team Turquoise left, Team Pink right. Each has its own question stream, its own two buttons and its own track. Both play at once; neither ever waits.
- Each track has START, **62 numbered spaces** and FINISH, on a winding line of straight runs and half-circle turns. The layout is solved for the space the board gives it (the number of runs that makes the spaces largest without any two touching): about 64 px spaces on a 1920×1080 board.
- A correct answer moves that team's football **exactly one space**, along the line. A wrong answer moves nothing. There are no bonuses, shortcuts or penalties.
- The football's space, the glowing completed spaces, the `24 / 62` counter and `38 STEPS LEFT` are all set in the same step, when the ball lands. The ball carries a badge with the number of the space it is on.
- After a correct answer the team's buttons rest 0.45 s; after a wrong one 2.5 s, with the correct answer shown. With two choices, pressing at random would otherwise move a team as fast as thinking.
- Presses carry their own timestamp (the pointer event's). A second finisher within 100 ms of the first is a tie; neither side is favoured.
- Options: skills, difficulty, team names, 62 spaces or a 30-space practice race. Keyboard: A/S for Turquoise, K/L for Pink.

## 3. The racing model

`src/engine/race.js`. Shared by Race Computer and Online Race, and run by the server.

- A car has a speed. A **correct** answer adds the car's acceleration, up to its top speed. Between answers the speed eases towards a 30 km/h idle at the car's own rate.
- A **wrong** answer adds nothing, cuts the speed above idle to two fifths, and rests the buttons for 2 s (0.35 s after a correct answer).
- Distance is worked out in closed form between answers. Frame rate has no effect on it.
- **The 30-answer rule.** A car can never be further along than `correct answers ÷ 30` of the race. With 29 correct answers no car can pass 96.7%. The rule is held in three places: the engine, a check on every stored racer state in the database, and a check on the finish time column.
- Speeds are game values, not claims about real cars.

### Cars (Race Computer only)

| Car | Price | Top speed | Per correct answer | Speed held after 5 s | Recommended |
|---|---:|---:|---:|---:|---|
| Street Starter | free | 160 km/h | +28 km/h | 61% | Stages 1–2 |
| Turbo Sprint | 2,000 | 185 km/h | +32 km/h | 64% | Stages 3–6 |
| Velocity GT | 4,000 | 210 km/h | +36 km/h | 67% | Stages 7–8 |
| Thunder X | 6,000 | 240 km/h | +40 km/h | 70% | Stages 9–10 |

These three numbers are the whole difference between cars; the garage shows exactly them.

### Stages

The computer always drives the Street Starter through the same model. What rises with the stage is how quickly and how accurately it answers. Stage lengths are set so the computer finishes in about 5¾ minutes on every stage.

| Stage | Computer answers every | Computer accuracy | Length | First-win reward |
|---:|---:|---:|---:|---:|
| 1 | 7.5 s | 72% | 4.8 km | 500 |
| 2 | 6.6 s | 75% | 5.3 km | 600 |
| 3 | 5.9 s | 78% | 5.7 km | 700 |
| 4 | 5.3 s | 80% | 6.1 km | 800 |
| 5 | 4.8 s | 82% | 6.6 km | 900 |
| 6 | 4.3 s | 84% | 7.1 km | 1,000 |
| 7 | 3.8 s | 86% | 7.8 km | 1,100 |
| 8 | 3.4 s | 88% | 8.5 km | 1,200 |
| 9 | 3.0 s | 91% | 9.6 km | 1,300 |
| 10 | 2.6 s | 93% | 10.9 km | 1,400 |

Simulated win rates (200 races each; a "steady" player answers every 5 s at 85%, a "quick" one every 3.5 s at 90%, a "fast" one every 2.5 s at 95%):

| | St 1 | St 4 | St 6 | St 8 | St 9 | St 10 |
|---|---:|---:|---:|---:|---:|---:|
| Steady, Street Starter | 100% | 86% | 20% | 0% | 0% | 0% |
| Steady, Turbo Sprint | 100% | 100% | 81% | 6% | 0% | 0% |
| Steady, Velocity GT | 100% | 100% | 99% | 63% | 10% | 0% |
| Steady, Thunder X | 100% | 100% | 100% | 97% | 71% | 14% |
| Quick, Thunder X | 100% | 100% | 100% | 100% | 100% | 100% |
| Fast, Street Starter | 100% | 100% | 100% | 100% | 100% | 78% |
| Random pressing, Street Starter | 54% | 1% | 0% | 0% | 0% | 0% |

So: the starter car can win every stage with fast, accurate answers; each dearer car is a real help where it is recommended; no car wins by itself; guessing does not pay. The player chooses the question difficulty for each race (a suggestion is pre-selected per stage).

### Race Dollars

Play money. Earned only by racing, spent only in the garage. Not bought, not transferable, no cash value.

| How | Amount | How often |
|---|---:|---|
| First win of each stage | 500, then +100 per stage (9,500 in all) | once per account per stage |
| Each of ten achievements | 250 (2,500 in all) | once per account |

Achievements: First Win; Sharp Driver (win at 90% or better); Flawless (win with no wrong answer); On a Roll (15 in a row); Mixed Master (win Stage 3+ on Mixed Skills); Hard Mode (win on Hard or Expert); Flat Out (reach top speed); Starter Hero (win Stage 5+ in the starter); Halfway There (win Stages 1–5); Champion (win all ten).

Everything earnable is 12,000, which is exactly the three cars (2,000 + 4,000 + 6,000). After Stages 1–3 a player has 1,800 plus First Win = 2,050, enough for Turbo Sprint.

Stage 1 is open; winning a stage opens the next. No car is needed to open a stage. Replays are free and improve the best time; they pay nothing more.

## 4. Online Race

- Any signed-in account or school session can create a room. The creator is a racer in it.
- Join with the six-digit code at `/join`, the QR code, or the link. A name, an optional emoji and a car colour; no account.
- **One car for everyone:** the Circuit Standard (180 km/h, +30 km/h, 8 km). Colour is paint. No request to the racer API has a field that could choose another car, and the join screen does not load the garage.
- Joining closes at the start, so everyone has the whole race. The start is one instant on the database clock.
- Finish order is the moment each racer crossed the line, to the millisecond, computed by the server. The same millisecond shares a place. Racers still on the road follow, by distance.
- The race ends when everyone has finished, when the creator ends it, or 20 minutes after the start. The result is fixed 2.5 s later.
- Creator controls: Start Race, Lock Join, see and remove racers, End Race. They need the creator's session **and** the room's host token; the room code commands nothing.
- A refresh returns to the same seat (token kept for the tab). The creator can take a room over on another device, which retires the old tokens.
- Sync is polling over HTTPS (about every 1.2 s in a race), as in the other live games. Other racers are drawn between polls by carrying their last checked state forward through the same model.
- No Race Dollars are earned online.

## 5. Architecture

Mirrors Polygon Showdown.

- **Client:** plain ES modules under `apps/platform-web/public/internal-games/math-race-champions/`, no bundler. `src/app.js` (the game) and `src/join.js` (racers at `/join`). Every screen is a dynamic import.
- **3D:** the vendored three.js r0.186.1 subset already used by Math Tug of War and Polygon Showdown (unchanged). Cars (`scene3d/cars.js`) are built from numbers: lofted shells with fenders and carved wheel arches, glass canopies, spoked wheels with brake discs, lights and per-model aero parts; no downloaded mesh or texture. The world (`scene3d/world.js`) paints its road, ground, sky, clouds, windows and boards on canvases, uses instanced scenery (palms, pines, saguaros, towers), ACES tone mapping and, on medium and high, one sun shadow map; the low tier has no shadows or clouds. The garage turntable and the race use the same builder. The road (`engine/circuit.js`) is one line; the 3D road and the minimap are both drawn from it.
- **Loading:** opening the game or Classroom Competition downloads no 3D code, no shop and no room code (unit-tested on the static import graph). A race against the computer builds the road first and only then asks the server to start the clock.
- **Graphics tiers:** low, medium, high, chosen from the device and stepped down if frames are slow. Only the nearest 3, 6 or 9 rivals are drawn as cars; everyone is on the minimap. Without WebGL the minimap stands in for the 3D view.
- **Server:** `lib/games/math-race-champions/server.ts`, `app/api/games/math-race-champions/{account,play}/route.ts`. Rebuilds each question from a seed the browser never receives, decides the verdict, runs the racing model on the database clock.
- **Database:** `supabase/migrations/20261112100000_math_race_champions_catalog.sql` (draft catalog entry) and `20261112110000_math_race_champions.sql`. Ten tables (`race_*`), all with forced RLS and no policy; every function `SECURITY DEFINER`, executable by `service_role` only. Rollback: `supabase/rollback/math_race_champions.sql`.
- **One code space:** `private.live_room_code_guard()` now sits on all three room tables and `public.live_room_game_for_code()` answers for all three games. These two shared functions are the only existing database objects the migration changes.

## 6. Security

| Threat | What stops it |
|---|---|
| Sending a made-up correct answer | The browser sends only "left" or "right" for a question number; the answer is never sent to it |
| Skipping, repeating or racing ahead of questions | A press for any question but the current one changes nothing; states are compare-and-swapped by version |
| Client-made distance or speed | The browser's own numbers are never read; distance comes from the model on the server |
| Finishing early | The 30-answer rule in the engine and in two database checks |
| Pressing faster than allowed | The rest after each answer is enforced by the server |
| Changing a car's statistics | Read from the game's own table on the server; the race uses the equipped car as the database holds it |
| Changing a price | The price is read inside the purchase function; nothing in the request is a price |
| Double charge / double reward | One idempotency key per purchase attempt; stage rewards and achievements are unique ledger keys per account |
| Negative balance | Checked inside the purchase transaction; `balance >= 0` constraint |
| Editing the wallet or the ledger | Browsers have no grant on any table; the ledger grants even the application only select and insert |
| Commanding someone else's room | Owner hash (keyed, from the session) and host token together |
| Code guessing | The shared limiter: 40 failed codes per 10 minutes per address |
| Cross-site requests | Custom header plus Fetch Metadata same-origin check on both endpoints |

## 7. Tests

| Suite | Where | Count |
|---|---|---:|
| Unit (engine, model, server, catalog, documents) | `apps/platform-web/lib/games/math-race-champions/*.test.ts` | 232 |
| Database (pgTAP) | `supabase/tests/database/43_math_race_champions.test.sql` | 170 |
| Browser | `e2e/math-race-champions/*.spec.ts` | classroom, computer, shop, online, guest |
| Load | `scripts/math-race-champions-load.mjs` | 10, 20, 30, 40, 50 racers |

```bash
node scripts/run-math-race-champions.mjs demo
```

```bash
node scripts/run-math-race-champions.mjs e2e --project=chromium
```

```bash
node scripts/run-math-race-champions.mjs load
```

## 8. Not done, by design, until the owner says so

Staging, a hosted load test, real-device checks, the catalog artwork review, trademark review of the name, publishing, and any Production migration.
