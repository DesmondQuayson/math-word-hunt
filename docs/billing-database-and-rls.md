# Billing database and RLS

Migration `20260726210000_phase2a_billing_foundation.sql` adds:

- `billing_customers`: immutable teacher owner, test/live environment, unique external customer reference.
- `billing_subscriptions`: owner/customer/environment integrity, one current subscription, approved plan, normalized status/periods, authoritative event time.
- `billing_webhook_events`: minimal idempotency receipt with allowlisted type, mode, timestamps, state, bounded attempts, payload hash, API version, and safe failure class—never raw payload.

`product_entitlements.billing_subscription_id` makes subscription provenance relational. Subscription sources require it; other sources cannot use it. Existing entitlement RLS still requires the owner and active account.

| Actor | Billing tables | Entitlements |
| --- | --- | --- |
| Anonymous | none | none |
| Active teacher | no direct access; future safe server summary only | own read only |
| Suspended/deletion-requested/missing | none | denied |
| Service role | future narrowly scoped reconciliation | transactional derive/revoke |

Billing tables have forced RLS, no browser policies, revoked browser privileges, explicit service grants, FKs, checks, and indexes. No card, payment-method, invoice-line, email, student, class, or activity data is stored.

