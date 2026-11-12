# MathNexa v1.2.46 release record: Math Race Champions

Released and published 2026-11-12. Owner instruction (2026-11-12): the local game is approved; make the three corrections, run every gate, validate staging, deploy Production, publish the game as free, add the homepage Free math games card, run live QA and record the release, without another approval stop.

| | |
| --- | --- |
| Version | `v1.2.46` (annotated tag on the build commit) |
| Build | `436988e`. `/api/health` reports it. Its runtime is the staging-certified `f1cfb44`: `git diff f1cfb44 436988e -- apps packages supabase package*.json` is empty (later commits are tests and release tooling). |
| Source branch | `feature/math-race-champions`, 21 commits on `4686763` (v1.2.45), PR #21 |
| Staging deployment | `dpl_FPf6U65GHqeGBrG7zqa7tY6dD6x9` (build `f1cfb44`). Earlier previews of this release: `dpl_9sgTLTuwbyyrTwHBp66RVFpPbQUg` (`9106063`) and `dpl_FtRpKCkuQCPzxb8if5Q8WbjUTETA` (`9f28c23`); they differ from the final one only in the client audio self-check and the two thumbnail images. |
| Production runtime | `dpl_33jeWHshBDSdmrsdUwWGM8ACFpUD`, promoted 2026-11-12 14:44:50Z |
| Rollback runtime | `dpl_2KufePPCeqSs1msZRq3hmccwLDGr` (v1.2.45, build `5dc155f`), retained |
| Database | History 47 to 49: `20261112100000_math_race_champions_catalog` (14:42:06Z) then `20261112110000_math_race_champions` (14:42:54Z), each dry-run, applied alone and verified |
| Catalog | `math-race-champions`: draft to published 14:46:23Z through the same functions as Super Admin; audit event `admin.game.publish` recorded; description set to the owner's line |
| Release worktree | `C:/GitHub/mathnexa-v1-2-46`, detached at `436988e`. Keep it for the rollback commands. |

Redacted evidence: `docs/releases/evidence/mathnexa-v1.2.46/` (the production project ref is replaced with `[production-ref]`).

## What changed since the local owner review

