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
- **Procedural animation** (`scene3d/rig.js`, `scene3d/puller.js`): no canned clips. Each puller is posed every frame from anatomical operations — hips placement, spine lean distributed over three bones, two-bone IK for arms (hands to the rope with elbow poles) and legs (feet planted, knees forward), hand orientation and finger curl, head look-at with limits — driven by a per-puller state machine (`ready`, `pulling` with `heave`/`yank` actions, `celebrate`, `falling` → `down` → `rising` → `dejected`). Feet are kept where they were planted while the team frame moves and only step when the stance is too far away (winners step back, losers are dragged then catch-step), so nobody slides. The pulling stance is a braced lean-back (hips low and behind both feet, the front heel dug in, grips beside the waist); on a heave the hips drive back and down while the hands trail, so the arms visibly straighten under load. Reach clamps keep every pose physical: `fitLegs` pulls the hips towards a foot the legs could not reach and `fitArm` slides a grip along the rope when it would leave the arm's reach, and the rope is built through the palms of the *posed* bones (`reachMiss` in the diagnostics reports any hand that misses its grip). Losing: the rope goes slack, the body lurches forward with two quick stumble steps and windmilling arms, then falls (hands-and-knees, sitting, or caught on the knees), stays down, rises and stands dejected (hands on hips, arms hanging, or hands on the knees); a standing teammate offers a hand until the neighbour is up. Winning: straight-arm V, jumps, a fist pump with hops, a high five, then both fists pumping. Tired pullers sag, breathe harder, heave more slowly and occasionally wipe their brow with the back hand.
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
| Hosted staging: deployed build is the tested source (runtime hash, byte-identical models/vendor/modules, commit), route CSP, 3D on hardware GL / classic on reduced motion and software GL, phone / Smart Board / iPad / WebKit renders, Online Match with 3D on both clients | `scripts/invoke-math-tug-of-war-staging.ps1 -Stage review-3d -Origin <preview>` (`review-math-tug-of-war-3d-staging.mjs`), after `-Stage review` | see §5 |
| Review pack (screenshots, recordings, measurements) | `node scripts/math-tug-of-war-3d/snap.mjs …` / `capture-math-tug-of-war-3d-review-pack.mjs` | `owner-review/math-tug-of-war-3d-v1/` |

## 4. Known limitations and honest caveats

- **Realism level.** The pullers are MakeHuman-grade humans (realistic proportions, faces and skin, real clothes and shoes), not photoreal scans. Hair is polygon-card hair; skin textures are 1024 px, so extreme close-ups are soft. The rig is Mixamo-named, so a licensed higher-fidelity character set can be dropped in later without touching the animation code.
- **Procedural motion.** Every pose is computed (IK, state machine, noise), not motion-captured. It reads as natural at game distance; it is not mocap. Hands grip with curled fingers but there is no per-finger contact solving; clothing and hair follow the body without cloth simulation.
- **Phone layout is unchanged.** On portrait phones the scene box keeps its existing 1000:310 aspect (about 113 px tall at 390 px wide), exactly like the SVG scene, so keypads and questions keep their certified space. The 3D scene is readable there but small; the math stays the priority by design.
- **Headless measurements.** Frame times come from headless Chromium/WebKit on the development machine (integrated GPU). Real phones, iPads and Smart Boards were not measured in hand; the tiers and the watchdog are the safety net.
- **Assets.** First load fetches about 4.6 MB of models plus about 0.73 MB of three.js (cached afterwards, prefetched from the home screen). Data-saver, reduced-motion, software-GL and non-WebGL2 browsers get the classic scene automatically.
- **Phone team-name wrapping (pre-existing).** At 390 px wide the Pink panel header shows the team name wrapped letter by letter beside the "Keyboard" badge. This comes from the existing `.panel-name` / `.panel-header` CSS on `main` (the classic capture shows the same) and is unrelated to the 3D layer; it is left untouched here so this branch changes nothing outside the scene.
- **Expressions are deliberately natural.** The face units are blended at moderate weights (determined, strain, surprise, joy, disappointed, tired, wince); they read at the close-up distance in the review pack, less so at phone size.
- **Online Match evidence** depends on the local Supabase stack (Docker); see §5 for the two-client suites in this session.

## 5. Results (2026-10-10, development machine: 16 cores, 16 GB, AMD Radeon integrated GPU)

Certification pass after the polish (the fourth commit on the branch; exact hashes in §6):

