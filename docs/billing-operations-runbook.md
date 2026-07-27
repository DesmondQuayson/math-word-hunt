# Billing operations runbook

## Kill switches

- `BILLING_CHECKOUT_ENABLED=false`: prevents new sessions; existing verified access is unchanged.
- `BILLING_PORTAL_ENABLED=false`: prevents new portal sessions.
- `BILLING_WEBHOOK_ENABLED=false`: returns HTTP 503 before event receipt so Stripe retries; no event is marked processed.
- `BILLING_EMERGENCY_DEFAULT_DENY=true`: premium authorization and new entitlement derivation deny while billing projections remain intact; v7/free access remains available.

No switch enables production billing.

## Diagnostics and reconciliation

All commands are server-only, test-key-only, dry-run by default, and redact external IDs from summary output.

```powershell
npm run billing:reconcile -- --unresolved
npm run billing:reconcile -- --owner=<internal-teacher-uuid>
npm run billing:reconcile -- --owner=<internal-teacher-uuid> --apply
```

Diagnostics include missing mappings/resources, duplicate customer/subscription, unknown Price, mode/ownership mismatch, expired entitlement, provider/database outage, stale event, API-version mismatch, and manual review. Apply mode refuses ambiguous duplicates and replays only an authoritative test event for the sole candidate. It never deletes provider or database records.

## Replay

```powershell
npm run billing:replay -- --event=<test-event-id>
npm run billing:replay -- --event=<test-event-id> --apply
```

Dry run retrieves and validates the Stripe test event. Apply mode re-signs the retrieved test event to the local endpoint using the local endpoint secret; the normal signature, mode, version, allowlist, idempotency, ownership, stale-event, and transaction checks still run. Live events are rejected. Retryable events can be claimed again; processed/manual-review events remain terminal until an explicit future reviewed remediation exists.

## Incident sequence

1. Disable Checkout if new purchases must stop.
2. Leave webhook intake on unless accepting new events is unsafe; disabling it intentionally produces retries.
3. Enable emergency default-deny if authorization integrity is uncertain.
4. Inspect unresolved categories and provider state in dry-run mode.
5. Resolve duplicate/ownership/unknown-Price conditions manually; never choose silently.
6. Apply reconciliation for the named internal owner or replay the verified test event.
7. Re-run the Phase 2 verification gate before restoring switches.

Billing records are retained during suspension/deletion and incidents. Permanent deletion and legal retention durations still require owner/legal approval. Static v7 does not depend on these operations.

