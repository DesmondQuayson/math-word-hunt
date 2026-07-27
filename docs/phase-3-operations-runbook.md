# Phase 3 capability operations runbook

All billing commands are test-only, server-only, redacted, and dry-run by default. `--apply` is explicit. They reject live credentials, never delete billing records, and never invent entitlement without a verified provider event. Use internal teacher UUIDs only in operator input; do not paste external IDs into support tickets.

## Standard commands

```powershell
npm run billing:reconcile -- --unresolved
npm run billing:reconcile -- --owner=<internal-teacher-uuid>
npm run billing:reconcile -- --owner=<internal-teacher-uuid> --apply
npm run billing:replay -- --event=<test-event-id>
npm run billing:replay -- --event=<test-event-id> --apply
npm run billing:provision:test -- --dry-run
npm run phase3:verify
```

## Support scenarios

| Scenario | Safe response |
| --- | --- |
| 1. Paid teacher shows Free | Confirm account is active, run owner reconciliation dry-run, resolve missing/mismatched provider evidence, then apply authoritative replay. Never grant manually. |
| 2. Free teacher shows Pro | Enable emergency deny if broad, inspect linked subscription and entitlement provenance, preserve records, and correct only through authoritative reconciliation. |
| 3. Teacher reaches Free limit | Confirm server usage, explain the 2/3 limits, and offer archive or optional sandbox upgrade. Do not alter counts client-side. |
| 4. Downgrade above limit | Reassure that records remain visible/editable; creation stays blocked until archive lowers active usage. Do not force archive. |
| 5. Payment fails | Confirm projected `past_due` state and provider event; keep access fail-closed according to the approved policy and direct the teacher to hosted billing support. |
| 6. Cancel at period end | Verify the provider projection. Access remains only through the verified period; no immediate deletion or refund. |
| 7. Subscription disappears | Run owner dry-run and inspect provider availability, mapping, and recent events. Apply only a verified event. |
| 8. Duplicate Stripe Customer | Dry-run reports `duplicate_customer`; stop. An owner must resolve the provider records before apply. |
| 9. Duplicate subscription | Dry-run reports `duplicate_subscription`; stop. Do not choose one silently. |
| 10. Unknown Price | Disable Checkout if necessary, review the catalog/resource, and keep entitlement denied until an allowlisted Price event exists. |
| 11. Environment mismatch | Reject the evidence, verify all resources and keys are test mode, and never copy IDs across environments. |
| 12. Manual-review event | Inspect the redacted failure class and source event. Resolve ownership/catalog ambiguity before an explicit replay. |
| 13. Suspended paid account | Suspension overrides billing. Preserve billing data; support and account review are required before reactivation. |
| 14. Deletion requested while subscribed | Premium and portal access deny. Use the documented support-assisted cancellation process; do not erase data automatically. |
| 15. Stripe outage | Disable Checkout if needed, leave webhook intake retryable, preserve projections, and do not infer payment success from redirects. |
| 16. Supabase outage | New protected work and entitlement resolution fail closed. The static v7 game remains available. Do not use browser fallback authority. |
| 17. Emergency entitlement deny | Set the reviewed test/local kill switch, verify Free fallback and public v7, investigate, run the complete gate, then restore deliberately. |
| 18. External sandbox provisioning | Verify an `sk_test_` key, run provisioning dry-run, review the plan, then use the write command. Store IDs only in ignored local configuration. |
| 19. Event replay | Retrieve in test mode, dry-run, then explicitly apply. Signature, idempotency, ownership, ordering, and allowlist checks still run. |
| 20. Reconciliation after reactivation | Reactivate through the approved account process, run owner dry-run, apply a current verified provider event, and confirm server usage before telling the teacher access returned. |

## Incident order

Stop new Checkout first when purchase integrity is uncertain. Keep webhook retries active unless event intake itself is unsafe. Use emergency Pro deny only for an authorization-integrity incident. Diagnose in dry-run mode, preserve all records, resolve ambiguity manually, apply only verified evidence, and finish with `npm run phase3:verify` before restoring switches.
