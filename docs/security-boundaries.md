# Security Boundaries

Status: requirements for future platform implementation. No security provider
or server is added in Phase 1B.

## Trust boundaries

The browser is untrusted. Form fields, DOM state, JavaScript variables, query
strings, referrers, cookies readable by scripts, local/session storage, cached
responses, and success-page navigation can be changed by a user. They may
carry display hints but cannot establish identity, role, payment, license, or
entitlement.

A future server must verify the session, derive the internal user ID, validate
catalog keys, and ask the entitlement service for protected access. The server
must enforce authorization on every protected operation even if the UI hides
the corresponding control.

## Authentication and session requirements

- Use a maintained authentication system with secure, HTTP-only, same-site
  cookies or an equivalently reviewed session mechanism.
- Rotate sessions after authentication and privilege change; support
  revocation and bounded expiry.
- Apply CSRF protection where browser credentials are ambient.
- Rate-limit login, recovery, invitation, and other abuse-sensitive paths.
- Never log credentials, session tokens, one-time links, or full provider
  payloads.

Provider selection, login methods, and recovery policy require owner approval.

## Authorization and data isolation

Entitlements is the only product-access authority and denies unknown values.
Application authorization and database Row Level Security (RLS) restrictions
must both use the verified user ID. RLS is defense in depth, not a replacement
for server authorization. Each data adapter exposes purpose-specific methods
rather than arbitrary client queries. Administrative operations require a
separate role, explicit checks, and audit events.

Required negative tests include user A reading or changing user B's profile,
entitlements, reports, organization membership, license assignments, and
billing references. Tests must also cover forged IDs, stale sessions, revoked
grants, expired grants, unknown keys, and replayed provider events.

## Secret and provider boundaries

Secrets, including any future database service-role secret, live only in a
managed server secret store and are never committed, embedded in static files,
prefixed for browser exposure, or copied into logs. A service-role credential
must never reach the browser and may be used only in narrowly scoped trusted
server code. Use separate credentials per environment, least-privilege scopes,
documented rotation, and prompt revocation after suspected exposure. Future webhooks must
verify signatures against the raw request, reject stale/replayed events, and
use a unique provider event ID for idempotency.

Billing state does not directly unlock the product. A verified, idempotent
server reconciliation command updates an entitlement, and the entitlement
policy makes the subsequent access decision.

## Privacy, retention, and observability

Collect the minimum adult teacher profile data. Avoid student accounts and
direct student identifiers in the first release. Logs use correlation IDs and
non-sensitive IDs; they exclude names, email addresses, curriculum responses,
tokens, and raw payment data unless an approved purpose requires a narrowly
controlled field.

Before launch, publish retention periods for profiles, entitlement history,
security events, support logs, and any provider payloads. Deletion requests
must be authenticated, auditable, reversible during a short safety window if
approved, and reconciled with accounting/security retention. Backups require a
documented expiry and deletion propagation process.

## Failure behavior

Malformed input and unknown keys deny. Protected writes use transactions where
partial completion could broaden access. Dependency failures must not convert
to allow. Error responses disclose no cross-account existence, secrets, stack
traces, or provider internals. The static v7 product remains the rollback
baseline during migration, but rollback must not bypass access rules once a
protected feature is launched.
