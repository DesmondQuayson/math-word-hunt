# Polygon Showdown: staging review, 2026-11-09

Status: **READY FOR POLYGON SHOWDOWN PRODUCTION OWNER APPROVAL.** On staging, Draft, not published. Hosted checks pass, and the owner reported the real-device checks passed on 2026-11-09. Production was not touched.

## Open it

| Screen | Address |
| --- | --- |
| Landing | https://mathnexa-platform-staging-hsrqoxowq-bright-path-ed-tech.vercel.app/games/polygon-showdown/play |
| Solo | https://mathnexa-platform-staging-hsrqoxowq-bright-path-ed-tech.vercel.app/games/polygon-showdown/play#solo |
| Continue Solo | https://mathnexa-platform-staging-hsrqoxowq-bright-path-ed-tech.vercel.app/games/polygon-showdown/play#continue |
| Shop | https://mathnexa-platform-staging-hsrqoxowq-bright-path-ed-tech.vercel.app/games/polygon-showdown/play#shop |
| Avatar | https://mathnexa-platform-staging-hsrqoxowq-bright-path-ed-tech.vercel.app/games/polygon-showdown/play#avatar |
| Create Showdown | https://mathnexa-platform-staging-hsrqoxowq-bright-path-ed-tech.vercel.app/games/polygon-showdown/play#create |
| Join | https://mathnexa-platform-staging-hsrqoxowq-bright-path-ed-tech.vercel.app/join |

The preview sits behind Vercel Deployment Protection. On your own devices, sign in to Vercel once; for a phone that is not yours, open the deployment in the Vercel dashboard, press **Share**, and open that link once on the phone. A scanned QR code then works in the same browser. Sign in to MathNexa with your staging account; if you do not remember its password, use Forgot Password on staging. New accounts start at 0 coins: Solo earns enough for the cheaper items.

## Source and staging

| | |
| --- | --- |
| Locally approved source | `feature/polygon-showdown-3d-difficulty` at `a1f1298` |
| Staging branch | `staging/polygon-showdown` (local only, not pushed) |
| Deployed runtime | `6bf8856`, deployment `dpl_66txtaun8zAPG6CxnuXnf8N5CoR6`, built from a clean export of that commit |
| Staging database | `gcmuhzxkwvfireyrearl`; baseline 45 migrations, latest `20261108110000`; both new migrations dry-run first |
| Staging migrations applied | `20261109100000_polygon_showdown`, `20261109110000_polygon_showdown_table_privileges` |
| Catalog | `draft`; absent from the homepage, `/math-games` and `/games` on staging |
| Production | Unchanged, checked before and after: 44 migrations, latest `20261108110000`, no Polygon tables or functions, no catalog row, identical schema digests, same deployment `dpl_3ozmqjmDboK1fYShWL7BQUe5zPca` |

## What changed since the local approval

1. **Polygon Crown and buns (you asked).** The crown balanced on the two buns and floated above the head. It now sits on the hair with the buns standing inside it; the same fault over a single bun is fixed too. Checked from eight sides on the hosted build. Without a crown the hairstyles are unchanged, and all 612 product pictures are byte-identical.
2. **Staging gate.** The Draft could only run on a local machine. It can now also run on a staging deployment, under the same rules as Math Bingo Live: a per-deployment flag, both Supabase URLs on the staging project, not the production address, and a protected preview. Production fails every condition.
3. **Coin ledger, a real fault that only staging could show.** Hosted Supabase projects give the application role every privilege on a new table. The first migration's narrow grant therefore narrowed nothing there, and the application role could have rewritten or emptied the ledger. Local stacks have narrower defaults, so the local tests passed. A forward migration now sets the grants outright on all eight tables. Production would have had the same hole.

## Hosted results

| Suite | Result |
| --- | --- |
| Anti-cheat and access attempts (`-Stage attack`) | 56 of 56 |
| Chromium, every device size | 48 passed, 1 skipped (the school-access test needs a local school code) |
| WebKit, every device size | 42 passed |
| Math Bingo Live hosted review | 41 of 41 |
| Math Tug of War hosted review | 102 of 102, after updating one check that still expected Tug to be the only featured game (Bingo was added beside it in v1.2.37) |
| Math Vocabulary Hunt and game suite, local | 6 of 6 |
| Number Logic, local | 2 of 2 |
| CrossCalc V2, local | 2 of 2 |
| Number Cross, local | Failed once on this code at a keyboard step in its own test (Space did not clear a crossed tile within 12 s), then 5 of 5. In the previous local pass it failed once on an aborted `/admin/mfa` request, then passed 3 of 3. This branch does not change Number Cross. |
| Lint, types, production build | Pass |
| Unit tests | 1,620 passed, 1 skipped |
| Security audits | Baseline 326, plus 47 scripted checks: pass |
| Database (pgTAP), local, clean database | 1,450 passed, including 101 for this game |
| Staging database verification | Tables, row security, grants, functions, 153 shop items matching the game, Draft row and `/join` guard: pass |

