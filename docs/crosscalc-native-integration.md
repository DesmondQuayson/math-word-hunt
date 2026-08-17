# CrossCalc native integration

CrossCalc remains one catalog product. The owner-published catalog record is version `0.2.0`, and the entitled subscriber route `/games/crosscalc/play` resolves the trusted V2 document and assets. V1 `0.1.0` remains source-controlled as the explicit rollback runtime. `/games/crosscalc/v2/preview` and catalog version inspection remain same-origin, MFA-backed admin surfaces and return 404 to unauthorized users. V2 is not a second public registry key, catalog row, sitemap entry, or client-side feature flag.

## Provenance and assets

- V1 standalone source: branch `feature/crosscalc-v1`, commit `0befe8e`; public version `0.1.0`.
- V2 owner-approved core: branch `feature/crosscalc-v2-number-placement`, commit `9d27dbc21fce043569fae89ab5b4434ae2d0bac0`.
- V2 integration-only result-provenance adapter: standalone follow-up `8bc4704`; no approved core gameplay commit was amended.
- V2 runtime CSS SHA-256: `f5c39c4c16b25b5cdd24827147449ef11c5faaa2f0f769b8a7dec3897568bdbf`.
- V2 runtime JS SHA-256: `5bb4968416f222c3bcdebfc49844d7084d59999fd5b1efeff049a26fcaf426ac`.
- Shared approved Cosmic Candy Catchers runtime MP3 SHA-256: `6ba9a6b324807202bb148f77f2030086e7aa0b5fc0f81e1d3ddea072b47c7369`.
- V2 thumbnail: original MathNexa release-candidate artwork derived from actual approved V2 board renders, resized without stretching to `1200×675`, then encoded as quality-94 WebP. Visual inspection and a 41.82 dB decode comparison confirmed no visible quality loss while reducing it from `1,112,176` bytes to `82,090` bytes (92.6%). Its visible arithmetic is valid (`8 + 6 = 14`, `18 ÷ 6 = 3`, and the tray-solvable `18 − 5 × 2 = 8`), and it uses `#20CFE3`, `#FF4F9A`, and `#071525`. It is shown only on the admin card; Production catalog art remains unchanged.

The native core source and production assets are checked byte-for-byte against the standalone integration source. The V2 document adds the same-origin base, the route-appropriate subscriber back link or admin preview banner, the platform integration stylesheet, and the reviewed single-source music adapter. The optimized gameplay bundle, generator, solver, and approved MP3 remain byte-identical. There is no iframe, remote runtime, source map, or debug/solution payload.

## Result and storage contracts

V2 active state and history are isolated at `mathnexa.crosscalc.v2.active` and `mathnexa.crosscalc.v2.results`; no V1 key is read, rewritten, or reinterpreted. A completed V2 game stores and emits `crosscalc-result/2` with `game=crosscalc`, `gameVersion=0.2.0`, `mechanic=number-placement`, mode, difficulty, seed/puzzle signature, RI total, RI components, attempt evidence, completion timestamp, and `completionValid=true`. The RI weights remain Complexity 25, Accuracy 25, Efficiency 20, Independence 20, Pace 10.

At final cutover, a fresh V2 active puzzle is expected. V1 active-puzzle state, V1 results, and V1 RI history remain historical V1 data and are not imported. Only durable account-level data with unchanged meaning may carry forward; no current release-candidate code performs that migration. Existing dashboards remain unaffected because V2 history is still namespaced locally and the emitted schema is explicitly versioned.

## Release-candidate evidence

- Fixed parity digests match the approved Beginner `matrix-mixed-beginner`, Medium `owner-medium-2026`, and Expert `matrix-mixed-expert` fixtures across geometry, equations, givens, blanks, tray instances, canonical values, uniqueness, and metrics.
- A fresh integration-side matrix independently regenerated, solved, validated, and compared 2,500 deterministic puzzles: 100 seeds for each of 25 mode/difficulty combinations, with zero failures and `solutionCount === 1` throughout.
- Chromium and WebKit passed the protected Admin Preview, V1 subscriber preservation, anonymous/non-entitled/entitled isolation, keyboard tile placement, persistence, result emission, audio toggle/singular source, 390×844, 844×390, 768×1024, WCAG axe, reduced-motion, and forced-colors checks.
- Number Logic and Number Cross unit, native parity, security, Admin Preview, storage/result, responsive, and browser regressions passed without registry drift.
- Typecheck, lint, optimized Next production build, and production dependency audit passed; audit reported zero vulnerabilities.

## Released cutover and rollback plan

The owner-authorized V2 release atomically preserved catalog ID `f457a0db-98bb-4401-8584-c8ba5cd93c98`, switched the published version from `0.1.0` to `0.2.0`, selected the trusted V2 renderer and approved thumbnail, and retained the normal release/version audit. V1 assets and renderer remain deployable during the observation window. This post-release hotfix changes only the trusted V2 presentation and audio integration; it performs no catalog or Production database mutation.

Rollback restores the previously recorded Ready V1 deployment and, through the approved owner-controlled catalog procedure, reselects version `0.1.0` and its thumbnail while leaving all V1 and V2 historical result records intact and distinguishable. This hotfix branch contains no migration and performs no Production catalog update, publication transition, or database write.
