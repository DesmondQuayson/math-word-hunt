# Billing privacy, retention, and support

Stripe may receive only required teacher billing email, immutable account reference as corroborating metadata, and approved plan. It must not receive students, student IDs, rosters, classes, activities, game traces, vocabulary results, classroom analytics, IEP/disability information, or unrelated school records.

The projection stores identifiers, lifecycle state, periods, and minimal event diagnostics—no card, payment method, raw webhook, invoice line, or duplicated email.

Proposals requiring owner/legal approval: keep mappings while obligations exist; after verified cancellation/deletion, retain only references required for refund/dispute obligations, then delete/redact teacher linkage. Keep processed event IDs/hashes 90 days and resolved failure diagnostics 30 days, extending only for a documented incident hold. Stripe remains the accounting record.

Deletion requests immediately block checkout/premium. Cancel and resolve obligations before identity deletion; store a safe resolution code, not narrative. Suspended paid teachers retain support/status access only. Support verifies authenticated owner, account override, mode, plan, projection freshness, and event receipt before server reconciliation—never browser-directed entitlement editing.

