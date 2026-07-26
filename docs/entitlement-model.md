# Entitlement Model

Status: Phase 1B policy contract; persistence and provider integration are
future work.

## Authority rule

The entitlement service is the sole authority for product and feature access.
Billing status, checkout redirects, URL parameters, cookies, local storage,
client claims, and hidden UI controls are not authorization evidence. Billing
and Licensing may cause a trusted server process to change entitlement records,
but the product always asks Entitlements for the resulting decision.

The exported interface contains:

- `canAccessProduct(userId, productKey)`
- `canAccessFeature(userId, productKey, featureKey)`
- `getUserAccessSummary(userId, productKey)`

Unknown or malformed inputs deny safely. Summary lookup returns no summary for
an unknown product.

## Grant record

An entitlement binds one user to the Math Vocabulary Hunt product. It has an
ID, product key, source, status, start time, optional expiry, and either:

- product scope, with no feature key; or
- feature scope, with exactly one registered feature key.

Phase 1B statuses are `active` and `revoked`. A record is effective only when
active, started, not expired, assigned to the requested user, and assigned to
the requested product. Revocation is explicit and wins immediately. Expiry is
exclusive: access ends at the recorded timestamp.

Phase 1B sources are `system`, `manual`, `subscription`, and `license`. A source
describes trusted provenance; it is not itself sufficient for access. Future
storage adapters must restrict who may write each source.

## Product and feature behavior

An effective product-scoped or feature-scoped grant establishes access to the
product container. Feature access requires an explicit effective grant for
that feature. A product grant does not silently imply every current or future
feature. This conservative rule prevents a newly registered premium feature
from being exposed by an old broad grant.

Plan-to-feature expansion is intentionally absent. Before paid launch, the
owner must approve whether plans generate individual feature grants, a policy
bundle, or another versioned representation.

## Lifecycle

1. A trusted server actor validates identity, catalog keys, and its authority.
2. It creates or updates a grant idempotently and records an audit event.
3. The entitlement reader supplies server-side records to the policy.
4. The policy validates every record and evaluates time and status.
5. The product receives only the allow/deny result or a complete summary.
6. Expiration, cancellation policy, refund, license removal, or administrative
   revocation updates the grant through a trusted command.

Caching, if later introduced, must be short-lived, user-bound, invalidated on
revocation, and never broaden access after an error. Storage or dependency
failure must deny protected features unless an explicitly approved continuity
policy says otherwise.
