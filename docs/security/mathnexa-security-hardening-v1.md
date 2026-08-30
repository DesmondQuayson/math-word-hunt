# MathNexa Security Hardening — Phase 1

**Baseline reviewed:** release `v1.2.3`, annotated tag object `3270a7a8`, peeling to commit
`201e7d4891c452c986353600ad3d25f8fe7a7a49`.
**Production at time of review:** `https://mathnexa.com` serving
`mathnexa-platform-production-kv9vnqu2t` / `dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd`.
**Branch:** `security/mathnexa-hardening-phase-1`, cut from `201e7d4`.
**Production changed by this phase:** no. Nothing was deployed, tagged or merged.
**ShowMe / MAP Prep:** untouched. `showme.mathnexa.com` was read once, for
comparison only, and neither its code nor its deployments were modified.

Scope was the main MathNexa platform in the `math-word-hunt` monorepo
(`apps/platform-web`, `packages/platform-core`).

---

## Headline

The platform's authorization core is genuinely well built, and most of the
categories in the brief were already closed before this pass started. The
authorized-code path, the entitlement decision, the admin console and the
redirect handling are all server-authoritative and were found correct under
direct attack. The real gap was at the edge: the application shipped **no
security response headers at all** — no CSP, no framing control, no
`nosniff`, no referrer or permissions policy — and consumer authentication had
**no rate limit**, which in a server-action architecture means no effective
limit at all.

Two HIGH findings, three MEDIUM/LOW, no CRITICAL. All HIGH and MEDIUM findings
are fixed on the branch.

---

## Findings

| ID | Severity | Finding | Fixed |
|----|----------|---------|-------|
| MN-01 | HIGH | No security response headers on any application document — clickjacking on authenticated pages, no XSS defence in depth | Yes |
| MN-02 | HIGH | No rate limit on consumer sign-in, sign-up or password recovery | Yes |
| MN-03 | MEDIUM | HSTS asserted without `includeSubDomains` | Yes |
| MN-04 | MEDIUM | Unsanitised filename interpolated into a `Content-Disposition` header | Yes |
| MN-05 | LOW | Framework and version advertised via `X-Powered-By` | Yes |
| MN-06 | LOW | Admin route existence disclosed by a `405` on `GET` | No — documented |
| MN-07 | INFO | `/api/health` returns the exact build commit SHA to anonymous callers | No — documented |
| MN-08 | INFO | Nonce-based CSP not yet possible; `script-src` retains `'unsafe-inline'` | No — P1 roadmap |

---

### MN-01 — HIGH — No security response headers

**Component:** `apps/platform-web/next.config.mjs`; every HTML document route.

**Attack scenario.** An attacker frames `https://mathnexa.com/account` or
`/subscription` inside their own page, overlays it, and lures a signed-in
customer into clicking through a state change — cancelling a subscription, or
submitting a profile mutation. Nothing in the response prevented the framing.
The same absence removed every layer of defence in depth behind the app's XSS
posture: had any injection been found, there was no CSP to contain it, and no
`nosniff` to stop a MIME-confusion upgrade on a served file.

**Evidence.** Live production, `dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd`:

```
$ curl -sS -D - -o /dev/null https://mathnexa.com/sign-in
HTTP/1.1 200 OK
Strict-Transport-Security: max-age=63072000
X-Powered-By: Next.js
```

That was the entire security-header surface. No `Content-Security-Policy`, no
`X-Frame-Options`, no `frame-ancestors`, no `X-Content-Type-Options`, no
`Referrer-Policy`, no `Permissions-Policy` — on `/`, `/sign-in`, or any other
document. The sibling product `showme.mathnexa.com` already ships a complete
CSP and `includeSubDomains`, which is what confirmed this was a gap on this app
rather than a constraint of the stack.

**Fix.** New `apps/platform-web/lib/security/headers.mjs`, applied to `/:path*`
from `next.config.mjs`. It sets `Content-Security-Policy`,
`Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Opener-Policy` and
`X-Permitted-Cross-Domain-Policies`.

