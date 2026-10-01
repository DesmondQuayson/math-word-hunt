# Route-owned security headers: local parity under `next dev`

This is a v1.2.20 fix to local development only. **No production or staging response changes.**

Every `next build` produces exactly the same header rules before and after this fix. That covers every Vercel deployment and the routes manifest a local `next start` serves. `apps/platform-web/test/security/internal-game-header-parity.test.ts` asserts it.

This is a reviewed, narrowed port of the unmerged `fix/local-internal-game-csp-parity` (`27dd1eb`, 2026-09-18). §4 lists the differences.

## 1. Symptoms (all on untouched `main` 9f317bc, all local `next dev`)

| Suite | Baseline result | Cause |
| --- | --- | --- |
| `test:e2e:number-cross` | 1/1 failed | the game never mounted (only "Skip to game" rendered) |
| `test:e2e:number-logic` | 2/2 failed | the game never mounted |
| `test:e2e:crosscalc:v2` | 2/2 failed (Chromium, WebKit) | the game never mounted |
| `test:e2e:game-suite` | 6/6 failed | Number Logic never mounted |
| `test:e2e:phase8e` (`public-game-delivery.spec.ts`) | hidden behind a stale sign-in check | the package document's own CSP and Permissions-Policy were not served |

## 2. Root cause

**Layer 1: configured headers replace route headers locally.**

`next.config.mjs` sends the platform security headers on `/:path*`. Several routes return their own, stricter headers:
- the internal game documents (`base-uri 'self'` for their `<base href="/internal-games/<game>/">`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, …);
- the game-package assets (a per-request CSP built in `lib/games/delivery.ts`, plus their own Permissions-Policy).

When the configuration and a route response both set a header, the runtimes pick opposite winners:
- **Vercel:** the function's header replaces the configured one.
- **`next dev` / `next start`** (Next.js 16, `next/dist/server/send-response.js`): a response header is copied only if the configuration has not already set that name.

Locally, therefore, the platform CSP (`base-uri 'none'`) blocked every `<base>`, so the bundles 404ed and no internal game mounted. The package documents also ran under the platform policy.

The earlier scope note in `lib/security/headers.mjs` said a browser receiving two CSPs "enforces both". That was wrong: each runtime serves one policy. The note has been rewritten.

**Layer 2: React's development eval.**

React's development build calls `eval` to rebuild server call stacks. Without `'unsafe-eval'` it logs "eval() is not supported in this environment" on every Next page. In WebKit, the dev overlay's follow-up `/__nextjs_original-stack-frames` fetch also surfaced as a page error. These failed the suites' clean-console checks. Production React never uses eval.

## 3. Fix: `next dev` only

| File | Change |
| --- | --- |
| `apps/platform-web/lib/security/route-owned-headers.mjs` (new, plus `.d.mts`) | `ROUTE_OWNED_HEADER_SOURCES` lists the routes that send their own security headers. `DEVELOPMENT_PLATFORM_HEADER_SOURCE` is every other path. |
| `apps/platform-web/next.config.mjs` | The config is now a function of Next's phase. Under `PHASE_DEVELOPMENT_SERVER` only, the platform rule uses `DEVELOPMENT_PLATFORM_HEADER_SOURCE`, so `next dev` serves those routes exactly the headers their route returns, as Vercel does. It also uses `buildSecurityHeaders(process.env, { developmentServer: true })`. Every build keeps `{ source: "/:path*", headers: buildSecurityHeaders() }`. |
| `apps/platform-web/lib/security/headers.mjs` (+ `.d.mts`) | A `developmentServer` option that adds `'unsafe-eval'` to `script-src`. Only a literal `true` enables it. This is the CSP pattern the Next.js documentation gives for development. The scope note is corrected. |
| `apps/platform-web/test/security/internal-game-header-parity.test.ts` (new, runs in `npm run test:security`) | The standing gate (§5). |

Routes left to their own headers under `next dev`:
- `/games/:resourceId/play`
- `/games/crosscalc/v2/preview`
- `/admin/games/catalog/:catalogId/preview`
- `/games/:resourceId/runtime/assets/:ticket/:asset*`
- `/admin/games/:packageId/preview/assets/:ticket/:asset*`
- `/admin/games/:packageId/thumbnail`

## 4. Differences from `27dd1eb`

- **Development server only.** `27dd1eb` added game-route CSP rules in every phase, which changed Vercel's CSP on non-document answers on those paths. Here production is untouched.
- **No duplicated policy.** `27dd1eb` copied the game document CSP into the configuration and rewired `lib/games/internal-registry.ts`. That registry has since gained Math Tug of War and document options. Here the registry is untouched, and `next dev` simply stops overriding the routes. This also covers the per-request package CSP, which a static rule cannot express. Under `next dev` the internal game documents and package documents now get all of their own headers, including `X-Frame-Options: DENY`, not only their CSP.
- **`'unsafe-eval'`** is kept from `27dd1eb`, for `next dev` only. It removes the cause (React's development eval and the overlay's follow-up fetches) instead of filtering their messages spec by spec.

## 5. Gate

`internal-game-header-parity.test.ts` evaluates the shipped `next.config.mjs` for each Next phase and compiles its rules with Next.js's own `buildCustomRoute`. It applies those rules to the real route responses under both precedence models. It asserts:
- Each build phase has exactly the four previous rules, with no `'unsafe-eval'` anywhere.
- `next dev` differs from a build only in the platform rule's source and the development `'unsafe-eval'`.
- Exactly the route-owned paths are left alone, and 19 other paths (Home, Math Games, the MVH runtime, Admin, API, …) still get the platform headers.
- For every internal game document, the CrossCalc V2 preview and every Admin catalog preview, `next dev` serves every header the route sets with the value Vercel serves.
- Every route file that serves a game document or package asset is left to its own headers.

Negative controls: with the development source switched back to `/:path*`, the parity tests fail; with the development rules applied in every phase, the build-phase tests fail.

## 6. Remaining local/hosted differences (CSP-02, accepted)

These are local-only, looser and non-breaking:
- Routes not listed above still get the configured platform values under `next dev` / `next start`, for example `/game/runtime`, resource downloads and previews, and media.
- Under `next dev`, the route-owned paths get no platform header that their route does not set itself (for example HSTS on plain-HTTP localhost).
- A local `next start` serves the production manifest, so it still gives the game documents the platform CSP. No suite plays games under `next start`.

Rule: never rely on a route header overriding a configured one locally.
