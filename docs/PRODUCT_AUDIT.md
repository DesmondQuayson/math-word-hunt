# Trace Clash Product Audit

Audit date: 2026-07-18  
Baseline checkpoint: `c9c6fdbdbb72ec4364a6c03b5182cd93da05db97`

## Method

The baseline was reviewed through repository inspection, graph-library validation, automated Euler-trail completion, unit tests, production build output, and the full Playwright classroom flow at desktop, tablet, phone, touch-style, mouse, and high-device-pixel-ratio configurations.

The baseline passed formatting, lint, TypeScript, 134 unit tests, 15 Playwright scenarios, and the production build. A passing baseline is not considered evidence of commercial readiness by itself.

## Original scores

| Area                              |  Score | Baseline assessment                                                                                                                                             |
| --------------------------------- | -----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core tracing correctness          | 8.5/10 | Stateful, interpolated continuous tracing with terminal locking and precise failures.                                                                           |
| Crossing detection                |   8/10 | Segment-level detection exists, but legal-node exemptions need tighter structural rules and fuzz coverage.                                                      |
| Retracing detection               |   8/10 | Completed-edge selection and collinear overlap are detected; synthetic sparse-event coverage is limited.                                                        |
| Dead-end detection                | 8.5/10 | Unused-edge exhaustion produces a deterministic dead end.                                                                                                       |
| Touch and Smart Board reliability |   8/10 | Pointer capture, coalesced samples, CSS-space coordinates, and DPR tests exist. Longer device sessions are untested.                                            |
| Puzzle mathematical validity      |   9/10 | Connectivity, parity, start nodes, intersections, and automated solutions are validated.                                                                        |
| Puzzle visual quality             |   5/10 | Clean rendering, but most puzzles are generated from three closely related hub-and-cycle layouts.                                                               |
| Puzzle uniqueness                 | 4.5/10 | Exact signatures reject obvious duplicates; near-duplicate detection and canonical graph labeling are incomplete.                                               |
| Puzzle-selection variety          |   7/10 | Shuffle bags and recent-history avoidance work; Mixed does not deliberately ramp challenge.                                                                     |
| Timer fairness                    |   8/10 | Deadline-based countdown avoids interval drift. Long-session and background/resume behavior need more evidence.                                                 |
| Team fairness                     |   9/10 | Both teams receive the same puzzle and equivalent turn reset.                                                                                                   |
| Match state management            |   7/10 | State transitions are explicit, but persisted JSON is not schema-validated and recovery is only a round checkpoint.                                             |
| New Showdown behavior             |   8/10 | Reset behavior and input activation are tested; repetition and long-session state need broader coverage.                                                        |
| Teacher setup speed               |   6/10 | Setup is understandable but there is no one-click Quick Play path or first-run practice.                                                                        |
| Classroom readability             | 8.5/10 | Strong dark game-show hierarchy, large timer, clear overlays, and prominent puzzle board.                                                                       |
| Accessibility                     |   7/10 | Live announcements, focus styles, reduced motion, mute, Node Mode, and large controls exist; color chips are only 32×32 and accessibility automation is narrow. |
| Responsive design                 |   8/10 | Five target viewports pass layout tests. Human review across every primary screen is incomplete.                                                                |
| Audio feedback                    | 6.5/10 | Useful synthesized cues with mute support; scheduled tones cannot yet be cancelled during resets.                                                               |
| Performance                       |   8/10 | High-frequency trace state stays outside React and canvas uses animation frames. No formal 100-round memory profile exists.                                     |
| Offline reliability               |   4/10 | A service worker and manifest exist, but install icons, version UI, cache migration, and offline-start tests are missing.                                       |
| Privacy                           |   9/10 | No accounts, advertising, analytics, or network data collection. Formal privacy and data-handling documents are missing.                                        |
| Replay value                      |   4/10 | Match play works, but there are no classroom records, daily challenge, themes, streaks, or tournament rotation.                                                 |
| Commercial polish                 | 3.5/10 | No landing route, onboarding, product tiers, tournament mode, release plan, or beta/pricing documentation.                                                      |

Original commercial-readiness score: **58/100**

## Remediation status

The engineering beta candidate is now assessed at **88/100**. The complete
20-area disposition is in `RELEASE_READINESS_REPORT.md`.

All baseline P1 findings were implemented or converted into explicit external
release gates: the catalog is 100 puzzles; Quick Play, onboarding, tournament,
safe storage, ramped rotation, PWA assets/cache cleanup, exact feedback, 44px
controls, entitlements, landing/privacy routes, long-session simulations, and
expanded browser tests now exist.

The product is **not commercially ready**. Physical Smart Board/offline/update
evidence, teacher and accessibility beta sessions, publisher legal identity,
licensing/payment, production deployment/monitoring, procurement, and support
operations remain open.

## Severity-ranked findings

### P0 — correctness or fairness blockers

No reproducible open P0 issue was found in the validated baseline. P0 status remains conditional on expanded fuzz testing, 100-round simulation, and manual failure-state review.

### P1 — classroom or purchase blockers

1. **Catalog size and structural variety:** 45 puzzles falls below launch scope, and most share a hub/cycle/tail construction.
2. **Teacher start time:** there is no one-click Quick Play or first-run practice, so a new teacher must understand the full setup form before play.
3. **Tournament support:** the product cannot rotate 2–8 classroom teams or produce standings.
4. **Persisted-state safety:** parsed local data is cast without runtime schema validation, allowing malformed settings or match records to reach game state.
5. **Mixed difficulty:** the current bag is random rather than a deliberate easy-to-hard classroom ramp.
6. **PWA installation and updates:** the manifest has no icons, the cache has no cleanup/version recovery flow, and offline startup is untested.
7. **Feedback contract:** lift and timeout presentation do not consistently use the exact required failure titles, and the fourth hint step is absent.
8. **Accessibility target size:** color-choice controls override the global 44×44 minimum with 32×32 controls.
9. **Commercial structure:** no entitlement configuration separates Free and Teacher Pro capabilities.
10. **Public explanation:** no landing route communicates classroom value, Smart Board use, privacy, or the free path.
11. **Privacy documentation:** privacy behavior is strong but undocumented for teacher and school review.
12. **Release evidence:** no long-session simulation, tournament test, offline-start test, entitlement test, manual QA report, release checklist, or beta plan exists.

### P2 — polish and retention

1. Audio oscillators scheduled before a reset cannot be cancelled as a group.
2. No daily challenge, streak, completion totals, per-puzzle best time, records, or earned themes.
3. Difficulty metadata is mainly assigned by builder family instead of calibrated from measured complexity.
4. Puzzle validators do not yet reject tiny edges or near-overlapping unrelated geometry.
5. The service worker does not expose an application version or update status.
6. Alternative Node Mode is present but has no short in-product explanation.
7. No formal performance budget or repeat-round memory measurement exists.

### P3 — future enhancements

1. Teacher-created puzzle tooling.
2. Optional anonymous, school-approved aggregate analytics.
3. Managed school roster integrations.
4. Native-store payment and distribution.

## Release order

1. Resolve P1 correctness, state-safety, geometry-evidence, and feedback issues.
2. Replace the repetitive catalog with at least 100 validated puzzles and verify rotation through simulation.
3. Add Quick Play, onboarding, Classroom Match, Tournament Mode, and entitlement boundaries.
4. Complete accessibility, privacy, offline, performance, progression, and landing-page work.
5. Pass the expanded automated gate and document human QA.
6. Conduct the planned teacher beta before making any commercial-readiness claim.