Two decisions inside that policy were made against real product constraints
rather than against a checklist, and both are worth recording:

- **`frame-ancestors 'self'`, not `'none'`.** The game runtime is legitimately
  framed by `/games/[resourceId]` in a sandboxed same-origin iframe. `'none'`
  would have broken every hosted game. `'self'` still blocks the actual attack,
  because an attacker cannot serve a framing page from our own origin.
- **`form-action 'self' https://checkout.stripe.com https://billing.stripe.com`.**
  Subscribing and opening the billing portal are form submissions whose response
  redirects to Stripe's hosted pages. Firefox enforces `form-action` against the
  redirect target as well as the initial post, so a bare `'self'` would have
  silently broken checkout and the billing portal. These are the only two
  external form destinations the product has.

The module is deliberately shared between the shipped config and the test suite,
so the policy that is asserted and the policy that is served are one value.

**Tests.** `test/security/security-baseline.test.ts` — presence of every header,
`frame-ancestors`/`X-Frame-Options` pairing, absence of any wildcard source or
`unsafe-eval`, the exact Stripe form-action set, and an assertion that the module
is actually wired into `next.config.mjs`.

**Verification.** Built and served locally; all headers present, `X-Powered-By`
gone, page renders with zero console errors and zero CSP violations, every CSS
and JS chunk `200`.

**Residual risk.** `script-src` still needs `'unsafe-inline'` — see MN-08.

---

### MN-02 — HIGH — No rate limit on consumer authentication

**Component:** `apps/platform-web/app/auth-actions.ts` — `signInAction`,
`signUpAction`, `forgotPasswordAction`.

**Attack scenario.** Unlimited online password guessing against any known
customer address, and unlimited automated account creation and recovery-mail
generation.

This is worse than it looks in a server-action architecture, and that is the
part worth being precise about. These actions call Supabase **from the server**,
so every attempt — the attacker's and a real classroom's alike — arrives at
Supabase from the same Vercel egress address. Supabase's own per-IP throttling
therefore sees one client for the entire internet and cannot separate them. The
platform was relying on a control that structurally could not apply.

**Evidence.** The codebase already had the right pattern in two other places and
simply had not applied it here. `lib/school-access/rate-limit.ts` throttles the
authorized code (5 attempts / 15 min), and `app/admin/actions.ts` throttles admin
login and MFA. A search for the limiter across the repository returned call sites
only in those two surfaces; `signInAction` had none.

**Fix.** New `apps/platform-web/lib/auth/rate-limit.ts`, wired into all three
actions. It reuses the **already-deployed** `consume_admin_auth_rate_limit`
Postgres function that admin login and the authorized-code gate have used since
Phase 8a. No new table, no migration, no Redis, no paid add-on. That function
pins its scope argument to `login | mfa`, so the three consumer surfaces are
separated inside the HMAC subject hash instead — the same technique
`lib/school-access/rate-limit.ts` already uses.

Budgets — deliberately shaped so a shared school NAT still works, since a whole
class signs in from one address:

| Surface | Attempts | Window | Block |
|---------|----------|--------|-------|
| Sign-in | 20 | 15 min | 15 min |
| Sign-up | 10 | 15 min | 15 min |
| Password recovery | 6 | 15 min | 30 min |

Three properties matter and are each tested:

- The throttle runs **before** the password is checked, so a blocked caller
  learns nothing about whether the address exists.
- A throttled password-recovery call returns the **same neutral success copy**
  as an accepted one. Otherwise the limiter itself becomes a user-enumeration
  oracle.
- Subjects are stored as a keyed SHA-256 hash, never as an address or IP.

