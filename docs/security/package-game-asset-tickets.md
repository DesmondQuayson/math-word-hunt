# Package-game asset tickets (v1.2.20)

This record covers hosted ZIP package games (Phase 8E, `docs/phase-8e-game-package-importer.md`): how their sub-assets are authorized after the v1.2.20 fix. The change needs no database migration and no environment change.

## 1. Defect

- `app/games/[resourceId]/page.tsx` renders a package game in `<iframe sandbox="allow-scripts">`. The document therefore has an opaque origin, which is required isolation and must stay.
- That frame loads `/games/<slug>/runtime?ticket=…`. The route checks the cookie session, then redirects with 307 to `/games/<slug>/runtime/assets/<ticket>/<entry>`. The entry page then loads its own CSS and JS from the same ticketed path.
- Since `bd85de2` (2026-08-23, "Add inline authorized school access"), `authorizeSubscriberGameAsset` has authorized every asset with the **cookie session** (`getGameAccessView`) and required it to be the ticket principal.
- **Chromium sends no SameSite=Lax cookie on sub-resource requests from an opaque-origin frame. WebKit does.** I proved this with a minimal Chromium/WebKit probe. For each request it logged `Cookie` and `Sec-Fetch-Dest` (navigations: cookie sent, `iframe`; sub-resources: Chromium no cookie, WebKit cookie, `style`/`script`). The restored Phase 8E e2e shows the same.
- The effect in Chrome and Edge: the entry HTML loaded, but the package's `styles.css` and `main.js` returned 404, so the games did not work. Safari worked.
- The defect failed closed: it denied access and granted none.

## 2. Model after the fix (`lib/games/ticket.ts`)

| Requirement | How it is met |
| --- | --- |
| A. The launch requires authenticated entitlement | `/runtime` is unchanged and cookie-only: a session, an allowed decision, a ticket whose kind and id equal the session principal, and (for consumers) `record_game_package_launch`. A valid ticket without a session returns 404. |
| B. Mint only after authorization | `page.tsx` mints only behind `requireProductAccess("/games")` and `access.decision.allowed && access.principal`, for that principal and its kind. |
| C. Sub-assets may use the ticket | The asset route accepts the signed ticket alone when the request carries no session. |
| D. Server re-check per asset | With a session present, it must **be** the ticket principal (kind and id) and hold games access. A mismatch is final and is never retried without the cookie. With no session: a **consumer** is re-read with the **service role** (`consumer_accounts` row, entitlement evidence, `decideMathNexaAccess`, games), exactly as the session path decides it, with no provider calls and no writes; a **school-access** ticket requires school access to still be configured. |
| E. Lifetime | Unchanged: minted as `issuedAt + 300` and verified as exactly 300 s, with +5 s issue skew. |
| F. Binding | The six-field v1 payload is unchanged (`v, aud, packageId, principalId, issuedAt, expiresAt`). The audience and package are checked as before. The principal **kind** is proven by which key verifies: consumer and admin-preview tickets use the delivery secret, byte-identical to before; school-access tickets use `HMAC(delivery, "mathnexa-game-ticket:school-access:v1:" + school session secret)`. |
| G. Fail closed | Forged, non-canonical, expired, future-dated, wrong-lifetime, wrong-audience, wrong-package, mismatched or revoked tickets return 404 with `no-store`. So do a missing service client, a read error, and use outside production-platform mode. |
| H. Nothing sensitive exposed | The package sees only its own ticket: the six fields above, including the principal UUID or school session id that has been in the ticket since `fae05cf`/`bd85de2`. It never sees provider ids, cookies, secrets, keys or entitlement state. |
| I. Sandbox | Unchanged: `sandbox="allow-scripts"` and `referrerPolicy="no-referrer"`. The audit requires exactly one package iframe per page, exactly that sandbox, and no spread attributes. |

### School access

School sessions are stateless signed cookies with no server record. Their tickets are therefore:

- **Never longer than the session.** Minting refuses a school ticket unless the session ends at or after the ticket's expiry. In the last 5 minutes of a 12-hour session, the page shows the access card instead of the frame.
- **Revoked with the session's own levers.** Removing school access, or rotating `MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET`, makes every in-flight school ticket unverifiable.

## 3. Bearer semantics (accepted, requirement C)

- **What a sub-asset URL grants:** without cookies, it works for at most 300 s, for one package and one principal, and only while that principal still passes the server re-check. It cannot launch.
- **What takes effect on the next asset request:** suspension, entitlement changes, account deletion, school configuration removal and school secret rotation.
- **What does not end an issued ticket early:** signing out. The window is at most 300 s.

## 4. Verification

| Check | Result |
| --- | --- |
| `lib/games/ticket.test.ts` | Golden vector (unchanged wire format), payload and lifetime, expiry boundary (299/300/301), wrong lifetimes, binding, eight forgery shapes including a non-canonical MAC, school expiry guard, school revocation, inline account mapping pinned to `resolveConsumerContext()`, cookie-less re-check (13 refusals and positive controls), revocation after minting, fail-closed paths, session mismatch, school principals, kind confusion, admin tickets |
| `lib/games/package-runtime-route.test.ts` | The asset route never delivers a refused asset; the launch needs the cookie session and its exact principal; Admin preview assets never consult the cookie session |
| `e2e/phase8e/public-game-delivery.spec.ts`, Chromium **and** WebKit | HTML, CSS and JS load in the script-only sandbox (Chromium sub-resources proven cookie-less; frame origin `null`); unauthenticated and unentitled refused; expired, wrong-lifetime, future-dated, forged and wrong-audience refused; principal mismatch refused with and without a session; package mismatch refused; entitlement expiry and account suspension after minting refused within the 300 s window; school access loads cookie-less and is bound to its session and key |
| `e2e/phase8e/admin-game-package.spec.ts` | Admin preview stays a script-only sandbox with ticket-only 300 s admin-preview assets; wrong audience, lifetime, expiry, package and MAC are refused |
| Negative control | With the pre-fix `ticket.ts`, `page.tsx` and `runtime/route.ts`, the new spec fails in Chromium and passes the entitled load in WebKit, which reproduces the defect |
| `scripts/audit-phase8e-security.mjs` | Pins every property above, with boundary-exact lifetime pins that also close the earlier `+3000` / `!==3000` substring gap; the audit mutation harness catches every one of its 59 8E cases |

## 5. Not changed, and known limits

- The cookie-scoped consumer context (`lib/auth/consumer-context.ts`), billing, entitlements, the admin preview, delivery headers and CSP, migrations and environment are all untouched.
- **Complimentary-only accounts.** The service-role re-check cannot see complimentary grants (`get_own_active_complimentary_entitlement` is keyed on `auth.uid()`). `record_game_package_launch` already refuses complimentary-only accounts at launch, so no reachable user is newly denied.
- **Staging gate.** The gate's exemption (`lib/staging-access/server.ts`) matches `/games/<UUID>/runtime/assets/…`, while the launch redirects to `/games/<slug>/…`. On a gated staging alias, Chromium sub-assets are still refused by the gate. Production has no gate, and branch previews are ungated. This is pre-existing and recorded as PKG-02.
