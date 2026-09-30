# MathNexa v1.2.18 — Super Admin "Sync with Stripe" database fix

Released 2026-09-30 under explicit owner approval (Phase 2A of the Super Admin programme).
**Database-only release: no runtime change and no Vercel deployment.**

| | |
| --- | --- |
| Version / tag | `v1.2.18` (annotated, tag object `a4af48d8`) |
| Release commit | `ad845c5` (branch `fix/admin-sync-billing-operation-check`) |
| Fix commit | `1d95ae3`. Tooling commits: `2216d09` (staging runner) and `ad845c5` (owner evidence tool). |
| Main | Fast-forwarded `ed5b47e..ad845c5`. This record follows as a docs commit. |
| Migration | `supabase/migrations/20260929100000_admin_sync_billing_operation.sql` |
| Rollback | `supabase/rollback/admin_sync_billing_operation.sql` (see below) |
| Production database | `hdtnbuowvdjwnkdqtdbv`, migration history 35 → 36 |
| Staging database | `gcmuhzxkwvfireyrearl`, migration history 36 → 37 (it holds the paused PH2-07 row) |
| Production runtime | **Unchanged**: build `b6337c8` (v1.2.17), deployment `dpl_14A8uM4MBvkPZhvXQLSdHADxzdBD` |

## Root cause

Super Admin "Sync with Stripe" always ended with `operation-failed`.

- Migration `20260907130000` taught `prepare_admin_account_operation` to accept `'sync-billing'`.
- The Phase 8G CHECK `admin_account_operations_operation_check` (`20260804000000`) was never widened.
- So the prepare INSERT raised `check_violation` and was rolled back **before Stripe was contacted**.
- Production had never stored a `sync-billing` row.

A read-only audit confirmed this on production and on staging before any change:

- the CHECK held eleven values;
- the prepare allow-list held twelve.

## Change

- The migration drops `admin_account_operations_operation_check` and re-adds it with the same eleven values plus
  `'sync-billing'`.
- The DROP is deliberately not `IF EXISTS`, so an unexpected shape fails closed.
- No function, grant, policy, trigger or row changes.
- No application code changed.
- New pgTAP suite `35_admin_sync_billing_operation.test.sql` (12 assertions) covers:
  - prepare, idempotent repeat, finish and audit for `sync-billing`;
  - the eleven earlier values still allowed;
  - unknown values, expired admin sessions and browser roles still rejected.
- Tooling:
  - `scripts/invoke-admin-sync-billing-production.ps1`:
    - `audit` and `verify` are read-only;
    - `migrate` needs `ADMIN_SYNC_BILLING_OWNER_APPROVED=yes`, dry-runs `db push`, refuses anything but this
      file, and proves the counts and the operations digest unchanged.
  - `scripts/invoke-admin-sync-billing-staging.ps1`:
    - `audit` and `verify` are read-only;
    - `apply` uses a single DO statement plus a history row, because staging `db push` is blocked by the
      remote-only PH2-07 row;
    - `contract` runs the database half of Sync with Stripe inside a statement that always rolls back.
  - `scripts/invoke-admin-sync-billing-owner-evidence.ps1`: read-only before/after evidence for one owner account.
    It uses SELECTs only, plus Stripe retrieve/list calls with a restricted `rk_live_` key only.

## Rollout

| Step | Result |
| --- | --- |
| Local: pgTAP without the fix | Failed as expected: `violates check constraint "admin_account_operations_operation_check"` |
| Local: pgTAP with the fix (clean reset) | 848/848, 36 files |
| Local: rollback drill (rolled back) | Pass: existing `sync-billing` rows kept, new ones blocked, other operations unaffected, re-apply validates |
| Staging audit → apply → verify | Pass. The CHECK has 12 values and is validated. Accounts, entitlements, billing customers, subscriptions, webhook events, operations, audit rows, admin users and auth users are unchanged. |
| Staging contract (rolled back, no residue) | Pass. See the list below the table. |
| Staging real Stripe round trip | **Not possible.** Staging has 0 billing customers, 0 subscriptions and 0 active admins. |
| Production audit (identity: pooler user, REST = pooler, 8/8 quiz fingerprint) | Pass. The CHECK lacked `sync-billing`, and only `20260929100000` was pending. |
| Production migrate | Pass. The dry run listed only this file, and history went 35 → 36. See the list below the table. |
| Production verify | Pass |

The staging contract proved:

- all 12 values are accepted and unknown values are rejected;
- `sync-billing` prepares, returns the same operation when repeated, finishes as succeeded, and writes the prepared and succeeded audit rows;
- expired sessions, admin identities as targets and browser roles are refused.

The production migrate stage left all of these unchanged:

| Row set | Count |
| --- | --- |
| Accounts | 21 |
| Auth users | 21 |
| Billing customers | 3 |
| Subscriptions | 3 |
| Entitlements | 3 |
| Complimentary grants | 0 |
| Webhook events | 24 |
| Operations | 1 (digest unchanged) |

After the push, the Supabase CLI warned that it could not cache its local pg-delta catalog (a missing temp
certificate). That is a local CLI cache step, not a database operation. The push finished and the history row
was recorded.

## Controlled production test (owner account)

