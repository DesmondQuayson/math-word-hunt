# Phase 2 billing test strategy

Phase 2A covers catalog, normalization, entitlement, copy, configuration mismatch, URL/plan validation, redaction, schema/uniqueness/ownership, service-only mutation, idempotency, mode constraints, browser/cross-account denial, account overrides, and secret/live-marker/bundle scans.

Phase 2B adds:

- Integration: valid/invalid signature, replay, duplicate/out-of-order, missing owner, unknown price, mismatch, provider outage/retry, duplicate subscription, suspension, deletion.
- Browser: Free, success return without access, canceled checkout, already subscribed, portal, forged ID/URL, keyboard/responsive/forced-colors/status announcement.
- Sandbox: initial payment, failure, renewal, cancellation/end, reactivation, approved plan change, webhook retry/order independence, and test clocks—never real charges.
- Security: raw-body verification, no secrets/live keys in test bundles, no arbitrary IDs/redirects, no sensitive logs, no browser grants.

Every phase retains lint, strict types, content, reset-from-empty, pgTAP, all platform/visual/auth browser suites, production-default audit, canonical v7 and v5, build, dependency audit, diff check, and protected hashes. Phase 2A changes no snapshot.

