# Teacher Experience Architecture

Status: Phase 1C.5B workflow prototype; no persistence or service integration.

## Product boundary

The teacher experience is an isolated Next.js App Router prototype in
`apps/platform-web`. It helps an owner evaluate navigation, language,
accessibility, information hierarchy, and future workflows. It does not create
accounts, classes, activities, sessions, reports, or entitlements.

Static v7 remains the only playable classroom product. `/play` opens the
canonical `docs/index.html` through a configured legacy-game URL; the platform
does not embed, copy, or rewrite its gameplay.

## Information architecture

The persistent teacher rail uses this order:

1. Overview — choose the next classroom task.
2. Classes — group teacher-owned work without a student roster.
3. Activities — choose curriculum and game settings.
4. Live Sessions — distinguish current shared-display play from a future
   managed session.
5. Reports — review aggregate lesson and session information.
6. Curriculum — check readiness, thin lessons, gaps, and review status.
7. Account — understand future profile, security, deletion, and subscription
   boundaries.

The rail is visible on desktop, tablet, and mobile. The active destination uses
`aria-current="page"` and visible text, so meaning does not depend on color.

## Component boundaries

- Route files assemble server-rendered page structure.
- `TeacherShell` owns teacher navigation and the field-map rail.
- `components/teacher` contains workflow cards, steppers, metrics, status
  summaries, and the aggregate report table.
- `components/forms` contains client-side validation prototypes. A successful
  check explicitly says that nothing was saved or assigned.
- `lib/adapters/curriculum-summary.ts` provides a small, non-authoritative
  readiness summary. A future content adapter must replace hard-coded choices.
- `lib/prototype/teacher-fixtures.server.ts` is the only fixture source and is
  guarded by a server-only, non-production switch.

## Trust boundaries

URL parameters, hashes, cookies, local storage, session storage, and client
form values have no authority to enable fixtures or grant access. Unknown class
identifiers return an empty state. Premium access continues to deny by default.
Future identity, ownership, entitlement, and persistence checks belong in
trusted server adapters and are not simulated here.

## Future work

Authentication, teacher profiles, database schemas, Row Level Security,
managed sessions, reporting persistence, subscription state, and deployment
are future phases. This document does not approve any of them.
