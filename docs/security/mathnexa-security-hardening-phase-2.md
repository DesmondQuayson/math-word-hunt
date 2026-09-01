# MathNexa Security Hardening — Phase 2

**Baseline:** release `v1.2.4`, annotated tag `be32ed124b83e78d045d1d299a1e91f12043691f`,
peeling to `7c01ff2a2b2dac8ec5c30c700b4da5d1e37c31ec`.
**Production at time of review:** `https://mathnexa.com` serving `dpl_7dTiNcKyhWaZKuGGMyAhnDgLypbs`.
**Branch:** `security/mathnexa-hardening-phase-2`, cut from `7c01ff2`.
**Production changed by this phase:** no. Nothing deployed to production, nothing tagged.
**ShowMe / MAP Prep:** untouched.

---

## Headline

Phase 1 hardened prevention. Phase 2 was scoped to detection, containment and abuse
resistance — and the audit found that the preventive controls themselves had two
bypasses worth more than any amount of new logging.

The blunt version: **the rate-limit key included the user agent, which the caller
chooses.** One header change minted a brand-new budget from a single address, no proxy
pool required. That undercut the Phase 1 limiter, and each forged agent also created a
row in a table with no TTL, so the bypass doubled as unbounded growth. Separately, a
**locked staging deployment was serving fully rendered application pages** to anyone who
appended `.png` to a path.

Neither is a Phase 1 regression — both predate it — but both are real, both are fixed,
and both were verified live.

**0 CRITICAL. 0 HIGH unresolved.** Three HIGH and one MEDIUM fixed; the rest recorded
with reasoning.

---

## Findings

| ID | Severity | Kind | Finding | Status |
|----|----------|------|---------|--------|
| PH2-01 | HIGH | new vulnerability | Caller-controlled user agent in the rate-limit key lets one address mint unlimited budgets | **Fixed** |
| PH2-02 | HIGH | new vulnerability | Distributed guessing against a single known account was uncapped | **Fixed** |
| PH2-03 | HIGH | new vulnerability | Authorized-code gate locked an entire school out after 5 mistyped codes | **Fixed** |
| PH2-04 | MEDIUM | new vulnerability | Locked staging served fully rendered pages via a path-suffix bypass (extends MN-11) | **Fixed** |
| PH2-05 | MEDIUM | new vulnerability | Confirmation-email resend was throttled only by a cookie the caller owns | **Fixed** |
| PH2-06 | MEDIUM | defense-in-depth | The consumer and public surfaces emitted no security events at all | **Fixed** |
| PH2-07 | HIGH | defense-in-depth | Security events have no read path: no log drain, no query, no alert | **Owner action required** |
| PH2-08 | MEDIUM | defense-in-depth | `admin_auth_rate_limits` has no TTL or purge | Deferred — Phase 3 |
| PH2-09 | MEDIUM | new vulnerability | Password spraying (one guess against each of many accounts) is counted nowhere | Deferred — Phase 3 |
| PH2-10 | MEDIUM | defense-in-depth | Unauthenticated `/media/[assetId]` and resource preview proxy whole files per request | Deferred — Phase 3 |
| MN-06 | LOW | — | Admin route existence distinguishable by status code | **Accepted** |
| MN-07 / MN-10 | LOW / INFO | — | `/api/health` and `/status` expose a stale 40-character build SHA | **Accepted, narrowed** |
| MN-08 | INFO | — | `script-src 'unsafe-inline'` | **Keep — see CSP** |
| MN-11 | LOW | — | Locked staging serves `/_next/static/**` and icons | **Accepted as originally scoped**; its extension fixed as PH2-04 |

---

### PH2-01 — HIGH — The rate-limit key included input the caller chooses

**Threat.** The Phase 1 subject was `HMAC(scope + address + IP + user agent)`. The user
agent is a request header. An attacker sends each guess with a different one and lands in
a fresh bucket every time, from a single address, without a proxy pool. The limiter
counted, but never to anything.

**Evidence.** `consumerAuthSubjectHash()` took `userAgent` and folded it into the digest;
`schoolAccessRateLimitSubject()` did the same. Both are reached on every attempt.

**Compounding effect.** Each forged agent created a new `(scope, subject_hash)` row in
`admin_auth_rate_limits`, which has no TTL (see PH2-08). So the bypass was also a cheap
way to grow that table without bound.

