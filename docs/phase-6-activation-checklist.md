# Phase 6 activation checklist

Status: **current NO-GO for Phase 6B**. Owner-approved readiness decisions are
recorded below, but activation requires every unchecked prerequisite and a new
explicit owner GO decision.

## Approved Phase 6 readiness decisions

- [x] Three-week duration, three initial adult teachers, and a hard cap of five.
- [x] Adult educators only; no students, minors, shared accounts, or unapproved users.
- [x] Participant and contact information stays in private owner records.
- [x] Organization labels are disabled for the initial pilot.
- [x] Minimum permitted data and absolute prohibited-data boundaries approved.
- [x] Active-data minimization and maximum 14-day post-pilot review window approved.
- [x] One owner-controlled private support channel and one-business-day acknowledgement approved in principle.
- [x] Project owner assigned as security contact, incident owner, rollback owner, and final go/no-go authority.
- [x] Complete success, immediate-stop, revocation, withdrawal, and cleanup procedures approved.
- [x] Existing privacy and acceptable-use text approved as readiness drafts, not final legal advice.

## Technical readiness evidence

- [x] `npm run phase6:verify` passed at `1d524ed3bc9f52b6830e046765b263e0ff9d6521`.
- [x] Restricted Preview disclosure, anonymous denial, teacher-only authentication, session restoration, RLS, account status, and reciprocal cross-account denial passed.
- [x] Canonical keyboard and Pointer Events gameplay passed with protected hashes.
- [x] Critical workflows passed the accessibility and viewport matrix.
- [x] Security, secret, dependency, no-student-data, billing-negative, real-email-negative, and analytics/session-replay-negative audits passed.
- [x] Synthetic fixtures and Auth users returned to zero.

## Unresolved Phase 6B activation prerequisites

- [ ] Approve exact pilot start and end dates.
- [ ] Record the three initial participant identities privately.
- [ ] Supply and test the private support channel outside the repository.
- [ ] Select and review an email provider.
- [ ] Pass confirmation-email delivery, expiry, replay, redirect, generic-error, and account-enumeration checks.
- [ ] Pass the complete password-recovery delivery flow.
- [ ] Complete appropriate final privacy/policy review.
- [ ] Approve and execute a separately controlled Phase 6B hosted deployment and verification plan.
- [ ] Reconfirm access, revocation, incident, cleanup, and rollback operators for the activation window.
- [ ] Record a new explicit owner **GO FOR PHASE 6B** decision.

Any unchecked item means NO-GO. Student data, public exposure, unresolved
security/RLS defects, inaccessible critical workflows, failed revocation, or
failed cleanup remain automatic stop conditions. This checklist does not
authorize Production, billing, public access, or permanent deletion.
