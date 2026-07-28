# Phase 6 pilot charter

Status: draft for owner review. It is not legal advice, an invitation, or
approval to activate a pilot.

## Proposed pilot

- Cohort: 3-5 approved adult teachers.
- Duration: 2-4 weeks, with exact dates and duration undecided.
- Environment: restricted Preview only.
- Participants: adult educators only; no student participation.
- Commercial status: no payment, billing, or subscription activity.
- Release status: no Production activation or public launch.

## Supported use

- teacher email/password authentication in the already supported environment;
- teacher-only platform routes and session restoration;
- launching the canonical Math Vocabulary Hunt v7 game through its gateway;
- teacher-created class organization and activity planning already supported;
- account restriction and staged deletion-request behavior already supported;
- owner-controlled support, feedback, access, and revocation procedures.

## Unsupported use

Student accounts, names, identifiers, rosters, assignments, progress tracking,
managed classroom sessions, persisted reports, analytics, session replay,
billing, payments, organization licensing, SSO, public access, and Production
use are outside the pilot. Unsupported screens must remain disabled or plainly
labeled; demonstrations must not imply persistence.

## Proposed success criteria

Every participant can:

1. understand and acknowledge the adult-teacher-only and no-student-data rules;
2. sign in, restore a session, and log out using the supported test boundary;
3. reach authorized teacher routes without cross-account exposure;
4. create only the minimum permitted class/activity planning data;
5. launch and complete canonical gameplay with keyboard or Pointer Events;
6. find support, feedback, restriction, and exit instructions;
7. use critical workflows without an accessibility blocker.

Operational success additionally requires zero student information collected,
zero cross-account exposure, complete synthetic-fixture cleanup, successful
account restriction, and evidence for every activation checklist item.

## Immediate stop criteria

Stop access and begin incident handling for any student data entry,
cross-account exposure, authorization or RLS failure, secret exposure, public
Preview exposure, unresolved security incident, inaccessible critical
workflow, inability to restrict access, or inability to remove pilot fixtures.

The pilot coordinator uses the access-revocation runbook immediately. No
participant activity resumes until the incident owner and owner approve a
verified recovery.
