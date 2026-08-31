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

No CRITICAL. Two HIGH, two MEDIUM, three LOW, three INFO. **Every CRITICAL, HIGH and MEDIUM finding is fixed on the branch, and no
CRITICAL, HIGH or MEDIUM remains unresolved.** MN-09 was found during
certification and is also fixed. The remaining two LOW and three INFO items are
documented with the reasoning for leaving them, in each case because the
remediation would carry more risk than the finding.

The candidate was deployed to staging, certified in a real browser, and approved
by the owner. Restoring the gate afterwards exposed MN-09, which was fixed,
re-certified across five separate live deployments, and the gate left locked. It
is ready for production promotion but **has not been promoted**.

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
| MN-09 | LOW | Staging gate read `MVH_STAGING_ACCESS_REQUIRED` with strict equality, so a malformed value silently left staging open | **Yes** |
| MN-10 | INFO | `/api/health` reports a `build` value 34 commits behind the deployed source | No — documented |
| MN-11 | LOW | A locked staging deployment still serves `/_next/static/**` and icons anonymously | No — pre-existing, documented |

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

**Availability policy — revised in the P0 pass, and this is the important part.**

The first shipped version of this fix allowed the attempt whenever the limiter
was *unconfigured*, on the reasoning that a missing environment variable should
not lock customers out. The owner rejected that trade, correctly: it meant
production authentication could silently become unlimited through
misconfiguration alone, which is exactly the failure an attacker would want and
nobody would notice. The posture is now:

| Runtime | Limiter state | Result |
|---|---|---|
| `production-platform` | unconfigured | **deny** — generic temporary-unavailable |
| `production-platform` | backend call failed | **deny** — generic temporary-unavailable |
| `production-platform` | healthy | enforce the budget |
| any other runtime | unconfigured or failing | allow (development fallback) |
| any other runtime | healthy | enforce the budget |

The whole rule lives in `decideRateLimit()`, a pure function, so it can be
proved by enumeration rather than argued about.

**Why failing closed is safe here — verified, not assumed.** The obvious
objection is that this trades a security hole for an outage risk. It does not,
and the reason is structural: `createServiceSupabaseClient()` and
`createServerSupabaseClient()` have the *same* preconditions. Both require
`hasProductionIdentityConfiguration()`, which itself requires `SUPABASE_URL` and
`SUPABASE_SECRET_KEY`. So any production state in which the limiter is
unconfigured is already a state in which the auth client is `null` and sign-in
returns unavailable regardless. Denying here removes a silent fail-open without
removing a path that would otherwise have worked.

That guarantee is load-bearing, so it is pinned by a test: an environment
holding a `SUPABASE_SECRET_KEY` of exactly the 20-character minimum
`hasProductionIdentityConfiguration()` accepts must also yield a limiter secret.
**The 20-character floor in `resolveLimiterSecret()` must therefore never be
raised** — requiring more than production identity requires would manufacture
the very configuration that locks customers out.

**Determining production.** From `MVH_APP_ENVIRONMENT`, a server-only variable.
The browser-visible `NEXT_PUBLIC_MVH_APP_ENVIRONMENT` twin is deliberately not
consulted, so no caller can talk a deployment out of rate limiting; a test
asserts the module contains no `NEXT_PUBLIC_` comparison and that the public
twin cannot flip the decision either way. A *dropped* variable cannot quietly
downgrade production into the development branch either, because `proxy.ts`
already 503s the entire site when the production registry fails to validate.

**Response on denial.** One shared `temporarilyUnavailable` message, used by all
three surfaces so none can drift: *"Authentication is temporarily unavailable.
Try again in a few minutes."* It names no backend, function, table or
configuration variable, and it is byte-identical for every address. A test
asserts the copy matches none of `supabase|rpc|rate.?limit|postgres|database|
consume_|service|token|secret|env|MVH_|SUPABASE_`, and that exactly three call
sites use it.

