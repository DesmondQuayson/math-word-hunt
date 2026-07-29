# Phase 6 evidence matrix

Status: **technical readiness accepted and governance decisions recorded;
Phase 6B remains NO-GO**. A pass is evidence, not activation authority.

| Area | Recorded evidence | Current state |
| --- | --- | --- |
| Phase 5 baseline | Complete baseline included in `npm run phase6:verify` | passed |
| Governance | Charter, data inventory, retention, support, runbooks, owner decisions, and stop rules | readiness decisions approved |
| Pilot dates and identities | Start deferred; end is start plus 21 days; identities stay in a private owner record | Phase 6B blocker |
| Pilot scope | Three initial and no more than five approved adult teachers; three weeks; organization labels disabled | approved for readiness only |
| Pilot policy | Missing, malformed, unknown, and requested-active values stay inactive | passed |
| Pilot UI | Persistent inactive/restricted, adult-teacher-only, no-student-data, no-billing, support, feedback, and exit disclosure | passed locally |
| Data minimization | Minimum permitted inventory, prohibited-data validation, no feedback persistence, 14-day maximum post-pilot review window | approved and tested locally |
| Identity/authorization | Signed-out and restricted denial, generic auth errors, session restoration, reciprocal cross-account RLS denial | passed |
| Gameplay | Canonical v7 keyboard and Pointer Events plus historical v5 | passed |
| Accessibility | Landmarks, keyboard, focus, 44px, reduced motion, forced colors, spacing, zoom/reflow, and viewport matrix | passed; not a conformance claim |
| Operations | Safe events, restriction, revocation, withdrawal, cleanup responsibilities, and zero synthetic counts | passed locally; activation operators must be reconfirmed |
| Support and incidents | Owner-controlled private channel, one-business-day acknowledgement, owner incident authority, immediate stop rules | policy approved; channel not supplied/tested |
| Email and recovery | Real-email negative boundary preserved | provider unselected; confirmation and recovery remain blockers |
| Privacy/policy | Existing language approved as readiness drafts | final appropriate review remains a blocker |
| External boundaries | No provider mutation, hosted participant, real email, live billing, public access, or Production deployment | preserved |
| Security | Bundle/tracked-secret, production-default, billing, capability, student-data, dependency, and negative scans | passed |
| Integrity | Production builds, `git diff --check`, historical protection, protected SHA-256 hashes | passed |
| Activation authority | Project owner | current decision: NO-GO |

Evidence must continue to omit identities, personal email addresses, private
contact details, secrets, bypass values, provider sessions, screenshots, and
raw payloads.
