# Platform Decision Log

This log records durable architecture decisions. A new entry should state the
date, status, decision, rationale, and consequences. Superseded entries remain
for history.

## Accepted on 2026-07-26

### Dedicated product boundary

Status: accepted. This repository is only Math Vocabulary Hunt. Other products
must not be imported, referenced as platform modules, or modified here.
Consequence: nested-parent tooling must be explicitly isolated, as the local
Vitest configuration does.

### Preserve static v7 during platform work

Status: accepted. `docs/index.html` and `docs/vocab.js` remain the canonical
production pair served from `docs/` by GitHub Pages. Platform development will
occur alongside them. Consequence: no platform phase may silently replace the
production route or rewrite gameplay.

### Modular monolith first

Status: accepted. Future platform capabilities begin as explicit modules in
one deployable application. Consequence: domain boundaries and interfaces are
enforced now; distributed services are deferred until evidence justifies them.

### Stable product and feature keys

Status: accepted. Product key `math-vocabulary-hunt` and the six registered
Phase 1B feature keys form the catalog vocabulary. Consequence: keys are
immutable identifiers, duplicates fail, and unknown values deny.

### Entitlements are sole access authority

Status: accepted. Product code asks Entitlements for access. Billing,
Licensing, browser state, and payment-success navigation cannot directly grant
access. Consequence: provider changes do not alter gameplay authorization and
every protected path has a single default-deny policy boundary.

### Teacher-first identity and student minimization

Status: accepted for planning. The first account model is an adult teacher; no
student account or direct student identifier is assumed. Consequence: student
data requires a later explicit privacy and product review.

### Framework- and provider-independent contracts

Status: accepted. Phase 1B TypeScript contracts have no React, Next.js,
Supabase, Stripe, browser, or deployment dependency. Consequence: implementation
choices remain reversible and require a later decision.

## Pending owner decisions

| Decision | Needed before | Required evidence |
| --- | --- | --- |
| Web framework and hosting | Platform shell | Maintenance, accessibility, preview/rollback, cost |
| Database and identity provider | Teacher accounts | Security model, data location, recovery, export/deletion |
| Login methods and account policy | Teacher accounts | User needs, verification, support and abuse handling |
| Feature-to-plan mapping | Paid design | Product value, curriculum availability, graceful downgrade |
| Pricing, billing provider, refunds, tax | Paid launch | Business/legal approval and operational runbooks |
| Product grants versus feature bundles | Entitlement persistence | Migration safety and future-feature behavior |
| Reporting data and retention | Teacher reporting | Educational purpose, privacy review, deletion plan |
| Organization licensing and seat rules | Licensing work | Customer need, roles, seat concurrency, contract terms |
| Public cutover from GitHub Pages | Production migration | Parity evidence, monitoring, support, tested rollback |
| Historical build archival/deletion | Repository cleanup | Owner approval and recovery location |

The framework/hosting decision must explicitly approve or reject Next.js and
Vercel. The database/identity decision must explicitly approve or reject
Supabase. The billing decision must explicitly approve or reject Stripe. No
selection is implied by naming these candidates in planning documents.
