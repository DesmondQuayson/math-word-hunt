# Phase 6 retention and deletion decision framework

Status: proposed choices for owner review. No final retention duration is
approved, and permanent deletion remains disabled.

## Categories and current treatment

| Category | Current pilot-readiness treatment |
| --- | --- |
| Authentication identity | no real pilot identity is created in Phase 6; future provider removal is a separate checkpoint |
| Profile, class, activity | restricted immediately after an accepted deletion request; eligible records await approved manual execution |
| Entitlement/billing projection | disabled/test-only; resolve obligations before any future identity removal |
| Sanitized operational evidence | retain only stable codes, safe correlation IDs, and minimum incident facts |
| Synthetic fixtures | remove at the end of every rehearsal and verify zero final counts |

## Retention decision

The owner must select and approve a duration before activation:

1. **Recommended: short fixed post-pilot window.** Keeps a bounded period for
   participant follow-up and incident review, then requires reviewed cleanup.
   It balances support with data minimization but creates a scheduled owner task.
2. **Delete eligible participant planning data at confirmed exit.** Minimizes
   data fastest but leaves less time to resolve mistaken exit or support issues.
3. **Retain through a longer evaluation window.** Supports extended comparison
   but increases privacy exposure and operational responsibility; select only
   with a documented purpose and end date.

The decision must separately cover profiles/planning data, sanitized support
evidence, Auth identity, backups, and any legal/incident hold.

## Procedures

- **Immediate restriction:** change account status through the existing trusted
  operator boundary; verify protected reads/writes fail closed.
- **Withdrawal:** log out, revoke Preview access, restrict the account, record a
  sanitized event, and open staged deletion review if requested.
- **Deletion request:** keep the existing request -> restricted -> cooling-off
  lifecycle. Browser reversal and irreversible execution remain unavailable.
- **Manual owner duty:** verify identity, scope records, resolve holds or
  obligations, approve the final plan, and separately coordinate application
  and provider deletion if a later phase enables execution.
- **Fixture cleanup:** follow the checklist, remove disposable synthetic users
  and owned records, and prove final counts are zero.

Failure to restrict access or clean up a fixture is an immediate pilot stop.
