# Math Tug of War — 3D characters and animation upgrade (v1)

Branch `feature/math-tug-of-war-3d-characters-v1` from `main` `cbc7121`
(v1.2.20 docs commit; release tag `v1.2.20` → `56667b0`, production
`dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA`, rollback `dpl_26KQ7nG4MgyFEdHWRQ3jYS9MpWtZ`).
Production, Super Admin V2 and ShowMe Math Lab are untouched.

## 1. What existed (investigated before any change)

| Concern | Finding |
| --- | --- |
| Runtime | Vanilla ES modules under `public/internal-games/math-tug-of-war/`, served as a raw document by `app/games/[resourceId]/play/route.ts` under the strict internal-game CSP (`default-src 'none'`, `script-src 'self'`, `worker-src 'none'`, `img-src 'self' data: blob:`, `connect-src 'self'`). Entry URLs versioned by a content hash of the runtime (`features/games/math-tug-of-war/document.ts`). |
| Scene | `src/scene.js`: original SVG competitors (three per team), rope with slack/taut states, centre ribbon, victory lines, confetti; Web Animations on transforms only. API: `element`, `describe`, `fit`, `position`, `set`, `pull`, `settled`, `celebrate`, `reset`. The scene **never** decides game state. |
| Game logic | `src/tug.js` (immutable local engine, 7 net pulls win), `src/questions.js` (six skills, seeded streams), `src/robot.js`, `lib/games/math-tug-of-war/online.ts` + `app/api/games/math-tug-of-war/online/route.ts` + SECURITY DEFINER `tug_*` functions (server-authoritative Online Match, polling, bearer tokens, rate limits). |
| Modes | VS Robot, Two Teams (one device, two keypads), Online Match (room codes, rematch, presence, reconnect). No timer, difficulty or tutorial by design. |
| Input | Pointer-down keypads, physical keyboard routed to one side, fullscreen "Classroom" button. |
| Responsive | Landscape ≥ 6:5: panel · scene · panel; portrait: scene on top. Certified 304–1920 px, 200 % text, axe. |
| Accessibility | SVG `role="img"` with a live `<title>`, status pill, polite/assertive announcers, reduced motion = no animation. |
| Audio | Shared CC-BY track, Web Audio tones (`src/audio.js`); preference record `mathnexa:math-tug-of-war:preferences`. |
| Tests | 78 vitest (engine, generator audit, 10,000 match simulations, robot, online authority, API route, runtime delivery), pgTAP (84), local e2e (5 device projects), two-client online e2e, free-access e2e. |

**Baseline before changes (this branch, `cbc7121`):** `npm run test --workspace @math-vocabulary-hunt/platform-web -- lib/games/math-tug-of-war` → 78 passed; `node scripts/run-math-tug-of-war-e2e.mjs` → 107 passed, 13 skipped (desktop-only cases on mobile projects), 0 failed, 8.5 min.

## 2. Design: a 3D layer that mirrors, never decides

- The SVG scene stays exactly as it was and remains the **accessible, always-on layer** (`role="img"`, title, `data-position`, `data-last-pull`, `won-*` classes, status pill, reduced-motion behaviour). Every existing e2e assertion keeps targeting it.
- `src/scene-composite.js` wraps it. When the device qualifies, it lazy-loads `src/scene3d/scene3d.js` (the only dynamic import in the runtime, a literal relative path) and lays a `<canvas aria-hidden>` over the SVG. Both layers receive the same calls (`set`, `pull`, `celebrate`, `reset`, `fit`); the 3D layer's promises are joined into `settled()` so the result card still waits for the motion.
- Game logic, question generation, scoring, win rules, matchmaking, room codes, sync and the server API are **unchanged**. `runtime.test.ts` asserts the 3D modules import nothing from `online.js`, `robot.js`, `questions.js`, `answer.js`, `panel.js` or `app.js`, and only `TUG_LIMIT` from `tug.js`.
- `app.js` changes are additive: composite scene, a "3D" toggle in the game toolbar (preference `graphics: auto|classic`, migrated by `audio.js` like the other preferences), `dispose()` on teardown/pagehide, pause on `visibilitychange`, model prefetch from the home screen.

### Technology

