# Deployment Topology

Status: intended topology only. Phase 1C does not deploy or add deployment
configuration.

## Current production

GitHub Pages publishes the repository `docs/` directory. It serves
`docs/index.html` as Math Vocabulary Hunt v7 and `docs/vocab.js` as its
curriculum dependency. This remains the public product and rollback baseline.

## Future preview

The approved Next.js application in `apps/platform-web` may later receive a
separate Vercel preview deployment. That preview must use its own URL and a
server-controlled `LEGACY_GAME_URL` pointing to the current public static game.
It must not modify the production domain, GitHub Pages source, DNS, or v7 files.

## Future service boundaries

Supabase is the intended future database and teacher-authentication provider,
and Stripe is the intended future billing provider. Neither is installed or
configured in Phase 1C. When approved for implementation, provider secrets and
service-role operations remain server-only. Billing reconciliation may create
or revoke trusted entitlements; the browser and payment pages never grant
access directly.

## Cutover gate

No production-domain cutover occurs until the replacement passes gameplay
parity, accessibility, content integrity, authorization, isolation, security,
performance, observability, and rollback tests. Static v7 remains available
through the cutover window. Removing it requires a separate owner decision and
a recoverable archive.

## Rollback

Before cutover, rollback is simply disabling the preview; current production is
unchanged. After any future cutover, DNS and hosting procedures must retain a
tested route back to static v7 without bypassing access controls for features
that have actually launched as protected.