Music, on the hosted build: the shared track is served from the same origin, starts on a first gesture in Solo and on the creator's device, and stays off on a guest's device until that player turns it on. Whether it can be heard on real speakers is on the sheet below.

The attack run covers: a fabricated score, an impossible swap, a duplicate swap, an altered seed and hash, future and superhuman timing, a post-deadline score, a fabricated Solo save, double-submitted purchases, an unowned equip, duplicate reward requests, guests leaving nothing permanent, direct browser access to every table and function, ledger rewrites, wrong-code and room-creation limits, markup in names, and Bingo and Showdown codes never colliding.

Pentagons on staging. Standard Showdown, three seats in each of three runs: first seen between 61.6 and 72.4 seconds of the room's clock, inside the first wave, none before 60 seconds, every seat carrying the same schedule. Solo: none during the first ten swaps; first seen after swap 11. The QR code on the staging lobby was decoded by an independent reader and holds the staging join link for that room.

## Hosted load

60 seconds of real play per cohort, two passes, one room, all from one machine as a class behind one school address. Everyone joins over a few seconds, 10% join late, one in five loses the connection for about eight seconds, and the game is ended and scored. Median / p95 / max, in ms.

**Join** (median / p95 / max, ms)

| Players | Pass 1 | Pass 2 |
| --- | --- | --- |
| 10 | 321 / 400 / 400 | 266 / 418 / 418 |
| 20 | 218 / 378 / 378 | 229 / 527 / 527 |
| 30 | 211 / 467 / 503 | 209 / 313 / 387 |
| 40 | 237 / 498 / 610 | 218 / 403 / 411 |
| 50 | 219 / 355 / 443 | 215 / 367 / 383 |

**Score submission** (median / p95 / max, ms)

| Players | Pass 1 | Pass 2 |
| --- | --- | --- |
| 10 | 284 / 378 / 673 | 309 / 563 / 1,812 |
| 20 | 289 / 391 / 881 | 294 / 435 / 664 |
| 30 | 336 / 520 / 713 | 339 / 725 / 2,735 |
| 40 | 481 / 802 / 1,352 | 466 / 852 / 1,171 |
| 50 | 896 / 1,698 / 2,446 | 909 / 1,505 / 2,123 |

**Leaderboard and room poll** (median / p95 / max, ms)

| Players | Pass 1 | Pass 2 |
| --- | --- | --- |
| 10 | 205 / 276 / 294 | 207 / 504 / 504 |
| 20 | 200 / 284 / 323 | 210 / 320 / 548 |
| 30 | 219 / 351 / 426 | 221 / 330 / 565 |
| 40 | 411 / 925 / 1,004 | 270 / 506 / 664 |
| 50 | 321 / 875 / 1,021 | 453 / 852 / 959 |

**Reconnect** (median / p95 / max, ms)

| Players | Pass 1 | Pass 2 |
| --- | --- | --- |
| 10 | 285 / 285 / 285 | 347 / 347 / 347 |
| 20 | 271 / 272 / 272 | 312 / 335 / 335 |
| 30 | 404 / 715 / 715 | 459 / 475 / 475 |
| 40 | 389 / 683 / 683 | 509 / 638 / 638 |
| 50 | 1,146 / 1,770 / 1,770 | 782 / 1,125 / 1,125 |

**End of game** (median / p95 / max, ms)

| Players | Pass 1 | Pass 2 |
| --- | --- | --- |
| 10 | 383 / 1,195 / 1,195 | 466 / 528 / 528 |
| 20 | 529 / 1,214 / 1,220 | 595 / 719 / 726 |
| 30 | 658 / 897 / 913 | 661 / 952 / 954 |
| 40 | 820 / 1,203 / 1,232 | 924 / 1,158 / 1,296 |
| 50 | 1,020 / 1,442 / 1,450 | 1,114 / 1,407 / 1,462 |

**All sync requests during play** (median / p95 / max, ms)