**Availability policy — an explicit, non-obvious decision.** An *unconfigured*
limiter allows; a *configured* limiter that errors or is exhausted denies. The
first draft of this fix failed closed in both cases, and the existing
`confirmation-actions` test caught it immediately: a single missing environment
variable would have silently locked every paying customer out of the product.
That is a worse outcome than the window it closes, and "unconfigured" is a
deployment state rather than an attack signal. `limiterConfigured()` is exported
so a deployment check can assert production is never left in that state. This is
the one place in this phase where availability was deliberately weighted above
strictness, and it is called out here for the owner to overrule if they disagree.

Keying material resolves `MVH_AUTH_RATE_LIMIT_SECRET` → `MVH_ADMIN_CSRF_SECRET`
→ `SUPABASE_SECRET_KEY`. The last is the important one: the admin CSRF secret
only exists when the admin console is enabled, so keying solely on it would have
left the limiter unavailable on any deployment running without admin. **No new
environment variable is required for this fix to be active in production.**

**Tests.** Six cases — all three surfaces throttled, throttle-before-verify
ordering, per-surface subject separation, subject pseudonymisation, the neutral
recovery response, secret resolution independent of the admin console, and a
check that every budget sits inside the bounds the database function accepts (it
raises outside `1..20` attempts and `30..3600` seconds, which under the deny rule
would have taken sign-in down).

**Residual risk.** The limiter is per address + IP + user-agent. A distributed
attacker with many source addresses still gets more attempts than a single one.
Closing that needs per-account lockout or an edge control — see the roadmap.

---

### MN-03 — MEDIUM — HSTS without `includeSubDomains`

