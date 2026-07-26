# Teacher Adapter Boundaries

Status: interface freeze only; no provider is connected.

## Repositories

- `TeacherProfileRepository`
- `ClassRepository`
- `ActivityRepository`
- `SessionRepository`
- `AggregateReportRepository`
- `CurriculumRepository`

Every teacher-owned read takes a trusted `UserId` first. `getById` returns an
explicit `TeacherResult`, not a nullable value that could blur unauthorized and
not-found outcomes. Writes accept validated domain records rather than database
rows or form data.

The boundary exposes no SQL, table names, provider filters, cookies, browser
storage, React types, Next.js types, Supabase types, or network response types.
There is no production implementation and no in-memory repository pretending
to be one.

## Read/write behavior

- List and get methods are ownership-scoped.
- Save methods may return unauthorized, unavailable, validation, not-found, or
  conflict results.
- Class archive and restore are distinct from deletion.
- Profile and class deletion create a request receipt only.
- Curriculum is read-only at this boundary.
- Aggregate-report saving is an internal future capability; it does not imply
  that browser or student input can write reports directly.

## Prototype fixture adaptation

The existing `teacher-fixtures.server.ts` constants may be mapped to read models
only when exact development/test prototype mode is enabled. That adapter must
remain server-only, visibly labeled, and unavailable in production. Browser
query, hash, cookie, storage, or JSON values cannot select a repository or grant
authority.

## Future provider rule

A future Supabase or other provider adapter must be server-only, validate every
provider response through these parsers, enforce teacher ownership independently
of browser input, map provider errors to the explicit result codes, and pass
cross-account negative tests. This phase does not approve or implement that
adapter.
