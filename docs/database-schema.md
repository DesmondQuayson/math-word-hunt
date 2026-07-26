# Phase 1D database schema

`auth.users` is the identity authority. Public application tables are:

| Table | Purpose | Owner boundary |
| --- | --- | --- |
| `teacher_profiles` | Display name, optional organization label, account status | `user_id` |
| `products` | Safe public product catalog | Public active reads; no ordinary writes |
| `product_entitlements` | Server-authoritative grants | `teacher_user_id`; teacher read only |
| `teacher_classes` | Privacy-minimized class labels | `owner_teacher_id` |
| `teacher_activities` | Approved activity drafts/settings | `owner_teacher_id`; optional owned class |
| `account_deletion_requests` | Request-only lifecycle record | `owner_teacher_id` |

Constraints restrict statuses, grade values, minimum keys, team counts, time limits, one pending deletion request, and the single Phase 1D game-mode key `team-hunt`. Foreign keys and owner/status indexes support integrity and policy checks. There are no students, rosters, subscriptions, payments, sessions, reports, analytics, or behavioral event tables.

The signup trigger creates an active teacher profile from sanitized display/organization metadata and ignores role, account status, entitlement, premium, and administrative metadata. The deletion-request trigger changes the profile to `deletion_requested`; it does not delete data.
