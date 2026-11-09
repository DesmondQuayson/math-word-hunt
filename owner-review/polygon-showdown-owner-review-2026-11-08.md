# Polygon Showdown: owner review, 2026-11-08

Status: **ready for final local owner review.** Catalog DRAFT. Nothing is on staging or production. Design detail is in `docs/polygon-showdown-v1.md`.

## Open it

The review server runs at `http://127.0.0.1:3102` (start it again with `node scripts/run-polygon-showdown.mjs demo`). Sign in with the synthetic account `polygon-owner@example.test`; its password and the other test accounts are at the top of `scripts/run-polygon-showdown.mjs`. It holds 200,000 local-only review coins, more than the whole shop costs (183,425), so cheap and expensive items can be bought and compared side by side.

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

To see an active Showdown: Create Showdown, keep **Standard**, START SHOWDOWN, then open the join address in a second window (a private window, signed out or as another account). The first Pentagons land about one minute in.

## What changed in this pass

Please look at **Shop** and **Avatar Editor** first, then play **Solo** for a few minutes.

**Product pictures.** All 153 shop items show a still rendered from the same 3D model that Try On and Equip use. Nothing was bought, downloaded or scraped: see `docs/polygon-showdown-asset-provenance.md`. The twelve shoes were not good enough to photograph, so the shoe model was rebuilt: a real opening, liner, tongue, laces and stacked sole. A basic pair is a plain upper on a sole; a legendary pair adds layered panels, a faceted midsole, metal and a gem.

**Turning avatar.** One turn in ten seconds in the Shop and Avatar Editor. Drag, swipe or use the rotate buttons; it waits three idle seconds before turning again, and stays still for anyone who has asked their device for less motion.

**Pentagon.** It stays, but it no longer starts on the first move. See the next section.

## Pentagon: a slight increase, not a 40% cut

With all five shapes from the first move, the board offered about 15 legal swaps instead of 24, cascades halved, and players earned 41 to 44% less over any long stretch. That is far more than a slight increase, so the Pentagon now arrives progressively.

| Mode | Warm-up on four shapes | Then |
| --- | --- | --- |
| Solo | 10 successful swaps | A wave every 70 swaps, lasting 10 swaps |
| Showdown, Standard (the default) | The first 60 seconds of the room's clock | A wave every 110 seconds, lasting 15 seconds |
| Showdown, Challenge (optional) | None | All five shapes, in every column, from the first move |

| Wave | New shapes in its three-column lane that become Pentagons | Most Pentagons on the board |
| --- | --- | --- |
| First | 20% | 4 |
| Second | 30% | 6 |
| Third and every one after | 40% | 8 |

Only new shapes falling in can be Pentagons; nothing already on the board ever changes. A Showdown's schedule follows the room's clock, which is the same for every seat and is replayed by the server, so neither the creator nor whoever is winning gets a different board. The first Pentagon to land is announced once: "New shape: PENTAGON joins the board!"

Three boards, same simulated players, 40 sessions per row (`scripts/polygon-showdown-difficulty-comparison.mjs`):

| Player | Legal swaps: before / all five / final | Cascades per swap: before / all five / final | Coins per minute: before / all five / final |
| --- | --- | --- | --- |
| Beginner | 24.2 / 15.0 / 20.9 | 0.68 / 0.36 / 0.54 | 41.9 / 23.7 / 34.6 |
| Average | 24.1 / 15.0 / 21.0 | 0.82 / 0.44 / 0.68 | 86.6 / 48.4 / 73.7 |
| Skilled | 23.9 / 15.1 / 21.0 | 0.88 / 0.47 / 0.73 | 141.0 / 82.6 / 122.2 |

