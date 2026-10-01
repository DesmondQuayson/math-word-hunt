# MathNexa v1.2.19 — Secure 2-hour Super Admin session

Released 2026-09-30 under explicit owner approval (Phase 2B of the Super Admin programme). It applies only to the
Super Admin surface (`/admin`). Consumer sign-in, Supabase Auth session lengths, Stripe billing, subscriptions,
trials, entitlements, PDFs and games are unchanged.

| | |
| --- | --- |
| Version / tag | `v1.2.19` (annotated) → `2a0b578` |
| Release commits | `1b55e85` database, `eb86796` application, `ae7ee77` staging/production runners, `ed18ff0` security-review fixes, `2a0b578` deployment probe |
| Main | Fast-forwarded `03b1626..2a0b578`. This record follows as a docs commit. |
| Migration | `supabase/migrations/20260930100000_admin_two_hour_session.sql` (27 statements) |
| Rollback | `supabase/rollback/admin_two_hour_session.sql` (see below) |
| Production database | `hdtnbuowvdjwnkdqtdbv`, migration history 36 → 37 |
| Staging database | `gcmuhzxkwvfireyrearl`, migration history 37 → 38 |
| Production environment | Added `MVH_ADMIN_SESSION_MINUTES=120` (type Config, Production target only) |
| Production runtime | `dpl_26KQ7nG4MgyFEdHWRQ3jYS9MpWtZ`, build `2a0b578`, promoted 2026-09-30 18:08:33 UTC |
| Rollback runtime | `dpl_14A8uM4MBvkPZhvXQLSdHADxzdBD` (v1.2.17, build `b6337c8`), retained |

## Root cause

The owner was signed out of Super Admin after about 15 minutes.

- `lib/admin/config.ts` defaulted `MVH_ADMIN_SESSION_MINUTES` to 15, bounded to 5–30.
- The production Vercel project never set that variable.
- Even when set, the session could not exceed 30 minutes, because three things capped it there:
  - the database CHECK `admin_sessions_check1` (`expires_at <= started_at + 30 minutes`);
  - `start_admin_session`;
  - the configuration bound.

Other problems made long sessions unworkable:

- Expiry produced a concealing 404 with no way back.
- Form tokens expired after 10 minutes.
- Sensitive operations required a session younger than 5 minutes.
- The SameSite=Strict cookie dropped the session on links opened from other sites.
- A double-submitted operation could run its side effect twice. The v1.2.18 owner test recorded two POSTs.

## What changed

**Session lifecycle.** Every rule is enforced on the server, and the database is the final authority.

- Absolute lifetime of 120 minutes, fixed at the MFA sign-in.
  - Enforced by `admin_sessions_absolute_lifetime_check`.
  - `start_admin_session` rejects anything above 121 minutes and clamps to exactly 2 hours.
  - Activity never extends it.
- Idle timeout of 60 minutes.
  - `touch_admin_session` records activity at most once a minute, and only for a live session.
  - Only first-party requests (`Sec-Fetch-Site` same-origin or none) count as activity.
  - `require_admin_account_session` refuses idle sessions.
- Every protected request re-checks:
  - the kill switch and emergency flag;
  - the Supabase user and confirmed email;
  - admin membership and revocation;
  - MFA at AAL2;
  - the session's token, owner, revocation, sign-out, absolute expiry and idle expiry.
- An expired or idle session is ended server-side with reason `expired` or `idle-expired`.
- A countdown in the shell shows the time left until the absolute deadline.
  - It warns 10 minutes before the earlier deadline.
  - The idle warning offers **Stay signed in** (`POST /admin/session/activity`).
  - The countdown is informational only and never authoritative.

**Step-up MFA.**

- Operations that need a TOTP verification within the last 5 minutes:
  - account: suspend, restore, revoke sessions, emergency revoke, grant or remove complimentary access, submit or
    deny a refund review, and open the customer or cancellation portal;
  - the checkout and admin emergency switches;
  - the analytics retention job.
- The form asks for a code once the last verification is 4 minutes old.
- The factor is looked up on the server, and the code is verified with Supabase `challengeAndVerify`.
- `record_admin_step_up` records the verification without moving the absolute limit.
- Attempts are rate-limited per admin and network address, and also per session.
- Audit events: `admin.step-up.success` and `admin.step-up.failure` (a reason, never the code).

**CSRF.**