- **three.js 0.186.1 (MIT)**, vendored as one tree-shaken module (`src/vendor/three.js`, ~725 KB, ~190 KB compressed) built by `scripts/math-tug-of-war-3d/bundle-three.mjs`. No workers, WASM, eval or network hosts, so the route CSP is unchanged.
- **Characters**: six original MakeHuman humans (CC0 data, see `docs/math-tug-of-war-3d-assets.md`) with a Mixamo-named 52-bone skeleton and 27 ARKit-style facial morph targets, built headless in Blender 4.5 + MPFB 2.0.18 by `scripts/math-tug-of-war-3d/build_characters.py`, then merged, simplified (head locked), quantized and texture-resized by `optimize-characters.mjs` into one plain glTF document (`models/`, ≈ 4.6 MB, fetched once per page and cloned per match).
- **Procedural animation** (`scene3d/rig.js`, `scene3d/puller.js`): no canned clips. Each puller is posed every frame from anatomical operations — hips placement, spine lean distributed over three bones, two-bone IK for arms (hands to the rope with elbow poles) and legs (feet planted, knees forward), hand orientation and finger curl, head look-at with limits — driven by a per-puller state machine (`ready`, `pulling` with `heave`/`yank` actions, `celebrate`, `falling` → `down` → `rising` → `dejected`). Feet are kept where they were planted while the team frame moves and only step when the stance is too far away (winners step back, losers are dragged then catch-step), so nobody slides. The pulling stance is a braced lean-back (hips low and behind both feet, the front heel dug in, grips beside the waist); on a heave the hips drive back and down while the hands trail, so the arms visibly straighten under load. Reach clamps keep every pose physical: `fitLegs` pulls the hips towards a foot the legs could not reach and `fitArm` slides a grip along the rope when it would leave the arm's reach, and the rope is built through the palms of the *posed* bones (`reachMiss` in the diagnostics reports any hand that misses its grip). Losing: the rope goes slack, the body lurches forward with two quick stumble steps and windmilling arms, then falls (hands-and-knees, sitting, or caught on the knees), stays down, rises and stands dejected (hands on hips, arms hanging, or hands on the knees); a standing teammate offers a hand until the neighbour is up. Winning (`scene3d/celebration.js`): one shared plan per win, built only after the game confirmed the winner and followed by all three winners on a common clock. Release the rope with the arms thrown up, turn to the teammates, walk into a huddle (the body moves while every planted foot keeps its place and the step controller walks the feet after it), wrap arms over the neighbours' shoulders (the palm is placed by IK on top of the nearest shoulder from the teammate's posed bones, elbow up, with a short blend so nothing snaps), jump together three to five times (knees bend before the push and give on landing, feet leave the grass, the hug arms stay in contact through the air), break and re-form arm-in-arm facing the camera, then a team pose with periodic cheers and hops, heads turning to teammates and the crowd, joy and cheering faces. The huddle radius, spread, jump count and tempo, final arm variants and per-person timing offsets vary by match seed. Tired pullers sag, breathe harder, heave more slowly and occasionally wipe their brow with the back hand.
- **Fatigue and momentum** are visual-only parameters: fatigue grows with match time and pull count (slower, heavier breathing, slump, strained face); momentum follows who is winning (lean, effort, surge vs struggle). Neither touches the rope position.
- **Rope** (`scene3d/rope.js`): a tube rebuilt each frame through the pullers' palms with tension-dependent sag, a twang on every pull, drooping tails on the ground beyond the back pullers, a centre knot marker; released when the game confirms a winner and dropped to the grass from where it was last held, even after every hand has let go.
- **Arena** (`scene3d/arena.js`): grass, centre line, dashed team victory lines with flags (wave / star marks, never colour alone), stands with an instanced crowd that cheers for the winner, sky, a warm key light from the camera side with shadow maps (so faces and shirts are lit and the shadows stretch back across the grass), a cool rim light from behind, a low hemisphere light and a PMREM room environment, at an exposure that keeps the ground shadows readable.
- **Effects** (`scene3d/effects.js`): instanced confetti (only after `celebrate`), dust puffs at the losing side's feet, soft contact-shadow blobs between each puller's feet on every tier (the only shadow on the low tier, a faint grounding under the shadow-mapped tiers).
- **Quality** (`scene3d/quality.js`): `classic` (SVG only) when WebGL2 is missing, rendering is software, reduced motion is on, data saver is on, or the player chose it; `low`/`medium`/`high` from cores, memory, screen and mobile heuristics; pixel-ratio caps, shadow-map size, crowd and confetti counts per tier; a frame-time watchdog that only ever steps down (to `classic` in the worst case); context-loss handling (one restore, then classic). `?graphics=classic|low|medium|high|3d` pins a tier for review and tests.

## 3. Verification

| Gate | Command | Result |
| --- | --- | --- |
| Engine, generator audit, simulations, robot, online authority, API route | `npm run test --workspace @math-vocabulary-hunt/platform-web -- lib/games/math-tug-of-war` | see §5 |
| Runtime delivery (hash, CSP, module hygiene, vendor bundle, model document, logic isolation) | same (`runtime.test.ts`) | see §5 |
| Animation layer (IK accuracy, finger curl, every state finite and grounded for 6 s × 3 variants, rope grips, state machine, expressions) | same (`animation.test.ts`) | see §5 |
| Local modes, 5 device projects | `node scripts/run-math-tug-of-war-e2e.mjs` | see §5 |
| 3D regression (forced 3D, pulls, victory, fallback, toggle, resize, axe, prefetch/teardown) | `node scripts/run-math-tug-of-war-e2e.mjs -g "3D"` (`e2e/math-tug-of-war/scene-3d.spec.ts`) | see §5 |
| 3D physicality and lifecycle: hands hold the rope (`reachMiss`), the rope drops after the win and is picked up for the rematch, five matches plus three re-entries leave no growing GPU/heap footprint, the old WebGL context is lost on exit | same spec (`hands really hold the rope…`, `repeated matches and re-entries…`) | see §5 |
| Online Match, two real clients (classic scene): create/join, teams, pulls, wrong answers, simultaneous answers, win, rematch, disconnect/reconnect, reload, leave, failure cases, API security, WebKit interop | `node scripts/run-math-tug-of-war-online-e2e.mjs` (`online.spec.ts`, local Supabase) | see §5 |
| Online Match with the 3D scene on both clients: both 3D layers follow the room state (pulls, states, winner, celebration, rematch, reload reconnect, leave), the clients never send a position, pull count or winner | same runner, project `chromium-3d` (`online-3d.spec.ts`) | see §5 |
| WebKit stability matrix (alone ×3, three WebKit workers, cross-engine, classic sweep under 3D load) | `run-math-tug-of-war-e2e.mjs --project … --workers 3 --repeat-each …` | see §5 |
| Team celebration: approach to the huddle slots, four arms over shoulders with the palm within 4 cm of the shoulder, hands outside the torso, bodies 0.3–0.9 m apart, all three airborne together within 12 cm, feet off the grass, clean landing, arm-in-arm line facing the camera, reset to the slots; seeds vary the choreography | `animation.test.ts` (`team celebration: …`, 3 pullers, 14 s offline) and `scene-3d.spec.ts` (`the winning team hugs and jumps together…`: the same metrics from the live scene on Chromium, WebKit and the mobile project, plus every winner in frame and the frame time), `online-3d.spec.ts` (both clients hugging on the same clock), the reduced-motion test now plays a whole match | see §5 |
| Hosted staging: deployed build is the tested source (runtime hash, byte-identical models/vendor/modules, commit), route CSP, 3D on hardware GL / classic on reduced motion and software GL, phone / Smart Board / iPad / WebKit renders, Online Match with 3D on both clients | `scripts/invoke-math-tug-of-war-staging.ps1 -Stage review-3d -Origin <preview>` (`review-math-tug-of-war-3d-staging.mjs`), after `-Stage review` | see §5 |
| Review pack (screenshots, recordings, measurements) | `node scripts/math-tug-of-war-3d/snap.mjs …` / `capture-math-tug-of-war-3d-review-pack.mjs` | `owner-review/math-tug-of-war-3d-v1/` |

## 4. Known limitations and honest caveats

- **Realism level.** The pullers are MakeHuman-grade humans (realistic proportions, faces and skin, real clothes and shoes), not photoreal scans. Hair is polygon-card hair; skin textures are 1024 px, so extreme close-ups are soft. The rig is Mixamo-named, so a licensed higher-fidelity character set can be dropped in later without touching the animation code.
- **Procedural motion.** Every pose is computed (IK, state machine, noise), not motion-captured. It reads as natural at game distance; it is not mocap. Hands grip with curled fingers but there is no per-finger contact solving; clothing and hair follow the body without cloth simulation.
- **Phone layout is unchanged.** On portrait phones the scene box keeps its existing 1000:310 aspect (about 113 px tall at 390 px wide), exactly like the SVG scene, so keypads and questions keep their certified space. The 3D scene is readable there but small; the math stays the priority by design.
- **Headless measurements.** Frame times come from headless Chromium/WebKit on the development machine (integrated GPU). Real phones, iPads and Smart Boards were not measured in hand; the tiers and the watchdog are the safety net.
- **Assets.** First load fetches about 4.6 MB of models plus about 0.73 MB of three.js (cached afterwards, prefetched from the home screen). Data-saver, reduced-motion, software-GL and non-WebGL2 browsers get the classic scene automatically.
- **Phone team-name wrapping (pre-existing).** At 390 px wide the Pink panel header shows the team name wrapped letter by letter beside the "Keyboard" badge. This comes from the existing `.panel-name` / `.panel-header` CSS on `main` (the classic capture shows the same) and is unrelated to the 3D layer; it is left untouched here so this branch changes nothing outside the scene.
- **The group hug is a huddle, not a bear hug.** Arms go over the neighbours' shoulders with the palms resting on them (real contact, verified), bodies 0.4–0.5 m apart in the arc; chests do not press together, which keeps the clothed bodies from passing through each other at any size.
- **Expressions are deliberately natural.** The face units are blended at moderate weights (determined, strain, surprise, joy, disappointed, tired, wince); they read at the close-up distance in the review pack, less so at phone size.
- **Online Match evidence** depends on the local Supabase stack (Docker); see §5 for the two-client suites in this session.

## 5. Results (2026-10-10, development machine: 16 cores, 16 GB, AMD Radeon integrated GPU)

Certification pass after the polish (the fourth commit on the branch; exact hashes in §6):

| Gate | Result |
| --- | --- |
| Unit: engine, generator audit, simulations, robot, online authority, API route, runtime delivery (now also "the 3D modules never fetch, open sockets or touch storage"), animation layer | **93 passed, 0 failed** (`lib/games/math-tug-of-war`, 5 files) |
| Local e2e, classic + 3D projects together (8 projects, 3 workers, 9.3 min) | **126 passed, 14 skipped (desktop-only cases on mobile projects), 1 failed**: the `webkit-3d` axe audit lost its page ("Target page, context or browser has been closed") while two other GPU browsers ran beside it; see the WebKit matrix below |
| Local e2e, rerun with the corrected configuration (8 projects, 2 workers, 15 min) | **132 passed, 15 skipped, 0 failed** (before the readiness fix; the 3D projects were rerun after it, see below) |
| Local e2e, final gate (same suites, 2 workers) | **131 passed, 15 skipped, 6 failed** (12.5 min): five were `online-3d.spec.ts` being collected by the database-less local harness (the local config now ignores it, like the other online specs); one was the `webkit-3d` soak losing its page ("Target page, context or browser has been closed") while the second worker rendered 3D in Chromium; see the WebKit section |
| 3D physicality and lifecycle (`hands really hold the rope…`, `repeated matches and re-entries…`) | **passed on `chromium-3d` and `webkit-3d`** (mobile project skips the soak by design): reach miss < 3 cm mid-heave and < 2 cm at rest, rope on the grass within 1.6 s of the win and back at the waist for the rematch; five matches and three exit/re-entries with geometries, textures and shader programs flat and the JS heap within tolerance; the previous WebGL context reports `isContextLost()` after exit |
| WebKit stability matrix | **42 of 42 targeted runs passed, no crash**: A alone ×3 repeats (9), B three concurrent WebKit workers (8), C WebKit + Chromium + Chromium-mobile 3D concurrently (12), D the classic WebKit viewport sweep and 200 % text while 3D projects ran beside it (7), E the WebKit soak alone ×2 (2), F the WebKit soak beside a Chromium soak, two workers, ×2 (4) |
| Online Match two-client suite (classic scene; local Supabase) | **`online.spec.ts` 4 passed** (two clients end to end, failure cases, API security, WebKit interop); **`free-access.spec.ts` 8 passed** on its own run (one sign-in navigation race failed once while the soak, lint and typecheck ran beside it, then passed 8/8 alone) |
| Online Match with the 3D scene on both clients (`online-3d.spec.ts`, GPU Chromium, local Supabase) | **passed** (52 s): both 3D layers at the same position after every pull, same pulling states, no celebration until the server confirmed the winner, both celebrate the same winner with the rope on the grass on both screens, rematch resets both, a reload reconnect rebuilds the guest's 3D scene at the live position, leaving ends the match with no celebration; the database agrees with both screens; every request body the clients sent carried only `action/code/token/round/questionIndex/answer/name/skill` (no position, pull count or winner) |
| Lint / typecheck | `npm run lint` 0 errors (8 pre-existing warnings elsewhere); `npm run typecheck` clean; the new e2e specs type-check with `tsc --noEmit` |
| Review pack | regenerated: `owner-review/math-tug-of-war-3d-v1/` (47 files) |

### Team celebration round (owner brief 3)

The individual victory animations were replaced by a shared team celebration (§2). Gates, all after the final code:

| Gate | Result |
| --- | --- |
| Unit (`lib/games/math-tug-of-war`, now 95 tests): engine, generator, robot, online authority, API, runtime delivery (the new module listed), animation layer incl. the 14 s offline team celebration and the seed-variation test | **95 passed, 0 failed** |
| `chromium-3d` (all 11 tests incl. "the winning team hugs and jumps together…", the slow-load test, soak, rope) | **11 passed** (3.0 min) |
| `chromium-3d-mobile` (Pixel 7: the celebration test with every winner in frame on the phone box) | **9 passed, 2 skipped** by design (1.6 min) |
| `webkit-3d` alone (one worker, all 11 tests) | **11 passed** (8.8 min) |
| Online Match with the 3D scene on both clients (`online-3d.spec.ts`): both screens hugging on the same clock after the server-confirmed win | **passed** |
| Full local suite (8 projects, 2 workers) | **138 passed, 15 skipped, 0 failed** (16.7 min; no WebKit page loss this time) |
| Classic Online Match suites (`online.spec.ts`, `free-access.spec.ts`; their Chromium clients run the 3D scene and so the new celebration) | **12 passed, 1 skipped** (the review-pack capture test; 5.1 min) |
| Lint / typecheck | lint 0 errors; `npm run typecheck` clean |

What the live metrics say (Chromium, a Pink win and a Turquoise win, sampled every 120–250 ms): the three winners reach their huddle slots by 2.1–2.4 s; from 2.9 s on, four arms rest on teammates' shoulders with the palm 0–4 cm from the shoulder contact point and a reach miss under 1 cm; hands sit 12–16 cm out from the teammate's spine (on the shoulder, not in the torso); hips 0.39–0.52 m apart in the huddle; three to five jumps with all three in the air together (27 cm, feet 30 cm off the grass) within 2–10 cm of each other; a landing with knees bending; the arm-in-arm line 0.5 m apart with hands on shoulders again; frame time 5.8–7.5 ms. The only large contact values are the first 0.4 s of the hug and of the team pose, while the arms blend onto the shoulders.

Bugs found and fixed on the way: a hug target converted in the wrong space (tug group vs world) broke the whole Turquoise side (every arm "left", the middle member hugging one neighbour); a one-frame lag between teammates at the jump apex (fixed by posing all bodies first and re-solving the hug arms afterwards, and by applying the jump height to the root before converting targets); and the review close-up camera sitting inside the huddle (now a longer shot).

### Hosted staging round 1 (preview of `3a76d84`): a real regression, fixed

- **Classic review** (`-Stage review`): 89/92, with a page error on the WebKit iPad session,
  `TypeError: null is not an object (evaluating 'rope.twang')`, and the three Online Match checks
  that followed it failing on the WebKit guest (a pull not counted, screens out of step, no win
  dialog). **3D review** (`-Stage review-3d`): 37/39, all hash / asset / CSP / device / online
  checks passing; the two failures were the "no console errors" checks, which counted the
  preview protection's own refused route prefetches.
- **Cause.** On the hosted build the character document arrives over the network, so a pull can be
  issued before the 3D world exists. `runPull` then touched the unbuilt rope, the rejection
  poisoned the 3D pull queue, and because the composite scene joined the 3D promise into
  `pull()`/`settled()`, the game's "match settled → celebrate" step never ran on that client.
  Locally the models were always cached, so no test had covered a pull before readiness.
- **Fix (follow-up commit).** A pull issued before the world exists only records the authoritative
  position and resolves at once (the game's result card is never delayed by the network); every queued
  pull catches its own failure (the queue can never be poisoned); a win that arrives while loading
  starts the celebration once the world is built; the composite scene swallows any 3D rejection so the
  animation layer can never reach the game's flow. New e2e test on Chromium and WebKit: the character
  document is held back until a whole match is decided, no page error, the result card appears on time,
  and the late 3D scene picks up the rope position, the winner and the rematch. The hosted 3D review
  now prints the offending errors and ignores the preview protection's prefetch noise.

**Local gates after the fix.** Unit 93/93 (the runtime hash moved to `d5546f1c…`). Chromium 3D:
load/mirror, confirmed-winner celebration, toggle, hands-on-rope and the new slow-loading test, 5/5.
WebKit 3D alone (one worker, the clean-gate recipe): **all 10 tests passed in 7.5 min**, including the
viewport sweep, axe, teardown, rope, the five-match soak and the slow-loading test. Online Match with the
3D scene on both clients (`online-3d.spec.ts`): passed again (1.5 min). One more WebKit page loss was
seen while the review pack capture (GPU Chromium) and an Online Match run shared the machine; it is
counted in the WebKit section below and did not recur alone.

### The WebKit crash, investigated

- **What happened.** Four page losses, all "Target page, context or browser has been closed" from Playwright's WebKit build on Windows (WinCairo, not Safari), all while two or three browsers rendered on one integrated GPU: the classic WebKit viewport sweep in the previous session (a page pinned to the SVG scene, with no WebGL at all), the `webkit-3d` axe audit in this session's 3-worker run, the `webkit-3d` soak in the 2-worker final gate, and the `webkit-3d` load test while the review pack capture (GPU Chromium) and an Online Match run shared the machine.
- **What was ruled out, by experiment.** Isolation (A, E): WebKit alone, every 3D scenario three times and the soak twice, no crash. Same-engine concurrency (B): three WebKit workers rendering 3D at once, no crash. Cross-engine contention (C, F): WebKit beside Chromium and Chromium-mobile 3D, and the WebKit soak beside a Chromium soak twice, no crash. The original condition (D): the classic WebKit sweep and 200 % text under 3D load, no crash. 42/42 targeted runs; the losses only appear in long mixed runs, and one of them hit a page that was not using WebGL.
- **Application side.** The soak proves no growth in geometries, textures, programs or heap across repeated matches and re-entries, and that the WebGL context is released on exit. Asset loading is one document per page (prefetched, cached). The runtime already handles `webglcontextlost` (stop, one restore, then classic) and pauses on `visibilitychange`. No defect was found that the application could fix; the only change made here is in the test tooling (the three new 3D e2e tests themselves) and the capture timing.
- **Conclusion.** Not reproducible on demand (0 of 42 targeted runs, including the exact test pairs that failed), and one of the three losses hit a classic page with no WebGL, so the application's 3D code is not the trigger. The evidence fits transient GPU-device pressure in the Windows WebKit test build under long multi-browser load. For a clean WebKit gate, run `--project webkit-3d --workers 1` (as in A and E). Real Safari and iPad were not in hand; the hosted staging review exercises WebKit against the deployed build.

Asset and performance figures are in `owner-review/math-tug-of-war-3d-v1/measurements.md`
(frame time, draw calls, triangles, canvas size, JS heap, model bytes and load time per
device scenario). From that table (headless Chromium with the integrated GPU, one match
each): medium tier averages about 5.4–7.0 ms per frame from a 390×844 phone layout up to
4K (1837×1043 canvas), 167 draw calls, 292 k triangles including the shadow pass, 43–48 MB
JS heap; the low tier (no shadow maps) averages 3.9 ms, 107 draw calls, 148 k triangles;
WebKit 8.0 ms. Worst single frames (125–462 ms) are first-frame shader compilation, after
which frames stay in single-digit milliseconds. Models: 4,769 KB in 32 files,
loaded in 80–95 ms from the local harness (a real network adds its own transfer time; the
home screen prefetches them). Vendored three.js: 743 KB uncompressed.

Commits on the branch: `12c0752` (the upgrade), `94beff1` (adult heights, e2e pinning, capture
timing), `1ca3f94` (review pack), then the polish / multiplayer 3D certification / WebKit matrix / staging tooling commit (§6). Staging deployment: see §6.

## 6. Staging deployment (protected preview) and owner review

The branch is ready for a protected staging preview; nothing on this branch is merged,
promoted or pointed at the customer domain, and no production database is touched.

**What a push does.** The Vercel project `mathnexa-platform-staging` is GitHub-linked
(`DesmondQuayson/math-word-hunt`, production branch `main`, root `apps/platform-web`,
SSO protection on every preview). Pushing this branch creates a preview deployment at
`https://mathnexa-platform-staging-<hash>-bright-path-ed-tech.vercel.app`; the production
project has no Git link, so a branch push can never reach `mathnexa.com`. The staging
Supabase project (`gcmuhzxkwvfireyrearl`) already carries the Math Tug of War schema from the
v1 release and this branch adds no migration.

**Steps (owner, or with the owner's push).**

1. Push the branch: `git push -u origin feature/math-tug-of-war-3d-characters-v1`
   (the session's permission policy refused to publish on its own; the push is the only
   outward action this branch needs).
2. Wait for the preview to build (`npx --yes vercel@59 ls mathnexa-platform-staging`), note its
   URL and deployment id, and the commit it was built from (`/api/health` reports it).
3. Classic certification of the hosted build (auth, free access, subscription gates, six
   skills, keypad, Smart Board, phones, iPad, reduced motion, Online Match on two phones):
   `powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-tug-of-war-staging.ps1 -Stage review -Origin <preview URL> -ExpectCommit <sha>`
4. 3D certification of the hosted build (runtime hash and byte-identical assets, CSP, 3D on
   hardware GL / classic on reduced motion and software GL, pulls and the confirmed-winner
   celebration, toggle, phone / Smart Board / iPad / WebKit renders, Online Match with the
   3D scene on both clients): same launcher with `-Stage review-3d`; screenshots and
   `staging-3d-results.json` land in `owner-review/math-tug-of-war-3d-v1/staging/`.
5. Open the preview URL in a browser, sign in with a staging account, choose Two Teams or
   Online Match: the 3D scene starts automatically on a hardware-accelerated browser and the
   "3D" toolbar button switches to the classic scene and back.

**Round 1 (done).** Push of `3a76d84` built preview `dpl_45Z7maT6uUdpwGLi3ySVdT7yY5Xt`
(`https://mathnexa-platform-staging-7t4xyv0tc-bright-path-ed-tech.vercel.app`, READY, commit `3a76d84`,
`/api/health` confirms it); `mathnexa.com` kept serving the v1.2.20 production build
(`dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA`, health build `56667b0`). The hosted reviews of that preview found the
readiness regression described in §5 and it is fixed on the branch; the next push builds the preview to review.

**Round 2 (the build to review).** Push of `d073832` built preview `dpl_9d6cfMQTAQJuGsd1uCUaumuvoY6M`
(`https://mathnexa-platform-staging-5elpskrut-bright-path-ed-tech.vercel.app`, READY, commit `d073832`);
`mathnexa.com` still serves `dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA` (health build `56667b0`). Hosted review results: **classic review 99/99** (free-account path, six skills, keypad, Smart Board, phones 320–430, iPad WebKit, reduced motion, Online Match host/guest across Chromium and WebKit with disconnect, reconnect, win, rematch, leave, and two non-subscribers; the round-1 failures are gone); **3D review 37/39** with every hash, asset, CSP, device, fallback and online-3D check passing; the two flags were the Vercel preview toolbar script (`vercel.live/_next-live/feedback/feedback.js`) being refused by the game's own CSP, which is preview-only and exactly what the CSP should do (now filtered as noise), plus one harmless Direct3D shader-compiler precision note. Hosted frame times 6.4–9.4 ms (medium tier) on desktop, phones, Smart Board, iPad WebKit and WebKit desktop; hands on the rope with zero reach miss on every device. Screenshots and `staging-3d-results.json` in `owner-review/math-tug-of-war-3d-v1/staging/`.

**Rollback plan.** A preview deployment is isolated: it has no custom domain and no alias. To
withdraw it, delete the deployment in Vercel (or leave it; protected previews expire with the
branch). Production is untouched: `https://mathnexa.com` stays on its current deployment
(see `docs/current-deployment.md`), and the 3D layer is a client-side enhancement under the
existing route, so a future production rollback is the ordinary "promote the previous
deployment" step with no data migration to undo.

