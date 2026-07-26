# Platform Decision Log

This log records durable architecture decisions. A new entry should state the
date, status, decision, rationale, and consequences. Superseded entries remain
for history.

## Accepted on 2026-07-26 during Phase 1D

The first identity/data vertical slice is local-only Supabase with teacher-only
email/password accounts, separate profiles, owner-scoped RLS, default-deny
entitlements, privacy-minimized classes, activity drafts, and request-only
account deletion. Browser input has no ownership, role, status, or entitlement
authority. Deletion-requested accounts retain only own status/request visibility
and cannot create new teacher data.

Hosted Supabase, production rollout, permanent deletion, students, organization
tenancy, Stripe/billing, final paid policy, automatic premium grants, additional
game modes, managed sessions, and reports remain pending owner approval. See
`phase-1d-decisions.md`.

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
| Vercel project and environment details | Preview deployment | Ownership, hostname, environment separation, rollback |
| Supabase implementation details | Teacher accounts | Security model, data location, recovery, export/deletion |
| Login methods and account policy | Teacher accounts | User needs, verification, support and abuse handling |
| Feature-to-plan mapping | Paid design | Product value, curriculum availability, graceful downgrade |
| Pricing, Stripe configuration, refunds, tax | Paid launch | Business/legal approval and operational runbooks |
| Product grants versus feature bundles | Entitlement persistence | Migration safety and future-feature behavior |
| Reporting data and retention | Teacher reporting | Educational purpose, privacy review, deletion plan |
| Organization licensing and seat rules | Licensing work | Customer need, roles, seat concurrency, contract terms |
| Public cutover from GitHub Pages | Production migration | Parity evidence, monitoring, support, tested rollback |
| Historical build archival/deletion | Repository cleanup | Owner approval and recovery location |

Next.js is approved, while Vercel, Supabase, and Stripe are approved future
directions with implementation still deferred. Their remaining operational and
security decisions are detailed in `phase-1c-decisions.md`.

## Accepted on 2026-07-26 during Phase 1C

Next.js with TypeScript and the App Router is approved for the isolated future
application, and Vercel is the intended future host. Supabase is the intended
future database and teacher-identity provider, and Stripe is the intended
future billing provider. The latter services remain unintegrated. The initial
account model is teacher-only, students do not create accounts, and static v7
remains production. Detailed implementation and remaining decisions are
recorded in `phase-1c-decisions.md`.

## Accepted on 2026-07-26 during Phase 1C.5A

### Scholarly field-guide design system

Status: accepted. The Next.js shell uses semantic tokens, system fonts, small
typed UI/layout/feedback primitives, restrained functional motion, and the
graph-paper vocabulary trail as its single signature device. Consequence: new
platform pages must compose the documented primitives and may not introduce
raw color systems, fake controls, fabricated records, or decorative motion.

### Platform-only visual evolution

Status: accepted. Phase 1C.5A changes only the isolated platform shell. The
canonical v7 game, its vocabulary source, and historical builds remain exact
rollback baselines. Consequence: any future game redesign requires its own
explicit product and regression phase.

## Accepted on 2026-07-26 during Phase 1C.5B

### Teacher task architecture and minimization

Status: accepted for prototype review. The future teacher navigation is
Overview, Classes, Activities, Live Sessions, Reports, Curriculum, and Account.
Class concepts omit student rosters; activity concepts use curriculum
references; session concepts preserve current v7 as the only working launch;
and reports are aggregate and non-predictive. Consequence: persistence may not
be added until the owner approves the shapes, retention, deletion, and privacy
boundaries documented in the Phase 1C.5B set.

### Production-denied demonstration data

Status: accepted. Generic workflow fixtures live only in a server-only module,
require the exact `enabled` switch in development or test, and are denied in
production regardless of configuration. Browser-controlled values cannot
enable them. Consequence: every fixture view is visibly labeled and separate
default, opt-in, and production-negative tests are mandatory.

## Recorded on 2026-07-26 during Phase 1C.5C

### Provider-independent teacher information boundary

Status: accepted as a structural frontend contract, not as provider or schema
approval. Teacher profiles, classes, activities, sessions, aggregate reports,
curriculum summaries, dashboard summaries, explicit result errors, and
ownership-scoped repository interfaces live in platform-core. Strict parsers
reject unknown fields and excluded student/predictive data. Consequence: future
providers must adapt through this boundary and may not expose database query
language or browser-controlled authority.

### Product and policy choices remain explicit

Status: pending where listed in `phase-1c5c-owner-decisions.md`. Activity-mode
enumeration, time/team defaults, archive and deletion operations, report
retention, curriculum review ownership, reporting approval, and identity/session
sequence are not silently approved by the contract freeze.

## Recorded on 2026-07-26 during Phase 2A

Billing ownership is the immutable authenticated teacher identity. Internal
plan keys and entitlement meaning remain provider-independent; provider IDs,
signatures, subscription state, and invoice state remain server-only. Billing
tables are service-only, reconciliation must be idempotent/order-independent,
and account restrictions override payment. Paid prices and commercial policies
remain unapproved. No provider resource, endpoint, payment, or deployment was
created. See `phase-2a-decisions.md`.
