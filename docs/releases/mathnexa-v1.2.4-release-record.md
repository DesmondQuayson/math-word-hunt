# MathNexa v1.2.4 — Release Record

## Security Hardening Phase 1

Owner-approved production release, frozen 2026-08-30 after the owner personally signed in to
the live site at https://mathnexa.com/ and exercised the authenticated product end to end.

## Release identity

| Item | Value |
| --- | --- |
| Release type | Security hardening |
| Tag | `v1.2.4` (annotated, object `be32ed124b83e78d045d1d299a1e91f12043691f`) |
| Application source | `7c01ff2a2b2dac8ec5c30c700b4da5d1e37c31ec` |
| Runtime security commit | `18653ee` — `7c01ff2` adds only the audit report and changes no runtime file after it |
| Parent release | `v1.2.3` → `201e7d4891c452c986353600ad3d25f8fe7a7a49` (tag untouched, verified local and remote) |
| Branch | `security/mathnexa-hardening-phase-1` |
| Vercel deployment | `decrsk3dk` / `dpl_7dTiNcKyhWaZKuGGMyAhnDgLypbs` on `bright-path-ed-tech/mathnexa-platform-production` (`prj_frhZ7EKPTnPJot97ioxNVv3oFi33`) |
| Production | https://mathnexa.com/ and https://www.mathnexa.com/ (308 to apex) |
| Previous production | `kv9vnqu2t` / `dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd` — the rollback target, retained and Ready |

The tag was verified in both directions before this record was written: the local and remote
tag objects are identical, and the remote tag was fetched into a temporary ref and resolved
independently to confirm it peels to the approved source. This record is deliberately
committed *after* the tag, so it sits outside the frozen application tree.

## What this release fixes

The audit found the authorization core already sound — the authorized-code path, the
entitlement decision, the admin console and the redirect allowlist are all
server-authoritative and held up under direct attack. The real gaps were at the edge.

**MN-01 (HIGH) — the application shipped no security response headers at all.**

Live production returned `Strict-Transport-Security` and `X-Powered-By: Next.js`, and
nothing else. No CSP, no framing control, no `nosniff`, no referrer or permissions policy —
on `/`, `/sign-in`, `/account`, anywhere. An attacker could frame an authenticated page,
overlay it, and lure a signed-in customer into clicking through a state change. The same
absence removed every layer of defence behind the XSS posture.

Adds `apps/platform-web/lib/security/headers.mjs`, applied to `/:path*`. The module is shared
between the shipped config and the test suite, so the policy asserted and the policy served
are one value.

Two directives were shaped by real product constraints and **must not be tightened**:

- `frame-ancestors 'self'`, not `'none'` — the game runtime is legitimately framed by
  `/games/[resourceId]` in a sandboxed same-origin iframe. `'none'` breaks every hosted game.
  `'self'` still blocks the attack, since nobody else can serve a page from our origin.
- `form-action 'self' https://checkout.stripe.com https://billing.stripe.com` — subscribing
  and opening the billing portal are form submissions whose response redirects off-site, and
  Firefox enforces `form-action` against the redirect target. A bare `'self'` silently breaks
  checkout.

**MN-02 (HIGH) — consumer sign-in, sign-up and password recovery had no rate limit.**

Worse than it first appears. These run as server actions, so every attempt — attacker and
classroom alike — reaches Supabase from one Vercel egress address. Supabase's per-IP limits
therefore see a single client for the whole internet and cannot separate them. The platform
was relying on a control that structurally could not apply.

Adds `apps/platform-web/lib/auth/rate-limit.ts`, reusing the already-deployed
`consume_admin_auth_rate_limit` function that admin sign-in and the authorized-code gate have
used since Phase 8a. No table, no migration, no Redis, no new environment variable.

| Surface | Attempts | Window | Block |
| --- | --- | --- | --- |
| Sign-in | 20 | 900 s | 900 s |
| Sign-up | 10 | 900 s | 900 s |
| Password recovery | 6 | 900 s | 1800 s |