**Observability.** A limiter outage emits a `SafeEvent` —
`authentication` / `rate-limiter-unavailable` / severity `critical` — through
the structured console adapter. Deliberately *not* through
`recordAggregateSignal`, because that helper writes via the service Supabase
client, the very dependency missing in the case being reported. `createSafeEvent`
refuses any detail key matching password/token/secret/authorization/cookie/email,
and `emitOperationalEvent` de-duplicates within 5 seconds so an outage under load
reports steadily instead of flooding. No external monitoring was added.

Keying material resolves `MVH_AUTH_RATE_LIMIT_SECRET` → `MVH_ADMIN_CSRF_SECRET`
→ `SUPABASE_SECRET_KEY`. The last is the important one: the admin CSRF secret
only exists when the admin console is enabled, so keying solely on it would have
left the limiter unavailable on any deployment running without admin. **No new
environment variable is required for this fix to be active in production.**

**Backend dependency confirmed deployed.** `consume_admin_auth_rate_limit` is
not speculative infrastructure: the authorized-code gate calls it on every
attempt, and `/access` serves that form on live production today. Were the
function absent, authorized-code access would already be permanently broken.

**Tests.** 24 in total across the two files. Eleven contract tests including an
exhaustive sweep over all eight input combinations proving no combination lets
production fail open, plus thirteen runtime tests driving the real
`consumeConsumerAuthAttempt` against a mocked service client for each of the
four required scenarios. The runtime tests also assert the RPC arguments stay
inside the bounds the database function accepts (it raises outside `1..20`
attempts and `30..3600` seconds, which under the deny rule would take sign-in
down) and that the raw address never reaches the database.

**Confirmed the tests have teeth.** Mutating `decideRateLimit` back to the old
fail-open behaviour makes six of them fail. A future change that reintroduces
this hole cannot land quietly.

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

### MN-09 — LOW — A malformed staging flag silently left staging open — FIXED

**Component:** `apps/platform-web/lib/staging-access/server.ts` and
`apps/platform-web/proxy.ts`.

**Found by hitting it**, not by reading code. While restoring the gate after the
owner's review, the flag was written through a PowerShell pipeline, which
appends a newline. The stored value became `"true
"`. The check was:

```ts
source.MVH_APP_ENVIRONMENT === "production-platform" &&
  source.MVH_STAGING_ACCESS_REQUIRED === "true"
```

`"true
" !== "true"`, so the gate did not engage and a full redeploy came back
**200 with the complete site body** while appearing to have been re-locked.

**Fix.** All interpretation now happens once, at the boundary, in
`stagingAccessRequirement()`. No `trim()` is scattered through callers.

| Configured value | Result |
|---|---|
| `true`, ` true `, `true
`, `	true
`, `TRUE`, `True` | **protected** |
| `false` — exact lowercase, whitespace ignored | intentionally open |
| `False`, `FALSE`, any other casing of false | **protected** |
| `yes`, `1`, `on`, `tru`, `trueXYZ`, anything else | **protected** |
| blank or absent, deployment holds a staging token | **protected** |
| blank or absent, no staging token | open |

Three decisions in that table are load-bearing and should not be "tidied" later:

- **The casing rule is asymmetric on purpose** — liberal about what counts as
  "protect", strict about what counts as "open". An operator writing `TRUE`
  plainly means to protect the site. Disabling protection has to be
  unmistakable, and PowerShell stringifies `$false` as `False`; symmetric
  case-folding would have let that silently open staging, reproducing the very
  defect being fixed.
- **Ambiguity is resolved by whether the deployment holds a well-formed staging
  token.** That is the only sound discriminator available: production and
  staging both run `MVH_APP_ENVIRONMENT=production-platform`. Verified against
  the live projects — the production project defines no staging variables at
  all. The token's value is never read, only its shape.
