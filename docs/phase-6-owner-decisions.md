# Phase 6 owner-decision register

Status: **Phase 6 readiness decisions approved; Phase 6B activation is NO-GO**.
These decisions close the readiness phase only. They do not authorize a hosted
mutation, participant account, invitation, email delivery, billing, public
access, Production deployment, or Phase 6B activation.

## Approved readiness decisions

| # | Decision | Owner decision |
| ---: | --- | --- |
| 1 | Pilot start date | Deferred until every Phase 6B prerequisite passes. |
| 2 | Pilot end date | Exactly 21 calendar days after the approved start date. |
| 3 | Duration | Three weeks. |
| 4 | Initial participant count | Three adult teachers. |
| 5 | Maximum participant count | Hard cap of five adult teachers; a sixth requires a new owner review. |
| 6 | Eligibility | Approved adult educators only; no students, minors, shared accounts, or unapproved users. |
| 7 | Participant identities | Recorded privately by the owner and never placed in source, documentation, logs, tickets, screenshots, or reports. |
| 8 | Organization labels | Disabled for the initial pilot; real school, district, classroom, and organization names are prohibited unless later approved. |
| 9 | Permitted teacher data | Only the minimum categories in [`phase-6-data-inventory.md`](phase-6-data-inventory.md). |
| 10 | Prohibited data | Student identity, roster, grade, work, IEP/disability, behavioral, sensitive-school, secret, password, token, payment, screenshot, upload, and raw authentication/provider data are prohibited. |
| 11 | Active-pilot retention | Keep only minimum permitted records while participation is active; restrict immediately after withdrawal, revocation, or a qualifying incident. |
| 12 | Post-pilot retention | No more than 14 calendar days after the pilot ends, followed by a documented cleanup review. |
| 13 | Support channel | One dedicated, tested, owner-controlled private channel; its address remains private and has not been supplied. |
| 14 | Security contact | Project owner; contact details remain private. |
| 15 | Incident owner | Project owner; a technical operator may assist, but pause, recovery, and reopening decisions remain with the owner. |
| 16 | Support expectation | Acknowledge within one business day; no 24/7 availability or guaranteed resolution time. |
| 17 | Security-incident response | Immediately pause affected access for serious privacy, security, RLS, authorization, secret, public-access, student-data, cleanup, or critical-accessibility incidents; resume only after verified correction and explicit owner approval. |
| 18 | Email provider | Not selected; this is a Phase 6B blocker. |
| 19 | Confirmation delivery | Not approved until end-to-end delivery, expiry, replay, redirect, generic-error, and enumeration protections pass. |
| 20 | Password recovery | Not approved until the complete recovery flow is tested safely. |
| 21 | Privacy language | Existing text approved as the Phase 6 readiness draft only; appropriate privacy or policy review remains required before invitations. |
| 22 | Acceptable use | Existing draft approved: adult teachers only, no student data, secrets, payments, public sharing, or use outside restricted Preview. |
| 23 | Feedback delivery | Participants may copy the local non-persistent summary into the approved private support channel; no persistence, analytics, replay, screenshots, uploads, automatic delivery, or third-party storage. |
| 24 | Success criteria | Complete charter criteria approved without weakening privacy, security, RLS, cleanup, authentication, gameplay, support, or accessibility requirements. |
| 25 | Stop criteria | All documented criteria approved, including student data, cross-account exposure, RLS/authorization failure, secret exposure, public Preview, unresolved security incident, critical accessibility failure, failed revocation, or failed cleanup. |
| 26 | Access revocation | Revoke Preview access, restrict the account, verify denial, revoke sessions when approved, and record sanitized evidence. |
| 27 | Withdrawal | Log out, revoke Preview access, restrict the account, inventory permitted data, and apply approved retention/deletion review; withdrawal is not automatic permanent deletion. |
| 28 | Cleanup responsibility | A designated technical operator performs cleanup; the project owner verifies record counts and evidence. |
| 29 | Rollback owner | Project owner. |
| 30 | Final go/no-go authority | Project owner. |

## Private information boundary

Participant identities, personal email addresses, contact details, the support
address, and private owner/operator contact records stay outside this
repository. No placeholder in source authorizes inventing or publishing them.

## Unresolved Phase 6B prerequisites

- exact pilot dates;
- private participant list;
- operating private support channel;
- selected and reviewed email provider;
- tested confirmation-email delivery;
- tested password-recovery delivery;
- final privacy/policy review;
- Phase 6B hosted deployment and verification plan; and
- a new explicit owner GO decision.

## Current activation decision

**NO-GO FOR PHASE 6B.** Technical readiness and these governance decisions do
not activate the pilot. Curriculum definitions still require teacher review,
and billing, Production, public access, permanent deletion, and student data
remain outside the approved scope.