Budgets are shaped so a shared school NAT still works; a whole class signs in from one
address. The throttle runs *before* the credential check, and a throttled recovery returns
the same neutral copy an accepted one does, so the limiter cannot become an enumeration
oracle. Subjects are stored only as a keyed SHA-256 digest.

**Availability contract — frozen, and the reasoning matters.**

| Runtime | Limiter state | Result |
| --- | --- | --- |
| `production-platform` | unconfigured | **deny** — generic temporary-unavailable |
| `production-platform` | backend call failed | **deny** — generic temporary-unavailable |
| `production-platform` | healthy | enforce the budget |
| any other runtime | unconfigured or failing | allow — approved development fallback |
| any other runtime | healthy | enforce the budget |

The first draft allowed the attempt when the limiter was unconfigured. The owner rejected
that: production authentication could have become unlimited through misconfiguration alone.
Failing closed is safe here because it was verified, not assumed —
`createServiceSupabaseClient()` and `createServerSupabaseClient()` share preconditions, so
any production state where the limiter is unconfigured is already one where sign-in fails
anyway. The 20-character floor in `resolveLimiterSecret()` deliberately matches
`hasProductionIdentityConfiguration()` and **must never be raised**; requiring more than
production identity requires would manufacture the configuration that locks customers out.

Production is determined from `MVH_APP_ENVIRONMENT`, a server-only variable. The
browser-visible `NEXT_PUBLIC_` twin is deliberately not consulted.

**MN-03 (MEDIUM) — HSTS now asserts `includeSubDomains`.** `preload` was deliberately
omitted: it is a one-way door and remains an owner decision. Verified before shipping that
`mathnexa.com`, `www.mathnexa.com` and `showme.mathnexa.com` are all HTTPS-only.

**MN-04 (MEDIUM) — a stored filename reached `Content-Disposition` unsanitised** in the
public resource download, while its sibling routes already stripped quotes and CRLF. The
inconsistency was the bug.

**MN-05 (LOW) — `X-Powered-By` removed.**

**MN-09 (LOW) — the staging gate could silently fail open.**

Found by hitting it. While restoring the gate after the owner's staging review, the flag was
written through a PowerShell pipeline, which appends a newline. `"true\n" !== "true"`, so the
gate did not engage and a full redeploy served the complete site with HTTP 200 while the
configuration looked correct. Only verifying the live URL caught it.

All interpretation now happens once, in `stagingAccessRequirement()`:

| Configured value | Result |
| --- | --- |
| `true`, ` true `, `true\n`, `\ttrue\r\n`, `TRUE`, `True` | **protected** |
| `false` — exact lowercase, whitespace ignored | intentionally open |
| `False`, `FALSE`, any other casing of false | **protected** |
| `yes`, `1`, `on`, `tru`, `trueXYZ`, anything else | **protected** |
| blank or absent, deployment holds a staging token | **protected** |
| blank or absent, no staging token | open — normal production behaviour |

The casing rule is asymmetric on purpose: liberal about what counts as "protect", strict
about what counts as "open". PowerShell stringifies `$false` as `False`, and symmetric
case-folding would have let that silently open staging.

A second defect of the same class surfaced while fixing the first: the gate was nested inside
`isProductionPlatformMode()`, which compares `MVH_APP_ENVIRONMENT` strictly, so transport
whitespace on *that* variable skipped the gate entirely and made the new parser unreachable.
The gate is now evaluated before any environment-mode branch in `proxy.ts`.

Failing closed could not be unconditional. Adversarial review caught that with no token the
bootstrap endpoint can never mint an access cookie, so an unscoped fail-closed would have let
one typo on the production project black out mathnexa.com unrecoverably. Ambiguity is
therefore resolved by whether the deployment holds a well-formed staging token — verified
against the live projects that production defines no staging variables at all.

## Verification

