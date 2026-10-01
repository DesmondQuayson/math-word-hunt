/**
 * Routes that answer with their OWN security headers, and the source pattern
 * the local development server uses for the platform header rule so that it
 * leaves those routes alone.
 *
 * Lives as `.mjs` for the same reason as `headers.mjs`: `next.config.mjs`
 * imports it before the TypeScript pipeline exists.
 *
 * When `next.config.mjs` and a route response both set a header, the runtimes
 * pick opposite winners:
 *
 *   - Vercel (production, staging): the function's header replaces the
 *     configured header of the same name, so these routes are served with
 *     their own Content-Security-Policy, Permissions-Policy, X-Frame-Options
 *     and Referrer-Policy.
 *   - `next dev` / `next start` (Next.js 16, server/send-response.js): a
 *     response header is copied only if the configuration has not already
 *     set that name, so locally the platform values replaced them.
 *
 * Locally that broke the routes below. The internal game documents load their
 * bundle relative to `<base href="/internal-games/<game>/">`, which the
 * platform CSP's `base-uri 'none'` blocks, so no internal game mounted under
 * `next dev` from ec0cbf7 (2026-08-30). The game-package asset routes compute
 * a per-request CSP (`lib/games/delivery.ts`) that the platform policy hid, so
 * the Phase 8E delivery checks could not see it.
 *
 * Under PHASE_DEVELOPMENT_SERVER only, `next.config.mjs` applies the platform
 * rule to every path EXCEPT these routes, so `next dev` serves them exactly
 * the headers their route returns - what Vercel serves. Every `next build`
 * (every Vercel deployment, and the routes manifest `next start` serves)
 * keeps the unconditional `/:path*` rule and is unchanged.
 * test/security/internal-game-header-parity.test.ts pins both. See
 * docs/security/internal-game-csp-parity.md.
 */

/** Next.js `source` patterns of the routes that send their own security headers. */
export const ROUTE_OWNED_HEADER_SOURCES = Object.freeze([
  // Internal game documents: CrossCalc, Number Cross, Number Logic, Math Tug of War.
  "/games/:resourceId/play",
  "/games/crosscalc/v2/preview",
  "/admin/games/catalog/:catalogId/preview",
  // Game-package assets (ticketed public play and Admin preview, Admin thumbnail).
  "/games/:resourceId/runtime/assets/:ticket/:asset*",
  "/admin/games/:packageId/preview/assets/:ticket/:asset*",
  "/admin/games/:packageId/thumbnail"
]);

/**
 * `next dev` source for the platform header rule: every path except
 * ROUTE_OWNED_HEADER_SOURCES (the parity test proves the two agree).
 */
export const DEVELOPMENT_PLATFORM_HEADER_SOURCE =
  "/:path((?!games/[^/]+/play$|games/crosscalc/v2/preview$|admin/games/catalog/[^/]+/preview$|games/[^/]+/runtime/assets/[^/]+/.+|admin/games/[^/]+/preview/assets/[^/]+/.+|admin/games/[^/]+/thumbnail$).*)";
