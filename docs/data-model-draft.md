# Data Model Draft

Status: conceptual future schema only. It is not a database migration and does
not select a database or vendor. `id` values should be opaque, and all dates
should be stored as timezone-aware instants.

## First teacher-account release

### profiles

Columns: user_id primary key, display_name, account_status, platform_role,
created_at, updated_at, deletion_requested_at. The authentication subject maps
one-to-one to user_id through a restricted adapter. Index account_status only
if operational queries require it. Ordinary users may read/update only safe
fields on their own profile; role and status require trusted server commands.
Retain or anonymize closed profiles according to the approved privacy policy.

### products

Columns: product_key primary key, display_name, lifecycle_status, created_at,
updated_at. `math-vocabulary-hunt` is the initial row. Product keys are unique
and immutable. Public read may be allowed for active catalog metadata; writes
are administrative and audited. Retain indefinitely so historical references
remain interpretable.

### entitlements

Columns: entitlement_id primary key, user_id, product_key, scope, feature_key,
status, source, starts_at, expires_at, source_reference, created_at, updated_at,
revoked_at. Foreign keys reference profiles and products. Enforce product scope
with null feature_key and feature scope with a registered feature_key. Add an
index on user_id plus product_key and an index supporting active expiry scans.
A source-specific unique key should make commands idempotent. Users may read
only their own grants through a narrow summary; writes require a trusted server
role. Retain grant history for support and audit, then anonymize consistently
with profile deletion policy.

### entitlement_events

Columns: event_id, entitlement_id, actor_type, actor_id, action, reason_code,
correlation_id, occurred_at, and a minimal metadata object. Index entitlement_id
plus occurred_at and correlation_id. Events are append-only, never exposed to
other users, and writable only by trusted services. Define a security and
support retention window before launch.

## Paid launch, only after owner approval

### plans

Columns: plan_key primary key, product_key, display_name, lifecycle_status,
version, created_at, updated_at. Provider price IDs belong in a restricted
mapping, not in gameplay code. Unique product_key plus plan_key/version.
Catalog reads may be public; commercial configuration writes are privileged.

### plan_features

Columns: plan_key, plan_version, feature_key, policy_value. Composite primary
key prevents duplicates. It references plans and the registered feature set.
Writes are privileged and versioned; old versions are retained for historical
interpretation.

### stripe_customers

Columns: user_id primary key, stripe_customer_id, created_at, updated_at.
The provider reference is unique. Never expose it to other users or public
clients. Retain only as accounting and support obligations require. This table
is only a draft if Stripe is later approved; another provider would require an
owner-approved neutral or provider-specific replacement.

### subscriptions

Columns: subscription_id, user_id, plan_key, plan_version, provider reference,
provider status, current_period_start, current_period_end, cancel_at_period_end,
last_event_at, created_at, updated_at. Enforce unique provider reference and
index user_id/status. Only trusted webhook/reconciliation paths write. Product
code never reads this table for access; reconciliation creates entitlements.

### stripe_events

Columns: event_id, stripe_event_id, event_type, received_at, processed_at,
outcome, correlation_id, and a minimized payload reference. stripe_event_id is
unique for idempotency. Access is restricted to billing operations. Raw payload
retention must be short and documented. This table is not approval to adopt
Stripe and is implemented only after the provider decision.

## Later organization licensing

### organizations

Columns: organization_id, name, status, created_at, updated_at. Name is personal
or institutional data and is tenant-restricted. Deletion and retention require
contract-aware policy.

### organization_members

Columns: organization_id, user_id, organization_role, status, joined_at,
ended_at. Composite uniqueness prevents duplicate active memberships. Members
may see only authorized organizations; membership management requires an
organization admin or trusted support role.

### licenses

Columns: license_id, organization_id, product_key, status, seat_limit,
starts_at, expires_at, source_reference, created_at, updated_at. Index active
licenses by organization/product and make source references idempotent. Writes
are trusted and audited.

### license_assignments

Columns: assignment_id, license_id, user_id, status, assigned_at, ended_at.
Prevent duplicate active assignment per license/user and enforce seat limits in
a transaction. A user sees only their own effective result; organization admins
receive only the minimum roster data. Valid assignments reconcile to
license-source entitlements.

## Cross-table rules

Every tenant- or user-owned query must filter by the verified server identity,
with database row-level controls where supported. Foreign keys, checks, unique
constraints, transactions, and idempotency keys defend invariants independently
of application code. Cross-account negative tests are mandatory before any
identity-backed release.
