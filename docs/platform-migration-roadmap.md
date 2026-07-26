# Platform Migration Roadmap

## Current checkpoint: Phase 2A billing contract freeze

Local Supabase Auth, versioned PostgreSQL migrations, RLS, server-only adapters,
teacher profiles, classes, activity drafts, account deletion requests, and
default-deny entitlement reads are implemented alongside unchanged static v7.
The work is a local validation foundation, not a production cutover.

Phase 2A adds local schema, policy, configuration, reconciliation, privacy,
support, and rollback contracts without accepting payment. Phase 2B may begin
only after the true blockers in `phase-2a-decisions.md` are approved, and must
remain test-mode with signed webhook integration and no public cutover.

Status: incremental plan updated after the Phase 1C workspace foundation.

## Preservation baseline

The current production artifact remains `docs/index.html`; its vocabulary
source remains `docs/vocab.js`; GitHub Pages continues to serve `docs/` with no
build step. Their Phase 1B starting SHA-256 values are:

- index.html: `8F957F59720816FE490E27BFD0C8214EB53D13F26A76BEB0176A4D8383319148`
- vocab.js: `CAEB8FBB590FFFD8CBC169F88F174A38C26DE2D16A7E1B0C1CF5E83AC9F01C46`

Historical v1-v6 files remain preserved. Contract work must not import code
from another product or couple the platform to the unrelated parent repository.

## Incremental sequence

### Checkpoint 1: contracts and evidence (Phase 1B)

Maintain the stable catalog, identity, and entitlement types; default-deny unit
tests; architecture decisions; content audit; and full canonical browser suite.
Rollback is deletion/reversion of only the new platform files. The static game
is untouched.

### Checkpoint 2: platform shell alongside static production (Phase 1C complete)

The approved Next.js App Router shell now exists in `apps/platform-web`, with
portable contracts in `packages/platform-core`. It has route, accessibility,
responsive, security-negative, and gateway tests. It has not been deployed and
does not replace `docs/`. Rollback is removal or disabling of the isolated
workspace; static v7 remains live.

### Checkpoint 2B: teacher workflow architecture (Phase 1C.5B complete)

The isolated shell now prototypes the complete teacher navigation, class and
activity forms, current-versus-future session boundary, aggregate reporting
structure, curriculum readiness, and account lifecycle information. It remains
empty by default, persists nothing, and uses only explicit local/test fixture
mode. Owner approval of workflows and minimization rules is required before
turning any prototype shape into a schema or service.

### Checkpoint 2C: validation and information-contract freeze (Phase 1C.5C)

Teacher workflows now have scenario, keyboard, forced-colors, text-spacing,
extreme-reflow, mobile-landscape, and Smart Board evidence. Provider-independent
teacher records and repository interfaces define only the minimized information
supported by the prototype. The owner-decision register separates phase
requirements from unresolved product, privacy, retention, and sequence choices.
No provider adapter or persistence is implied.

### Checkpoint 3: teacher identity

After login, privacy, RLS, retention, and environment decisions, implement
teacher identity behind the existing anonymous adapter in a non-production
environment. Supabase is the approved intended provider but integration still
requires a separate implementation approval and security plan. Add account
lifecycle, session security, cross-account negative tests, and deletion
workflow. The static game remains anonymously testable and production remains
unchanged.

### Checkpoint 4: server entitlement storage

Implement persistence adapters behind the Phase 1B interfaces. Seed only the
registered product/features, use row-level isolation and audited trusted
commands, and run parity tests against the in-memory contract policy. No paid
launch occurs here. Rollback disables protected preview routes and preserves
the existing static production path.

### Checkpoint 5: product adapter

Wrap or integrate the canonical game without rewriting gameplay. Demonstrate
functional parity for launch, selection, setup, a complete round, keyboard,
pointer, mobile, reduced motion, audio failure, curriculum safety, and Combine
Mode. Compare visual and behavior evidence to v7. Do not remove v7.

### Checkpoint 6: commercial readiness

Only after separate approval of plans, pricing, provider, refund/cancellation
rules, tax/legal requirements, and support procedures, add Billing and trusted
entitlement reconciliation. Test signed events, idempotency, replay, delayed
events, refunds, expiration, and provider outage. A payment-success page never
grants access.

### Checkpoint 7: migration and retirement decision

Run the future platform in staged preview, then an owner-approved limited
release. Define availability, error, performance, accessibility, content, and
support acceptance thresholds. Changing the public deployment or archiving v7
requires explicit owner approval and a tested rollback. Historical deletion is
never automatic.

### Checkpoint 6A: billing architecture preflight (Phase 2A complete)

Billing ownership, restrained proposed catalog, service-only projections,
default-deny reconciliation, strict configuration, future Checkout/portal
contracts, privacy limits, threat model, and operations are frozen. No Stripe
SDK, resource, endpoint, or payment exists.

### Checkpoint 6B: test-mode billing integration (recommended Phase 2B)

After owner blockers resolve, add the official server SDK, approved test
products/prices, authenticated Checkout/portal actions, and a raw-body verified
webhook. Prove duplicate/out-of-order handling with sandbox/browser tests. Live
activation remains a separate phase.

## Non-negotiable gates

Every checkpoint preserves canonical hashes until an explicit release change,
runs lint/type/content/unit/browser/build/security checks, documents schema and
security changes, reviews curriculum impact, and records an owner decision.
Next.js and the intended future Vercel, Supabase, and Stripe directions are now
recorded, but no provider integration or public cutover is implied.