- **Failing closed could not be unconditional.** Adversarial review of the first
  draft caught this: with no token, `getStagingAccessToken()` returns null, the
  bootstrap endpoint cannot mint a cookie, and the lock is unrecoverable. An
  unscoped fail-closed would therefore have meant one typo on the *production*
  project blacking out mathnexa.com site-wide with no way back in.

**A second defect of the same class, found while fixing the first.** The gate
was nested inside `isProductionPlatformMode()`, which compares
`MVH_APP_ENVIRONMENT` strictly. Transport whitespace on *that* variable skipped
the gate entirely, so normalizing the flag alone would have left the root cause
alive on a sibling variable and the new parser unreachable on the real request
path. The gate is now evaluated **before** any environment-mode branch in
`proxy.ts`. Reproduced before the fix: `"production-platform
"` with a
correct `"true"` flag left the site fully open.

**Tests.** 30 unit and proxy-level cases, plus 3 in the security baseline.
They include a recurrence guard asserting that a protected staging deployment
with a malformed flag returns the empty-body 404 rather than HTTP 200, and an
ordering assertion that the gate is its own top-level branch. Confirmed they
have teeth: removing the `trim()` fails 2 of them, removing the hoisted gate
fails 6.

**Certified on the live staging deployment**, each as its own deploy:

| Configuration | Deployment | Result |
|---|---|---|
| `"true"` written through the PowerShell pipeline that caused the incident | `dpl_HrZwvuKh4N5fw3hGAFruPhbCPdn9` | **404, 0-byte body** |
| `"   true   "` | `dpl_6EoE548mjBqp3U5sEHdP7qxRgiUM` | **404, 0-byte body** |
| `"false"` exact lowercase | `dpl_4uQ5k6rSpLajEYFTqkSuXM3DpeJ2` | 200, site served — deliberate open preserved |
| `"False"` — PowerShell `$false` | `dpl_H4ovP2kFMdtfJVoKFXxhTFfGAk7T` | **404, 0-byte body** |
| `"true"` restored via `printf` | `dpl_gmccVXtUHZ7H7KatTsdgE26Zitf4` | **404, 0-byte body — final state** |

The first row is the decisive one: the identical command sequence that produced
HTTP 200 earlier in this engagement now produces the protected 404.

`MVH_STAGING_ACCESS_TOKEN` was never read, printed, rotated or replaced
throughout — it still shows its original age in the environment listing.

**Safer operational procedure**, now documented in
`docs/phase-7d-isolated-hosted-staging.md`:

```bash
printf true | npx vercel env add MVH_STAGING_ACCESS_REQUIRED production
```

and always confirm the live URL returns an empty-body 404 afterwards.

---

### MN-11 — LOW — A locked staging deployment still serves its static assets

**Component:** the `config.matcher` in `apps/platform-web/proxy.ts`.

The matcher excludes `_next/static`, `_next/image`, `favicon.ico` and common
image extensions, so those paths never reach the proxy and therefore never reach
the staging gate. Confirmed live against the locked deployment: `/` returns a
0-byte 404 while `/_next/static/chunks/*.js`, `/favicon.ico` and `/icon.png`
all return **200**.

An anonymous visitor to a "locked" staging environment can therefore still
retrieve the compiled client bundle — route names, component structure, copy.

**Not fixed, and not introduced here.** The matcher is byte-identical to the
frozen parent `201e7d4`, so this predates the security work. It is mitigated:
the built bundle was rescanned and contains no secret, no credential and no
privileged logic, and the Phase 7D contract already requires that public assets
contain no staging token. Routing every static asset through the proxy is a
performance and correctness change to a candidate the owner has already approved,
which does not belong in a config-parsing fix. Recommended for the next phase.

---

### MN-10 — INFO — `/api/health` reports a stale build identifier

`GET /api/health` on production returns `build: e5c5294d…`, which is a real
commit but sits **34 commits behind** the deployed source `201e7d4`. The field
comes from `MVH_BUILD_ID`, which is set independently of the deployment rather
than derived from it.