**Fix.** Removed from both keys. This costs nothing for the case it was meant to serve:
students behind one school address sign in with *their own different addresses*, which
are already in the key, so their budgets stay separate regardless. Both limiters now
prefer `x-vercel-forwarded-for`, which the platform sets and a caller cannot prepend to;
`x-forwarded-for` is a fallback and only its leftmost entry is ever read.

**Residual risk.** An attacker with a genuine pool of addresses still gets one budget per
address. That is what PH2-02 exists to cap.

---

### PH2-02 — HIGH — Distributed guessing against one account was uncapped

**Threat.** With the request dimension keyed on address, an attacker spreading attempts
across many addresses got unlimited guesses against a single known account.

**Fix.** A second limiter dimension keyed **only on the account**, reusing the deployed
`consume_admin_auth_rate_limit` at the tightest budget it permits — 20 attempts per hour,
15-minute block. Both dimensions must pass; either refusal returns the same generic copy.

**The trade, stated plainly.** Any per-account limiter hands an attacker who knows a
victim's address a way to spend that budget deliberately and lock them out. Three things
keep it proportionate:

1. The block is 15 minutes, not permanent, and a successful sign-in clears it.
2. **It applies to sign-in only.** Password recovery deliberately keeps just its
   request-level budget, so a locked-out user still has a working route back into their
   account instead of hitting the same wall.
3. The refusal is byte-identical to any other failure, so it cannot confirm an account
   exists.

Leaving distributed guessing uncapped is the worse option for a paid product holding real
accounts.

---

### PH2-03 — HIGH — The authorized-code gate locked out whole schools

**Threat.** This is precisely the failure mode the brief warns about. The gate allowed
**5 attempts, then blocked for 30 minutes**, keyed on the network address — and a school
puts an entire cohort behind one. Six mistyped codes during a lesson cost the whole school
half an hour of access.

**Fix.** Widened to 20 attempts (the maximum the database function accepts) with the block
halved to 15 minutes, and the user agent removed from the key per PH2-01.

**Why this is still strong — with the arithmetic corrected.** An earlier draft of this
section said an exhaustive search would take "millennia". That was wrong by three orders of
magnitude and adversarial review caught it. The real figures: the shortest permitted code is
`[A-Z0-9][A-Z0-9_-]{3}`, so 36 × 38³ = **1,975,392** possibilities. At 20 attempts per 15
minutes — 80 an hour — exhaustion takes about **2.8 years**, and an even chance about 1.4.
The previous 5-per-15-minutes budget bought 11.3 years, so this loosening is a real
reduction, not a free one.

It remains the right trade. Years is still far beyond any realistic attacker against a code
that is rotated between cohorts, each additional character multiplies it by 38, and the cost
it buys back is not hypothetical: the old budget locked an entire school out of a lesson
after six mistyped codes. Because a correct entry calls `clearSchoolAccessAttempts`, only
*consecutive failures* accumulate, so students who type the code correctly never spend the
budget for the ones behind them.

**This figure must be restated if the four-character floor is ever lowered.**

---

### PH2-04 — MEDIUM — Locked staging served fully rendered pages

**Threat.** The proxy matcher excluded any path *ending* in an image extension:

```
"/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
```

`/sign-in.png` is not a file. Next.js rendered its own 404 document for it, and because
the proxy never ran, the **staging gate never saw the request**. A locked staging
environment therefore returned a complete MathNexa page — `<title>MathNexa</title>`, brand
markup, the full navigation — to any anonymous visitor, with no `X-Robots-Tag`, so it was
also search-indexable.

**Evidence, before the fix, against locked staging:**

```
GET /            -> 404, 0 bytes        (gate working)
GET /sign-in.png -> 404, 18450 bytes    (gate bypassed, full page rendered)
```

**Fix.** Exclusions are now listed by **prefix**, never by extension: the framework's own
output, the three real public asset directories (`brand/`, `game-suite/`,
`internal-games/`) and the four App Router root icons. Everything else reaches the proxy,
which is what makes the gate authoritative.

**Verified on the live locked staging deployment after the fix:**

