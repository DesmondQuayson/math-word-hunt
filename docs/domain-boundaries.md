# Domain Boundaries

Status: Phase 1B future architecture contract.

## Identity

Owns stable teacher user IDs, profile lifecycle, and platform roles. It does
not own passwords or sessions supplied by a future authentication adapter, and
it does not determine paid access. It exposes the verified current user and
account status to server modules. Entitlements depends on its user ID type.

## Product Catalog

Owns immutable product and feature keys plus human-readable product metadata.
It does not own prices, subscriptions, grants, UI navigation, or curriculum.
Its key registry is consumed by Entitlements, Billing, Licensing, and product
adapters. Unknown keys are invalid and default to denied access.

## Entitlements

Owns access-grant records, their lifecycle, and all product/feature policy
decisions. It does not collect money, authenticate users, or render the game.
It consumes verified identity, catalog keys, and trusted grants. It exposes
only server-evaluated access methods to product code.

## Math Vocabulary Hunt Product

Owns gameplay rules, accessibility, audio behavior, curriculum presentation,
and game-specific state. It does not own identity, pricing, billing records,
or access policy. The preserved v7 static application is currently the whole
runtime; a future adapter may ask Entitlements for access before exposing a
catalog-defined capability.

## Billing

Will own provider customer references, plans, subscription state, invoices,
and idempotent webhook processing. It does not decide access at request time
and cannot be called directly by game code. Trusted server reconciliation may
create, renew, expire, or revoke entitlement records. Provider selection and
implementation are future owner decisions.

## Licensing

Will own organizations, memberships, license terms, seat pools, and seat
assignments. It does not authenticate users or directly unlock UI. Valid
license assignments may create trusted entitlement records. This domain is
deferred beyond the first teacher-account release unless the owner reprioritizes it.

## Audit and Operations

Will own append-only security and operational events, correlation IDs, and
support-safe diagnostics. It does not contain secrets or become a source of
truth for identity, payments, or access. Other modules publish significant
commands and outcomes; access to audit records is administrative and logged.

## Boundary rules

1. Browser state may request an action but cannot prove identity, payment, or
   entitlement.
2. Billing and Licensing issue server-side commands; Entitlements evaluates
   resulting grants.
3. The product consumes access decisions, never raw payment or license rows.
4. Cross-module calls use typed interfaces and stable IDs, not shared mutable
   objects.
5. Each future persistence adapter enforces least privilege and row-level
   ownership in addition to application checks.
6. Platform administration is separate from ordinary teacher access and must
   be explicitly authorized and audited.