| Coins earned in Solo | Time | Before the Pentagon | All five from the start | Final, progressive |
| --- | --- | --- | --- | --- |
| Beginner | 5 min | 204 | 146 (−28.4%) | 176 (−13.7%) |
| | 10 min | 416 | 261 (−37.3%) | 350 (−15.9%) |
| | 30 min | 1,264 | 715 (−43.4%) | 1,043 (−17.5%) |
| | 1 hour | 2,517 | 1,425 (−43.4%) | 2,073 (−17.6%) |
| Average | 5 min | 433 | 289 (−33.3%) | 365 (−15.7%) |
| | 10 min | 864 | 524 (−39.4%) | 734 (−15.0%) |
| | 30 min | 2,578 | 1,467 (−43.1%) | 2,184 (−15.3%) |
| | 1 hour | 5,197 | 2,907 (−44.1%) | 4,423 (−14.9%) |
| Skilled | 5 min | 708 | 459 (−35.2%) | 605 (−14.5%) |
| | 10 min | 1,417 | 875 (−38.2%) | 1,223 (−13.7%) |
| | 30 min | 4,224 | 2,502 (−40.8%) | 3,648 (−13.6%) |
| | 1 hour | 8,459 | 4,959 (−41.4%) | 7,330 (−13.3%) |

| Standard Showdown, coins by game length | 5 min | 10 min | 30 min |
| --- | --- | --- | --- |
| Beginner | 211 to 187 (−11.4%) | 409 to 374 (−8.6%) | 1,227 to 1,012 (−17.5%) |
| Average | 429 to 379 (−11.7%) | 861 to 735 (−14.6%) | 2,584 to 2,140 (−17.2%) |
| Skilled | 705 to 620 (−12.1%) | 1,401 to 1,232 (−12.1%) | 4,198 to 3,644 (−13.2%) |

Every figure for the final board is inside the 10 to 20% target, apart from one short Showdown at −8.6%, which is easier than the target rather than harder. Rewards and prices were not touched: a normal Match 3 still pays 1 base coin, no bonus changed, and the 153 prices are as they were.

The Pentagon in play: the first one lands after 12 or 13 swaps, 3.6 to 3.8 of the 64 cells hold one on average, it is 1.2 to 1.4% of all new shapes, and players make 2.3 to 2.7 Pentagon matches per 100 swaps. Time between successful swaps barely moves (beginner 4.83 to 4.91 s, average 3.24 to 3.25 s, skilled 2.19 to 2.16 s), and no simulated session needed a reshuffle.

## What to check

**Product card, Try On and Equipped must look like one item.** The review coins cover all of these. All 27 were checked side by side, each card next to the same item worn. That check found one real mismatch, now fixed: hair and beard cards were photographed in dark brown while a new avatar has black hair. They now show the colour a new avatar wears. Hair colour is a separate choice, so someone who has picked another colour sees the same style in their own colour on Try On.

| Group | Items (price in coins) |
| --- | --- |
| Shoes | Everyday Sneakers (free), Canvas Lows (40), Cloudstep Platforms (600), Lightning Kicks (1,800), Stardust Heels (4,000), Golden Apex Sneakers (10,000) |
| Clothing | Everyday Tee (free), Starfield Couture Top (4,000), Classic Jeans (free), Simple Sundress (free), Midnight Tailored Suit (750), Galaxy Puffer (2,200), Phoenix Flame Coat (12,000), Celestial Gown (20,000) |
| Head and accessories | Explorer Fedora (200), Aviator Frames (180), Afro (free), Full Beard (60), Crimson Velvet lipstick (120), Aurora Glow eye shadow (520), Sport Watch (230) |
| Premium | Polygon Crown (6,000), Supernova Halo (25,000), Infinity Medallion (8,000), Diamond-Cut Frames (3,000), Supernova Afro (6,000), Royal Beard (520) |

**Avatar Editor.** Slow 360° spin (front, left, back, right, front); mouse drag; touch drag; rotate left and rotate right; the spin pausing while you control it and resuming after three idle seconds; a device set to reduced motion staying still.

## 360° clipping audit

Worn on the avatar and rendered from eight angles (every 45°), 67 outfit combinations. This is a check of the rendered pictures by eye, not an automatic collision test.