| Gate | Result |
| --- | --- |
| Unit: engine, generator audit, simulations, robot, online authority, API route, runtime delivery (now also "the 3D modules never fetch, open sockets or touch storage"), animation layer | **93 passed, 0 failed** (`lib/games/math-tug-of-war`, 5 files) |
| Local e2e, classic + 3D projects together (8 projects, 3 workers, 9.3 min) | **126 passed, 14 skipped (desktop-only cases on mobile projects), 1 failed**: the `webkit-3d` axe audit lost its page ("Target page, context or browser has been closed") while two other GPU browsers ran beside it; see the WebKit matrix below |
| Local e2e, final gate (same suites, 2 workers) | **131 passed, 15 skipped, 6 failed** (12.5 min): five were `online-3d.spec.ts` being collected by the database-less local harness (the local config now ignores it, like the other online specs); one was the `webkit-3d` soak losing its page ("Target page, context or browser has been closed") while the second worker rendered 3D in Chromium; see the WebKit section |
| 3D physicality and lifecycle (`hands really hold the rope…`, `repeated matches and re-entries…`) | **passed on `chromium-3d` and `webkit-3d`** (mobile project skips the soak by design): reach miss < 3 cm mid-heave and < 2 cm at rest, rope on the grass within 1.6 s of the win and back at the waist for the rematch; five matches and three exit/re-entries with geometries, textures and shader programs flat and the JS heap within tolerance; the previous WebGL context reports `isContextLost()` after exit |
| WebKit stability matrix | **36 of 36 runs passed, no crash**: A alone ×3 repeats (9), B three concurrent WebKit workers (8), C WebKit + Chromium + Chromium-mobile 3D concurrently (12), D the classic WebKit viewport sweep and 200 % text while 3D projects ran beside it (7) |
| Online Match two-client suite (classic scene; local Supabase) | **`online.spec.ts` 4 passed** (two clients end to end, failure cases, API security, WebKit interop); **`free-access.spec.ts` 8 passed** on its own run (one sign-in navigation race failed once while the soak, lint and typecheck ran beside it, then passed 8/8 alone) |
| Online Match with the 3D scene on both clients (`online-3d.spec.ts`, GPU Chromium, local Supabase) | **passed** (52 s): both 3D layers at the same position after every pull, same pulling states, no celebration until the server confirmed the winner, both celebrate the same winner with the rope on the grass on both screens, rematch resets both, a reload reconnect rebuilds the guest's 3D scene at the live position, leaving ends the match with no celebration; the database agrees with both screens; every request body the clients sent carried only `action/code/token/round/questionIndex/answer/name/skill` (no position, pull count or winner) |
| Lint / typecheck | `npm run lint` 0 errors (8 pre-existing warnings elsewhere); `npm run typecheck` clean; the new e2e specs type-check with `tsc --noEmit` |
| Review pack | regenerated: `owner-review/math-tug-of-war-3d-v1/` (47 files) |

### The WebKit crash, investigated

- **What happened.** In the previous session the classic WebKit viewport sweep lost its renderer while the 3D projects ran beside it; in this session's 3-worker full run the `webkit-3d` axe audit lost its page the same way. Both were Playwright's WebKit build on Windows (WinCairo, not Safari), both during long concurrent runs with three browsers rendering WebGL on one integrated GPU, and both in the *test* process (axe traverses the whole document while the scene renders).
- **What was ruled out, by experiment.** Isolation (A): WebKit alone, every 3D scenario three times, no crash. Same-engine concurrency (B): three WebKit workers rendering 3D at once, no crash. Cross-engine contention (C): WebKit, Chromium and Chromium-mobile 3D at once, no crash. The original condition (D): the classic WebKit sweep and 200 % text under 3D load, no crash. 36/36.
- **Application side.** The soak proves no growth in geometries, textures, programs or heap across repeated matches and re-entries, and that the WebGL context is released on exit. Asset loading is one document per page (prefetched, cached). The runtime already handles `webglcontextlost` (stop, one restore, then classic) and pauses on `visibilitychange`. No defect was found that the application could fix; the only change made here is in the test tooling (the three new 3D e2e tests themselves) and the capture timing.
- **Conclusion.** Not reproducible on demand; consistent with transient GPU pressure in the WebKit test build under concurrent load, not with a reproducible application crash. Real Safari and iPad were not in hand; the hosted staging review exercises WebKit against the deployed build.

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
