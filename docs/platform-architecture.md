# Platform Architecture Contract

Status: Phase 1B design contract. This document describes future work; it does
not change the current static product or its GitHub Pages deployment.

## Architecture direction

The target is a modular monolith: one deployable platform application with
explicit modules and server-side interfaces. This keeps early operations
simple while preventing billing, identity, and game code from becoming a
single undifferentiated module. A module may later be extracted only when
scale, reliability, or team ownership provides evidence for doing so.

The current v7 static application remains the production baseline at
`docs/index.html`, with `docs/vocab.js` as its curriculum source. The Phase 1C
platform shell is built alongside it and reaches the preserved game through a
deliberate gateway adapter. It does not embed or rewrite gameplay.

## Future modules

| Domain | Owns | Primary output |
| --- | --- | --- |
| Identity | Teacher account identity and account lifecycle | Authenticated user identity |
| Product Catalog | Stable product and feature definitions | Registered keys and product metadata |
| Entitlements | Access grants and policy evaluation | Product and feature access decisions |
| Math Vocabulary Hunt Product | Gameplay, curriculum delivery, and product state | A playable classroom experience |
| Billing | Commercial transactions and provider synchronization | Billing state and entitlement commands |
| Licensing | Organization membership and allocated seats | License-derived entitlement commands |
| Audit and Operations | Security events and operational diagnostics | Append-only evidence and support tooling |

## Dependency direction

- The Product module asks Entitlements for access decisions.
- Entitlements depends on Product Catalog keys and trusted entitlement records.
- Identity supplies a stable user identifier but does not decide product
  access.
- Billing and Licensing may request server-side entitlement changes. Neither
  may be queried by the game to infer access.
- Audit and Operations observes commands and decisions without becoming the
  access authority.
- Product Catalog is dependency-light and must not depend on billing providers,
  frameworks, browser state, or product rendering.

The entitlement service is the sole authority for product and feature access.
Unknown products, unknown features, malformed records, expired grants, and
revoked grants deny access. A payment-success page, query string, cookie,
local-storage value, or other browser-controlled value is never authority.

## Runtime shape

The contracts in `packages/platform-core` are framework-independent TypeScript. They define
stable vocabulary and policy behavior before selecting a web framework,
database, authentication system, host, or payment provider. Future adapters
may implement storage and transport, but must preserve these interfaces:

- `canAccessProduct`
- `canAccessFeature`
- `getUserAccessSummary`

Phase 1C places an approved Next.js shell in `apps/platform-web`. The core
contracts remain independent, and no external database, identity, billing, or
deployment service is installed or configured.

## Current versus future

Current production is static, anonymous, local-first gameplay. Future platform
work may add teacher identity and server-managed access, but must not make the
existing playable build dependent on an unfinished platform. Migration occurs
behind explicit checkpoints, with the static v7 files retained as the tested
rollback baseline.
