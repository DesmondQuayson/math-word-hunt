# Manual QA Report

Date: 2026-07-18

## Method

The application was inspected in the in-app Chromium browser against the local
Vite build. Evidence was captured in `qa-artifacts/` (intentionally ignored by
Git). Automated Playwright separately completed full gameplay interactions.

## Visual coverage

| Surface                               | Viewport  | Result                                 |
| ------------------------------------- | --------- | -------------------------------------- |
| Landing hero and live puzzle preview  | 1440×900  | Pass                                   |
| Landing/mobile actions and trust copy | 390×844   | Pass; no horizontal overflow           |
| First-run practice                    | 1024×768  | Pass                                   |
| Classroom setup                       | 1024×768  | Pass; setup scrolls vertically by 66px |
| Round intro and active puzzle         | 1024×768  | Pass after scroll-origin fix           |
| Time-up feedback                      | 1024×768  | Pass                                   |
| Tournament setup                      | 1024×768  | Pass                                   |
| Quick Play round intro                | 1920×1080 | Pass; no overflow                      |

Visible controls measured at least 44px in both the automated check and the
tablet inspection. Browser console errors and warnings: **0**.

## Gameplay evidence

- Automated solver completes every one of the 100 curated puzzles.
- Automated noisy-trace fuzzing completes 200 valid paths and rejects 200
  blank-space shortcuts.
- Playwright completes five consecutive full two-team matches.
- Playwright covers success, bad start/off-path, crossing, pause, restart,
  timeout-related transitions, team handoff, scoring, final winner, and New
  Showdown.
- Tournament automation completes a two-team bracket and verifies final
  standings.

This is strong engineering evidence, but it is not equivalent to five human
finger/stylus plays in every difficulty tier on physical classroom hardware.
That remains part of the beta gate.

## Defect found and fixed

At 1024×768, clicking the setup button near the bottom could carry a 66px page
scroll into gameplay and clip the scoreboard. Game phase changes now reset
scroll origin, and an end-to-end regression assertion verifies `scrollY === 0`.

## Open manual items

- Physical Smart Board stylus/finger session
- Production PWA install, offline cold restart, and update recovery
- 30-minute memory observation
- Teacher comprehension and accessibility sessions