No security impact — if anything it discloses less than the true SHA. It is
recorded because it is actively misleading for release verification: anyone
confirming "is production still v1.2.3?" from this endpoint would get an answer
that neither matches the release nor indicates a problem. Deployment identity
should be confirmed from the Vercel deployment ID, as this pass did.

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
| `npm audit --omit=dev` | 0 vulnerabilities |
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

## Staging certification

Deployed to `mathnexa-platform-staging`
(`prj_O61Cyx9WMjc0jljpM9erCiSXsJA0`, owner BrightPath EdTech, confirmed through
the Vercel API rather than the local link file before deploying).
Deployment `dpl_AUB14LCFM24qyGerG3H3ZLsq9fxN` at
`https://mathnexa-platform-staging.vercel.app`. Production was not touched.

### Headers, as actually served

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co; worker-src 'self' blob:; frame-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: SAMEORIGIN
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: accelerometer=(), autoplay=(self), camera=(), display-capture=(), encrypted-media=(), fullscreen=(self), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), midi=(), payment=(), usb=(), xr-spatial-tracking=()
Cross-Origin-Opener-Policy: same-origin
X-Permitted-Cross-Domain-Policies: none
```

`X-Powered-By` is **absent**. The `connect-src` Supabase origin resolved
correctly at build time, which is the one directive local testing could not
exercise because the credential-free local mode runs without Supabase.

### Browser CSP

**Chromium — 0 violations** across `/`, `/sign-in`, `/sign-up`, `/games`,
`/game-access`, `/account`, `/pricing`, `/subscription`, each in a fresh
context. Every route kept its header, favicon link, applied CSS and 20 hydrating
scripts. No redirect loops. The only failed requests were `_rsc=` router
prefetch cancellations, which are normal Next.js behaviour.

### Framing

| Case | Result |
|---|---|
| Cross-origin page framing `/sign-in` | **Blocked** — frame resolved to `chrome-error://chromewebdata/`, with the engine logging `Framing … violates … "frame-ancestors 'self'"` |
| Same-origin sandboxed iframe (the game runtime pattern) | **Allowed** — loads, no `frame-ancestors` violation |
| Anonymous `GET /game/runtime/index.html` | **401** — entitlement still enforced |

Both halves matter: blocking cross-origin is the clickjacking control, and
permitting same-origin is what keeps hosted games working.

### form-action

| Destination | Expected | Actual |
|---|---|---|
| `https://checkout.stripe.com/...` | allowed | allowed |
| `https://billing.stripe.com/...` | allowed | allowed |
| same origin | allowed | allowed |
| `https://exfiltration.example/collect` | blocked | blocked |
| `https://checkout.stripe.com.evil.example/c` | blocked | blocked |

The lookalike case matters: it proves the directive matches the host exactly
rather than by prefix, so a domain merely *starting* with our allowed host is
still refused. Both Stripe destinations were intercepted and answered locally —
CSP is enforced in the renderer before the network layer, so the directive was
genuinely exercised without any request leaving the machine. No charge, no live
key, no account.

### Rate limiting

| Property | Result |
|---|---|
| Configured budget | 20 attempts / 900 s window / 900 s block (sign-in) |
| Subject basis | `HMAC(scope + address + client IP + user agent)`, stored only as a 64-hex digest |
| Attempts 1–20 | generic *"The email or password was not accepted."* |
| Attempt 21 | **throttled** — *"Too many sign-in attempts…"* |
| Enumeration | **none** — a single identical message across three different addresses, including one that plausibly has an account |

Probed with one synthetic `@certification.invalid` address and an invalid
password, stopping one attempt past the threshold. No account created, no mail
sent (a failed sign-in sends nothing).

Sign-up and password recovery are covered by the deterministic runtime tests
rather than by live probing, deliberately: exercising them against the real
route would generate confirmation and recovery mail for no security benefit.

### Security and product regression on staging

