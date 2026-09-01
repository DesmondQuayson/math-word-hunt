# MathNexa v1.2.5 — Release Record

## Security Hardening Phase 2

Owner-approved production release, frozen 2026-08-31 after the owner tested the candidate
on staging, approved promotion, and then verified the live production deployment.

## Release identity

| Item | Value |
| --- | --- |
| Release type | Security hardening — detection, containment, abuse resistance |
| Tag | `v1.2.5` (annotated, object `2210092a36875d199e4305ee81db4b897990327e`) |
| Application source | `ecb1f0f3984e2ff673303005153a4ba6817ba282` |
| Parent release | `v1.2.4` → `7c01ff2a2b2dac8ec5c30c700b4da5d1e37c31ec` (tag untouched, verified local and remote) |
| Branch | `security/mathnexa-overnight-hardening` |
| Vercel deployment | `kgbnxbx94` / `dpl_3FAmKZfSSG2L3QqPg3jFVLEUN5qi` on `bright-path-ed-tech/mathnexa-platform-production` (`prj_frhZ7EKPTnPJot97ioxNVv3oFi33`) |
| Production | https://mathnexa.com/ and https://www.mathnexa.com/ (308 to apex) |
| Immediate rollback | `dpl_7dTiNcKyhWaZKuGGMyAhnDgLypbs` — the v1.2.4 build, Ready, retained |
| Older rollback | `dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd` — the v1.2.3 build, Ready, retained |

The tag was verified in both directions before this record was written: local and remote tag
objects are identical, and the remote tag was fetched into a temporary ref and resolved
independently to confirm it peels to `ecb1f0f`.

**`ecb1f0f` is the same tree at every stage** — owner-tested on staging, deployed to
production (the worktree was detached to that commit so the deployed directory was
byte-for-byte the tested source), and owner-verified in production. This record is committed
afterwards and therefore sits outside the frozen tag.

---

## What this release is

Phase 1 hardened prevention. Phase 2 was scoped to detection and abuse resistance — and it
opened by finding that two of the preventive controls it was meant to complement had
bypasses worth more than any amount of new logging.

The blunt version: **the rate-limit key included the user agent, which the caller chooses.**
One header change minted a brand-new budget from a single address, no proxy pool required.
And a **locked staging environment was serving fully rendered application pages** to anyone
who appended `.png` to a path.

Neither was a Phase 1 regression; both predated it. Both are fixed and were verified live.

---

## Fixed

### Authentication and abuse resistance

**PH2-01 (HIGH) — caller-controlled input in the rate-limit key.** The subject was
`HMAC(scope + address + IP + user agent)`. The user agent is a request header, so an
attacker sent each guess with a different one and landed in a fresh bucket every time. The
limiter counted, but never to anything. Each forged agent also created a row in a table with
no TTL, so the bypass doubled as unbounded growth. Removed from both the consumer and
authorized-code keys; both now prefer `x-vercel-forwarded-for`, which the platform sets and
a caller cannot prepend to.

**PH2-02 (HIGH) — distributed guessing against one account was uncapped.** Adds a second
dimension keyed only on the account, at 20 attempts per 15 minutes with a matching block.

**PH2-03 (HIGH) — the authorized-code gate locked out whole schools.** It allowed 5 attempts
then blocked for 30 minutes, keyed on the network address — and a school puts a whole cohort
behind one. Six mistyped codes cost the entire school half a lesson. Widened to 20 attempts
with a 15-minute block, and only *consecutive failures* accumulate because a correct entry
clears the counter.

**ON-04 — account lockout was indefinite.** The deployed database function only resets a
counter when the window has rolled, so a window longer than the block re-blocked immediately
and every further attempt pushed the release further out. An attacker could have held a
victim out permanently for one request every quarter hour. The window and block are now
equal, which is what makes the lockout genuinely temporary. Found by simulation, not by
reasoning.

**ON-10 — the recovery escape hatch was only half real.** The account dimension covers
sign-in only, so that a victim whose budget an attacker deliberately spends still has
recovery as a way back in. Recovery was indeed never blocked — but completing it left the
block standing, so the user got a new password and still could not use it.
`updatePasswordAction` now clears the counter.

**ON-11 — the limiters accepted any string as the client address.** Only the admin limiter
validated it. Varying `x-forwarded-for` minted unlimited buckets and unlimited rows. All
three now require the value to parse as an IP.

