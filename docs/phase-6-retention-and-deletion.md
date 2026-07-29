# Phase 6 retention and deletion decision framework

Status: owner-approved readiness policy; **Phase 6B remains NO-GO** and
permanent deletion remains disabled.

## Categories and current treatment

| Category | Current pilot-readiness treatment |
| --- | --- |
| Authentication identity | no real pilot identity is created in Phase 6; future provider removal is a separate checkpoint |
| Profile, class, activity | restricted immediately after an accepted deletion request; eligible records await approved manual execution |
| Entitlement/billing projection | disabled/test-only; resolve obligations before any future identity removal |
| Sanitized operational evidence | retain only stable codes, safe correlation IDs, and minimum incident facts |
| Synthetic fixtures | remove at the end of every rehearsal and verify zero final counts |

## Approved retention decision

- While a participant is active, keep only the minimum permitted records in
  [`phase-6-data-inventory.md`](phase-6-data-inventory.md).
- Restrict access immediately after withdrawal, revocation, or a qualifying
  incident.
- After the pilot ends, retain minimum permitted pilot data for no more than
  14 calendar days, then conduct and record a cleanup review.
- A designated technical operator performs cleanup. The project owner verifies
  record counts and evidence.

Any category-specific legal or incident hold requires appropriate review and a
documented owner decision. It must not silently become indefinite retention.

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
Withdrawal and the 14-day review do not authorize or promise automatic
permanent deletion. Application and provider deletion remain separate,
disabled checkpoints.
