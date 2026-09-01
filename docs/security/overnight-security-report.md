# MathNexa Overnight Security Hardening — Report

**Frozen baseline:** release `v1.2.4`, annotated tag
`be32ed124b83e78d045d1d299a1e91f12043691f`, peeling to
`7c01ff2a2b2dac8ec5c30c700b4da5d1e37c31ec`. Untouched.
**Production:** `https://mathnexa.com` serving `dpl_7dTiNcKyhWaZKuGGMyAhnDgLypbs`.
**Production changed:** **no.** Nothing deployed, no tag, no environment variable, no alias.
**ShowMe / MAP Prep:** untouched.
**Staging:** locked throughout. Never opened.

**Branch:** `security/mathnexa-overnight-hardening`, cut from the Phase 2 tip `89f26a4`.

---

## What this session actually was

The night ran in two halves. The first built: SSRF address hardening, an admin limiter
fix, a distributed-attack simulation, spray observation, a dedicated limiter secret,
SBOM generation, split security gates, and the documentation set. Then an adversarial
review was run **against that work** — and it found real defects in it.

That second half is the more valuable one, and it is worth being blunt about what it
found, because three of the four issues were mine from earlier the same night:

| Finding | What was wrong |
|---|---|
| ON-07 | Spray detection fired on ordinary classroom sign-ins |
| ON-08 | A secret length ceiling broke the invariant its own neighbouring comment defended |
| ON-09 | A security log recorded a session revocation that may never have happened |
| — | A justification in the Phase 2 report was wrong by three orders of magnitude |

None of them were exploitable. All of them were the kind of thing that quietly degrades a
security system while every test stays green.

---

## ON-07 — Spray observation fired on every classroom sign-in

**Severity: MEDIUM (detection quality). Fixed.**

`observeSprayPressure` ran inside `consumeConsumerAuthAttempt`, which executes **before**
the password is checked. So it counted every attempt, including every success — while its
own comment claimed it was "counting failures per ADDRESS". It was not.

Because the counter is keyed on the network address and a school puts a whole cohort
behind one, the review reproduced the consequence directly: **30 legitimate student
sign-ins produced 10 `AUTH_SPRAY_SUSPECTED` events; 200 produced 170.**

Nothing was ever blocked, so no classroom was locked out and the constraint was not
violated. But the signal was guaranteed to saturate on any normal school morning, which
would have buried the genuine `AUTH_LOGIN_FAILED` and `AUTH_RATE_LIMITED` lines in the
same stream. Detection that always fires is not detection.

**Fix.** The observation moved to the rejected-credential branch of `signInAction`, so a
successful sign-in contributes nothing and the comment is now true. It also emits under a
stable correlation id, so `emitOperationalEvent`'s five-second de-duplication applies —
once the threshold is crossed the database function keeps returning `false` for the rest
of the window, and a per-request id would have emitted one line per subsequent attempt.

**Why it passed the suite in the first place, which matters more than the bug.** The
simulation harness stubbed `emitOperationalEvent` to `() => true`. Emitted events were
invisible to every assertion in the file, so a signal firing on every ordinary sign-in
looked identical to one that never fired. The harness now captures events, and a new test
walks 200 successful sign-ins from one school address and requires **zero** spray events.
Confirmed it has teeth: restoring the old call site fails it.

---

## ON-08 — A secret ceiling broke the invariant above it

**Severity: MEDIUM (latent availability). Fixed.**

`resolveLimiterSecret` enforced `MAXIMUM_SECRET_LENGTH = 512`, directly beneath a comment
explaining that requiring more than production identity requires would lock every customer
out. A ceiling does exactly that from the other end:
`hasProductionIdentityConfiguration()` imposes **no** maximum on `SUPABASE_SECRET_KEY`, so
a longer key satisfies production identity — authentication live, service client working —
while the limiter refuses to resolve it and the fail-closed rule denies every sign-in.

HMAC accepts a key of any length, and the value comes from server configuration rather
than from a request, so the bound protected nothing. Removed.

The test that pinned that ceiling was asserting the defect. It is replaced by the invariant
that actually matters: every environment `hasProductionIdentityConfiguration` accepts must
also yield a limiter secret — verified at 20, 40, 128 and 600 characters.

---

## ON-09 — A security log stated something that may not have happened

**Severity: MEDIUM. Fixed.**

The password-change path called `signOut({ scope: "others" })` inside a `try`/`catch` that
swallowed failure, then unconditionally recorded
`AUTH_PASSWORD_CHANGED { otherSessionsRevoked: true }`.

An incident responder reading "other sessions were revoked" would draw exactly the wrong
conclusion about whether a stolen session is still live. That is worse than no event.

The same call was also unbounded — a network round trip with no timeout, sitting on the one
journey a user is least able to abandon halfway.