The owner signed in to Super Admin with password + TOTP and pressed **Sync with Stripe** on their own
subscriber account. The banner read "sync billing succeeded."

Evidence was taken read-only before (10:15:15 UTC) and after (10:53:04 UTC):

| Field | Before | After |
| --- | --- | --- |
| Account | active, email confirmed, not an admin identity | unchanged (digest identical) |
| Subscription status (local / Stripe) | active / active | active / active |
| Period (local = Stripe) | 2026-09-06 22:17:50 → 2026-10-06 22:17:50 UTC | unchanged, still equal to Stripe |
| Cancel at period end / canceled / ended | false / none / none | unchanged (local and Stripe) |
| Latest invoice, last paid | same invoice, 2026-09-06 | unchanged |
| Entitlement | subscription-active through 2026-10-06, version 8 | subscription-active through 2026-10-06, version 10 |
| Last sync | 2026-09-08 08:47:49 UTC, source `reconciliation` | 2026-09-30 10:50:33 UTC, source `admin` |
| Billing customer row | — | unchanged (digest identical) |

The only fields that changed are these:

- the subscription's `last_synchronized_at`, `last_synchronization_source`, `latest_authoritative_event_created_at` and `updated_at`;
- the entitlement's `authoritative_version` and `updated_at`.

Operation and audit:

- `admin_account_operations` gained exactly one row: `sync-billing`, `succeeded`, no error code.
  - The before and after snapshots are identical: active / subscription-active / active.
  - The pre-existing `open-portal` row is unchanged.
- The owner's audit rows: `admin.account.operation.prepared` and `admin.account.operation.succeeded`, both
  `sync-billing`.
- All audit rows written since the before snapshot (2,087 → 2,092):
  - `admin.login.success`, `admin.mfa.success` and `admin.session.started` from the owner's sign-in;
  - the two operation rows.

No charge, refund or cancellation:

- **Stripe returned 0 events for the whole account between the two snapshots.** Any charge, refund,
  subscription change or cancellation creates an event.
- No webhook was received in the window.
- The subscription, its period, its cancellation fields and its latest invoice are identical in Stripe before
  and after.
- The sync code path calls only `customers.retrieve`, `subscriptions.list`, `invoices.retrieve`,
  `invoicePayments.list` and `paymentIntents.retrieve`.
- The restricted read-only key is not permitted to list charges or refunds directly (403). The event list
  above is the evidence instead.

No other customer's data changed:

- digests of every other account, subscription, entitlement and billing customer row are identical before and after;
- the complimentary grant set is identical;
- account, auth-user, subscription, entitlement, billing customer and webhook counts are identical.

### Finding: the confirm form was submitted twice

Production request logs show two `POST /admin/users/action` requests, at 10:50:29.06 and 10:50:32.07 UTC.
Both returned 303 and carried the same idempotency key.

- Only one operation row exists, and `finish` is a no-op on an already-finished operation.
- The synchronizer therefore ran twice, which is why the entitlement version rose by 2. The second write is at
  10:50:33.40, after the operation completed at 10:50:31.71.
- The effect was harmless: both runs only read from Stripe and re-applied the identical projection.
- It does expose two gaps, recorded for the next admin phase and **not changed in this release**:
  - the operation dialog's Confirm button has no pending/disabled state;
  - the route re-executes an operation's side effect when a duplicate request reuses a finished operation's key,
    and that second execution is not separately audited.
- Operations whose SQL function requires a `prepared` operation refuse the repeat. `sync-billing` and the
  portal operations run their side effect in the route, so they do not.

## Gates

| Gate | Result |
| --- | --- |
| pgTAP (clean reset) | 848/848 |
| Unit | core 245/245; web 774 passed, 1 skipped |
| TypeScript | clean |
| ESLint | platform-web 0 errors. The root `eslint .` has 1 pre-existing error on main (an unused import in the Tug production runner, not this change). |
| Phase 8G admin e2e (users and subscriptions) | 1/1 |
| Phase 8A admin e2e | 2 passed. 1 failed on main before this change: the spec expects Next's default 404 heading, but the site's heading has been different since `9e54cf7`. |
| Phase 8A security, billing security, security baseline | pass |
| Phase 8G security audit | Pre-existing failure on main: `account-operations.ts` selects `stripe_subscription_id`. That file was not touched. |

The three pre-existing gate failures are being fixed separately.

## Rollback

No application rollback is needed, because the same runtime serves before and after.

1. Run `supabase/rollback/admin_sync_billing_operation.sql` against the target database. It restores the
   eleven-value CHECK as `NOT VALID`, so any `sync-billing` rows already written are kept (they are audit
   evidence) while new ones are rejected again.
2. Optionally delete the `20260929100000` row from `supabase_migrations.schema_migrations` on that database.
3. Run `scripts/invoke-admin-sync-billing-production.ps1 -Stage verify`. It is then expected to FAIL:
   - `fix-migration-not-recorded` if you deleted the history row in step 2;
   - otherwise `operation-check-missing-or-not-validated`, because the restored rule is `NOT VALID`.

   Either failure confirms the rollback took effect.

Sync with Stripe then fails at prepare again, as it did before this release.
