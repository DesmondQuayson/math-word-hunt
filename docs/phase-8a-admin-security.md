# Phase 8A admin security foundation

Phase 8A adds only the owner identity, TOTP MFA, server authorization, short privileged sessions, append-only audit evidence, protected empty storage, emergency revocation, and a non-functional shell. It does not add Games, MAP Prep, Homework, Quiz, Users, Subscriptions, Analytics, Media Library, CMS, or Settings functionality.

## Security boundary

- Supabase Auth establishes the underlying verified email/password identity.
- `public.admin_users` is a separate, server-owned allowlist. The only role is `owner`. Browser role claims, account metadata, subscriber records, cookies, and local storage have no authorization authority.
- TOTP factors are enrolled and verified by Supabase Auth. The application never persists the TOTP secret; Supabase Auth owns its encrypted-at-rest factor storage. The setup key and QR payload are returned only to the active enrollment screen and are never written to application logs or audit metadata.
- Every protected page calls the server data-access layer. It verifies the Auth user, active allowlist row, AAL2, `mfa_enrolled`, the opaque admin-session cookie hash, the server session row, its owner, expiry, end state, and revocation state.
- Admin session tokens are random and only their SHA-256 hashes are stored. Sessions default to 15 minutes and cannot exceed 30 minutes. Expiry, sign-out, and emergency revocation are checked server-side.
- State-changing Server Actions require a short-lived HMAC-signed form token and an exact same-origin request. Login and MFA verification use persistent database rate limits.
- Authenticated non-admins receive a real 404. Unauthenticated `/admin` requests are redirected to the owner credential flow without receiving shell content.

This follows the current [Next.js authorization guidance](https://nextjs.org/docs/app/guides/authentication), including database-backed secure checks close to the data source and independent checks in Server Actions. TOTP follows the current [Supabase MFA flow](https://supabase.com/docs/guides/auth/auth-mfa/totp), and database/storage boundaries follow [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [Storage access-control guidance](https://supabase.com/docs/guides/storage/security/access-control).

## Environment contract

All values are server-only. Nothing may use a `NEXT_PUBLIC_` alias.

| Variable | Contract |
| --- | --- |
| `MVH_ADMIN_ENABLED` | Single kill switch. Only exact `true` exposes the admin flow; every other value hard-disables it. |
| `MVH_ADMIN_CSRF_SECRET` | 32–256 printable characters from the environment's managed secret store. Required when enabled; missing/malformed fails closed. |
| `MVH_APPLICATION_ORIGIN` | Exact canonical origin used for same-origin validation and cookie security. HTTPS is required except for non-production loopback development. |
| `MVH_ADMIN_SESSION_MINUTES` | Optional integer from 5 through 30. Default is 15; invalid values return to 15. |
| `MVH_ADMIN_REVOCATION_APPROVAL` | Emergency CLI hosted guard. Exact `owner-approved` plus the exact project ref is required for hosted execution. It does not enable the UI. |

Local Supabase enables Storage and TOTP in `supabase/config.toml`. No real environment value belongs in Git.

## Data and storage

- `admin_users`: owner allowlist and immutable revocation state.
- `admin_sessions`: server-owned hashed tokens, AAL2 assertion, bounded expiry, end and revocation state.
- `admin_audit_log`: append-only security events. Login success/failure, MFA success/failure, session start/end, and revocation are recorded. Application roles have no update, delete, or truncate privilege; a trigger also rejects owner-level row mutation.
- `admin_auth_rate_limits`: server-only atomic login/MFA counters keyed by an HMAC pseudonym rather than raw email.
- `admin-assets`: empty, private, 10 MiB maximum, raster-image MIME allowlist. Restrictive bucket/object policies deny anonymous and authenticated browser roles. No upload interface exists.

IP and user-agent values are audit context only and never authorization authority. Passwords, Auth tokens, session tokens, TOTP setup material, provider keys, and Stripe data are prohibited from audit metadata.

## Owner provisioning

Phase 8A deliberately has no browser provisioning route. A reviewed server-side operation must create the Supabase Auth user and then insert one `admin_users` row with `role='owner'`. Creating an Auth user, setting metadata, or changing a browser/JWT claim alone does not grant admin access. No production owner was provisioned in this phase.

## Emergency revocation

1. Independently confirm the target Auth user UUID and environment.
2. Disable the UI globally with `MVH_ADMIN_ENABLED=false` if the incident may involve the whole admin surface.
3. Run the dry-run from a trusted operator shell whose server-only Supabase variables already target the intended environment:

   `npm run admin:revoke -- --user-id <auth-user-uuid> --reason "<incident reason>"`

4. For local execution, add `--execute`. Hosted execution additionally requires `--confirm-hosted-ref <exact-ref>` and an externally supplied `MVH_ADMIN_REVOCATION_APPROVAL=owner-approved`.
5. The transaction sets `admin_users.revoked_at`, ends/revokes every matching `admin_sessions` row, and appends `admin.revoked`. Existing client cookies immediately lose admin authority because every request rechecks the database.
6. Verify the audit event and keep the feature flag disabled until incident review is complete.

The CLI never prints provider credentials or user email. It reports only whether execution was a dry run and the count of invalidated admin sessions.

## Rollback

1. Set `MVH_ADMIN_ENABLED=false`.
2. Confirm no admin operation is active and the `admin-assets` bucket is empty.
3. Run `supabase/rollback/phase8a_admin_security_foundation.sql` through the approved migration process.
4. The rollback refuses a non-empty bucket, drops only Phase 8A policies/functions/tables, and does not reference consumer, billing, game, historical, or backup data.
5. Re-run the Phase 7E verification gate and protected hashes.

## Verification

`npm run phase8a:verify` reuses the complete Phase 7E gate, rebuilds the local database from empty, runs all pgTAP tests, runs Phase 8A unit and real local browser MFA/revocation coverage, audits scope and secrets, checks Git whitespace, and reconfirms every protected file diff and canonical hash.