**Fix.** Bounded at three seconds through the existing `withTimeout` helper, and the event
now reports the actual outcome.

---

## The "millennia" correction

The Phase 2 report justified widening the authorized-code budget from 5 to 20 attempts by
saying an exhaustive search would take "millennia". **That was wrong by three orders of
magnitude**, and the review was right to call it.

The real arithmetic: the shortest permitted code is `[A-Z0-9][A-Z0-9_-]{3}`, so 36 × 38³ =
**1,975,392** possibilities. At 20 per 15 minutes — 80 an hour — exhaustion takes about
**2.8 years**, and an even chance about 1.4. The previous budget bought 11.3 years.

So the loosening is a real reduction, not a free one. It is still the right trade: years is
far beyond a realistic attacker against a code rotated between cohorts, each extra
character multiplies it by 38, and the cost it buys back is a whole school locked out of a
lesson after six mistyped codes. But the number was overstated, and both the code comment
and the Phase 2 report now say *years* and show the working.

**If the four-character floor is ever lowered, this figure must be restated.**

---

## Earlier in the night — already committed and verified

| Commit | Area | What |
|---|---|---|
| `43750e0` | auth | Distributed-attack simulation; fixed an indefinite lockout it exposed (ON-04) |
| `1e43544` | SSRF, admin, auth | Address bypass (ON-01), admin limiter keyed on a spoofable address (ON-02), password-change containment |
| `86fb142` | supply chain | SBOM generation, split fast/deep security gates |
| `ad4bbd7` | staging, docs | Narrowed the gate exemption (ON-05); architecture and incident-response docs |
| `c4b53da` | docs | Debt register, CSP feasibility, disaster recovery |
| `29d0e5a` | docs | OWASP map, API abuse cost model, dependency review, `security.txt` proposal |
| `8f8bea5` | SSRF | IPv6 judged by its bytes rather than its spelling — closed a regression the review caught in the first attempt |
| `915c9c8` | tests | Value-shape redaction covered independently of key-name filtering (ON-06) |
| `098d473` | tests | A blocked user cannot deadlock themselves by retrying |

`8f8bea5` deserves a note: the first IPv6 fix extracted an embedded IPv4 address before
checking the private-range prefixes, so `fe80::8.8.8.8`, `fc00::8.8.8.8` and `ff02::8.8.8.8`
all read as *public* — addresses that were correctly rejected before that change. It now
expands to bytes and applies embedded-v4 extraction only to the genuine embedding prefixes
(`::ffff:/96`, `::/96`, `64:ff9b::/96`, `2002::/16`). A fix that introduced a regression,
caught and corrected the same night.

---

## Test gates

| Gate | Result |
|---|---|
| `npm run test:security` | **129 passed**, plus both standing bundle audits |
| `npm run test:unit` | 234 core + 456 web pass |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (8 pre-existing warnings, untouched file) |
| `npm run build` | compiled successfully |
| `npm audit --omit=dev` | 0 vulnerabilities |

**Mutation checks performed tonight:** restoring the spray observation to the allowed path
fails 2 tests including the classroom regression; the earlier session confirmed removing
the limiter `trim()` fails 2 and removing the hoisted staging gate fails 6.

**Known pre-existing failure, not a regression:** `lib/game-access/canonical-assets.test.ts`
fails on Windows from CRLF normalisation at checkout. Present identically on the frozen
`v1.2.4` tree. It touches no security control.

---

## Honest limits of this session

- **Six verification agents were killed by a session limit mid-review.** Their findings are
  therefore *unverified*, not refuted. I checked the highest-signal ones myself — the secret
  ceiling, the password-change log, the "millennia" figure — and all three were real, which
  suggests the unchecked remainder deserves attention rather than dismissal. They are listed
  in the debt register as unverified.
- **PH2-07 remains the largest open gap.** Security events are written but nothing reads
  them: no log drain, no query, no alert. That needs owner credentials.
- **WebKit and Firefox still cannot run locally** (missing host dependencies), so
  cross-engine CSP verification remains Chromium-only and the Firefox Stripe `form-action`
  round trip is still `NOT TESTED`.
- **No staging deployment tonight.** The gate stayed locked, as instructed, so anything
  needing a live environment was done against local deterministic tests instead.

---

## Owner-gated

1. **Vercel log drain and alerts** (PH2-07) — the read path for every security event.
2. **`MVH_AUTH_RATE_LIMIT_SECRET` in production** — code support and fallback are shipped
   and tested; creating and migrating the value needs owner credentials.
3. **Publishing `/.well-known/security.txt`** — proposal drafted, not published.
4. **HSTS `preload`** — researched, recommendation **DEFER**.
5. **Edge firewall rules** — designed, deliberately not applied.