- Forms inside the shell carry a session-bound token: `v2.<issuedAt>.<nonce>.HMAC(secret, "v2.<session id>.<issuedAt>.<nonce>")`.
  It is valid for at most 121 minutes and only while its session is.
- The sign-in, MFA and account-switch forms keep the existing 10-minute pre-session token.
- Every mutation also requires an exact same-origin `Origin`.

**Cookie.** `mvh-admin-session` is:

- `HttpOnly`;
- `Secure`;
- `SameSite=Lax` (was Strict);
- limited to `Path=/admin`;
- set to expire at the absolute limit.

It holds an opaque 32-byte token, and only its SHA-256 is stored. No authority lives in browser storage.

**Expiry.**

- An administrator whose session expired, went idle or was lost is redirected to
  `/admin/sign-in?expired=1&next=<admin page>`, and returns there after password and MFA.
- `next` accepts only allow-listed admin pages on this origin.
- The concealing 404 stays for non-admins, revoked administrators, signed-out or emergency-revoked sessions, the
  disabled system and discovery attempts.

**Duplicate submissions.**

- In the browser, confirmation dialogs and admin forms lock on the first submit ("Processing…").
- On the server, `begin_admin_account_operation` reports whether this request created the operation.
  - Only the creating request runs the side effect.
  - A replay is answered with the recorded state and audited as `admin.account.operation.duplicate-suppressed`.

## Migration

`20260930100000_admin_two_hour_session.sql`:

1. Drops the 30-minute ceiling and the three-reason end rule. Each is located by its definition and must exist
   exactly once. They are dropped first so the migration can be re-applied after a rollback.
2. Adds `last_activity_at` and `step_up_at`.
   - Both are back-filled from `started_at`.
   - A before-insert trigger defaults them, and both are then NOT NULL.
3. Adds four rules:
   - the 2-hour lifetime;
   - four end reasons (adding `idle-expired`);
   - activity times inside the session window;
   - step-up times inside the session window.
4. Replaces `start_admin_session`, `end_admin_session` and `private.require_admin_account_session` (now idle-aware,
   with step-up freshness).
5. Adds:
   - `touch_admin_session`;
   - `record_admin_step_up`;
   - `begin_admin_account_operation`, which returns `(operation_id, created, operation_state)`.
6. Every new function is SECURITY DEFINER with an empty `search_path`, executable by `service_role` only.

It is backward compatible with the v1.2.17 runtime:

- new and back-filled rows give `step_up_at = started_at`, so "fresh" keeps its old meaning for the old runtime;
- `prepare_admin_account_operation` is kept.

## Tests (pre-release)

| Gate | Result |
| --- | --- |
| pgTAP (37 files, new `36_admin_two_hour_session` with 66 assertions) | 914/914 |
| Unit | core 245/245; web 827 passed, 1 skipped (admin + security baseline subset 148/148) |
| TypeScript | clean |
| ESLint | platform-web 0 errors. The root `eslint .` has 1 pre-existing error on main (Tug runner unused import). |
| Security audits | phase 8A, 8C, 8H, billing and baseline pass. Phase 8G fails only on the pre-existing `stripe_subscription_id` check on main. |
| Playwright: admin session lifecycle (see list below) | 2/2 |
| Playwright: phase 8C, 8G | 1/1, 1/1 |
| Playwright: phase 8A | 4/5. The failure is the pre-existing 404-heading copy test on main. |
| Local rollback drill | Rollback R1–R7 pass. Re-applying the migration after rollback (M1–M3) passes. |
| Independent security review | No critical, high or medium findings. Low findings were fixed in `ed18ff0`. |

The admin session lifecycle suite covers:

- the 2-hour Lax cookie and the countdown;
- a double click sending exactly one POST;
- a replay being suppressed and audited;
- a wrong step-up code, then the right one;
- the idle warning and Stay signed in;
- idle expiry with return to the same page;
- the absolute limit (it cannot be extended, and a POST after expiry is redirected);
- cross-site requests not counting as activity;
- sign-out with the cookie missing;
- rejected `next` values;
- the header at 390, 768, 1024 and 1440 px.

The three pre-existing gate failures are fixed on the separate branch `fix/main-gate-repairs`, which is **not part
of this release**.

## Staging

- Database `gcmuhzxkwvfireyrearl`:
  - applied with `scripts/invoke-admin-session-staging.ps1` (one DO statement plus the history row, because staging
    `db push` is blocked by the paused PH2-07 row);
  - verify passed;
  - the hosted contract passed: a 7,200-second lifetime and every rule, inside a statement that always rolls back.