**Component:** response headers (previously Vercel's default only).

**Attack scenario.** A network attacker downgrades a request to a MathNexa
subdomain to plain HTTP and intercepts or injects. The apex asserted HSTS but
said nothing about subdomains.

**Fix.** `Strict-Transport-Security: max-age=63072000; includeSubDomains`.

`preload` was **deliberately not added.** It is a one-way door — removal from the
browser preload list is slow and partly outside our control — and that is an
owner decision, not a hardening-pass decision. A test asserts `includeSubDomains`
is present and `preload` is absent, so neither drifts silently.

**ShowMe interaction, checked before making the change:** `showme.mathnexa.com`
already sends `includeSubDomains` itself and is HTTPS-only on Vercel, so no
sibling host regresses. No ShowMe code or deployment was touched.

---

### MN-04 — MEDIUM — Unsanitised `Content-Disposition` filename

**Component:** `apps/platform-web/app/resources/[resourceId]/download/route.ts`.

**Attack scenario.** A stored filename containing a double quote or CRLF breaks
out of the quoted `filename="..."` parameter, allowing filename spoofing — a
learner-facing PDF presented under an attacker-chosen name and extension — or
header injection.

**Evidence.** The sibling routes already stripped these characters and this one
did not; the inconsistency is the bug:

```
app/admin/resources/.../route.ts   filename="${...normalized_filename.replace(/["\\\r\n]/g,"")}"
app/resources/[id]/download/route.ts   filename="${file.data.normalized_filename}"      <-- unsanitised
```

Reachability is conditional — the value is admin-controlled at upload and named
"normalized" — which is why this is MEDIUM and not HIGH.

**Fix.** Applies the same strip as its siblings. A test now asserts *every*
`Content-Disposition` filename in the app is sanitised, so a fourth route cannot
reintroduce it.

---

### MN-05 — LOW — `X-Powered-By: Next.js`

Advertised the framework to every visitor, letting an attacker skip fingerprinting
and target framework-specific issues. Fixed with `poweredByHeader: false`;
asserted by test.

---

### MN-06 — LOW — Admin route existence disclosed by `405`

`GET /admin/users/action` returns `405` with `Allow: POST`, while `/admin`
returns a concealment `404`. The `405` confirms the route exists.

**Not fixed, deliberately.** The fix is a `GET` handler returning `404` in each of
35 route files. That is broad churn across the entire admin surface — and
therefore real regression risk — to withhold a path name from someone who still
faces Supabase authentication, an admin record check, enrolled MFA at `aal2`, a
bound server-side session and an HMAC CSRF token before anything happens. The
existence of the path is not what protects the console. Recorded as P2.

---

### MN-07 — INFO — `/api/health` exposes the build commit SHA

```
$ curl https://mathnexa.com/api/health
{"status":"ready","environment":"production-platform","build":"e5c5294d…"}
```

Lets an attacker fingerprint the exact build. The repository is private, so the
SHA alone is of limited use, and the field is consumed by existing preview and
readiness tests. Removing it would break those for negligible gain. Recorded as
P2, to be dropped if the endpoint is ever revised.

---

### MN-08 — INFO — `script-src` retains `'unsafe-inline'`

The Next.js App Router emits inline bootstrap and RSC flight scripts on every
document. Removing `'unsafe-inline'` requires per-request nonces, which requires
every HTML response to be rewritten in `proxy.ts` and the nonce threaded through
the root layout. That is a structural change to a frozen release and does not
belong in a hardening pass smuggled in beside header work. `showme.mathnexa.com`
ships the same trade-off today. P1 — see roadmap.

---

## Category results

### Authentication — PASS after MN-02

Sign-in, sign-up, confirmation, session refresh, recovery, password update,
callback and sign-out were reviewed. Supabase is the identity provider and every
decision is taken server-side.

Already correct before this phase: error copy is uniform (`"The email or password
was not accepted."`), sign-up failures are generic, and `forgotPasswordAction`
returns the same response whether or not the address exists — **no user
enumeration** on any of the three. Password policy is enforced server-side.
`updatePasswordAction` requires a live recovery session. Admin sign-in is
separately protected by MFA at `aal2`, its own bound session and its own throttle.

Rate limiting was the single gap; MN-02 closes it.

### Authorization / RBAC — PASS

Roles that actually exist — no others were invented:

| Role | Games | MAP Prep | Homework | Quizzes | Account | Subscription | Admin | Entitlement ops |
|------|-------|----------|----------|---------|---------|--------------|-------|-----------------|
| Anonymous | deny | deny | deny | deny | deny | deny | deny | deny |
| Authenticated, unconfirmed | deny | deny | deny | deny | self | self | deny | deny |
| Subscriber (entitled) | allow | allow | allow | allow | self | self | deny | deny |
| Authorized-code (school) | allow | allow | allow | allow | n/a | n/a | deny | deny |
| Admin (`aal2` + bound session) | allow | allow | allow | allow | self | self | allow | allow |

All 49 route handlers were inventoried. Every one of the 35 admin routes calls
`inspectAdminAccess()` and refuses any non-`authorized` state with a concealment
`404`; every admin mutation additionally requires `validateAdminMutationCsrf`.
The one admin route without a session check —
`/admin/games/[packageId]/preview/assets/[ticket]/[...asset]` — is gated by an
HMAC-signed, 5-minute, audience-bound ticket instead, which was read and found
correct.

`decideAdminAccess` was tested against twelve single-condition downgrades
(revoked admin, no MFA enrolment, `aal1` only, missing or expired or foreign
session, and so on). Every one refuses.

Direct-route and direct-API access were tested against live production
unauthenticated: `/admin` → `404`, `/teacher` → `404`,
`/games/crosscalc/v2/preview` → `404`, `/api/internal/staging-access/bootstrap`
→ `404`, `/game/runtime/index.html` → `401`, resource download → `401`.
**Knowing a URL is never sufficient.**

### Paid access / entitlement — PASS

`getGameAccessView()` in `lib/game-access/server.ts` is the single authority. It
is `server-only`, reads entitlement evidence from Supabase, and defaults to deny
on every unconfigured or degraded path. It reads no `localStorage`, no
`sessionStorage`, no query parameter and no client-supplied state — asserted by
test.

**The authorized code is server-side and cannot be extracted.**
`getSchoolAccessConfiguration()` reads `MATHNEXA_SCHOOL_ACCESS_CODE` — no
`NEXT_PUBLIC_` prefix — and the repository contains a standing **negative test**
asserting the browser-public variant is refused. Comparison is HMAC-then-
`timingSafeEqual`, so it is constant-time over variable-length input. The school
session cookie is an HMAC-signed token with a fixed 12-hour lifetime, verified
server-side; forged, re-signed, tampered, wrong-key and expired variants were all
tested and refused.

Empirically confirmed against the **live production bundle** (12 chunks, 680 KB,
plus three page documents): zero occurrences of the access code, any session or
service secret, any Stripe key, the staging token, or any JWT.

### API security — PASS

49 handlers inventoried across authentication, authorization, methods, input
validation, rate-limit need, response sensitivity and CORS. Every product route
gates on `requireProductAccess` or `getGameAccessView` before delivering bytes.
UUID path parameters are pattern-validated before use. The webhook bounds its
body and returns `413` past the limit. `/api/health` is intentionally public and
returns no implementation detail (a standing audit script enforces that).

Unauthorized calls were made directly against production rather than assumed —
see the status codes above.

### Rate limiting — PASS after MN-02

Now covered: admin login, admin MFA, authorized-code attempts, consumer sign-in,
sign-up, password recovery. Confirmation resend already had a 60-second cooldown.
The staging bootstrap requires a bearer token and needs no separate limit.
Classroom use is preserved by the budgets in MN-02.

### CSRF — PASS

Every admin mutation validates an HMAC-signed, 10-minute, single-version CSRF
token **and** a same-origin check that compares `Origin` against both the
forwarded host and the configured application origin. Consumer mutations are
Next.js server actions, which carry framework-level CSRF protection and are
`POST`-only. `form-action 'self'` (plus the two Stripe hosts) now further
constrains where any injected form could submit.

**No sensitive state-changing GET exists.** Sign-out is a `POST` server action.
The `GET` handlers that mutate nothing are reads or signed-ticket asset
deliveries.

### XSS / injection — PASS

Repository-wide search: **zero** `dangerouslySetInnerHTML`, **zero**
`innerHTML =`, **zero** `document.write`. A test now walks `app/`, `components/`
and `lib/` and fails if any appears. No Markdown or user-generated HTML is
rendered. Path traversal was tested on the two `[...asset]` catch-all routes:
`/game/runtime` accepts a single segment from a fixed canonical allowlist, and
the ticketed delivery path is regex-constrained and rejects `..` and `//`. Header
injection: MN-04 fixed the one unsanitised sink.

### Redirect security — PASS

Redirect handling is not a parser but an **exact-match allowlist** — a `Set` of
literal first-party paths — which structurally eliminates the entire class.
Encoding, double-encoding, scheme, backslash, CRLF and Unicode tricks cannot
apply, because nothing is parsed.

Every payload in the brief was fired at live production
(`/auth/callback?next=…`): `//evil.com`, `https://evil.com`, `http://evil.com`,
`javascript:`, `data:`, `file:`, `\\evil.com`, `/%5C%5Cevil.com`,
`%2F%2Fevil.com`, `%252F%252Fevil.com`, path traversal, CRLF, fragments and
query injection. **All refused.** Twenty hostile values are now covered by
standing tests, alongside assertions that genuine first-party destinations still
work.

### Secrets — PASS, no rotation required

| Secret type | Location | Currently exposed? | Rotation required? |
|---|---|---|---|
| Supabase service key | Vercel env, server-only | No | No |
| Supabase publishable key | Browser (by design) | Not a secret | No |
| Stripe secret + webhook secret | Vercel env, server-only | No | No |
| Admin CSRF secret | Vercel env, server-only | No | No |
| Game delivery secret | Vercel env, server-only | No | No |
| School-access code + session secret | Vercel env, server-only | No | No |
| Staging access token | Vercel env, server-only | No | No |

**No active production secret has been committed or exposed. No rotation is
required.** No secret values are printed anywhere in this report.

Scanned: the working tree, **all 151 commits of history**, and the live
production browser bundle. Every pattern hit resolved to one of a deterministic
test fixture, a format-validation regex, or a standing audit script that *forbids*
live credentials. The only high-entropy match across all history was a fixture
literally named `sb_secret_phase7…`. `.gitignore` covers `.env*` with explicit
allowances for the two `.example` files, and no key material is tracked.

The repository already carries a family of standing secret gates
(`audit-platform-bundle.mjs`, `audit-billing-security.mjs`, and per-phase
scripts) which pass.

### Client-side leakage / clone resistance — PASS

Scanned the real production bundle for privileged logic, not just secrets:

- `decideAdminAccess`, `inspectAdminAccess`, `mvh-admin-session`, `aal2`, the
  admin RPC names, `createAdminCsrfToken` — **0 occurrences**
- `decideMathNexaAccess`, `MATHNEXA_ALL_ACCESS`, `hasMathNexaModuleAccess`,
  `subscription-active` — **0 occurrences**
- Every secret pattern — **0 occurrences**

The entitlement decision, the admin authorization model and the authorized-code
comparison are not shipped to the browser in any form.

### Cookies — PASS

| Cookie | HttpOnly | Secure | SameSite | Path | Lifetime |
|---|---|---|---|---|---|
| `mvh-admin-session` | Yes | Yes (https) | Strict | `/admin` | ≤30 min |
| `mvh-admin-mfa-pending` | Yes | Yes (https) | Strict | `/admin` | 5 min |
| `__Host-mvh-staging-access` | Yes | Yes | Lax | `/` | Session |
| `mathnexa-school-access` | Yes | Yes | Lax | `/` | 12 h |
| `mathnexa-confirmation-*` | Yes | Yes (https) | Lax | `/` | 20 min |
| Supabase auth | Yes | Yes | Lax | `/` | Supabase-managed |

Two attribute choices are correct rather than lax, and are recorded so they are
not "hardened" later by mistake:

- The admin cookies are `SameSite=Strict` **and** scoped to `Path=/admin`, which
  is tighter than the app default and appropriate for a console.
- The staging and school-access cookies are `SameSite=Lax`, **not** `Strict`,
  because both must survive a top-level cross-site navigation into the site.
  `Strict` would break the entry flow. The staging cookie carries the `__Host-`
  prefix, so a sibling host cannot set it — asserted by test.

### Security headers — FIXED (MN-01, MN-03, MN-05)

| Header | Before | After |
|---|---|---|
| Content-Security-Policy | absent | full policy, no wildcard, no `unsafe-eval` |
| Strict-Transport-Security | `max-age` only | `+ includeSubDomains` (no `preload`) |
| Clickjacking | **absent** | `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN` |
| X-Content-Type-Options | absent | `nosniff` |
| Referrer-Policy | absent | `strict-origin-when-cross-origin` |
| Permissions-Policy | absent | camera, mic, geolocation, payment, USB and others denied |
| X-Powered-By | `Next.js` | removed |

Framing is restricted to same-origin rather than denied outright because the
game runtime is legitimately framed; see MN-01.

### CORS — PASS

No `Access-Control-Allow-Origin` is set anywhere in the codebase. Every API is
therefore same-origin by default, and no authenticated endpoint is reachable
cross-origin. There is no wildcard to remove. Least privilege already holds.

### Staging — PASS

`MVH_STAGING_ACCESS_REQUIRED` only engages when the environment is *also*
`production-platform`, so the flag alone cannot leak into another mode, and a
missing flag is never read as "unlocked production". The token is validated
server-side with a constant-time compare and never reaches the browser; the
cookie carries only an HMAC of a fixed payload, so the token cannot be recovered
from it. The bootstrap endpoint requires a bearer credential and returns a
content-free, `no-store`, `noindex` `404` otherwise. `GET` on it is refused.

**Automated fail-closed test added** as required: the gate cannot be unlocked
without the exact bearer credential; the cookie is opaque and rejects tampering;
production cannot inherit the bypass; and the cookie uses the `__Host-` prefix.

### Admin / internal / debug routes — PASS

| Route class | Classification | Enforcement |
|---|---|---|
| `/admin`, `/admin/**` (35 routes) | ADMIN ONLY | `aal2` + bound session + CSRF; `404` otherwise |
| `/api/internal/staging-access/bootstrap` | STAGING ONLY | Bearer token; `404` otherwise |
| `/games/crosscalc/v2/preview` | ADMIN ONLY | `inspectAdminAccess`; `404` otherwise |
| `/api/health`, `/status` | PUBLIC | Intentional; no implementation detail |
| `/teacher/**` | AUTHENTICATED | `404` in platform mode |
| `/game/runtime/**`, `/games/**`, `/resources/**`, `/media/**` | AUTHENTICATED + ENTITLED | Server-side entitlement |

No route was found that should be removed. All privileged routes were confirmed
inaccessible to ordinary and anonymous users against live production.

### Dependencies — PASS

```
npm audit
found 0 vulnerabilities
```

Zero critical, zero high, zero moderate, zero low. No `--force` was used and no
dependency was changed.

### Logging / observability — PASS

Only three non-test logging sites exist in the entire application. All emit
structured JSON, and `safeBillingLog` actively strips any key matching
`email|customer|subscription|price|event|secret|payload|token`. **No password,
token, cookie, authorization header, authorized code or payment secret is
logged anywhere.**

Detection: failed admin logins, failed MFA, failed authorized-code attempts and
now failed consumer sign-ins all increment durable counters in
`admin_auth_rate_limits`, and admin actions write to `admin_audit_log`. Email
success and failure feed `recordAggregateSignal`. That is a reasonable,
privacy-conscious foundation and no new PII logging was introduced. What is
missing is *alerting* on those counters — see the roadmap.

### WAF / edge protection — **CURRENTLY ADEQUATE**

Current protection: `mathnexa.com` resolves to Vercel Anycast
(`216.150.1.129`, `216.150.16.1`) on Vercel's own nameservers
(`ns1/ns2.vercel-dns.com`). That provides always-on L3/L4 DDoS mitigation, TLS
termination and automatic HTTP→HTTPS (verified: `308` to HTTPS). There is no
`vercel.json`, so no firewall rules are currently defined as code.

**Recommendation: CURRENTLY ADEQUATE.** With MN-01 and MN-02 in place, the
application-layer gaps that an edge WAF would have compensated for are closed,
and the traffic profile does not yet justify added latency, cost or a
false-positive risk against classroom networks that share a single NAT address.

If the owner wants more, the correct next step is **Vercel Firewall rules plus
Attack Challenge Mode on the auth paths** — same platform, no DNS change, no
migration risk. Cloudflare would add a managed WAF ruleset and bot scoring, but
it means moving DNS and terminating TLS at a second provider; that is a real
migration risk for a benefit that mostly overlaps what Vercel already offers at
this scale. Not recommended in this phase. **No DNS or provider change was made.**

### Payment / signature verification — PASS

Billing is implemented but **gated**: `/pricing` and `/subscription` currently
redirect anonymous callers to `/access`, and platform mode carries a deferred-
billing path guard tied to `billingAvailable`. The webhook is nonetheless fully
implemented and correct:

- Signature verified via `stripe.webhooks.constructEvent` against
  `STRIPE_WEBHOOK_SECRET`; a missing or invalid signature returns `400` before
  any processing.
- Replay and idempotency handled by a receipt table — a duplicate event already
  in `processed | ignored | manual_review` short-circuits.
- Body is bounded, returning `413` past the limit.
- Product and price IDs come from server configuration, never from the client.
- The client cannot mark itself subscribed: entitlement is read from
  server-side evidence only, and the checkout URL is produced server-side by the
  provider.

No payment infrastructure was invented or added.

---

## Automated security tests

**43 tests**, all passing, in
`apps/platform-web/test/security/security-baseline.test.ts`.

Categories: security headers (7), redirect safety (4), authorized-code and
entitlement forgery (5), server-only authority (2), admin RBAC decisions (2),
privileged route surface (3), rate limiting (8), secret containment (2), staging
fail-closed (4), cookies (3), injection surface (2).

They assert against the modules the application actually ships — not copies — so
they keep failing if the thing they protect is later loosened. Run with:

```bash
npm run test:security
```

which now runs this suite plus the two pre-existing bundle audits. The suite is
also included in `npm run test:unit` via the vitest config.

---

## Verification summary

| Check | Result |
|---|---|
| `npm run test:security` | 43/43 pass + both bundle audits pass |
| `npm run test:unit` | 333 pass, 1 pre-existing failure (see below) |
| `npm run lint` | 0 errors (8 pre-existing warnings in an untouched file) |
| `npm run build` | Compiled successfully |
| `npm audit` | 0 vulnerabilities |
| Headers served by a real build | All present; `X-Powered-By` gone |
| Rendered app | No console errors, no CSP violations, all chunks `200` |

**Pre-existing failure, not caused by this work:**
`lib/game-access/canonical-assets.test.ts` — "reads byte-identical canonical
source" — is a checksum over `docs/index.html` and `docs/vocab.js` that fails on
Windows because of CRLF normalisation at checkout. Confirmed by stashing every
change on this branch and re-running against the pristine `201e7d4` tree, where
it fails identically. It touches no security control.

---

## Regression check

Preserved and verified: favicon and header brand (bunny mark, pink "Nexa"),
sign-in → Home destination, account, logout, Games, MAP Prep, Homework, Quizzes,
subscription, entitlement, authorized access, game audio (`media-src 'self' data:
blob:` and `autoplay=(self)`), accessibility, and responsive layout. The game
iframe keeps working because `frame-ancestors` is `'self'`, and checkout keeps
working because the two Stripe hosts are permitted form-action destinations.

---

## Prioritised roadmap

### P0 — now
1. Owner review and approval of this branch.
2. Deploy to `mathnexa-platform-staging` only, with the staging gate left closed.
3. Confirm on staging that the CSP is clean in the browser console across Home,
   Games, a hosted game, Account and Sign in.

### P1 — next
1. **Nonce-based CSP** (MN-08). Generate a per-request nonce in `proxy.ts`,
   thread it through the root layout, and drop `'unsafe-inline'` from
   `script-src`. This is the single largest remaining hardening step and needs
   its own change window because it touches every rendered document.
2. **Alerting on the counters we already collect.** The data for repeated failed
   logins, repeated authorized-code failures and admin authorization failures is
   already durable in `admin_auth_rate_limits` and `admin_audit_log`; nothing
   watches it. A scheduled query and a notification is a small change with real
   detection value.
3. **Per-account lockout** to complement the per-IP throttle, closing the
   distributed-guessing residual in MN-02.
4. **Decide on HSTS `preload`** (owner call — one-way door).
5. Set a dedicated `MVH_AUTH_RATE_LIMIT_SECRET` so the limiter stops borrowing
   the admin CSRF secret and the service key, and add a production readiness
   assertion on `limiterConfigured()`.

### P2 — later
1. Vercel Firewall rules + Attack Challenge Mode on `/sign-in`, `/sign-up`,
   `/forgot-password` and `/access`, if traffic or abuse warrants it.
2. Return `404` instead of `405` on admin routes (MN-06) — best folded into
   other admin work rather than done as a standalone 35-file sweep.
3. Drop the build SHA from `/api/health` (MN-07) when that endpoint is next
   revised, updating the preview and readiness tests that consume it.
4. Consider `Cross-Origin-Embedder-Policy` once the game runtime's asset
   loading has been checked against it.
