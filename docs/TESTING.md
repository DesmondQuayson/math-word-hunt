# Testing

## Unit tests

`npm test` runs Vitest coverage for geometry, intersections, legal junctions,
edge reuse, graph connectivity, Euler validation and solving for all 100
puzzles, puzzle quality/uniqueness, noisy tracing, blank-space shortcuts,
shuffle-bag rotation, a 1,000-match simulation, fitted board scaling,
timestamp timing, pause/resume behavior, scoring, ties, entitlements, storage
sanitization, progression, tournaments, and state transitions.

## Static checks

- `npm run lint`
- `npm run typecheck`
- `npm run build`
- `npm run test:offline` (after `npm run build`)

## Browser flow

`npm run test:e2e` launches the Vite app and checks landing/privacy routes,
onboarding, Quick Play, Free-tier routing, setup, the stopped ready timer,
active countdown, pause/resume, attempt reset, actual puzzle completion, team
transition, same-puzzle parity, round scoring, hidden normal node markers, hint
feedback, large fitted geometry, a complete tournament, five consecutive full
matches, corrupt-state recovery, 44px controls, scroll-origin safety, New
Showdown rotation, fullscreen presence, keyboard focus, and console errors.

Recommended manual viewports: 1920×1080, 1366×768, 1024×768, 768×1024, and 390×844.
