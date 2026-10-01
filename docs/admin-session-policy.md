# Super Admin session policy (Phase 2B)

Applies only to the Super Admin surface (`/admin`). Normal MathNexa accounts,
Supabase Auth session lengths, Stripe billing, subscriptions, trials and
entitlements are unchanged.

## Lifecycle

| Rule | Value | Enforced by |
| --- | --- | --- |
| Absolute lifetime | 120 minutes from the MFA sign-in that starts the session (`MVH_ADMIN_SESSION_MINUTES=120`). Never extended by activity. | `admin_sessions_absolute_lifetime_check`, `start_admin_session()` (clamps a request up to 1 minute over to exactly 2 hours; rejects longer), `decideAdminAccess()` |
| Idle timeout | 60 minutes without an authorized admin request. | `require_admin_account_session()`, `touch_admin_session()`, `record_admin_step_up()`, `decideAdminAccess()` |
| Activity | Any authorized admin request (page, form, download). Written at most once a minute and never past `expires_at`. | `touch_admin_session()` (throttled in SQL too), `admin_sessions_activity_window_check` |
| Step-up freshness | Sensitive operations need a TOTP verification (the sign-in MFA counts) within the last 5 minutes. | `require_admin_account_session(..., true)`, `ensureAdminStepUp()` |
| Warning | The shell warns 10 minutes before the session would end. | `AdminSessionNotice` (informational only) |

Every protected request re-checks, on the server: the kill switch and emergency
flag, the Supabase user and confirmed email, `admin_users` membership and
revocation, MFA enrollment and AAL2, and the admin session (token, owner,
revocation, sign-out, absolute expiry, idle expiry). A session found expired
or idle is ended server-side with reason `expired` or `idle-expired`.

The browser never holds authority. The session cookie is an opaque random
token (only its SHA-256 is stored); nothing is kept in `localStorage` or
`sessionStorage`; the countdown only displays server-provided deadlines.

## Step-up MFA

Operations that need a fresh step-up:

- account: suspend, restore, revoke sessions, emergency revoke, grant or remove complimentary access, submit or deny a refund review, open the Stripe customer or cancellation portal;
- operations: the checkout and admin emergency switches, the analytics retention job.

When the last verification is older than 4 minutes (the 5-minute window with
a 1-minute safety margin, so the database's own check cannot lapse halfway
through a multi-step operation), the confirmation form shows an
**Authenticator code** field. The code is verified by Supabase Auth
(`challengeAndVerify`) against the administrator's own enrolled TOTP factor
(the factor is looked up on the server, never taken from the form) and on
success is recorded as `step_up_at` (`admin.step-up.success`). Attempts are
limited to 5 per 5 minutes (then a 15-minute block) both per administrator
and network address and per admin session regardless of address; these
limits are separate from the sign-in MFA limit, so failed step-ups never
lock the owner out of signing in. Failures are audited as
`admin.step-up.failure` with a reason, never the code. The session is not
restarted and its absolute limit does not move.

Ordinary operations (for example Sync with Stripe, resend confirmation,
support notes, content publishing) need only a valid session.

## CSRF

- **Session-bound (v2)** for every form inside the Super Admin shell:
  `v2.<issuedAt>.<nonce>.HMAC(secret, "v2.<admin session id>.<issuedAt>.<nonce>")`.
  A token is useless for any other admin session. It is accepted only while its
  session is valid (routes authorize the session first) and for at most the
  longest possible session (2 hours + 1 minute), so forms no longer expire
  after 10 minutes.
- **Pre-session (v1)**, 10 minutes, for the sign-in, MFA and account-switch
  forms, which run before any admin session exists.
- Every state-changing request also requires an exact same-origin `Origin`.

## Cookie

`mvh-admin-session`: `HttpOnly`, `Secure` (outside plain-HTTP loopback
development), `SameSite=Lax`, `Path=/admin`, `Expires` = the absolute session
end. Lax (was Strict) keeps the session when an admin link is opened from
another site; cross-site POSTs still carry no cookie, and every mutation also
needs the session-bound token and a same-origin `Origin`. Admin GET routes do
not change account, billing or content data (they render pages, exports,
file and thumbnail downloads, and short-lived preview tickets). Because Lax
lets another site open an admin page for a signed-in owner:

- only the administrator's own requests (`Sec-Fetch-Site` of `same-origin`
  or `none`) count as idle activity, so a page opened from another site never
  keeps a session alive;
- one-shot result banners are shown only after a same-origin navigation (our
  own post-then-redirect), so a link cannot put its own text into the admin
  workspace.

## Expiry experience

A still-authorized administrator whose session expired, went idle or was lost
by the browser is redirected to
`/admin/sign-in?expired=1&next=<admin page>`; after password and MFA they
return to that page. `next` is accepted only for known admin pages on this
origin (`/admin`, `/admin/resources/<id>`, `/admin/games/<id>/preview`,
`/admin/map-prep`); anything else (other sites, protocol-relative URLs, API
routes, the sign-in or MFA pages) is dropped. A form posted after expiry is
redirected the same way and is not run.

Non-admins, revoked administrators, sign-out replays, emergency-revoked
sessions, a disabled admin system and discovery attempts keep the concealing
404.

## Duplicate submissions

- The confirmation dialog and the other admin mutation forms lock on the first
  submission ("Processing…"); a second submit event is cancelled.
- Server-side, `begin_admin_account_operation()` reports whether this request
  created the operation. Only the creating request runs the side effect; a
  double click, retry or replayed form (same idempotency key) is answered with
  the recorded state (`already-completed`, `already-in-progress`, ...) and
  audited as `admin.account.operation.duplicate-suppressed`. No Stripe or
  account side effect can run twice.

## Audit events

`admin.session.started` (with expiry and idle timeout), `admin.session.ended`
with reason `signed-out` / `expired` / `idle-expired`, emergency revocation via
`admin.revoked` or the audited `admin-emergency-disabled` switch,
`admin.step-up.success`, `admin.step-up.failure`,
`admin.account.operation.duplicate-suppressed`. Passwords, TOTP codes, raw
session tokens, CSRF secrets and provider secrets are never logged.

## Rollback

Migration `20260930100000_admin_two_hour_session.sql`, rollback
`supabase/rollback/admin_two_hour_session.sql`. Roll the application back
first (the previous runtime ignores the new columns and functions), then run
the rollback file: it ends live sessions longer than 30 minutes, restores the
30-minute ceiling and three end reasons as `NOT VALID` (evidence rows are
kept), restores the previous functions, and drops the new ones and the two
columns. The migration can be re-applied afterwards.

### Legacy `prepare_admin_account_operation` (kept on purpose)

The current runtime (v1.2.19 onwards) never calls
`public.prepare_admin_account_operation`; it uses
`begin_admin_account_operation`, which adds the `created` flag and duplicate
suppression. The legacy function stays, unchanged and executable by
`service_role` only, because **v1.2.17 (`dpl_14A8uM4MBvkPZhvXQLSdHADxzdBD`,
build `b6337c8`) is still an accepted rollback runtime** and its
`/admin/users/action` route prepares every account operation through it.
Revoking it now would make that rollback fail closed on every account
operation.

Retire it only when v1.2.17 is no longer an accepted rollback, in its own
small migration: revoke `EXECUTE` from `service_role` (do not drop the
function — the historical rollback files recreate or drop it). That migration
must also:

- update `supabase/tests/database/22_phase8g_users_subscriptions.test.sql`,
  which expects `service_role` to execute it in its privilege matrix and, under
  `set local role service_role`, calls it directly to drive the suspend,
  restore and grant flows — move those calls to
  `begin_admin_account_operation`;
- review the direct calls in `35_admin_sync_billing_operation.test.sql`;
- retire the v1.2.18 staging contract in `scripts/run-admin-sync-billing-staging.mjs`,
  which calls it, and mark the v1.2.7 runners that inspect its definition
  (`run-subscription-lifecycle-*.mjs`) as historical.