| Area | Result |
| --- | --- |
| Pants and skin | Clear |
| Dresses | Clear |
| Jackets and suits | Clear after a fix: the long coat let the trousers through at the hips |
| Shoes and feet | Clear after two fixes: shoe soles were built inside out, so the floor shadow showed through; calves came through the tall boots |
| Hats and hair | Clear. Polygon Crown sits a little above twin buns: a gap you can see, not clipping |
| Beards and faces | Clear |
| Glasses and faces | Clear |
| Long hair and shoulders | Clear |
| Accessories and clothing | Clear |

## Decisions taken automatically

You asked for the recommended option each time, so these are mine to flag rather than yours to have picked:

- **Pause is left out.** A paused board could be studied by whoever paused it, which would be a creator advantage.
- **School access sessions are guests for progression**: they can open the game, create a room, and play a practice run that exists only in their tab. No wallet is ever created.
- **Anonymous visitors are sent to sign in**, matching every other free game. No anonymous Solo.
- **Standard and Challenge.** The selector stayed, on the Create Showdown screen, and defaults to Standard. Challenge is the all-five board for anyone who wants it, and costs what the all-five figures above say.
- **Pentagons come in waves, in a lane, under a ceiling.** Simulation showed that a low share on its own cannot meet the target: a rare shape rarely lines up, so it piles up (5% of new shapes reached 12% of the board and cost a third of the coins). The ceiling caps that, and the waves keep Pentagons close enough together to be cleared.
- **Permanent reward from a Showdown** is half the Showdown's coins, capped at 40 per minute of its length. Solo stays the main earner.
- **Daily banking limit** of 15,000 coins per account, to stop a modified client from farming the shop.

## Economy simulation

Real engine, including animation time, 40 sessions per row (`scripts/polygon-showdown-economy-simulation.mjs`). It runs slightly above the comparison table because this script does not slow a player down on a sparser board.

| Coins earned, final board | 5 min | 10 min | 30 min | 1 hour |
| --- | --- | --- | --- | --- |
| Beginner | 181 | 369 | 1,073 | 2,137 |
| Average | 382 | 760 | 2,266 | 4,521 |
| Skilled | 623 | 1,255 | 3,749 | 7,532 |

| Solo play to earn | Typical price | Items | Beginner | Average | Skilled |
| --- | --- | --- | --- | --- | --- |
| Cheap item | 45 | 34 | 1 min | 1 min | under 1 min |
| Mid-tier item | 200 | 31 | 6 min | 3 min | 2 min |
| Premium item | 600 | 17 | 17 min | 8 min | 5 min |
| Rare item | 1,600 | 13 | 45 min | 21 min | 13 min |
| Luxury item | 4,000 | 11 | 1.9 h | 53 min | 32 min |
| Prestige item (legendary) | 12,000 | 7 | 5.6 h | 2.7 h | 1.6 h |
| The whole shop | 183,425 | 153 | 86 h | 41 h | 24 h |

## Evidence

Lint, types, unit tests, build, security, pgTAP and both browser suites ran on the final code (commit 87bd3da). The other games, the load tests, fairness and the simulations ran one commit earlier (46b6984); the only code change since is the hair colour in the card pictures, which none of them use.

| Check | Result |
| --- | --- |
| Unit tests | 1,614 passed, 1 skipped (1,369 platform and 245 package) |
| Database (pgTAP) | 1,448 passed across 42 files, on a freshly reset database |
| Browser, Chromium | 48 of 48, including every device size |
| Browser, WebKit | 41 of 41, including every device size |
| Lint, types, production build | Pass |
| Security audits (baseline 326, plus 47 scripted platform, launch and deployment checks) | Pass |
| Fairness (1,000 rooms, 8 seats, `polygon-showdown-fairness-simulation.mjs`), Standard | Creator −0.25 standard errors from the average; creator won 12.3% against a fair 12.5%; no seat out of line |
| Fairness, Challenge (`--challenge`) | Creator +0.70 standard errors; creator won 13.3%; no seat out of line |
| Gameplay performance (`polygon-showdown-performance.mjs`) | 59 fps average on a CPU slowed 4×, frame p95 17 ms; 140 KB of game script and 29 KB of CSS; 3D renderer not loaded |
| Shop, on this machine's integrated graphics (`polygon-showdown-shop-performance.mjs`) | First 12 pictures in 319 ms; 56 KB of pictures on the first screen, 5.1 KB each on average; a product opens to 3D in 459 ms; avatar turns at its 30 fps cap, also on a CPU slowed 4× |
| Avatar | About 29,200 triangles and 16 meshes by default; about 68,400 triangles and 24 meshes at the heaviest combination |

