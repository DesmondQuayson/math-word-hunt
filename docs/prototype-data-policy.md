# Prototype Data Policy

Status: enforced by server adapter and regression tests.

## Default behavior

Prototype records are disabled by default. Production pages always return
honest empty or unavailable states. No environment file, browser storage,
cookie, URL parameter, hash, remote API, database, or JSON fixture file is used.

## Explicit local/test opt-in

The only switch is the server environment variable
`MVH_TEACHER_PROTOTYPE_MODE=enabled`. It is accepted only when `NODE_ENV` is
exactly `development` or `test`. Any missing, differently cased, malformed, or
unknown value disables fixtures. `NODE_ENV=production` disables fixtures even
when the variable is present and exact.

All records are frozen constants in
`apps/platform-web/lib/prototype/teacher-fixtures.server.ts`, which imports
`server-only`. Pages render them only on the server. Each fixture region uses a
`data-prototype-fixture` test marker and is preceded by a visible
“Demonstration data” notice.

## Verification

- Unit tests cover exact opt-in, malformed values, production denial, and the
  default empty state.
- Default Playwright tests attempt query, hash, cookie, local-storage, and
  session-storage activation and verify that no fixture appears.
- The separate `test:e2e:platform:prototype` command starts a development
  server with the exact switch and verifies labels and allowlisted routes.
- `test:production-default` starts the built production application with the
  switch maliciously set and rejects any fixture marker or sample label.
- The bundle audit continues to reject forbidden secrets and service clients.

The fixtures are not authorization data and cannot grant product access.