| Check | Result |
| --- | --- |
| Secret scan — working tree, all 151 commits of history, live production bundle | No active exposure. **No rotation required.** Every pattern hit was a test fixture, a validation regex, or an audit script that forbids live credentials |
| Deployed bundle scan — 4 pages, 15 assets | 0 hits across 19 secret patterns and 19 privileged server symbols, including every new limiter and staging-gate symbol |
| `npm audit --omit=dev` | 0 vulnerabilities |
| `npm run test:security` | 57/57 plus both standing bundle audits |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (8 pre-existing warnings in an untouched file) |
| `npm run build` | compiled successfully |
| Browser CSP certification, Chromium, 8 routes, fresh contexts | **0 violations** |
| Framing | cross-origin **blocked** (engine logged the `frame-ancestors 'self'` refusal); same-origin game-runtime pattern **allowed** |
| `form-action` | both Stripe hosts allowed; attacker origin and lookalike `checkout.stripe.com.evil.example` blocked |
| Live headers on mathnexa.com | 6/6 present, `X-Powered-By` absent |
| Branding | header 81 px, `rgb(8,44,67)`, mark 48×48 (natural 144×144), Math white, Nexa `rgb(255,79,154)`, brand mark hash byte-identical to the approved asset, desktop and 375 px clean |

Known pre-existing failure, unrelated to this release and present on the frozen parent
`201e7d4`: `lib/game-access/canonical-assets.test.ts` fails on Windows because of CRLF
normalisation at checkout. It touches no security control and is **not** a regression.

MN-09 was additionally certified across five separate staging deployments, including the
decisive one — the identical PowerShell command sequence that produced HTTP 200 earlier in
the engagement now produces the protected empty-body 404.

## Owner production verification

The owner personally tested the live deployment and confirmed: sign in; sign in → Home;
Account; Games; MAP Prep; Homework; Quizzes; real authenticated game launch; normal
gameplay; game audio; subscription and pricing pages; logout; logged-out protected-route
enforcement; the MathNexa header; the favicon.

## Deferred to Security Phase 2

| ID | Severity | Item |
| --- | --- | --- |
| MN-06 | LOW | Admin route existence disclosed by a `405` on `GET`. The fix is a `GET` handler in each of 35 route files — broad churn to withhold a path name from someone still facing MFA, a bound session and a CSRF token |
| MN-11 | LOW | A locked staging deployment still serves `/_next/static/**` and its icons, because the proxy matcher excludes them. Pre-existing — the matcher is byte-identical to `201e7d4` — and mitigated, since the bundle carries no secret or privileged logic. Deliberately not fixed here: changing request routing after owner approval adds release risk for no security gain |
| MN-07 | INFO | `/api/health` returns a build identifier to anonymous callers |
| MN-08 | INFO | `script-src` retains `'unsafe-inline'`. Nonce-based CSP needs `proxy.ts` to rewrite every HTML response and the nonce threaded through the root layout — its own change window |
| MN-10 | INFO | `/api/health` reports a build value 34 commits behind the deployed source, so it is misleading for release verification. Confirm deployment identity from the Vercel deployment ID |

Also carried forward: alerting on the failed-attempt counters already collected in
`admin_auth_rate_limits` and `admin_audit_log`; per-account lockout to complement the per-IP
throttle; a decision on HSTS `preload`; and a dedicated `MVH_AUTH_RATE_LIMIT_SECRET`.

Edge protection assessment stands at **currently adequate** — Vercel Anycast on Vercel DNS.
Cloudflare is not recommended at this scale; the DNS migration risk outweighs a mostly
overlapping benefit. No DNS was changed.

## Operational notes

Setting `MVH_STAGING_ACCESS_REQUIRED` through a PowerShell pipeline appends a newline. The
parser now tolerates it, but the safe form is:

```bash
printf 'true' | npx vercel env add MVH_STAGING_ACCESS_REQUIRED production
```

Always confirm the live URL returns an empty-body 404 afterwards — an environment change only
takes effect on a new build, and the value alone is not proof.

The security worktree is deliberately relinked to `mathnexa-platform-staging` so a stray
`vercel deploy --prod` cannot reach production. Relink before any future production deploy.

`MVH_STAGING_ACCESS_TOKEN` was never read, printed, rotated or replaced at any point.

ShowMe / MAP Prep was not modified, deployed or tagged. Its `mathnexa-map-prep-v1.2.x` tag
namespace remains separate from this project's bare `v1.2.x` tags.
