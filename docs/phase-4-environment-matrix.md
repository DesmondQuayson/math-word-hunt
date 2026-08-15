# Phase 4 environment matrix

Historical note: Phase 4 intentionally rejected Production. The later
owner-approved provider-free public contract is documented in
`production-public-architecture.md`; it does not change the Phase 4 Preview
boundary or authorize Production authentication.

All authority is server-owned. `NEXT_PUBLIC_*` values configure connectivity only and cannot select environment, role, plan, entitlement, ownership, deletion state, or billing mode. Unknown, incomplete, malformed, or production configuration returns no registry and denies sensitive Phase 4 operations.

| Control | Local | Hosted preview | Production |
|---|---|---|---|
| Identity | `local` | `preview` | rejected in Phase 4 |
| Origin | loopback HTTP only | owner-approved HTTPS origin | not provisioned |
| Data project | disposable local stack | dedicated preview project; never shared with production | not provisioned |
| Payments | disabled/test fixtures | test mode only; checkout disabled until sandbox validation | disabled |
| Email | local capture | capture or provider sandbox | disabled |
| Monitoring | console adapter | provider-neutral adapter | disabled |
| Fixtures | allowed and disposable | allowed, labeled, disposable | forbidden |
| Deletion | dry-run | dry-run | disabled |
| Support contact | hidden pending owner decision | hidden pending owner decision | hidden |
| Label | none | persistent “Preview environment” banner | unavailable |
| Indexing | blocked | blocked | blocked |

Required server variables are documented in `.env.example`: `MVH_APP_ENVIRONMENT`, `MVH_APPLICATION_ORIGIN`, `MVH_SUPABASE_PROJECT_REF`, `MVH_STRIPE_MODE`, `MVH_EMAIL_DELIVERY`, `MVH_MONITORING_MODE`, `MVH_FIXTURE_POLICY`, `MVH_DELETION_MODE`, and `MVH_BUILD_ID`. Provider secrets remain separate server-only values.

Promotion is configuration plus owner approval, never a browser flag. Preview must use a unique data-project identity and test payment mode. Production remains deliberately unparsable until a later approved phase changes the contract.