| Players | Pass 1 | Pass 2 | Requests per second, pass 1 / 2 | Server errors | Database errors | Resyncs | Score mismatches |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 281 / 376 / 673 | 307 / 551 / 1,812 | 6 / 6 | 0 | 0 | 0 | 0 |
| 20 | 286 / 384 / 881 | 291 / 433 / 664 | 12 / 12 | 0 | 0 | 0 | 0 |
| 30 | 328 / 519 / 713 | 333 / 712 / 2,735 | 18 / 17 | 0 | 0 | 0 | 0 |
| 40 | 480 / 802 / 1,352 | 457 / 849 / 1,171 | 21 / 22 | 0 | 0 | 0 | 0 |
| 50 | 881 / 1,689 / 2,446 | 883 / 1,502 / 2,123 | 22 / 22 | 0 | 0 | 0 | 0 |

**Where the time went, score submissions, p95 (ms), pass 1 / pass 2**

| Players | Whole request | In database calls | Outside the function (network and Vercel) | Supabase one-row read, p95 | Vercel health route, p95 | Postgres mean exec, load / commit | Lock waits |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 378 / 563 | 238 / 446 | 161 / 178 | 151 / 269 | 155 / 180 | 1.8, 1.03 / 4.51, 2.49 | 0 / 0 |
| 20 | 391 / 435 | 259 / 302 | 153 / 163 | 172 / 189 | 160 / 152 | 1.75, 1.03 / 2.02, 1.19 | 0 / 0 |
| 30 | 520 / 725 | 398 / 570 | 155 / 168 | 227 / 257 | 162 / 173 | 2.29, 1.08 / 2.5, 1.15 | 0 / 0 |
| 40 | 802 / 852 | 685 / 730 | 158 / 161 | 378 / 451 | 176 / 241 | 3.33, 1.17 / 3.31, 1.21 | 0 / 0 |
| 50 | 1,698 / 1,505 | 1,575 / 1,393 | 166 / 161 | 726 / 831 | 171 / 217 | 4.03, 1.32 / 4.14, 1.28 | 0 / 0 |

**Is it good enough for a classroom?** Up to 30 players: yes, comfortably. 40: yes, with a sync near 0.8 s at p95. 50: it works correctly, with no errors, no refused moves and every score matching, but it is noticeably slower: a sync takes about 1.5 to 1.7 s at p95, so the leaderboard refreshes roughly every two seconds. Swaps themselves are played instantly on the device and reconciled afterwards, so the board does not feel it; the standings do.

**Where the time goes at 50.** Almost all of it is inside the two database calls per sync (1.4 to 1.6 s of 1.5 to 1.7 s). It is not Vercel or the network: time outside the function stays near 160 ms at every size, and the health route does not move. It is not Postgres: each statement takes about 4 ms and 1 ms on average, with no lock waits and at most two active connections. It is the Supabase API layer in front of Postgres: a plain one-row read rises from about 150 ms to 730 to 830 ms at p95 as the room fills. Staging and production both run the smallest compute (60 connections, 224 MB). This matches what Math Bingo Live showed. No upgrade was made. The options, for your decision: a larger Supabase compute, or combining the two calls per sync into one.

## Real-device sheet

Owner's result, 2026-11-09: **all passed, on real iPhone, iPad and a physical Smart Board**. This is the owner's own report; no automated check observed these devices.

**iPhone, Safari:** sign in; Solo; swap gestures; shapes breaking; Pentagon appearing after about ten swaps; music; autosave; Continue Solo; Shop; product pictures; avatar spin; swipe to turn; Try On; buy; equip; Create Showdown; QR join; playing a Showdown.

**iPad, Safari, portrait and landscape:** board size; the page does not scroll while swapping; touch targets; shop grid; avatar smoothness; turning gestures; lobby; a live game; leaderboard.

**Smart Board, if you have one:** touch swapping; board visible from the room; lobby QR; creator controls; leaderboard; sound; nothing that needs hover.

**On real devices, card against Try On and Equipped:** shoes, premium shoes, shirt, pants, dress, suit, jacket, hat, glasses, hair, facial hair, makeup, accessory, a legendary item. Materials loading properly in Safari.

**Turning, on real hardware:** auto-spin; front, side, back, other side; touch swipe; rotate buttons; pause while touched; resume after idle; reduced motion; framing for each kind of item.

**Polygon Crown with twin buns:** rests on the hair from every side.

## Known limits

- Real iPhone, iPad and Smart Board results are the owner's report.
- At 50 players the leaderboard lags, as described above.
- Load came from one machine; a real class has 50 devices on one network.
- Vercel's log query returned only 50 lines without a filter, so its "no errors" is backed by the load tests' own counts (0 server errors).
- Vocabulary Hunt, Number Logic, Number Cross and CrossCalc ran locally on this code rather than against the preview: they have no hosted test runner, and three of them are still Draft on staging.