```
/sign-in.png    404, 0 bytes      /account.webp  404, 0 bytes
/.png           404, 0 bytes      /games.svg     404, 0 bytes
/favicon.ico    200               /brand/mathnexa-mark.png  200
```

This is what changes the MN-11 verdict. The original finding — that static assets remain
public on locked staging — really is acceptable. Serving a rendered application document
is not.

---

### PH2-05 — MEDIUM — Confirmation resend was throttled by a cookie the caller owns

**Threat.** `resendConfirmationAction` gated resends on `mathnexa-confirmation-resend-after`,
a cookie. The caller owns their own cookie jar: delete it and the 60-second wait is gone.
The action then sends an unbounded number of confirmation emails, at our cost and someone
else's inbox.

**Fix.** The server-side budget is now the control (sign-up scope, 10 per 15 minutes,
keyed on address + account). The cookie stays, because it gives a legitimate user an
honest countdown — it just is not what protects anything.

---

### PH2-06 — MEDIUM — The consumer and public surfaces emitted no security events

**Correcting my own first draft:** it is not true that the platform had no detection.
`app/admin/actions.ts` writes 11 audit rows covering admin login failure by reason, MFA
outcomes and success, and `safeBillingLog` records webhook processing. The accurate claim
is narrower and still worth fixing: **the admin surface was instrumented and the
consumer/public surface was silent.** Logging existed on happy paths, not denial paths.

Before this change, `emitOperationalEvent` had exactly one caller in the whole codebase —
the Phase 1 limiter-outage report — and the `authorization` event category had never been
used at all.

**Fix.** New `lib/observability/security-events.ts` with a twelve-event taxonomy, wired at
seven denial points.

| Event | Emitted from |
|---|---|
| `AUTH_LOGIN_FAILED` | `app/auth-actions.ts` |
| `AUTH_RATE_LIMITED` / `AUTH_SIGNUP_RATE_LIMITED` / `AUTH_RECOVERY_RATE_LIMITED` | `lib/auth/rate-limit.ts` |
| `AUTH_LIMITER_UNAVAILABLE` | `lib/auth/rate-limit.ts` (Phase 1) |
| `AUTHORIZED_CODE_FAILED` / `AUTHORIZED_CODE_RATE_LIMITED` | `app/school-access-actions.ts` |
| `WEBHOOK_SIGNATURE_INVALID` / `WEBHOOK_REPLAY_DETECTED` | `lib/billing/consumer-webhook.ts` |
| `STAGING_ACCESS_DENIED` | `proxy.ts` |
| `AUTHORIZATION_DENIED` / `ADMIN_AUTH_FAILED` | reserved; admin is already covered by `admin_audit_log` |

**Privacy.** Events carry a coarse user-agent *family* (`browser` / `scripted` / `bot` /
`absent`), never the raw string, and **never the address** — the limiter's own counters
already cover that dimension and the brief is explicit about not increasing collection.
Two independent filters strip credential-shaped keys: `createSafeEvent`'s, and a second
domain-specific one here covering access codes, subject hashes and payloads. Changing
either alone cannot open the hole.

**Transport.** The console adapter, deliberately not `recordAggregateSignal` — that helper
writes through the service Supabase client, so it cannot report a failure of that client,
and its metric keys are fixed by a database CHECK constraint that only a forward migration
can change. It is also the wrong tier for unauthenticated paths: one service-role write per
attacker request is write amplification.

**Correlation.** Uses the platform's existing `x-vercel-id` rather than minting a new
identifier, falling back to a random value when absent.

**Known consequence, chosen deliberately:** `emitOperationalEvent` de-duplicates on
`category:code:correlationId` within 5 seconds. Because the correlation id is per-request,
that dedup never fires, so each denied request produces one line. That is comparable to the
platform's own request log and is the right trade — collapsing them would destroy exactly
the burst volume that makes an attack visible. No emission site sits inside a fan-out loop.

---

### PH2-07 — HIGH (defense-in-depth) — Security events have no read path

**This is the honest limitation of Phase 2 and it needs owner action.**

Writing events is only half a detection system. Today they land in Vercel runtime logs:
no log drain is configured, no `vercel.json` is committed, retention is short, nothing
queries them, and nothing alerts. The Phase 1 `rate-limiter-unavailable` event — severity
`critical` — has been in that position since v1.2.4 with nobody watching.