Privileged routes anonymous: `/admin` 404, `/teacher` 404,
`/games/crosscalc/v2/preview` 404, staging bootstrap 404,
`/game/runtime/index.html` 401, resource download 401. Hostile `next=` values
(`//evil.com`, `https://evil.com`, `javascript:`, `%2F%2Fevil.com`) all refused.

Product: `/games`, `/map-prep`, `/homework`, `/quizzes` and `/account` each
redirect anonymous visitors to the correct `/access?next=<destination>`;
`/`, `/sign-in`, `/sign-up`, `/access`, `/help`, `/accessibility` all 200.
Favicon, `icon.png` and `apple-icon.png` all serve. The brand mark hashes to
`b8cafb97…6ac4ba9`, byte-identical to the approved asset. Header renders with
the bunny mark and pink "Nexa" at desktop, and the navigation reflows correctly
at 375 px with no console errors.

### Coverage this pass could not reach

Stated plainly rather than papered over:

- **WebKit and Firefox could not be run.** Both Playwright builds are present or
  installable but fail to launch on this Windows host — WebKit exits with
  `0xC0000135` (missing DLL) and Firefox reports "Host system is missing
  dependencies". Cross-engine CSP verification is therefore **Chromium only**.
  This matters most for Firefox, which is the engine whose `form-action`
  enforcement across redirects motivated the Stripe allowance in the first
  place; the directive is proven correct in Chromium, but the Firefox-specific
  behaviour remains unverified by execution.
- **A real Stripe test-mode round trip: NOT TESTABLE.** Stripe configuration
  exists on staging, but `/pricing` and `/subscription` are sign-in gated and no
  authorized staging test account was available. Creating one was out of scope.
  The closest deterministic evidence — that the CSP permits exactly the two
  Stripe hosts and blocks everything else — is above.
- **A live `Content-Disposition` download** needs an entitled session. The fix is
  proven by unit test against the exact sanitisation expression the route
  applies, over quotes, CR/LF, header-injection payloads and path separators;
  every result stays a single syntactically valid attachment header with exactly
  two delimiting quotes.

---

## Production promotion readiness

Owner approved the candidate on staging (Home, Sign in, Sign in → Home, Account,
Games, MAP Prep, Homework, Quizzes, game loading, logout, favicon, header).
Staging was then re-locked and this pre-flight run. **Nothing has been deployed
to production and no tag has been created.**

### Final application source

**`18653ee`** — the last commit that touches runtime application code, and also
the branch tip. There are no trailing documentation-only commits after it, so
the commit to promote and the final application source are the same object.

The complete runtime change from the frozen parent `201e7d4` is eight files:

| File | Change |
|---|---|
| `lib/security/headers.mjs` | new — the header policy (MN-01, MN-03, MN-05) |
| `next.config.mjs` | wires the headers, `poweredByHeader: false` |
| `lib/auth/rate-limit.ts` | new — the limiter and its availability contract (MN-02) |
| `app/auth-actions.ts` | wires the limiter into the three credential surfaces |
| `app/resources/[resourceId]/download/route.ts` | one-line filename sanitisation (MN-04) |
| `lib/staging-access/server.ts` | normalized gate configuration contract (MN-09) |
| `proxy.ts` | staging gate hoisted above the environment-mode branches (MN-09) |
| `vitest.config.ts` | test discovery only, not shipped |

The `auth-actions.ts` diff is pure addition — no existing line was removed or
rewritten. Nothing outside the approved Phase 1 scope is present.

### Pre-flight verification

