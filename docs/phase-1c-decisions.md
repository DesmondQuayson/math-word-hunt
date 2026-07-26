# Phase 1C Decisions

Date: 2026-07-26. Status: implemented unless marked deferred.

## Approved and implemented

- Use npm workspaces with `apps/platform-web` and
  `packages/platform-core`.
- Use Next.js 16 with strict TypeScript and the App Router for the isolated
  future shell.
- Treat Vercel as the intended future Next.js host without adding deployment
  configuration or performing a deployment.
- Keep the platform-core package framework- and provider-independent and expose
  one intentional public API.
- Keep the teacher identity adapter anonymous in production Phase 1C runtime.
- Use a production entitlement reader with no grants, producing default-deny
  product and feature access.
- Keep explicit entitlement fixtures in a test-only adapter file; never select
  fixtures from request, browser, environment, query, cookie, or storage input.
- Link to the canonical static game through a server-controlled destination;
  do not embed or migrate gameplay.
- Keep the initial account direction teacher-only with no student accounts.

## Approved direction, deferred implementation

- Supabase for future data and teacher authentication.
- Stripe for future billing.
- Vercel preview and production hosting operations.

No provider SDK, project configuration, key, secret, database, migration,
authentication flow, checkout, subscription, price, or customer portal is
added in Phase 1C.

## Dependency security decision

Next.js 16.2.12, React 19.2.8, and matching lint packages are pinned. Patched
transitive versions of PostCSS, Sharp, Minimatch, and Brace Expansion are
enforced through root npm overrides. ESLint is pinned to the supported 9.x line
because the latest 10.x release is not yet compatible with the current React
lint plugin. The clean regenerated lockfile audits with zero vulnerabilities.

## Still requiring owner approval

- Teacher login methods, email verification, recovery, session duration, and
  administrative provisioning.
- Supabase project region, environments, data retention, RLS design, and schema
  migration approval.
- Vercel team/project ownership, preview hostname, environment separation, and
  public legacy-game URL.
- Stripe commercial model, pricing, refunds, taxes, webhook operations, and
  entitlement reconciliation rules.
- Reporting purpose, collected fields, retention, export, deletion, and school
  privacy review.
- Feature-to-plan mapping and downgrade behavior.
- Public cutover, DNS, and static-game retirement.