Adding more writes without a read path produces the *appearance* of detection. It is worth
doing anyway, because the events must exist before anything can consume them, but it should
not be mistaken for monitoring.

**Exact steps, which require owner credentials and were deliberately not performed:**

1. In the Vercel dashboard, **mathnexa-platform-production → Settings → Log Drains**, add a
   drain for `Runtime Logs` only. Any endpoint that can filter JSON works; the events are
   single-line JSON with stable `category`, `code` and `severity` fields.
2. Alert on: any `severity: "critical"` (today only `rate-limiter-unavailable`, which means
   authentication is failing closed); a rise in `auth-rate-limited` or
   `authorized-code-rate-limited` above the normal classroom baseline; any
   `webhook-signature-invalid`, which should be zero in steady state.
3. Vercel's own **Monitoring** view can chart 4xx/5xx rate without a drain and is the
   cheapest way to cover the 5xx-spike case.

No paid service is required for step 3, and steps 1–2 can point at infrastructure the owner
already has.

---

## Vercel Firewall / WAF

Capability was checked against the live account rather than assumed.

**Currently configured — both projects:**

```
Firewall:            Not configured
System Bypass:       0 IPs
Attack Mode:         Off
System Mitigations:  Active
Custom rules:        none
```

**Available on this plan:** custom rules with conditions (path, header, cookie, query,
AND/OR groups); actions `deny`, `challenge`, `log`, `bypass`, `rate_limit`, `redirect`;
native rate limiting with `fixed_window` or `token_bucket`, 1–10,000,000 requests over a
10–3600 s window; **rate-limit keys of `ip`, `ja4`, or an arbitrary header**; IP blocking;
Attack Challenge Mode; a draft → publish workflow; and team-level rules.

**The finding that matters for this product:** `ja4` — a TLS client fingerprint — is
available as a rate-limit key. That is the answer to the school-NAT problem, because it
distinguishes individual clients behind one address far better than the address alone. Any
future edge rate limit should key on `ja4`, not `ip`.

**Recommended rules — designed, not applied.** Applying them changes live traffic handling
on a release the owner has already approved, and the draft/publish flow means they can be
staged and reviewed first. Every one uses `challenge` or `log`, never `deny`, so a
misjudged threshold degrades a classroom's experience rather than blocking it:

| Rule | Condition | Action |
|---|---|---|
| Auth endpoint abuse | `path` starts with `/sign-in`, `/sign-up`, `/forgot-password`, `/access` | `rate_limit` keyed on `ja4`, 60 requests / 60 s → `challenge` |
| Exploit probes | `path` matches `/wp-admin`, `/.env`, `/.git`, `/phpmyadmin`, `/vendor` | `deny` |
| Scripted bulk traffic | `user-agent` header absent | `log` first, to size the baseline before acting |

**Not recommended and not done:** country blocking (MathNexa may be used internationally
and there is no threat evidence), IP denies (a school is one address), and any DNS
migration.

**Verdict: CURRENTLY ADEQUATE, with the above staged for owner approval.** System
Mitigations already cover L3/L4. The application-layer gaps that a WAF would have papered
over are the ones PH2-01 through PH2-03 just closed properly, in code, where they belong.

---

## CSP — `unsafe-inline` feasibility (MN-08)

**Recommendation: keep the current policy. Do not pursue nonce CSP in Phase 2.**

Next.js 16.2.12 with the App Router emits inline bootstrap and RSC flight scripts on every
document. A nonce approach requires `proxy.ts` to generate a per-request value and the root
layout to thread it through — which makes every document render per-request and forfeits
static generation for the marketing and public pages that currently benefit from it. That
is a real performance and caching regression traded for a partial hardening, on a release
the owner has just approved.

`style-src 'unsafe-inline'` cannot be dropped independently either: the framework inlines
critical CSS.

The mitigating context matters. The application has **zero** raw-HTML sinks — no
`dangerouslySetInnerHTML`, no `innerHTML`, no `document.write`, enforced by a standing test
that walks `app/`, `components/` and `lib/`. `'unsafe-inline'` is a defence-in-depth gap,
not an exploitable one, and the thing it would defend against does not currently exist.

`showme.mathnexa.com` ships the same trade-off. Revisit when Next.js offers first-class
nonce support that does not cost static generation.

