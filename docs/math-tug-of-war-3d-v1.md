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
- **Procedural animation** (`scene3d/rig.js`, `scene3d/puller.js`): no canned clips. Each puller is posed every frame from anatomical operations — hips placement, spine lean distributed over three bones, two-bone IK for arms (hands to the rope with elbow poles) and legs (feet planted, knees forward), hand orientation and finger curl, head look-at with limits — driven by a per-puller state machine (`ready`, `pulling` with `heave`/`yank` actions, `celebrate`, `falling` → `down` → `rising` → `dejected`). Feet are kept where they were planted while the team frame moves and only step when the stance is too far away (winners step back, losers are dragged then catch-step), so nobody slides.
- **Fatigue and momentum** are visual-only parameters: fatigue grows with match time and pull count (slower, heavier breathing, slump, strained face); momentum follows who is winning (lean, effort, surge vs struggle). Neither touches the rope position.
- **Rope** (`scene3d/rope.js`): a tube rebuilt each frame through the pullers' palms with tension-dependent sag, a twang on every pull, drooping tails on the ground beyond the back pullers, a centre knot marker; released and dropped when the game confirms a winner.
- **Arena** (`scene3d/arena.js`): grass, centre line, dashed team victory lines with flags (wave / star marks, never colour alone), stands with an instanced crowd that cheers for the winner, sky, sun with shadow maps, hemisphere light, PMREM room environment.
- **Effects** (`scene3d/effects.js`): instanced confetti (only after `celebrate`), dust puffs at the losing side's feet, contact-shadow discs on the lowest tier.
- **Quality** (`scene3d/quality.js`): `classic` (SVG only) when WebGL2 is missing, rendering is software, reduced motion is on, data saver is on, or the player chose it; `low`/`medium`/`high` from cores, memory, screen and mobile heuristics; pixel-ratio caps, shadow-map size, crowd and confetti counts per tier; a frame-time watchdog that only ever steps down (to `classic` in the worst case); context-loss handling (one restore, then classic). `?graphics=classic|low|medium|high|3d` pins a tier for review and tests.

## 3. Verification

| Gate | Command | Result |
| --- | --- | --- |
| Engine, generator audit, simulations, robot, online authority, API route | `npm run test --workspace @math-vocabulary-hunt/platform-web -- lib/games/math-tug-of-war` | see §5 |
| Runtime delivery (hash, CSP, module hygiene, vendor bundle, model document, logic isolation) | same (`runtime.test.ts`) | see §5 |
| Animation layer (IK accuracy, finger curl, every state finite and grounded for 6 s × 3 variants, rope grips, state machine, expressions) | same (`animation.test.ts`) | see §5 |
| Local modes, 5 device projects | `node scripts/run-math-tug-of-war-e2e.mjs` | see §5 |
| 3D regression (forced 3D, pulls, victory, fallback, toggle, resize) | `node scripts/run-math-tug-of-war-e2e.mjs -g "3D"` (`e2e/math-tug-of-war/scene-3d.spec.ts`) | see §5 |
| Review pack (screenshots, recordings, measurements) | `node scripts/math-tug-of-war-3d/snap.mjs …` / `capture-math-tug-of-war-3d-review-pack.mjs` | `owner-review/math-tug-of-war-3d-v1/` |

## 4. Known limitations and honest caveats

- **Realism level.** The pullers are MakeHuman-grade humans (realistic proportions, faces and skin, real clothes and shoes), not photoreal scans. Hair is polygon-card hair; skin textures are 1024 px, so extreme close-ups are soft. The rig is Mixamo-named, so a licensed higher-fidelity character set can be dropped in later without touching the animation code.
- **Procedural motion.** Every pose is computed (IK, state machine, noise), not motion-captured. It reads as natural at game distance; it is not mocap. Hands grip with curled fingers but there is no per-finger contact solving; clothing and hair follow the body without cloth simulation.
- **Phone layout is unchanged.** On portrait phones the scene box keeps its existing 1000:310 aspect (about 113 px tall at 390 px wide), exactly like the SVG scene, so keypads and questions keep their certified space. The 3D scene is readable there but small; the math stays the priority by design.
- **Headless measurements.** Frame times come from headless Chromium/WebKit on the development machine (integrated GPU). Real phones, iPads and Smart Boards were not measured in hand; the tiers and the watchdog are the safety net.
- **Assets.** First load fetches about 4.6 MB of models plus about 0.73 MB of three.js (cached afterwards, prefetched from the home screen). Data-saver, reduced-motion, software-GL and non-WebGL2 browsers get the classic scene automatically.
- **Online Match evidence** depends on the local Supabase stack (Docker); see §5 for whether the two-client suite ran in this session.

## 5. Results (2026-10-10, development machine: 16 cores, 16 GB, AMD Radeon integrated GPU)

| Gate | Result |
| --- | --- |
| Unit: engine, generator audit, simulations, robot, online authority, API route, runtime delivery, animation layer | **93 passed, 0 failed** (`lib/games/math-tug-of-war`, 5 files) |
| Local e2e, classic projects (Chromium/WebKit desktop, Pixel 7, iPhone 13, iPad) | **106 passed, 13 skipped (desktop-only cases on mobile projects), 1 failed** in the combined run: the WebKit viewport sweep crashed the WebKit renderer while the 3D projects ran concurrently on the same GPU. Rerun alone: **2 passed** (sweep + 200 % text), so the full classic suite is green (107 equivalent to the baseline) |
| 3D e2e (`scene-3d.spec.ts`): load/mirroring, no-pull-on-wrong-answer, celebration only after the confirmed winner, fall and recovery, toggle, classic/reduced-motion/override never create a canvas, 12 viewport sizes with no overlap or overflow, axe, prefetch and teardown | **20 passed** across `chromium-3d`, `webkit-3d`, `chromium-3d-mobile` (6.5 min, one worker) |
| Lint / typecheck / security audits | `npm run typecheck` clean; `eslint` clean for the new TypeScript (two pre-existing warnings elsewhere); `audit-platform-bundle`, `audit-phase11-security`, `audit-game-suite-media` pass |
| Online Match two-client suite | **Not run in this session**: Docker Desktop's engine never started on this machine (WSL distro and service stayed stopped), so the local Supabase stack could not boot. The 3D layer consumes the same authoritative pull counters and `celebrate` calls as the SVG layer (see `applyOnlineState`/`showOnlineWin` in `app.js`), and `online.test.ts`/`online-route.test.ts` are unchanged and green. Run `node scripts/run-math-tug-of-war-online-e2e.mjs` once Docker is up. |

Asset and performance figures are in `owner-review/math-tug-of-war-3d-v1/measurements.md`
(frame time, draw calls, triangles, canvas size, JS heap, model bytes and load time per
device scenario). From that table (headless Chromium with the integrated GPU, one match
each): medium tier averages 5.2–6.3 ms per frame from a 390×844 phone layout up to 4K
(1837×1043 canvas), 160 draw calls, 292 k triangles including the shadow pass, 43–48 MB JS
heap; the low tier (no shadow maps) averages 3.9 ms, 107 draw calls, 148 k triangles,
40 MB; WebKit 6.6 ms. Worst single frames (213–425 ms) are the first-frame shader
compilation, after which frames stay in single-digit milliseconds. Models: 4,768 KB in 32
files, loaded in 83–94 ms from the local harness (a real network adds its own transfer
time; the home screen prefetches them). Vendored three.js: 743 KB uncompressed.

Commits on the branch: `12c0752` (the upgrade), `94beff1` (adult heights, e2e pinning, capture
timing). Nothing is merged, pushed or deployed.
