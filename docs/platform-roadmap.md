# Platform Roadmap

This roadmap records the original platform sequence and its accepted status.
Completed checkpoints do not authorize deliberately deferred Production,
email, billing, domain, or pilot work.

## Phase 1A — repository normalization

- establish a dedicated repository
- identify and hash the canonical static release
- remove positively identified copied artifacts
- retain historical releases
- document current architecture, deployment, content risk, and migration safety
- add canonical content and browser regression coverage

## Phase 1B — architecture contracts

- approve the future application framework and hosting model
- define stable product key math-vocabulary-hunt
- document identity, product catalog, entitlement, product, and operations
  domain boundaries
- define server-only access-check interfaces
- define a migration path that preserves the static game
- do not add checkout or production authorization

## Phase 2 — teacher identity and data foundation

- add teacher-only authentication
- add a normalized teacher profile
- establish database migrations and row-level security
- keep direct student accounts out of the initial scope
- add cross-account authorization tests

## Phase 3 — test-mode billing foundation

- add validated server-only billing configuration
- create checkout, customer mapping, signed webhook processing, subscription
  synchronization, idempotency, and reconciliation
- remain in test mode

## Phase 4 — account and entitlement experience

- enforce product and feature access server-side
- add accessible Account, Subscription, Upgrade, and Manage Billing interfaces
- handle active, trialing, recovery, cancellation, and failed-payment states

## Phase 5 — protected hosted Preview verification (complete)

- owner-accepted completion recorded on 2026-07-28
- protected Preview, hosted authentication and session behavior, reciprocal
  cross-account RLS, responsive behavior, and accessibility evidence verified
- all synthetic hosted fixtures and Auth users removed after verification
- authoritative evidence: [`phase-5-completion.md`](phase-5-completion.md)
- real email and password-recovery delivery, live billing, pilot invitations,
  custom domain, and Production launch remain deliberately deferred

## Phase 6 - controlled teacher pilot governance and readiness (owner decision pending)

- prepare governance, privacy/acceptable-use drafts, retention choices,
  support/incident operations, participant runbooks, evidence, and one
  consolidated owner-decision register
- add a polished local pilot field guide with persistent restricted/inactive,
  adult-teacher-only, no-student-data, no-billing, and unsupported-feature copy
- add provider-independent default-inactive PilotPolicy, readiness evaluation,
  sanitized operations, synthetic fixtures, and cleanup verification without
  changing RLS, identity, ownership, or entitlements
- rehearse the complete journey with disposable local adult-teacher identities
  and require reciprocal cross-account denial plus zero final fixture counts
- use [`phase-6-verification.md`](phase-6-verification.md) as the readiness gate
- Phase 6B activation, participant accounts/invitations, real email/recovery,
  provider mutation, billing, public access, and Production remain unapproved

## Later platform work

Organizations, school or district licensing, multiple products, rostering, SSO,
and centralized organization billing remain later work. They should not shape
the first teacher subscription into a premature platform rewrite.
