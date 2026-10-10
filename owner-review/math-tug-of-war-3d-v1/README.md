# Math Tug of War — 3D upgrade: owner review pack

Captured from the shipped game document under its production route CSP by
`node scripts/capture-math-tug-of-war-3d-review-pack.mjs` (headless Chromium
with the machine's GPU, plus one WebKit capture). The 3D scene is forced on
with `?graphics=3d` for the captures; players get it automatically on devices
that qualify and can switch with the "3D" toolbar button.

| # | File | What it shows |
| --- | --- | --- |
| 1 | `01-before-classic-desktop.png` | The unchanged SVG scene (what every device shows today, and what classic/fallback still shows) |
| 2 | `02-after-3d-desktop.png` | The same match with the 3D scene, 1366×768 |
| 3 | `03-after-3d-scene-only.png` | The 3D scene enlarged to the viewport: braced lean-back stance, rope through the hands at the waist, ground shadows |
| 4 | `04-face-closeup-losing-side.png` | Face close-up of the front Pink puller while losing ground |
| 5 | `05-pulling-*-frameNN.png` | Active pulling: nine frames at 90 ms after a Turquoise pull, then after a Pink pull (wind-up, drive back and down with the arms straightening, heel dig, step; lurch, drag, catch-step) |
| 6 | `06-fatigue-after-24-pulls.png`, `07-fatigue-face-closeup.png` | A long match: lower, heavier posture, heads down, slower heaves, strained faces; tired pullers wipe their brow between pulls |
| 7 | `08-loss-stumble-0.5s.png` → `11b-dejected-6.0s.png` | The losing team, timed from the confirmed winner: 0.5 s rope released, lurching forward with two stumble steps and arms windmilling; 1.4 s down (hands-and-knees / sitting / caught on the knees, one per puller); 2.6 s still down, a teammate's hand on a shoulder; 4.8 s rising; 6.0 s standing dejected (hands on hips / arms hanging / hands on knees) |
| 8 | `12-winning-celebration-with-result-card.png` | Winners celebrate while the result card shows; confetti; rope on the ground |
| 9 | `13-recording-pulls-victory-fall-recovery.webm` | Recording of pulls, the win, the fall and the recovery |
| 10 | `14-…`, `15-…`, `15b-…`, `16-winner-face-joy.png` | Turquoise winning: arms straight up, jump, fist pump, high five, then fists pumping; joy close-up (the camera tracks the head while they jump) |
| 11 | `17-…` to `22-…` | Phone 390×844 and 430×932, iPad portrait and landscape, Smart Board 1920×1080, 4K |
| 12 | `23-device-phone-390x844-low-tier.png` | The low tier (no shadow maps, contact shadows only) on a phone |
| 13 | `24-device-phone-390x844-classic.png` | The classic scene on the same phone for comparison |
| 14 | `25-webkit-desktop.png` | WebKit (Safari engine) |
| 15 | `measurements.md` / `measurements.json` | Frame times, draw calls, triangles, canvas size, JS heap, model bytes and load time per scenario |

Multiplayer synchronisation evidence comes from the Online Match suites
(`node scripts/run-math-tug-of-war-online-e2e.mjs`): two real browsers, the
real API and database; `online.spec.ts` certifies the match contract and
`online-3d.spec.ts` runs both clients with the 3D scene on and checks that both
3D layers follow the same room state (see `docs/math-tug-of-war-3d-v1.md` §5).
