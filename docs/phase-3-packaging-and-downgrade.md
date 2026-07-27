# Phase 3 packaging and downgrade policy

## Implemented packaging

| Capability | Free | Teacher Pro monthly/annual |
| --- | --- | --- |
| Canonical v7 classroom game | Included, no account required | Included |
| Curriculum readiness view | Included | Included |
| Teacher account management | Included | Included |
| Owned saved classes | 2 active | 25 active |
| Owned activity drafts | 3 active | 100 active |
| Safe edits and archive | Included | Included |
| Hosted billing tools | Test sandbox only | Test sandbox only |
| Managed sessions and reports | Unavailable | Unavailable |

These limits are conservative, reversible test defaults. Archived records do not count. The package contract is in platform-core; database policy repeats the numbers because it is the final transactional enforcement boundary. Both are covered by regression tests and must change together after owner approval.

## Authoritative access

The browser never supplies a trustworthy plan, count, owner, entitlement, Price, or customer. The server reads the authenticated teacher and a strict usage RPC. The database recognizes Pro only from an active teacher profile, a current subscription-sourced `classroom-tools` entitlement, its linked active billing subscription, the expected billing environment, and a known plan. Missing, expired, mismatched, emergency-denied, or malformed Pro evidence receives Free limits; malformed server responses make the application deny constrained work.

## Downgrade behavior

A downgrade never deletes, hides, truncates, or automatically archives data. Owned existing classes and activities remain readable. Safe edits and archive remain allowed even when current usage is above the Free limit. New creation is denied until usage is below the applicable limit. Archiving releases capacity. Class attachment is limited to the teacher's own active class and never changes ownership. Re-upgrade expands capacity only after authoritative reconciliation.

Teacher copy states that existing work is safe, new creation is limited, archiving may restore capacity, upgrading is optional, and unresolved billing state may require support. There is no countdown, forced deletion, or urgency language.

## Account overrides

Suspension and deletion-request status deny protected mutations and premium authorization even when a billing record appears active. The static canonical game remains public. Billing records are retained for review; no automatic refund, cancellation, or deletion is performed.