**PH2-05 (MEDIUM) — confirmation resend was throttled by a cookie the caller owns.** Delete
the cookie and the wait was gone, so the action would send unbounded confirmation email.

### Detection

**PH2-06 (MEDIUM) — the consumer and public surfaces emitted no security events.** The admin
surface was already instrumented; what was silent was everything a customer or an attacker
touches, and logging existed on happy paths rather than denial paths. Adds a twelve-event
taxonomy wired at every denial point.

**ON-06 / ON-13 — redaction.** Events are filtered by key name *and* by value shape, so a
secret arriving under an innocent field name is still dropped. Two independent filters, so
loosening either alone cannot open the hole.

**ON-07 (MEDIUM) — spray detection fired on ordinary classroom sign-ins.** It ran before the
password was checked, so it counted every attempt including every success, while its own
comment claimed it counted failures. Keyed on the address, and a school is one address:
**30 legitimate student sign-ins produced 10 alarms; 200 produced 170.** Nothing was ever
blocked, so no classroom was locked out — but the signal was guaranteed to saturate on any
normal school morning and bury the genuine ones. Detection that always fires is not
detection. Moved to the rejected-credential path.

**ON-12 — correlation.** Sustained conditions (being throttled, a scan against locked
staging) emit under a stable id so de-duplication applies; discrete incidents keep a
per-request id, because there the volume *is* the signal. Correlation is server-controlled.

**ON-09 (MEDIUM) — a security log stated something that may not have happened.** The
password-change path recorded `otherSessionsRevoked: true` unconditionally, including after
a swallowed failure. An incident responder would have drawn exactly the wrong conclusion
about whether a stolen session was still live. It now reports the real outcome, and the call
is bounded at three seconds rather than being an unbounded network round trip on the one
journey a user is least able to abandon halfway.

### Isolation and integrity

**PH2-04 (MEDIUM) — locked staging served rendered pages.** The proxy matcher excluded any
path *ending* in an image extension, not just real assets. `/sign-in.png` is not a file, so
Next.js rendered its own 404 document and the proxy never ran — meaning the staging gate
never saw the request. A locked environment returned a complete MathNexa page, with no
`X-Robots-Tag`, so it was search-indexable too. Confirmed live at 18,450 bytes before the
fix and 0 bytes after. Exclusions are now by prefix.

**ON-01 (HIGH) — IPv6 spellings of private IPv4 passed as public.** The address check now
expands to bytes and applies embedded-v4 extraction only to the genuine embedding prefixes,
so a compressed or uppercase spelling cannot slip past. The first attempt at this fix
introduced a regression — `fe80::8.8.8.8` read as public — which was caught and corrected
the same night.

**ON-02 (HIGH) — the admin limiter keyed on a spoofable header.** It preferred
`x-forwarded-for`, so an attacker minted a fresh admin-login budget per request by varying
one header.

**ON-05 — the staging gate exemption matched case variants.**

**ON-08 (MEDIUM) — a secret ceiling broke the invariant above it.** `resolveLimiterSecret`
enforced a 512-character maximum directly beneath a comment explaining that demanding more
than production identity demands would lock every customer out. A ceiling does exactly that
from the other end, because `hasProductionIdentityConfiguration()` imposes no maximum.
Removed.

---

## Three contracts that must not be "tidied" later

1. **Spray detection counts rejected credentials only.** Move it back before the credential
   check and it alarms on every school morning.
2. **The account dimension covers sign-in only.** Extending it to recovery removes the
   victim's way back in from a deliberate lockout.
3. **`resolveLimiterSecret` has a 20-character floor and no ceiling.** Either bound diverging
   from `hasProductionIdentityConfiguration` produces a deployment where authentication is
   live but the limiter refuses to resolve — and the fail-closed rule then locks every
   customer out.

The two Phase 1 CSP decisions also still stand: `frame-ancestors 'self'` because the game
runtime is legitimately framed, and the two Stripe `form-action` hosts because checkout is a
form post that redirects off-site.

---

## Verification

