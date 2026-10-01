# MathNexa Security Debt Register

Every known security finding that is not fixed, with why. Kept in one place so
"we decided that was fine" is a recorded decision rather than folklore.

Status values: **FIXED** (closed, with a standing test), **ACCEPTED** (judged not
worth the remediation risk), **DEFERRED** (worth doing, scheduled),
**OWNER-GATED** (needs a decision or credentials this work cannot supply).

## Closed

| ID | Sev | Finding | Closed in |
|----|-----|---------|-----------|
| MN-01 | HIGH | No security response headers on any document | Phase 1 (`v1.2.4`) |
| MN-02 | HIGH | No rate limit on consumer sign-in, sign-up or recovery | Phase 1 (`v1.2.4`) |
| MN-03 | MED | HSTS without `includeSubDomains` | Phase 1 (`v1.2.4`) |
| MN-04 | MED | Unsanitised filename in `Content-Disposition` | Phase 1 (`v1.2.4`) |
| MN-05 | LOW | `X-Powered-By` disclosed the framework | Phase 1 (`v1.2.4`) |
| MN-09 | LOW | Staging flag compared strictly, so a newline disabled the gate | Phase 1 (`v1.2.4`) |
| PH2-01 | HIGH | Caller-controlled user agent in the rate-limit key | Phase 2 |
| PH2-02 | HIGH | Distributed guessing against one account uncapped | Phase 2 |
| PH2-03 | HIGH | Authorized-code gate locked out whole schools | Phase 2 |
| PH2-04 | MED | Locked staging served rendered pages via a path suffix | Phase 2 |
| PH2-05 | MED | Confirmation resend throttled only by a caller-owned cookie | Phase 2 |
| PH2-06 | MED | Consumer and public surfaces emitted no security events | Phase 2 |
| ON-01 | HIGH | IPv6 spellings of private IPv4 passed as public (SSRF) | Overnight |
| ON-02 | HIGH | Admin limiter keyed on a spoofable address | Overnight |
| ON-04 | MED | Account lockout was indefinite, not temporary | Overnight |
| ON-05 | LOW | Staging gate exemption matched case variants | Overnight |
| ON-06 | MED | Event redaction filtered by key name only | Overnight |
| ON-07 | MED | Spray observation counted every attempt, so it fired on ordinary classroom sign-ins | Overnight |
| ON-08 | MED | Limiter secret had an upper length bound, breaking the fail-closed invariant | Overnight |
| ON-09 | MED | Password change made an unbounded revocation call and logged a revocation that may not have happened | Overnight |
| ON-10 | MED | Recovery did not clear the account-target block, so the documented escape hatch was false | Verification |
| ON-11 | MED | Consumer and school limiters accepted any string as the client address | Verification |
| ON-12 | LOW | Throttle and staging-denial events defeated de-duplication | Verification |
| ON-13 | LOW | Credential-shape redaction had no standing test coverage | Verification |
| CSP-01 | LOW | Under `next dev` the platform headers replaced the internal game documents' and game-package assets' own headers (`base-uri 'none'` blocked the games' `<base href>`), so the local internal-game and package-delivery e2e checks failed; hosted unaffected (`internal-game-csp-parity.md`) | `v1.2.20` |
| PKG-01 | MED | Package-game sub-assets 404 in Chrome/Edge since `bd85de2`: the sandboxed (opaque-origin) frame sends no SameSite=Lax cookie on sub-resources and assets were authorized by the cookie session only; fail-closed, no exposure. Now ticket-authenticated with a per-asset server re-check of the ticket principal (`package-game-asset-tickets.md`) | `v1.2.20` |

---

## Accepted

### MN-06 — Admin route existence distinguishable by status code — LOW

`GET /admin/users/action` returns `405` while `/admin` returns a concealment
`404`, so the path's existence is confirmable.

**Accepted.** A uniform `404` means adding a `GET` handler to ~35 route files:
broad churn across the entire admin surface to withhold a path name from an
attacker who still faces Supabase authentication, an `admin_users` record,
enrolled MFA at `aal2`, a bound server-side session and an HMAC CSRF token.
Existence is not what protects the console. The overnight audit added that admin
route existence is already inferable from at least three other public surfaces,
so a uniform `404` would not even achieve concealment.

### MN-07 / MN-10 — Public build identifier — LOW / INFO

`/api/health` and `/status` return a 40-character commit SHA to anonymous
callers, and the value is currently 34 commits behind what is deployed.

**Accepted, with a correction that matters more than the disclosure.** The
repository is private, so the SHA is of limited use to an attacker, and several
e2e specs plus a standing audit script consume the endpoint. But because the
value is set independently of the deployment, **`/api/health` must never be used
to verify what is deployed** — confirm from the Vercel deployment ID. That trap
is recorded in the incident-response runbook.

### MN-08 — `script-src 'unsafe-inline'` — INFO

**Accepted for now.** See `csp-nonce-feasibility.md`. Removing it costs static
generation across the marketing surface to defend against a sink type the
application has zero of.

### MN-11 — Locked staging serves static assets — LOW

`/_next/static/**` and the root icons remain public on locked staging.

**Accepted as originally scoped.** Blocking them protects nothing unique: the
production bundle is already publicly downloadable and has been scanned clean of
secrets and privileged logic in every phase. Routing every asset through the
proxy would add a Supabase round trip per request for no gain. Its *extension* —
rendered application documents leaking through the same matcher — was a different
question and was fixed as PH2-04.

### PKG-02 — Gated staging refuses Chromium package sub-assets — LOW

The staging gate exempts ticketed package assets only at `/games/<UUID>/runtime/assets/…`
(`lib/staging-access/server.ts`), but the launch redirects to `/games/<slug>/runtime/assets/…`.
Chromium sends no SameSite=Lax staging cookie from the sandboxed frame, so on a *gated* staging
alias package CSS/JS are refused by the gate. Production has no gate and branch previews are
ungated, so the product is unaffected.

**Accepted (pre-existing, staging-only).** Review package games on an ungated preview. Fixing
it means widening the 7D gate exemption or redirecting by resource UUID: an owner decision.

### PKG-03 — A package sub-asset URL is a 300-second bearer credential — INFO

Without cookies, a ticketed asset URL serves one package's assets for one principal for at
most 300 s, and only while that principal still passes the server re-check. Signing out does
not end an issued ticket early; suspension, entitlement changes, deletion, school-access
removal and school secret rotation take effect on the next request. It cannot launch a game.

**Accepted.** This is what lets the opaque-origin sandbox stay cookie-less (requirement C of
`package-game-asset-tickets.md`); the window is the existing 300-second ticket lifetime.

### CSP-02 — Local runtimes serve configured headers over route headers — INFO

Under `next dev` / `next start` a header set by `next.config.mjs` wins over the
same header from a route response (Next.js 16 `send-response.js`); on Vercel
the route's wins. CSP-01 makes `next dev` leave the internal game documents
and the game-package assets to their own headers. Every other route with its
own stricter headers (`/game/runtime`, resource downloads and previews, media)
is still served the looser platform values locally, and a local `next start`
(which serves the production build's rules) also serves the game documents
the platform CSP.

**Accepted.** Local-only and looser, never stricter; production and staging
serve each route's own headers. Rule for future work: never rely on a route
header overriding a configured one under `next dev` / `next start`.

### ON-07 — `unrs-resolver` executes a postinstall script — INFO

The only package in the tree with an install lifecycle script.

**Accepted.** It is dev-only: it arrives via `eslint-config-next` →
`eslint-import-resolver-typescript`, and the production tree
(`npm ls --omit=dev`) is empty of it. It never ships.

---

## Deferred

### ON-08 — `admin_auth_rate_limits` has no TTL or purge — MEDIUM

Rows accumulate per subject with no expiry. PH2-01 removed the cheapest way to
grow the table, and the overnight work bounded row creation to three per
address/account rather than one per forged user agent — but there is still no
purge. Because the limiter fails closed, a table that eventually degrades becomes
an authentication outage.

**Deferred**: needs a database migration, and applying migrations unattended to
production is out of scope. **Next phase.**

### ON-09 — Six teacher tables lack `FORCE` RLS — MEDIUM

Six Phase 1D teacher tables have RLS enabled but not forced, and `service_role`
holds broad grants on them.

**Deferred**: a policy change to live tables, which must not be applied
unattended. Prepare the migration, review, apply with the owner present.

### ON-10 — Unauthenticated media and preview routes proxy whole files — MEDIUM

`/media/[assetId]` and `/resources/[id]/preview/[fileId]` stream entire Supabase
Storage objects through the function per request, `no-store`. An egress cost
amplifier rather than a data exposure — both only serve published content.

**Deferred**: the fix is a caching or signed-redirect strategy, which is a
delivery change deserving its own testing.

### ON-11 — `/media/[assetId]` marks mutable content immutable for a year — LOW

`Cache-Control: public, max-age=31536000, immutable` on an admin-replaceable
asset means a takedown or correction cannot be propagated.

**Deferred**: an operational correctness issue more than a security one.

---

## Owner-gated

### ON-03 — Password change accepts any session — OWNER-GATED

`updatePasswordAction` accepts any authenticated session, not only one from a
recovery link, and never asks for the current password. Whoever holds a session
can set a new one — turning a borrowed or stolen session into a permanent
takeover.

**Containment is shipped**: every *other* session is now revoked on a successful
change, so the window closes the moment the password changes, and the event is
recorded.

**The complete fix requires an owner decision**, because it changes the password
recovery journey and cannot be verified end to end without a live Supabase
session. Two workable designs:

1. Require the current password whenever the session is not a recovery session,
   distinguishing the two from the session's `amr` claim.
2. Have `/auth/callback` set a short-lived signed recovery-intent cookie when it
   exchanges a recovery code, and require either that cookie or the current
   password.

Design 2 depends only on values this application controls and is the safer of the
two to implement without live testing.

### ON-12 — Security events have no read path — OWNER-GATED

The taxonomy now emits at eleven denial points, but nothing reads it: no log
drain, short retention, no alerts. **Writing events without a reader produces the
appearance of detection.** Exact configuration steps are in the Phase 2 report;
they need dashboard access.

### ON-13 — Dedicated rate-limiter secret not yet set in production — OWNER-GATED

`MVH_AUTH_RATE_LIMIT_SECRET` is now preferred by the resolver, with the legacy
`MVH_ADMIN_CSRF_SECRET` retained as a fallback so nothing breaks. Production has
not been changed. To migrate, the owner sets the variable on the production
project and redeploys; no code change is needed. Rotating resets limiter
counters, which is harmless.

### ON-14 — `/.well-known/security.txt` not published — OWNER-GATED

A vulnerability-reporting address is worth publishing, but it commits to a
contact and a response expectation. Not published unilaterally. A proposed file
is in `docs/security/security-txt-proposal.md`.

### ON-15 — HSTS `preload` — OWNER-GATED, recommendation **DEFER**

All three hosts are HTTPS-only, so the technical precondition is met. Preload is
nonetheless a one-way door: removal takes months to propagate, and it binds every
future subdomain to HTTPS forever. The marginal gain over
`max-age=63072000; includeSubDomains` is the first-visit window only.
**Recommendation: DEFER** until the subdomain plan is settled.

### ON-16 — Vercel Firewall rules designed but not applied — OWNER-GATED

Both projects show `Firewall: Not configured`, `Attack Mode: Off`, System
Mitigations active. Proposed rules are in the Phase 2 report; all use `challenge`
or `log`, never `deny`, and the auth rule keys on **`ja4`** rather than `ip`
because a school shares one address. Applying them changes live traffic handling
and was deliberately left to the owner.
