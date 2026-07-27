# Math Vocabulary Hunt

Math Vocabulary Hunt is a classroom word-search game for middle-school math
vocabulary. The current product is a static HTML, CSS, and JavaScript
application designed for projectors, classroom displays, tablets, and phones.

## Canonical application

- Playable deployment file: docs/index.html
- Curriculum and vocabulary source: docs/vocab.js
- Current release: v7
- Deployment source: the docs directory on GitHub Pages

The canonical HTML loads only the sibling docs/vocab.js file. These two files
are protected by the content-integrity test and must be versioned together.

## Local preview

1. Install the development dependencies with npm install.
2. For the current game, run npm run serve and open
   http://127.0.0.1:4173/docs/index.html.
3. For the isolated platform shell and its working game gateway, run
   npm run dev:platform and open http://127.0.0.1:3000.

For the Phase 1D local teacher vertical slice, start Docker Desktop, run `npm
run supabase:start`, then `npm run db:reset`. The authenticated integration
runner supplies local runtime configuration without writing secrets: `npm run
test:e2e:phase1d`. See `docs/local-supabase-setup.md`.

The local server exists only for development and automated tests. GitHub Pages
continues to publish directly from docs without a build step.

## Verification

- npm run lint checks repository scripts and the Next.js workspace.
- npm run typecheck checks every workspace in strict TypeScript mode.
- npm run test:content checks canonical hashes, curriculum references, lesson
  counts, and documented content gaps.
- npm run test:unit checks platform-core contracts and platform-web adapters.
- npm run test:e2e:canonical runs the v7 browser regression suite.
- npm run test:e2e:platform checks shell routes, accessibility, responsive
  behavior, anonymous state, access denial, visual baselines, and the safe game
  gateway.
- npm run test:e2e:visual runs only the three stable platform visual snapshots.
- npm run db:test runs the complete schema and Row Level Security assertion suite.
- npm run test:e2e:phase1d tests local authentication, two-account isolation,
  profile/class/activity persistence, archive, deletion request, entitlement
  denial, and sign-out.
- npm run phase1d:verify runs the complete old and new release gate.
- npm run phase2a:verify runs that full gate plus billing secret and live-marker checks.
- npm run test:e2e:phase2 runs deterministic local Checkout, portal, account-state, responsive, and accessibility flows.
- npm run phase2:verify runs the complete Phase 2 local release gate, including reset-from-empty, billing integration, bundle/security scans, dependency audit, and protected hashes.
- npm run test:capabilities runs the provider-independent capability registry,
  authorization engine, copy, and server usage-contract tests.
- npm run test:e2e:phase3 validates Free/Pro limits, real concurrent creation,
  downgrade preservation, and the nine-viewport accessibility matrix.
- npm run phase3:verify runs the complete Phase 2 gate followed by every new
  capability, database, browser, security, clean-build, and preservation gate.
- npm run build creates the isolated Next.js production build.
- npm run test:security inspects production client assets and platform-core
  source for secret markers or forbidden dependencies.
- npm test runs content, unit, current/historical, and platform browser tests.

## Workspace foundation

Phase 1C uses npm workspaces. `apps/platform-web` is the isolated Next.js App
Router shell, and `packages/platform-core` contains the portable catalog,
identity, and entitlement contracts. The shell does not change production and
adds no authentication, database, billing, pricing, or student accounts. Start
with `docs/workspace-architecture.md`, `docs/platform-shell-design.md`, and
`docs/phase-1c-decisions.md`.

Phase 1C.5A adds a local design-system layer under
`apps/platform-web/components` and `apps/platform-web/styles`. Its visual,
component, accessibility, and responsive standards are documented in
`docs/design-system.md`, `docs/component-guidelines.md`,
`docs/accessibility-visual-standard.md`, and
`docs/responsive-design-standard.md`.

Phase 1C.5B adds the teacher workflow prototype under `/teacher` and
`/account`. It is production-default empty, adds no persistence, and keeps the
current v7 game as the only real classroom launch. Start with
`docs/teacher-experience-architecture.md`, `docs/teacher-workflow-map.md`, and
`docs/prototype-data-policy.md`. Optional generic fixtures can be exercised only
through `npm run test:e2e:platform:prototype`; `npm run
test:production-default` proves that a production build denies them.

Phase 1C.5C validates those workflows against ten classroom scenarios, hardens
reflow and forced-colors behavior, and freezes provider-independent teacher
information contracts under `packages/platform-core/src/teacher`. It still adds
no provider, account, persistence, student model, billing, or deployment. Start
with `docs/teacher-scenario-validation.md`,
`docs/teacher-accessibility-validation.md`,
`docs/teacher-information-contracts.md`, and
`docs/phase-1c5c-owner-decisions.md`. Run `npm run test:e2e:scenarios` for the
scenario and responsive matrix.

Phase 1D adds a local-only Supabase foundation and connects supported teacher
states to real server-owned data. It does not change the static deployment.
Identity is teacher-only; all tables use RLS; entitlements default deny; classes
contain no roster; activities are drafts only; deletion is request-only; and
sessions, reports, billing, students, hosted Supabase, and production deployment
remain deferred. Start with `docs/authentication-architecture.md`,
`docs/database-schema.md`, `docs/row-level-security.md`, and
`docs/phase-1d-security-review.md`.

Phase 2B–2F implements the approved local/test-only Stripe boundary: the exact
server SDK and API version, idempotent sandbox provisioning, hosted Checkout
and portal actions, signed webhook reconciliation, transactional subscription
and entitlement projection, operator reconciliation/replay, kill switches, and
deterministic browser/security verification. Repository defaults still disable
billing; no production resource, deployment, real charge, or final production
price is approved. Start with `docs/phase-2-implementation.md`,
`docs/stripe-test-mode-setup.md`, `docs/billing-operations-runbook.md`, and
`docs/phase-2-verification.md`.

Phase 3 connects the existing teacher workspace to one provider-independent
capability registry and server authorization engine. Free teachers may keep two
active classes and three active activity drafts; verified Teacher Pro raises
those reversible test defaults to 25 and 100. Creation is transactionally
enforced by local Supabase, while downgrade preserves owned work and permits
safe edits and archiving. Managed sessions, reports, students, and production
billing remain unavailable. Start with `docs/phase-3-capability-audit.md`,
`docs/phase-3-packaging-and-downgrade.md`,
`docs/phase-3-operations-runbook.md`, and
`docs/phase-3-owner-decisions.md`.

## Preservation rules

- Do not replace docs/index.html in place without an explicit release decision.
- Do not edit docs/vocab.js without curriculum review and a content-audit update.
- Retain the historical v1-v6 builds until the owner approves archival.
- Preserve Pointer Events, keyboard access, visible focus, reduced-motion
  behavior, 44px controls, responsive layout, and optional-audio fallbacks.
- Do not place student names, rosters, screenshots, or other student records in
  this repository.

Architecture, deployment, content status, testing, and migration safeguards are
documented in the docs directory.