- Preview `dpl_CV5UwM7XoB9CSgJSb6Hvu83oN7xQ`:
  - deployed with deployment-scoped admin enablement, a throwaway CSRF secret and 120 minutes;
  - unauthenticated probe 13/13;
  - removed after this release.
- A signed-in hosted test was not possible: staging has no active administrator, and credentials are never entered
  on hosted environments by automation.

## Production rollout

| Step | Result |
| --- | --- |
| Preflight audit (identity: pooler user, REST = pooler, 8/8 quiz fingerprint) | Pass. Only `20260930100000` was pending. Both old rules existed exactly once. 0 live admin sessions. |
| Schema drift check (whole `public`/`private` fingerprint, 1,487 objects) | No unexpected drift. Every object Phase 2B touches matched the tested reference, which also proves the rollback restores production's exact functions. See the note below the table. |
| Data baseline | Per-column digests of billing, subscription, webhook, account, entitlement, refund, deletion, operation and auth-user rows, plus PDF, game and CMS tables |
| Migrate | Pass. The dry run listed only this file. History went 36 → 37 with the other rows unchanged. See the note below the table. |
| Verify | Pass. Old ceiling gone; three new rules validated; `idle-expired` allowed; both columns NOT NULL; trigger present. The three functions are service-role only and definer-pinned. `service_role` still cannot UPDATE sessions. |
| Post-migration schema | Identical to the tested schema for all seven object kinds: columns 576, constraints 532, functions with ACLs 132, indexes 140, policies 16, tables with RLS flags 50, triggers 38 |
| Post-migration data | Every digest is unchanged |
| Environment | `MVH_ADMIN_SESSION_MINUTES=120` added on `mathnexa-platform-production`, Production only. Nothing else changed: CSRF secret, admin-enabled flag, Stripe, Supabase Auth. |
| Main | Fast-forward `03b1626..2a0b578`, with no force |
| Deploy | `dpl_26KQ7nG4MgyFEdHWRQ3jYS9MpWtZ` built with the production environment and no domain. Pre-promotion probes 6/6, health build `2a0b578`. |
| Promote | Apex moved to `dpl_26KQ…`. `dpl_14A8…` retained. |
| Live probes | 22/22 site checks: webhooks, canonical hosts, public pages, product gating, private no-store, admin fails closed, scheduler, fixture, game runtime, Tug gating, forged access, security headers, images |
| Admin security probe on the apex | 13/13: concealed without a session, forged and unknown cookies, signed-out POSTs, Stay signed in without a session, validated and untrusted `next` |
| Runtime logs after the promote | No 5xx and no error entries |

Notes on the rollout:

- **Drift check.** The 12 objects that differ are default `service_role` grants that hosted Supabase gives and the
  local stack does not: EXECUTE on 7 teacher/consumer functions, and DELETE on 5 consumer tables. They are
  documented in `20260801170000` and untouched by this release.
- **Migrate.** The first attempt lost its pooler connection during the read-only identity step, before anything
  was applied. A re-audit confirmed nothing had changed, and the retry applied the migration. After the push, the
  Supabase CLI's PostHog telemetry timed out on the next query; see Operational notes.

## Controlled production check (owner)

The owner signed in on 2026-10-01 at 00:03 UTC with password + TOTP and ran the agreed non-destructive checks.

The owner reported the check complete. The observation fields in the written report were left as template
placeholders, so the owner did not record what they saw. The outcomes below are proven by server evidence; the
countdown text and the MFA page copy are not server-observable.

| Check | Evidence |
| --- | --- |
| Sign-in | `admin.login.success` 00:03:09, `admin.mfa.success` (totp) 00:03:44 |
| 2-hour session | Session `b2994f8b` started 00:03:44.484 and expires 02:03:44.396: **120 minutes**. `admin.session.started` metadata `idle_timeout_minutes: 60`. This proves the environment change is live. |
| Past the old limit | Authorized navigation at 00:28–00:29, and an authorized step-up and portal operation at 00:29:55 (26 minutes after sign-in) |
| Sync with Stripe, double-clicked | **One** `POST /admin/users/action` (00:05:21.942 → 303) and **one** `sync-billing` operation (`044a55c0`, succeeded 00:05:27, no error). No `duplicate-suppressed` row was needed. The entitlement version rose by exactly 1 (10 → 11). In v1.2.18 it rose by 2. |
| Step-up | `admin.step-up.success` (totp) at 00:29:55.591. `step_up_at` and `last_activity_at` moved to that instant. No step-up failures. |
| Customer portal | `open-portal` (`993b52f6`) succeeded at 00:29:56. Stripe recorded `billing_portal.session.created`. |
| Audit | 2,092 → 2,100: exactly the 8 expected rows (login, MFA, session started, prepared and succeeded × 2, step-up success). No failure or security events. |