---

## Deferred findings — status

**MN-06 — ACCEPTED as low risk.** `GET /admin/users/action` returns `405` while `/admin`
returns a concealment `404`. A uniform 404 means adding a `GET` handler to ~35 route files.
That is broad churn across the entire admin surface to withhold a path name from an attacker
who still faces Supabase authentication, an admin record, enrolled MFA at `aal2`, a bound
server-side session and an HMAC CSRF token. Existence is not what protects the console.

**MN-07 / MN-10 — ACCEPTED, with the scope corrected.** The audit found the build SHA is
also rendered by `/status`, not only `/api/health`, so the original finding understated its
reach. It remains low value to an attacker — the repository is private and the identifier is
34 commits stale — and several e2e specs plus a standing audit script consume the endpoint.
Recorded rather than changed. **Operational note that matters more than the disclosure:
`/api/health` must not be used to verify what is deployed**, because it reports a value
unrelated to the deployed commit. Confirm from the Vercel deployment ID.

**MN-08 — KEEP.** See CSP above.

**MN-11 — ACCEPTED as originally scoped.** Blocking `/_next/static/**` and the icons on
locked staging protects nothing unique: the production bundle is already publicly
downloadable and has been scanned clean of secrets and privileged logic in every phase.
Routing every asset through the proxy would add a Supabase `getUser()` round trip per
request for no gain. **Its extension — rendered application documents leaking through the
same matcher — was a different question and is fixed as PH2-04.**

---

## Deferred to Phase 3

Five items, ranked:

1. **PH2-07 — the read path.** Configure the log drain and alerts. Detection is not real
   until something watches. Highest value of anything remaining.
2. **PH2-08 — `admin_auth_rate_limits` has no TTL.** Rows accumulate per subject with no
   purge. PH2-01 removed the cheapest way to grow it, but a scheduled purge of expired
   windows is still needed before the table becomes a performance problem — and, because the
   limiter fails closed, a slow table eventually becomes an authentication outage.
3. **PH2-09 — password spraying.** One guess against each of many accounts passes every
   dimension: the request key is per-account, and so is the account key. An address-scoped
   counter of *failures across all accounts* would catch it. Needs care to avoid the school
   NAT.
4. **PH2-10 — egress abuse.** `/media/[assetId]` and `/resources/[id]/preview/[fileId]` are
   unauthenticated and proxy whole Supabase Storage objects through the function on every
   request, with `no-store`. A caching or signed-redirect strategy would cut both cost and
   abuse value.
5. **Edge rules.** Publish the `ja4`-keyed auth rule above once the owner has reviewed it.

---

## Verification

| Check | Result |
|---|---|
| `npm run test:security` | 68/68 plus both standing bundle audits |
| `npm run test:unit` | 234 core + 391 web pass |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (8 pre-existing warnings in an untouched file) |
| `npm run build` | compiled successfully |
| `npm audit --omit=dev` | 0 vulnerabilities |
| PH2-04 live before/after | `/sign-in.png` 18450 bytes → 0 bytes, on locked staging |
| Staging gate | still 404, 0-byte body, `no-store`, `noindex` |

Known pre-existing failure, unrelated and present on the frozen parent:
`lib/game-access/canonical-assets.test.ts` fails on Windows from CRLF normalisation at
checkout. It touches no security control and is **not** a security regression.

**14 new security tests**, covering key construction (no caller-controlled input, account
dimension independent of address, budgets inside the database contract, recovery preserved
as an escape hatch), event redaction (a deliberately hostile detail object containing a
password, token, address, access code and subject hash — none of which reach the log), the
user-agent classifier, correlation id derivation, all seven emission sites, transport
choice, and the matcher's prefix-only exclusions.

---

## Phase 1 protections — still intact

Verified by the standing suite: all six security headers, `frame-ancestors 'self'`, both
Stripe `form-action` hosts, HSTS `includeSubDomains`, `X-Powered-By` absent,
Content-Disposition sanitisation, the redirect allowlist, server-side entitlement,
authorized-code secrecy, admin MFA at `aal2` with a bound session and CSRF, the staging
gate's fail-closed configuration contract, and the rate limiter's production fail-closed
behaviour. The rate-limiter secret floor of 20 characters is unchanged.