| Correction | What was done |
| --- | --- |
| Conversion wording | Percentage to Decimal and Decimal to Percentage are asked as one fixed sentence each way: `Convert 28% to a decimal.` and `Convert 0.58 to a percent.` The other five skills keep their equations. Still exactly two choices and exactly one correct; the validator reads the sentence back and rejects the old bare form. A sentence has its own type size and may wrap to two lines. |
| Music | Unchanged in what it plays: the shared MathNexa copy of "Cosmic Candy Catchers" by Eric Matyas (soundimage.org, CC BY 3.0) at `/media/audio/cosmic-candy-catchers.mp3`; no second copy. It starts on the first real press or key, with no need to touch the music button, and the Music and Sound effects switches are separate and remembered. New: the music is mixed in the audio graph where Web Audio exists (so its level is honoured on iPhone and iPad, which ignore an audio element's own volume), checks itself for actually carrying sound, and falls back to the plain element if it does not. |
| Racing sound | Synthesised in the browser with Web Audio; no recording is downloaded and nothing is taken from any other game. A pure engine model turns the car's real race speed into revs, gear and throttle; the synthesiser draws engine note, idle patter, induction, road, wind, gear changes, tyre scrub, a car going past and the finish line from it. A correct answer opens the throttle; a wrong answer shuts it and nothing accelerates. Each garage car and the Online Race car has its own engine profile, trimmed to the same measured loudness. Effects pass one limiter; music is turned down to 55% during a race. Classroom Competition has no engine. In Online Race only the two nearest cars within 45 m are heard. |
| Free game on the homepage | The access policy already made the game free for any signed-in account. It now has compact-card copy for the homepage Free math games section and appears there because the catalog publishes it and the policy makes it free; nothing is hard-coded. It sits after the three free games already there, so the owner's order of 2026-11-09 stands. The owner's line (82 characters) is the catalog description; the card carries a 60-character cut of it, the limit the compact card's tests hold every card to. |
| Catalog artwork | Re-captured from a real Stage 1 race. The earlier capture happened to show a conversion in its old bare form (`10% = ?`); the new one shows `8 − ? = 6`. |

## Gates

| Gate | Result |
| --- | --- |
| Lint, typecheck | Pass |
| Unit | 1,717 web (1 skipped) and 245 core |
| Conversion tests | 10,000 generated questions for each of the 35 skill and difficulty pairs through the independent validator; the owner's examples (0.58, 0.4, 0.07, 1.2; 28%, 65%, 5%, 125%) give exactly the stated answers |
| Database (pgTAP) | 1,771 in 44 files on a clean reset |
| Security baseline | 326 |
| Production build, bundle audit | Pass (and the same commit built on Vercel for staging and Production) |
| Audio audit | 66/66 in Chromium: no clipping, no click at the start, the four cars within 0.6 dB of each other (A-weighted), a correct answer raises the engine, a wrong answer never does, 49 distant racers add nothing, twelve races started and stopped leave silence |
| Race browser suite, Chromium | 41/41, including a full Stage 1 and a full Stage 10 |
| Race browser suite, WebKit | 40 pass, 1 skipped. Playwright's WebKit build for Windows has no Web Audio at all, so the engine cannot sound there and that one engine test is skipped; music is checked there. |
| Other games | Math Bingo Live 10/10, Polygon Showdown 28/28, Math Tug of War 47 (+1 skipped), Number Logic 2/2, Number Cross 1/1, CrossCalc 2/2, game suite 6/6, Math Vocabulary Hunt runtime 40/40. Run one at a time: on the first pass, with several browser suites sharing this machine's memory, WebKit crashed in five Tug tests, the CrossCalc runner crashed on start and one security test timed out; each passes alone. |
| Load, local | 10 and 50 racers: all finish, no errors |

## Staging

| Check | Result |
| --- | --- |
| Migrations | Both applied to staging one at a time and verified; room contract smoke PASS; a browser key is refused on every table and function |
| Browser review (Chromium, synthetic accounts, deleted afterwards) | 36 of 39 on the first run; the three failures were the tests' own plain-HTTP racers lacking the preview's protection header. With the header: 3/3. Includes full Stage 1 and Stage 10 races, the garage, Classroom, Online Race, wording, audio and the device sizes. |
| Guest QA (no account) | 95/95 on the final preview: homepage card at five sizes, catalog, free access, assets, Online Race by QR link and typed code, wording, music and engine state, reconnect, server-decided finish |
| Load, hosted | See below |

### Online Race load on staging (whole races, every racer over the public API)

| Racers | Joined | Finished | Poll p95 | Answer p95 | Errors | Reconnects | Finish order |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10 | 10 | 10 | 280 ms | 380 ms | 0 | 1/1 | correct |
| 20 | 20 | 20 | 342 ms | 503 ms | 0 | 2/2 | correct |
| 30 | 30 | 30 | 898 ms | 1,685 ms | 0 | 3/3 | correct |
| 40 | 40 | 40 | 1,144 ms | 2,098 ms | 0 | 4/4 | correct |
| 50 | 50 | 50 | 1,557 ms | 2,720 ms | 0 | 5/5 | correct |

Every racer joined and finished at every size, nobody finished with fewer than 30 correct answers, and there were no errors. Above about 30 racers the replies slow down; almost all of that time is the database API layer on the current (smallest) tier, the same limit already recorded for Polygon Showdown and Math Bingo Live. No upgrade was made. At 40 to 50 racers the race works but each answer takes one to three seconds to come back.

## Order of release

audit (read only) → preflight → non-aliased candidate → candidate probe → migration 1 → migration 2 → room smoke → promote → live probe → publish → guest QA → Bingo and Polygon QA → signed-in QA → logs.

The game cannot be exercised on a production candidate: non-apex production hosts redirect to mathnexa.com, and a Draft entry closes the game. So, as for Polygon Showdown, the candidate was probed for health and the fail-closed surfaces, the game itself was certified on staging from the same runtime, and gameplay QA ran on Production immediately after publishing.

## Database (`scripts/invoke-math-race-champions-production.ps1`)

| Stage | UTC | Result |
| --- | --- | --- |
| audit (read only) | 09:48 | PASS. Production identity proven (API matches database, quiz fingerprint 8/8); pending exactly the two Math Race migrations; no remote-only versions; all seven games published. |
| migrate 1 | 14:42:06 | PASS. Dry run listed exactly the catalog file; history 47 → 48; catalog 7 → 8 and versions 17 → 18; the new entry is a Draft; accounts 48, entitlements 6, subscriptions 6, resources 225 and the other games unchanged. |
| migrate 2 | 14:42:54 | PASS. Dry run listed exactly the schema file; history 48 → 49; ten tables with row security forced and no browser privilege; 14 service-only functions; four cars at 0 / 2,000 / 4,000 / 6,000; ten achievements; ledger append-only; shared join router knows Bingo, Polygon and Race; catalog still Draft; unrelated data unchanged. |
| smoke | 14:43:46 | PASS. Synthetic room: created, routed to Math Race Champions, joined, a stranger's command refused, closed, code released; browser key refused; 0 rows left. |
| publish | 14:46:23 | PASS. Description set, draft → published, lock 2 → 3, two version rows, audit event recorded, other games unchanged. |
| verify (read only) | after QA | PASS. |

The old app ran on the new database for about two and a half minutes between the second migration and the promotion; `/api/health` and `/join` answered normally in that window.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=f1cfb44`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_2KufePPCeqSs1msZRq3hmccwLDGr`, `RELEASE_PURPOSE=v1.2.46-math-race-champions`, `HOTFIX_VERCEL_CLI=npx --yes vercel@59`.

| Stage | Result |
| --- | --- |
| preflight | PASS (14:34:37Z). Apex served `dpl_2KufePPC…` (the rollback target); health 200. |
| deploy-preview | PASS (14:37:48Z). `dpl_33jeWHsh…` Ready, candidate commit `436988e`, Next 16.4.2, sharp 0.35.5. |
| probe-preview | PASS, 7/7 (health, webhook, canonical host, scheduler fail-closed, no server errors, optimizer, remote refused). The first invocation was refused before probing because the wrapper dropped `--url` and `--deployment`. |
| promote | PASS (14:44:50Z). `dpl_2KufePPC…` → `dpl_33jeWHsh…`. |
| probe-live | PASS, 22/22. |

## Live verification on mathnexa.com

### No account (script, synthetic room, deleted afterwards): 96/96

- `/api/health` ready on `436988e`; `/`, `/math-games`, `/join`, `/help` 200.
- Signed out, the game's route sends to the free sign-in page and back, never to pricing; that page says no subscription is needed and that an account does not start a subscription or a trial.
- 21 runtime files, the 3D library, the music track and both thumbnail formats served. The served question engine asks conversions in words; the served racing sound contains oscillators and noise, no recording and no outside URL.
- Homepage Free math games at 390×844, 768×1024, 1024×768, 1366×768 and 1920×1080: a Math Race Champions card with the FREE badge, the real gameplay picture, one button "Play Free" to `/games/math-race-champions/play`, the same size as the other cards, no horizontal overflow, and only free games in the section (Polygon Showdown, Math Bingo Live, Math Tug of War, Math Race Champions).
- `/math-games` lists it as free with the other seven games.
- Online Race: a room with a six-digit code; the QR link opens this game's join screen with the code filled in; a code typed at the shared `/join` is handed over to this game; four racers, the creator among them; one start; everyone in the Circuit Standard; an answer before the start refused; joining after the start closed.
- On both phones every question was a sentence with two answers (`Convert 78% to a decimal.` 7.8 | 0.78; `Convert 63% to a decimal.` 0.63 | 0.063), both sentences were asked, and the server counted five correct and one wrong exactly.
- Music started by itself on the first touch on both phones (Chromium and WebKit), one track, turned down under the race. Engine: one synthesiser sounding; a correct answer opened the throttle; after a wrong answer the throttle stayed shut and the engine speed only fell.
- Progress, minimap (three rivals), leaderboard and position agreed; a refresh came back to the same seat with the same progress and no second seat.
- The two HTTP racers finished with 211 and 165 correct answers, in the order of the server's finish times; the creator finished first. API p95: poll 444 ms, answer 522 ms; no 5xx.

### Regressions on Production after the release

Math Bingo Live production QA 33/33 and Polygon Showdown production QA 63/63, both through the shared `/join` (a Bingo code opens Bingo, a Polygon code opens Polygon). The first Bingo run stopped on a dropped connection from the testing machine (see "Known limits"); the first Polygon run missed one check because the build id was given in short form.

### Signed in (the owner's own sign-in in the app's browser pane)

No password was entered and no account was created by the release: the owner signed in to mathnexa.com in the pane. That account has a subscription, so "a free account is not asked to pay" was shown on Production by the signed-out path above and by the policy, and on staging by accounts with no subscription.

| Check | Result |
| --- | --- |
| Homepage card | The live Free math games section holds Polygon Showdown, Math Bingo Live, Math Tug of War and Math Race Champions. The card (FREE, Racing, "Play Free", the re-captured real race picture) opened `/games/math-race-champions/play` on the game menu, with no subscription, pricing or trial text anywhere. |
| Music | Nothing played before a gesture. The first real press (the Start button, not the music button) started the one approved track by itself, at its menu level; so did a first key press after a reload. Turned down to 55% in every race and back up after it; one play request all session; no error. The routed music was heard by its own check. |
| Classroom Competition | Two tracks, each START, 1 to 62, FINISH; counters 0 / 62 and 62 STEPS LEFT; two different questions at once, each a sentence with two choices (`Convert 45% to a decimal.` 0.45 or 4.5; `Convert 136% to a decimal.` 136 or 1.36). 105 answers pressed across both teams: 99 correct, each +1; 6 wrong, each +0. Footballs and counters moved. Team Turquoise finished 62 / 62 ("GOAL! Team Turquoise wins!"); Team Pink stood at 37 / 62. No engine sound. |
| Computer Race, Stage 1 | A new account: ten stages, one open, R$ 0, Street Starter. 3D at the "high" picture, minimap with the computer on it, speedometer, 30 correct answers needed. Conversions only: every question a sentence. Won in 1:57 (computer 6:30) with 184 correct and 2 wrong: R$ 500 and four achievements, balance R$ 1,500. |
| Engine sound, Stage 1 | Idle 850 rpm on the grid, throttle shut. The first correct answer opened the throttle fully and the revs climbed; five gears used. After each of the two wrong answers the throttle was shut within a tenth of a second and stayed shut, the engine speed only fell (147 → 72 km/h; 151 → 130 km/h), and the correct count did not move. One engine all race, released at the end. |
| Stages 2 to 10 | All won, each first win paid once: R$ 600 up to R$ 1,400 (Stage 10: 10.9 km, Expert questions, 314 correct, 3:16 against the computer's 5:13). Stages 3 to 10 on Mixed Skills at the stage's own difficulty: all seven kinds asked, conversions as sentences and the rest as equations, one deliberate wrong answer per race (no credit, throttle to zero, engine speed down by 70 to 85 km/h). Turbo Sprint (idle 950 rpm, six gears) in Stages 3 to 6, Velocity GT (idle 720 rpm) in Stages 7 to 10. |
| Garage | Four cars with their 3D models, prices (Free, R$ 2,000, R$ 4,000, R$ 6,000), speeds and recommended stages; the turntable turns (Thunder X seen from the front and from the rear). With R$ 2,350, Buy was offered for the Turbo Sprint only; the other two said how many Race Dollars were missing, and the server refused a Thunder X purchase as "insufficient". Turbo Sprint: confirmation, Owned, charged once (R$ 2,350 → R$ 350), Equip → Equipped, all kept after a reload. Velocity GT: bought through the button and its confirmation (R$ 4,250 → R$ 250), Owned, Equipped, raced. Thunder X was not bought. |
| Wallet | Balance equals the ledger: 19 credits (ten stage rewards, nine achievements) less two purchases = R$ 5,750; no duplicate key. |

Detail: `evidence/mathnexa-v1.2.46/15-signed-in-qa.json`.

Not done on Production: the Thunder X purchase (the account is R$ 250 short of it), and a race as a signed-in account with no subscription (see above).

### Logs

Vercel runtime logs for the production project from the promotion onwards: no 5xx, no `error`, `fatal` or `warning` entries. Database: wallets agree with their ledgers, no duplicate ledger key, no negative balance, no open synthetic room.

## What the QA left on Production

- The account the owner signed in with now has Math Race Champions progress: all ten stages won, 9 of 10 achievements, R$ 5,750, Turbo Sprint and Velocity GT owned, Velocity GT equipped (R$ 11,750 earned, R$ 6,000 spent). Every Race Dollar on it was earned by a real, server-judged win; nothing was granted.
- No synthetic room, seat or account remains.

## Rollback

- Game only: `powershell -File scripts/invoke-math-race-champions-production.ps1 -Stage archive` (the entry leaves the homepage and the catalog; the routes refuse new rooms and races; progress is kept).
- App: from `C:/GitHub/mathnexa-v1-2-46`, `node scripts/run-nextjs-hotfix-production.mjs --stage=rollback` with the pipeline variables above, or `npx vercel@59 promote dpl_2KufePPCeqSs1msZRq3hmccwLDGr --scope bright-path-ed-tech`. v1.2.45 does not know this game: archive the entry first so its card is not offered.
- Database: both migrations are additive and v1.2.45 runs on the new database, so nothing needs to be undone for an app rollback. Only if the game must be removed entirely: `supabase/rollback/math_race_champions.sql`, which deletes every Race Dollar balance, car and race and restores the Polygon-era join router; run it before Polygon Showdown's rollback if both are ever removed.

Rollback required for this release: no.

## Known limits

- Real iPhone, iPad and Smart Board hardware were not available to the release run. Sound was measured in Chromium and exercised in real browser engines; the WebKit test build on this machine has no Web Audio, so the engine has not been heard in a WebKit engine by any automated check. Frame rate on real school hardware is unmeasured.
- 40 to 50 racers in one room: works, slowly (see the load table). A larger database tier or one combined database call per answer would be the fix.
- On a very slow link (measured here at about 70 KB/s when the testing machine's connection dropped during the release), the music track (about 1 MB, started by the first touch) delays the first reply after it past the game's 12 second limit, so the first Join can say "having trouble connecting"; pressing Join again works. The same mechanism exists in Math Bingo Live and Polygon Showdown. Not changed in this release.
- The 3D art is stylised low-poly built in code.
- Name check (not legal advice): a web search on 2026-11-12 found no product named "Math Race Champions"; several unrelated "Math Race" and "Math Racing" games exist. No trademark register was searched.