No charge, refund or cancellation:

- Stripe returned **exactly one event account-wide** since the release: `billing_portal.session.created` at 00:29:56.
- The subscription is active, `cancel_at_period_end=false`, with no cancel or end dates. Its period (to 2026-10-06)
  and latest invoice are unchanged.
- No webhook was received.

Only sync metadata changed:

- On the owner's subscription: `updated_at`, `last_synchronized_at` and `latest_authoritative_event_created_at`.
- On the owner's entitlement: `updated_at` and `authoritative_version`.
- Every other column and every other customer's subscription, entitlement, billing customer, account, refund,
  deletion, webhook and auth-user row is digest-identical to the pre-release baseline.
- PDF, game, CMS and topic tables are unchanged.
- The two pre-existing operation rows are unchanged.

## Rollback

**1. Application (fast; enough on its own).** Promote the retained deployment:

```powershell
$env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_14A8uM4MBvkPZhvXQLSdHADxzdBD'
$env:HOTFIX_VERCEL_CLI = "node $(Join-Path $env:LOCALAPPDATA 'npm-cache\_npx\67eb4586ca667318\node_modules\vercel\dist\vc.js')"
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

Or use `vercel promote dpl_14A8uM4MBvkPZhvXQLSdHADxzdBD --scope bright-path-ed-tech`.

The v1.2.17 runtime works against the migrated database:

- it ignores the new columns and functions;
- it still uses `prepare_admin_account_operation`;
- it treats `MVH_ADMIN_SESSION_MINUTES=120` as out of its 5–30 range and falls back to 15 minutes.

**2. Database (only if the schema itself must go back; always after step 1).**

- Run `supabase/rollback/admin_two_hour_session.sql` as one transaction:
  `psql --single-transaction -f …`, or wrap it in `BEGIN; … COMMIT;`.
- What it does:
  - ends live sessions longer than 30 minutes (`expired`);
  - restores the 30-minute ceiling and the three-reason end rule as `NOT VALID`, so historical 2-hour and
    `idle-expired` rows are kept as evidence;
  - restores the previous `start_admin_session`, `end_admin_session` and `require_admin_account_session`;
  - drops the three new functions, the trigger and the two columns.
- Afterwards, `scripts/invoke-admin-session-production.ps1 -Stage verify` is expected to FAIL (`session-schema-wrong`).
  That failure confirms the rollback.
- The migration can be re-applied later; the local drill proved it.

**3. Environment (optional).** Remove `MVH_ADMIN_SESSION_MINUTES` from the production project. The old runtime
ignores 120 anyway.

## Operational notes

- **Supabase CLI telemetry.** CLI 2.109 disables telemetry only for `SUPABASE_TELEMETRY_DISABLED=1` or `DO_NOT_TRACK=1`.
  - The release runners pass `"true"`, which is ignored, so a slow PostHog endpoint can fail a query that actually
    succeeded ("Timeout while shutting down PostHog").
  - Set `DO_NOT_TRACK=1` in the shell before running the runners.
- **Large results through the pooler.** Results of roughly 100 KB or more stalled intermittently on 2026-09-30.
  Small results and server-side md5 aggregates were reliable.

## Follow-ups (not started)

- Revoke `prepare_admin_account_operation` from `service_role` once v1.2.19 is settled. It is kept now so the
  rollback runtime keeps working.
- Make the release runners pass `SUPABASE_TELEMETRY_DISABLED=1`.
- Content-management RPCs check the admin session in the application, not in SQL. Database-level checks cover
  account operations only.
- Pre-existing gate repairs: branch `fix/main-gate-repairs`, a separate controlled release.
- Lax cookie: admin GET routes such as preview tickets and CSV or file downloads can be opened by another site in
  the owner's browser. They change nothing and do not count as activity. Accepted and documented in
  `docs/admin-session-policy.md`.
