# Billing rollback and operations

Phase 2A is local-only. Reset-from-empty is authoritative; no remote rollback exists. Treat deployed migrations as immutable and forward-fix. Locally, stop/reset the disposable stack. Reversion never touches static v7.

Future independent kill switches disable new Checkout while retaining last verified access to period end, or pause webhook intake while preserving receipts/replay and denying new grants. An emergency entitlement switch denies without deleting evidence. Do not drop tables in an incident.

Rebuild by retrieving authoritative subscriptions for mapped customers, validating mode/plan/owner, projecting by event time, and transactionally deriving entitlements. Replay only verified failed IDs under idempotency. Manual review detects unknown plan/owner/mode, duplicate, stale, and poison events without raw bodies.

Rotate API/endpoint secrets per environment and verify replacement before retirement. Separate test/live incidents. Paid-but-denied support checks identity, override, provider state, mapping, period, and receipt then reconciles. Free-but-Pro disables the derived grant first and preserves evidence. Duplicate subscriptions stop purchasing and require cancellation/refund review. Deletion pauses until cancellation/obligations resolve. During outage, existing verified access lasts only to stored end; new grants/extensions deny.

