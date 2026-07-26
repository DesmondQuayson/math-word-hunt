# Workspace Architecture

Status: Phase 1C implemented workspace foundation.

## Repository layout

The repository is an npm workspace with two future-platform units beside the
preserved static product:

```text
apps/
  platform-web/        Next.js App Router platform shell
packages/
  platform-core/       Framework-independent domain contracts
docs/                  Current GitHub Pages product and documentation
e2e/                   Static-game and platform-shell browser tests
scripts/               Audits, test runners, and local development runners
math-word-hunt-v*.html Historical product builds
```

`docs/index.html` and `docs/vocab.js` remain the production pair. Neither npm
workspace participates in the current GitHub Pages runtime.

## Workspace responsibilities

`@math-vocabulary-hunt/platform-core` owns the stable product/feature catalog,
identity types, entitlement record types, parsing, and default-deny policy. It
has no runtime dependencies and no React, Next.js, browser, Node business-logic,
Supabase, or Stripe imports. Its single public entry point is `src/index.ts`.

`@math-vocabulary-hunt/platform-web` owns the approved Next.js shell, route
presentation, and server adapter boundaries. It imports all domain keys and
policy behavior from platform-core. It must not duplicate them.

## Dependency direction

Platform web depends on platform core. Platform core never depends on platform
web. The preserved game depends on neither. Future infrastructure adapters may
depend on provider SDKs only inside server-only platform-web boundaries after a
separate approved phase.

## Root commands

- `npm run serve`: serve the preserved static repository on port 4173.
- `npm run dev:platform`: run the shell on port 3000 and the static game on
  port 4173, with a server-controlled legacy-game destination.
- `npm run build`: create the platform-web production build.
- `npm run lint`: lint repository scripts and the Next.js workspace.
- `npm run typecheck`: strictly type-check every workspace.
- `npm run test:content`: audit canonical hashes and curriculum references.
- `npm run test:unit`: run platform-core and adapter unit tests.
- `npm run test:e2e:platform`: run platform-shell browser regression tests.
- `npm run test:e2e:canonical`: run the canonical v7 suite.
- `npm run test:e2e`: run current and historical game suites.
- `npm run test:security`: inspect the production client bundle and core source.

The root lockfile is authoritative. Next.js is explicitly rooted at this
repository so tooling cannot inherit a lockfile or configuration from a parent
directory.
