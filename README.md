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
2. Run npm run serve.
3. Open http://127.0.0.1:4173/docs/index.html.

The local server exists only for development and automated tests. GitHub Pages
continues to publish directly from docs without a build step.

## Verification

- npm run lint checks repository scripts and current browser tests.
- npm run typecheck checks the framework-independent platform contracts.
- npm run test:content checks canonical hashes, curriculum references, lesson
  counts, and documented content gaps.
- npm run test:unit checks catalog registration and default-deny entitlement
  policy behavior.
- npm run test:e2e:canonical runs the v7 browser regression suite.
- npm test runs the content audit, platform unit tests, and all current and
  historical browser tests.

## Future platform contracts

Phase 1B adds framework-independent TypeScript contracts under `platform/` for
the product catalog, teacher identity shape, and entitlement policy. These are
future architecture boundaries only: they are not connected to the static
game, do not change deployment, and add no authentication, billing, database,
or application framework. Start with `docs/platform-architecture.md` and
`docs/decision-log.md` for the boundary and pending owner decisions.

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