| Check | Result |
| --- | --- |
| `npm run test:security` | **245 passed**, plus both standing bundle audits |
| `npm run test:unit` | 234 core + 476 web pass |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (8 pre-existing warnings in an untouched file) |
| `npm run build` | compiled successfully |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Client bundle scan | 0 hits across 13 secret patterns and 12 server-authority symbols |
| Browser CSP, Chromium | **0 violations**, 8 routes, fresh contexts |
| Browser CSP, WebKit 26.5 | **0 violations**, 8 routes |
| Browser CSP, Firefox | **NOT TESTED** — will not launch on this host (`spawn UNKNOWN`) |
| Framing | cross-origin blocked, same-origin game runtime permitted, anonymous runtime 401 |
| `form-action` | both Stripe hosts allowed; attacker origin and lookalike host blocked |
| Live headers | all six present, `X-Powered-By` absent |

**Mutation coverage — every critical control was broken deliberately and the suite required
to notice:** value redaction 10 failures, account dimension 4, production fail-closed 3,
SSRF private-address 2, admin identity 2, spray success-path 2, staging normalization 1.

**Classroom safety, the single most important behaviour for this product:** 200 valid users
behind one school NAT, all succeeding, produce **0 false spray events and 0 blocks**.
Successful traffic never increments a failure-only signal.

Known pre-existing failure, unchanged and not a regression:
`lib/game-access/canonical-assets.test.ts` fails on Windows from CRLF normalisation at
checkout. This branch changes neither `docs/index.html` nor `docs/vocab.js`.

---

## Owner verification

**Staging** and again on **live production**, the owner confirmed: sign in; sign in → Home;
Account; Games; MAP Prep; Homework; Quizzes; Pricing and Subscription; authenticated game
launch; gameplay; controls; game music and audio; logout; logged-out route enforcement;
desktop and mobile presentation.

This is the evidence automation could not produce — there is no authorized account for
automated sign-in on either environment.

---

## Deferred and owner-gated

| Item | Status |
| --- | --- |
| PH2-07 — observability read path | **OWNER-GATED.** Events are written, redacted, correlated and de-duplicated; no log drain or alert consumes them yet |
| `MVH_AUTH_RATE_LIMIT_SECRET` | **OWNER-GATED.** Not configured in production; the tested fallback to `MVH_ADMIN_CSRF_SECRET` is what runs |
| Vercel firewall rules | **OWNER-GATED.** Designed, not applied. School shared-NAT false positives are the constraint |
| `security.txt` | **OWNER-GATED.** Drafted, unpublished |
| HSTS `preload` | **DEFER** |
| MN-06, MN-11 | **ACCEPTED LOW RISK** |
| MN-07, MN-08 | Informational |
| **MN-10** | Informational — see below |
| **PH2-08** | **Phase 3** — see below |

### MN-10 — the health endpoint reports a stale build identifier

`/api/health` returns a `build` value set independently of the deployment, and it is now
stale by a further release. **It must not be used as release-identity evidence.** The
authoritative identity of this release is the Vercel deployment ID, the `v1.2.5` tag, and
the peeled source commit — all three recorded above. The endpoint was deliberately not
modified during this freeze.

### PH2-08 — `admin_auth_rate_limits` has no TTL

**Growth.** One row per `(scope, subject_hash)`. Two amplification paths were closed in this
release: the user agent is no longer part of any key, and every limiter now requires the
address to parse as an IP. Residual growth is proportional to real traffic rather than to
attacker effort.

**Security impact.** None directly. The risk is indirect and worth stating plainly: the
limiter fails closed, so if the table ever grew large enough to make its locking select slow
or error, that degrades into an authentication *availability* problem rather than a bypass.

**Proposed remediation.** A scheduled delete of rows whose window has rolled and whose block
has expired. It needs a migration, and therefore an owner-approved database change, which is
why it is Phase 3 rather than part of this release.

---

## Operational notes

`MVH_STAGING_ACCESS_TOKEN` was never read, printed or rotated at any point in this phase.
Only `MVH_STAGING_ACCESS_REQUIRED` was changed, and always through `printf` rather than a
shell pipeline that appends a newline — the MN-09 lesson from v1.2.4.

Staging is **locked**. The security worktree is deliberately relinked to
`mathnexa-platform-staging` so a stray `vercel deploy --prod` cannot reach production.

ShowMe / MAP Prep was not modified, deployed or tagged. Its `mathnexa-map-prep-v1.2.x`
namespace remains separate from this project's bare `v1.2.x` tags.
