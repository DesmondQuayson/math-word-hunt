# CrossCalc native integration

CrossCalc remains one catalog product. The published subscriber route `/games/crosscalc/play` continues to resolve the V1 `0.1.0` document and assets. V2 `0.2.0` is a private, same-origin release candidate at `/games/crosscalc/v2/preview` and through the existing catalog Admin Preview route with `?version=0.2.0`. Both V2 entry points require the server-verified MFA-backed admin session and return 404 to anonymous, non-entitled, and entitled non-admin users. V2 is not a public registry key, catalog row, sitemap entry, or client-side feature flag.

## Provenance and assets

- V1 standalone source: branch `feature/crosscalc-v1`, commit `0befe8e`; public version `0.1.0`.
- V2 owner-approved core: branch `feature/crosscalc-v2-number-placement`, commit `9d27dbc21fce043569fae89ab5b4434ae2d0bac0`.
- V2 integration-only result-provenance adapter: standalone follow-up `8bc4704`; no approved core gameplay commit was amended.
- V2 runtime CSS SHA-256: `f5c39c4c16b25b5cdd24827147449ef11c5faaa2f0f769b8a7dec3897568bdbf`.
- V2 runtime JS SHA-256: `5bb4968416f222c3bcdebfc49844d7084d59999fd5b1efeff049a26fcaf426ac`.
- Shared approved Oldskool SHA-256: `888052a10a8939c8fa543b5e383e9852e2682e123aa077097c83de9976337a88`.
- V2 thumbnail: original MathNexa release-candidate artwork derived from actual approved V2 board renders, resized without stretching to `1200×675` PNG. Its visible arithmetic is valid (`8 + 6 = 14`, `18 ÷ 6 = 3`, and the tray-solvable `18 − 5 × 2 = 8`), and it uses `#20CFE3`, `#FF4F9A`, and `#071525`. It is shown only on the admin card; Production catalog art remains unchanged.

The native core source and production assets are checked byte-for-byte against the standalone integration source. The V2 document adds only the same-origin base, an explicit `CrossCalc / Preview Version 0.2.0 / NOT LIVE` banner, and the admin return link. There is no iframe, remote runtime, source map, or debug/solution payload.

## Result and storage contracts

V2 active state and history are isolated at `mathnexa.crosscalc.v2.active` and `mathnexa.crosscalc.v2.results`; no V1 key is read, rewritten, or reinterpreted. A completed V2 game stores and emits `crosscalc-result/2` with `game=crosscalc`, `gameVersion=0.2.0`, `mechanic=number-placement`, mode, difficulty, seed/puzzle signature, RI total, RI components, attempt evidence, completion timestamp, and `completionValid=true`. The RI weights remain Complexity 25, Accuracy 25, Efficiency 20, Independence 20, Pace 10.

At final cutover, a fresh V2 active puzzle is expected. V1 active-puzzle state, V1 results, and V1 RI history remain historical V1 data and are not imported. Only durable account-level data with unchanged meaning may carry forward; no current release-candidate code performs that migration. Existing dashboards remain unaffected because V2 history is still namespaced locally and the emitted schema is explicitly versioned.

## Release-candidate evidence

- Fixed parity digests match the approved Beginner `matrix-mixed-beginner`, Medium `owner-medium-2026`, and Expert `matrix-mixed-expert` fixtures across geometry, equations, givens, blanks, tray instances, canonical values, uniqueness, and metrics.
- A fresh integration-side matrix independently regenerated, solved, validated, and compared 2,500 deterministic puzzles: 100 seeds for each of 25 mode/difficulty combinations, with zero failures and `solutionCount === 1` throughout.
- Chromium and WebKit passed the protected Admin Preview, V1 subscriber preservation, anonymous/non-entitled/entitled isolation, keyboard tile placement, persistence, result emission, audio toggle/singular source, 390×844, 844×390, 768×1024, WCAG axe, reduced-motion, and forced-colors checks.
- Number Logic and Number Cross unit, native parity, security, Admin Preview, storage/result, responsive, and browser regressions passed without registry drift.
- Typecheck, lint, optimized Next production build, and production dependency audit passed; audit reported zero vulnerabilities.

## Authorized final cutover and rollback plan

Do not encode cutover in an automatically applied migration. After separate owner authorization, prepare one controlled release that atomically preserves catalog ID `f457a0db-98bb-4401-8584-c8ba5cd93c98`, switches the public `crosscalc` renderer/assets from V1 to the already-reviewed V2 runtime, updates catalog version `0.1.0 → 0.2.0` and the approved thumbnail, and writes the normal release/version audit. Keep V1 assets and renderer deployable during the observation window.

Rollback reverses the public renderer/assets, catalog version, and catalog thumbnail to the recorded V1 release while leaving all V1 and V2 historical result records intact and distinguishable. Neither this branch nor its migrations perform any public switch, Production catalog update, deployment, publication, or Production database write.
