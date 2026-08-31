# OWASP Top 10 (2021) — MathNexa Coverage

A working map, not a certification claim. For each category: whether it applies
here, what control exists, what test proves it, and what is genuinely left.

## A01 — Broken Access Control

**Applies. Strongest area of the codebase.**

Controls: `getGameAccessView()` is the single entitlement authority and is
`server-only`; `requireProductAccess()` gates product routes; all 35 admin routes
require `aal2` MFA plus a bound server session plus an HMAC CSRF token; game
assets need a signed, audience-bound, principal-bound ticket.

Evidence: an object-level authorization audit across **50 route handlers and 6
server-action files found no IDOR**. Teacher objects resolve through repositories
that chain `.eq("owner_teacher_id", …)` under RLS; writes go through
`SECURITY DEFINER` functions that derive the owner from `auth.uid()` and never
from the request; billing session lookups require the caller's own customer
mapping.

Tests: admin RBAC downgrades (12 single-condition cases), privileged route
surface, entitlement never derived from client storage.

Residual: the complimentary-entitlement predicate is expressed twice and has
drifted — it fails closed, so it is a product defect rather than a hole.

## A02 — Cryptographic Failures

**Applies.**

HSTS with `includeSubDomains` on all hosts; HTTPS-only; secrets server-side only
and verified absent from the client bundle; HMAC-SHA256 for tickets, sessions,
CSRF tokens and limiter subjects; constant-time comparison (`timingSafeEqual`)
for every secret comparison; session tokens stored as SHA-256 hashes, never in
the clear.

Residual: HSTS `preload` deliberately deferred — it is a one-way door.

## A03 — Injection

**Applies, and largely structurally absent.**

No raw SQL: everything goes through the Supabase client or `SECURITY DEFINER`
functions with typed parameters. **Zero** `dangerouslySetInnerHTML`, `innerHTML`
or `document.write` in the application, enforced by a standing test. Header
injection: every `Content-Disposition` filename is sanitised, and a full
response-header inventory found no CR/LF sink. Path traversal: every path is
constrained by an allowlist pattern rather than a filter.

Tests: injection-surface walk, hostile-filename corpus, path-traversal corpus.

## A04 — Insecure Design

**Applies.**

Design decisions and their reasoning are recorded in `security-architecture.md`,
including the ones that look like gaps, so they are not "fixed" into regressions.
Notable deliberate choices: the account limiter covers sign-in only so recovery
stays an escape hatch; spray detection observes rather than blocks because
schools share an address; the limiter fails closed in production, but its secret
floor matches the identity contract so it cannot lock customers out.

## A05 — Security Misconfiguration

**Applies. This is where the real findings have been.**

MN-09 (a newline disabling the staging gate), PH2-04 (an extension-anchored
matcher letting rendered pages past that gate) and ON-05 (a case-insensitive gate
exemption) were all misconfiguration-shaped. All three are fixed, each with a
standing test.

Controls: full security header set; `poweredByHeader: false`; environment values
normalised at one boundary; the staging gate fails closed on ambiguity.

Residual: no `engines`/`packageManager` pinning; Vercel Firewall unconfigured
(rules designed, owner-gated).

## A06 — Vulnerable and Outdated Components

**Applies.**

`npm audit` clean in both scopes; 76 production components from a single
registry; no git or http sources; one lifecycle script and it is dev-only;
CycloneDX SBOM generated from existing tooling.

Residual: **no automated advisory monitoring** — audits run when someone runs
them. Enabling Dependabot is the highest-value remaining supply-chain action.

## A07 — Identification and Authentication Failures

**Applies. Most of tonight's work.**

Three limiter dimensions, all keyed only on material the caller cannot choose; no
user enumeration anywhere, verified live with one identical message across three
addresses including one that plausibly exists; generic responses throughout; MFA
at `aal2` for admin; sessions bound and hashed server-side; a password change now
revokes every other session.

Residual: `updatePasswordAction` accepts any session rather than requiring
re-authentication — owner-gated, containment shipped.

## A08 — Software and Data Integrity Failures

**Applies.**

Stripe webhooks are signature-verified with idempotency receipts and replay
refusal; no untrusted deserialisation; no CDN-loaded third-party script anywhere,
so there is no SRI gap to fill; the lockfile carries integrity hashes.

## A09 — Security Logging and Monitoring Failures

**Applies. The weakest area, stated honestly.**

Before Phase 2 the consumer surface emitted nothing. It now emits at eleven
denial points with two independent redaction filters and a per-request
correlation id.

**Residual, and it is significant: there is no read path.** No log drain, short
retention, no alerting. Writing events without a reader produces the appearance
of detection. Owner-gated, with the exact configuration steps recorded.

## A10 — Server-Side Request Forgery

**Applies, narrowly.**

One server-side fetch takes an influenced destination: the admin
external-destination health check. It resolves the hostname, refuses any
non-public address, and does not follow redirects (`redirect: "manual"`).

Tonight closed a real bypass: IPv6 spellings of private IPv4 addresses
(`::ffff:127.0.0.1`, `::ffff:169.254.169.254`, NAT64, 6to4) were classified as
public internet addresses. 14 tests now cover the classification in both
directions.

Residual: a DNS rebinding window exists between resolution and connection. It is
admin-only, the host must match an admin-configured allowlist entry, and
redirects are not followed, so the practical reach is small. Recorded rather than
closed.
