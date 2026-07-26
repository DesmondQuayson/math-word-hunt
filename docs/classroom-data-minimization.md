# Classroom Data Minimization

Status: required design constraint for all future teacher work.

## Phase 1C.5B data

Production-default pages contain no saved classroom records. Optional local
fixtures use generic class labels and aggregate team/session values. They
contain no student names, emails, identifiers, rosters, free-form student
notes, individual scores, or device identifiers.

## Proposed minimum class shape

A future teacher-owned class needs only:

- opaque class ID;
- owning teacher ID, enforced on the server;
- teacher-recognizable class name;
- optional grade and period/section;
- active or archived state;
- created and updated timestamps.

Student membership is not part of this initial shape. Teachers should be told
not to put student names into class or section labels. Archive should be the
routine reversible action; destructive deletion and retention rules need owner,
privacy, and support approval.

## Activity, session, and report limits

Activities should reference curriculum IDs and configuration, not copied
student data. Initial participation remains team-based or anonymous. If managed
session persistence is approved, store only the aggregate facts necessary for
teacher review and recovery. Do not infer individual mastery, rank students,
build behavioral profiles, or retain raw interaction streams by default.

## Decisions required before persistence

Owner approval is required for retention periods, exports, deletion timing,
support access, organization ownership, education/privacy review, and any
student-linked information. Adding student accounts or identifiers is a new
product and privacy phase, not an incremental implementation detail.
