# Webhook processing contract

Phase 2A originally froze this contract without an endpoint. Phase 2 implements it at `POST /api/billing/webhook`:

1. Verify the signature over the unmodified body with an endpoint/environment secret and the SDK default five-minute tolerance unless reviewed clock evidence requires otherwise.
2. Reject mode mismatch and non-allowlisted types before authority changes.
3. register `(environment,event_id)` idempotently.
4. Resolve owner through mapping and verified provider data; metadata alone is insufficient.
5. Retrieve authoritative subscription when data is incomplete/stale/out of order; never overwrite a newer projection.
6. Transactionally upsert projection, validate plan, derive/revoke entitlement, apply account override, and mark processed.
7. Return prompt 2xx after durable safe processing. Transient failures return retryable non-2xx; poison/permanent conflicts become redacted manual review and deny.

Logs contain correlation, type, mode, safe failure class, and hashed/truncated references—not bodies, secrets, email, or classroom data. Phase 2B pins an API version. Unsupported signed events are recorded/acknowledged as ignored without mutation. Duplicate IDs are safe.

| Allowlisted event | Owned purpose |
| --- | --- |
| `checkout.session.completed` | Trigger authoritative retrieval; never grant alone. |
| `customer.subscription.created` | Discover/project after owner/plan validation. |
| `customer.subscription.updated` | Refresh status, period, cancellation, approved plan. |
| `customer.subscription.deleted` | Confirm end and revoke. |
| `invoice.paid` | Trigger renewal refresh; invoice alone does not authorize. |
| `invoice.payment_failed` | Trigger refresh/payment-issue state; projection controls denial. |

Never grant from redirect, session creation, unverified body, or client ID. Unknown plan/owner/mode, contradictory objects, and duplicate current subscriptions deny and require review.

## Renewal reliability addendum (2026-09)

The canonical lifecycle contract now lives in `subscription-lifecycle.md`. Changes to this contract:

- `invoice.payment_succeeded` is accepted as an alias of `invoice.paid`; both trigger the same renewal refresh.
- An event rendered with an API version other than the pinned SDK version is processed and reported as `webhook-api-version-drift`. It is no longer a 400: every authoritative object is re-fetched with the pinned SDK version, and the hard rejection converted a dashboard setting into a permanent, silent renewal-sync outage.
- Every event re-fetches all of the customer's subscriptions and writes them through `synchronize_consumer_billing_subscription`, historical ones first, so a missed final event on an old subscription cannot block the live one.
- `/api/billing/webhook` and `/api/health` are exempt from the canonical-host 308 redirect. Stripe does not follow redirects.
- Failures emit structured, PII-free events (`webhook-processing-failed`, `webhook-manual-review`) with event type, redacted object suffix, failure class, and retryability.
