# Teacher Information Contracts

Status: Phase 1C.5C structural freeze. Provider and persistence choices remain
future work.

## Public modules

The provider-independent contracts live under `packages/platform-core/src/teacher`:

- `teacher-profile.ts`
- `class-record.ts`
- `activity-definition.ts`
- `session-record.ts`
- `aggregate-report.ts`
- `curriculum-summary.ts`
- `teacher-dashboard.ts`
- `teacher-errors.ts`
- `repository-interfaces.ts`

All shapes use strings, numbers, booleans, null, and arrays of the same. No
Date, Map, Set, class instance, framework object, or provider response appears
in a public record.

## Frozen information

- Teacher profile: ID, display name, optional organization label, account
  status, created timestamp, updated timestamp.
- Class: ID, teacher owner, name, optional grade, optional period/section,
  active/archived status, archive timestamp, created/updated timestamps.
- Activity: ID, teacher owner, optional class, grade, topic, lesson, game mode,
  1–60 minute limit, 2–8 teams, Combine Mode, draft/ready, timestamps.
- Session: ID, teacher owner, activity, optional class, approved lifecycle
  status, aggregate team/term/response counts, lifecycle timestamps.
- Aggregate report: teacher-owned references, aggregate session/team counts,
  lesson percentages, neutral review categories, vocabulary strength/review
  categories, generated timestamp.
- Curriculum: grades, canonical counts, review flag, and four readiness states.
- Dashboard: minimal aggregate counts and current-v7 availability; this value is
  display information and never authorization authority.

The game-mode field is structurally frozen as a validated key, but the final
enumeration is deliberately not frozen because the owner has not approved the
initial mode list.

## Validation and denial

Every record parser accepts `unknown`, returns `TeacherResult<T>`, rejects
unknown keys, validates bounded strings/counts/statuses/timestamps, and never
throws for malformed input. Unknown or malformed shapes return a validation
failure. Unknown authorization returns `denyTeacherOperation()` and therefore
an explicit `unauthorized` result.

Result codes are unauthorized, unavailable, validation, not-found, and
conflict. Repositories must not convert unknown access into an empty successful
record.

## Archive, deletion, and retention

An active class has `archivedAt: null`; an archived class requires a timestamp.
Archive is reversible through the repository boundary. Teacher-profile and
class deletion expose request receipts only—there is no permanent delete method.

Retention periods, deletion completion, recovery windows, report expiration,
legal holds, exports, and support access remain unresolved owner/privacy
decisions. The contracts do not invent defaults for them.

## Explicit exclusions

Student names, emails, IDs, rosters, keystrokes, raw interaction streams,
behavioral tracking, inferred ability, hidden engagement, predictive analytics,
ranking, and unsupported mastery claims are absent. Strict parsers reject these
as unknown fields.