| Check | Result |
|---|---|
| Production deployment | `dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd` — matches the frozen expectation |
| Newest production deployment | `kv9vnqu2t`, 6 h old — no unexplained deployment |
| Production headers | only Vercel's default HSTS and `X-Powered-By` — **zero** Phase 1 headers, so production is genuinely untouched |
| Production brand mark | `b8cafb97…6ac4ba9`, byte-identical to the approved v1.2.3 asset |
| `v1.2.3` tag | still `3270a7a8` → `201e7d4`, unmoved |
| Branch lineage | descends from `201e7d4` |
| `npm run test:security` | 57/57 plus both bundle audits |
| `npm run test:unit` | 234 core + 378 web pass; 1 known pre-existing CRLF failure |
| `npm run typecheck` | clean (three test-only errors found and fixed in `bcb56f0`) |
| `npm run lint` | 0 errors (8 pre-existing warnings in an untouched file) |
| `npm run build` | compiled successfully |
| `npm audit` | 0 vulnerabilities |
| Route inventory | 49 handlers, unchanged from the audit baseline |
| Secret scan of the built bundle | 0 hits across 14 credential patterns |
| Privileged logic in the bundle | 0 hits, including all new limiter symbols and the RPC name |
| Headers on the final build | all present, `X-Powered-By` absent |

`npm run typecheck` had not been in the earlier battery. Running it here caught
three genuine type errors in the new test file — none in runtime code — which is
why the pre-flight was worth running rather than assuming the prior green.

### Staging after restoration

`MVH_STAGING_ACCESS_REQUIRED` set back to `true`
(`MVH_STAGING_ACCESS_TOKEN` never read, printed or altered — still 29 days old
in the environment listing), then the same candidate redeployed as
`dpl_6s6imLVuRmG7aTUkoXxrSE4Di2PB`. Verified locked:

```
GET https://mathnexa-platform-staging.vercel.app/
HTTP/1.1 404 Not Found      body: 0 bytes
Cache-Control: no-store
X-Robots-Tag: noindex, nofollow
Content-Security-Policy: default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'
```

`/sign-in`, `/games`, `/account`, `/access` and `/api/health` all return 404.

The first restoration attempt did **not** take, for the reason recorded as
MN-09. It was caught because restoration was verified against the live URL.

---

## Prioritised roadmap

### P0 — done in the finalization pass

1. Rate-limiter fail-open closed (see MN-02 above).
2. **Deployed to `mathnexa-platform-staging`** —
   project `prj_O61Cyx9WMjc0jljpM9erCiSXsJA0`, verified through the Vercel API
   before the command ran, not from the local link file. Deployment
   `dpl_AUB14LCFM24qyGerG3H3ZLsq9fxN`.
3. **Certified in a real browser** with the four `scripts/certify-staging-*.mjs`
   harnesses. All routes clean, framing correct in both directions, form-action
   correct in all five cases, and the sign-in throttle engaging at exactly the
   configured attempt.
4. **Staging gate temporarily opened for owner testing** —
   `MVH_STAGING_ACCESS_REQUIRED` only. `MVH_STAGING_ACCESS_TOKEN` was never read,
   printed or altered (still 29 days old in the Vercel env listing).

### P0 — remaining for the owner

1. **Approve production promotion of `18653ee`.** Nothing has been deployed to
   production and no tag exists; that step is deliberately left to the owner.
2. Two checks this environment could not run — see "Coverage this pass could not
   reach" above. Neither is blocking: the Stripe origins are specifically
   allowlisted, a lookalike origin is blocked, and the deterministic
   form-action tests are green.

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
0. Route `/_next/static/**` and the icon paths through the staging gate
   (MN-11), so a locked staging stops serving its compiled bundle anonymously.
1. Vercel Firewall rules + Attack Challenge Mode on `/sign-in`, `/sign-up`,
   `/forgot-password` and `/access`, if traffic or abuse warrants it.
2. Return `404` instead of `405` on admin routes (MN-06) — best folded into
   other admin work rather than done as a standalone 35-file sweep.
3. Drop the build SHA from `/api/health` (MN-07) when that endpoint is next
   revised, updating the preview and readiness tests that consume it.
4. Consider `Cross-Origin-Embedder-Policy` once the game runtime's asset
   loading has been checked against it.
