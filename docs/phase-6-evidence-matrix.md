# Phase 6 evidence matrix

Status: working readiness record. A pass means locally verified, not activated.

| Area | Required evidence | Readiness state |
| --- | --- | --- |
| Phase 5 baseline | complete `npm run phase5:verify` | required before implementation and inside final gate |
| Governance | charter, data inventory, draft policy, retention choices, support and runbooks | owner approval pending |
| Pilot policy | default/missing/malformed inactive; readiness distinct from activation | automated unit tests required |
| Pilot UI | persistent disclosure; onboarding, privacy, support, feedback, exit routes | local browser evidence required |
| Data minimization | no student fields; obvious prohibited patterns rejected; no feedback persistence | static, unit, and browser evidence required |
| Identity/authorization | signed-out and restricted denial; generic auth errors; reciprocal cross-account denial | existing and Phase 6 harnesses required |
| Gameplay | gateway, canonical keyboard, canonical Pointer Events, historical v5 | protected suites required |
| Accessibility | landmarks, h1, keyboard, focus, 44px, reduced motion, forced colors, spacing, zoom/reflow, viewport matrix | browser evidence required; not a conformance claim |
| Operations | safe events/correlation IDs, restriction rehearsal, cleanup to zero | deterministic tests required |
| External boundaries | no email delivery, analytics, session replay, live billing, deployment, or provider mutation | negative scans and run record required |
| Security | bundle/tracked secret scans, production-default audit, dependency audit | final verification required |
| Integrity | protected hashes, historical diff, `git diff --check`, production build | final verification required |

Evidence must record command, result, date, commit, and any warning without
including personal data, secrets, bypass values, or provider sessions.
