# Release Checklist

## Engineering gate

- [x] Formatter, lint, TypeScript, unit, build, and browser-flow commands pass
- [x] All 100 puzzles pass graph, geometry, intersection, uniqueness, and solver checks
- [x] No repetition before shuffle-bag exhaustion; mixed mode ramps difficulty
- [x] Pointer fuzzing and 1,000-match rotation simulation pass
- [x] Five consecutive browser matches complete and reset
- [x] Corrupt local state falls back safely
- [x] Free entitlement and Tournament Mode browser flows pass
- [x] Responsive browser checks cover phone, tablet, desktop, DPR 2, touch, and 1920×1080
- [x] PWA icons, cache versioning, old-cache cleanup, and navigation fallback exist
- [x] Production service-worker offline startup passes automated Chromium test
- [ ] Production offline cold restart verified in Chrome/Edge on target hardware
- [ ] Memory profile captured during a 30-minute live Smart Board session

## Product and classroom gate

- [x] Quick Play, Classroom Match, Daily Challenge, and Tournament routes exist
- [x] First-run practice is skippable and score-free
- [x] Exact failure language and four progressive hints are centralized
- [x] Controls meet a 44px minimum and keyboard focus is visible
- [x] Privacy summary and local-data map are present
- [x] Free/Teacher Pro entitlements are centralized
- [ ] 10–15 teacher beta completed against `BETA_TEST_PLAN.md`
- [ ] Accessibility session completed with switch/keyboard-dependent users
- [ ] Pricing and procurement interviews completed

## Business and launch gate

- [ ] Publisher legal identity and support contact added
- [ ] Terms, refund policy, and jurisdiction-specific privacy review approved
- [ ] License/payment/renewal system implemented and security-reviewed
- [ ] Production hosting, monitoring, rollback, and incident process configured
- [ ] School purchasing, tax, and invoice process tested
- [ ] Final release candidate re-tested on actual classroom hardware

Passing the repository's automated suite does not satisfy the unchecked gates.
