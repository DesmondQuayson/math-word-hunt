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
  behavior, anonymous state, access denial, and the safe game gateway.
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