### Load: 30 seconds of real play, one room, one address

Local `next dev` on one machine with local Supabase, each pass on a newly started server. Treat these as relative: a hosted run with a real network is still to be done. Pass 1 ran straight after 85 minutes of other suites; passes 2 and 3 ran with nothing else going.

| Players | Requests/s | p50 | p95, pass 1 | p95, pass 2 | p95, pass 3 | p95, median | Worst p99 | Worst max | Errors | Resyncs | Scores matched |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 8 | 72 to 73 ms | 97 ms | 109 ms | 96 ms | **97 ms** | 161 ms | 183 ms | 0 | 0 | all |
| 20 | 15 | 73 ms | 111 ms | 109 ms | 112 ms | **111 ms** | 154 ms | 212 ms | 0 | 0 | all |
| 30 | 23 | 74 ms | 130 ms | 130 ms | 179 ms | **130 ms** | 227 ms | 251 ms | 0 | 0 | all |
| 40 | 30 | 83 to 85 ms | 194 ms | 179 ms | 174 ms | **179 ms** | 927 ms | 978 ms | 0 | 0 | all |
| 50 | 36 to 37 | 110 to 131 ms | 500 ms | 254 ms | 318 ms | **318 ms** | 917 ms | 1,010 ms | 0 | 0 | all |

The two 900 ms figures and the 500 ms come from pass 1, which hit pauses of about one second across the whole server at 40 and 50 players. The time was inside Next.js's own dev handling, not game code, and the two isolated passes did not repeat it (their worst p99 at 50 players was 403 ms). The 3D shop is not on this path: the Showdown screens load no renderer, avatar or product pictures.

### Existing games

| Suite | Result |
| --- | --- |
| Math Bingo Live, Chromium | 9 of 9, including live play, reconnect, security and join with emoji |
| Math Bingo Live, WebKit (join and reconnect) | 2 of 2 |
| Math Tug of War, Chromium desktop | 24 of 24 |
| Math Vocabulary Hunt and game suite | 6 of 6 |
| Number Logic | 2 of 2 |
| Number Cross | Failed once in the final pass, then 1 of 1 on three repeat runs. In the failed run every gameplay and access assertion passed; only the closing check on failed requests did not, naming an aborted `/admin/mfa` request from the test's admin sign-in. The test normally tolerates that Next.js 16.4 abort (two of the three repeat runs logged doing so), the same failure showed once in the previous pass, and this branch does not change the admin pages. Why it escaped the tolerance that one time was not captured. |
| CrossCalc V2 | 2 of 2 |

## Known limits

- Hosted performance is unmeasured. Math Bingo Live ran several times slower on hosted infrastructure than locally.
- Real phones, iPads and Smart Boards were not used: sizes and engines were emulated in Chromium and WebKit, and the 3D avatar ran on this machine's integrated graphics and in software GL.
- The 360° audit covers 67 outfit combinations, not every combination of 153 items.
- A determined player could play at the maximum legal rate with a script: the rules cap that rate and the daily limit caps the reward, but a fast bot can still be first in a Showdown.
- A guest could open several seats in one room, as in Math Bingo Live. The creator sees them and can remove them.
- A client offline for more than 45 seconds loses the moves it made while offline, and resumes from the server's board.
- Avatar: every eye is the same dark brown (no eye-colour slot); a visor on the two afros reads more like a headband.
- Name: "Polygon Showdown" needs a final trademark and branding review before release.
