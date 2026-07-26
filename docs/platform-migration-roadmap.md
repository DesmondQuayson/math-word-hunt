# Platform Migration Roadmap

Status: future work plan. Phase 1B implements contracts and documentation only.

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

### Checkpoint 2: platform shell alongside static production

After owner approval of framework and host, create a separate application path
or directory. It must not replace `docs/` or change GitHub Pages. Add health,
accessibility, and deployment-preview tests. Rollback removes the preview route
while v7 remains live.

If Next.js is approved, develop it in that separate application directory and
publish only to a non-production preview first. It may reference platform
contracts through a server adapter, but it must not absorb or rewrite v7 during
foundation work. Supabase, Vercel, and Stripe each require their own explicit
owner decision; approval of Next.js does not imply approval of any of them.

### Checkpoint 3: teacher identity

After authentication and privacy decisions, implement teacher accounts in the
preview environment. Add account lifecycle, session security, cross-account
negative tests, and deletion workflow. The static game remains anonymously
testable and production remains unchanged.

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

## Non-negotiable gates

Every checkpoint preserves canonical hashes until an explicit release change,
runs lint/type/content/unit/browser checks, documents schema and security
changes, reviews curriculum impact, and records an owner decision. Next.js,
Supabase, Vercel, Stripe, or alternatives are candidate decisions—not Phase 1B
assumptions.
