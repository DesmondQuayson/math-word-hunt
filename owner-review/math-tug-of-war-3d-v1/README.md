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
| 3 | `03-after-3d-scene-only.png` | The 3D scene enlarged to the viewport |
| 4 | `04-face-closeup-losing-side.png` | Face close-up of the front Pink puller while losing ground |
| 5 | `05-pulling-*-frameNN.png` | Active pulling: nine frames at 90 ms after a Turquoise pull, then after a Pink pull (heave, drive, step; lurch, drag, catch-step) |
| 6 | `06-fatigue-after-24-pulls.png`, `07-fatigue-face-closeup.png` | A long match: slower, heavier posture and strained faces |
| 7 | `08-loss-stumble-0.4s.png` → `11-recovery-4.5s.png` | The losing team: rope released, stumble, fall (kneel / sit / catch, one per puller), rise, dejected stance with a teammate offering a hand |
| 8 | `12-winning-celebration-with-result-card.png` | Winners celebrate while the result card shows; confetti; rope on the ground |
| 9 | `13-recording-pulls-victory-fall-recovery.webm` | Recording of pulls, the win, the fall and the recovery |
| 10 | `14-…`, `15-…`, `16-winner-face-joy.png` | Turquoise winning: arms up, jump, fist pump, high five; joy close-up |
| 11 | `17-…` to `22-…` | Phone 390×844 and 430×932, iPad portrait and landscape, Smart Board 1920×1080, 4K |
| 12 | `23-device-phone-390x844-low-tier.png` | The low tier (no shadow maps, contact shadows) on a phone |
| 13 | `24-device-phone-390x844-classic.png` | The classic scene on the same phone for comparison |
| 14 | `25-webkit-desktop.png` | WebKit (Safari engine) |
| 15 | `measurements.md` / `measurements.json` | Frame times, draw calls, triangles, canvas size, JS heap, model bytes and load time per scenario |

Multiplayer synchronisation evidence comes from the Online Match suite
(`node scripts/run-math-tug-of-war-online-e2e.mjs`): two real browsers, the
real API and database; both clients' SVG and 3D layers are driven by the same
authoritative pull counters (see `docs/math-tug-of-war-3d-v1.md` §5).
