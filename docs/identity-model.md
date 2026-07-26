# Identity Model

Status: Phase 1B future contract. No authentication system is implemented or
selected.

## First identity boundary

The first planned account type is an adult teacher account. The platform uses
a stable internal `UserId` rather than an email address as a foreign key.
Email, credential, session, and verification details belong to a future
authentication provider or adapter and should not be copied broadly across
domain tables.

The Phase 1B profile contract contains user ID, display name, account status,
platform role, and timestamps. Account statuses are active, suspended,
deletion-requested, and closed. Roles are teacher and platform-admin. Admin is
not a paid tier and does not automatically grant product access.

## Separation of concerns

- Authentication proves which user is making a request.
- Identity supplies the internal user and account lifecycle.
- Authorization determines whether that user may perform an operation.
- Entitlements decides product and feature access.

An authenticated user is not automatically entitled. A paid or licensed user
still cannot cross account boundaries. A browser-supplied user ID, role, or
email is never trusted without server verification.

## Account lifecycle

Account creation must bind one verified provider subject to one internal user
ID. Suspension prevents new protected activity without erasing audit or
commercial records. A deletion request starts a documented workflow rather
than immediately destroying records needed for security, accounting, or legal
retention. Closure removes login capability and anonymizes or deletes eligible
personal data on the approved schedule.

## Student-data boundary

The initial platform should avoid student accounts and direct student
identifiers. Classroom gameplay can remain teacher-led and locally displayed.
If reporting is later approved, use pseudonymous participant/session IDs and
collect the minimum needed. Names, emails, rosters, voice recordings, and
free-form student text require a separate privacy, retention, and school-use
review before implementation.

## Open decisions

The owner must later approve authentication provider, supported login methods,
account recovery, verified-email requirements, minimum teacher age and terms,
admin provisioning, and whether school-managed identity is needed.
