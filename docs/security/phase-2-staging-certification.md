# MathNexa Security Phase 2 — Staging Certification

**Candidate:** `security/mathnexa-overnight-hardening` at
`ecb1f0f3984e2ff673303005153a4ba6817ba282`.
**Frozen production:** `v1.2.4` → `7c01ff2a2b2dac8ec5c30c700b4da5d1e37c31ec`, serving
`dpl_7dTiNcKyhWaZKuGGMyAhnDgLypbs`. **Unchanged throughout.**
**Status:** approved on staging by the owner; awaiting production approval. Not merged,
not tagged, not deployed to production.

---

## Owner staging verification

The owner personally tested `https://mathnexa-platform-staging.vercel.app` running the
`ecb1f0f` candidate and confirmed **PASS** on every item:

| Area | Result |
|---|---|
| Sign in | PASS |
| Sign in → Home | PASS |
| Account | PASS |
| Games | PASS |
| MAP Prep | PASS |
| Homework | PASS |
| Quizzes | PASS |
| Pricing / Subscription | PASS |
| Authenticated game launch | PASS |
| Gameplay | PASS |
| Game controls | PASS |
| Game music / audio | PASS |
| Logout | PASS |
| Logged-out route protection | PASS |
| Desktop and mobile presentation | PASS |

This is the evidence the automated suites could not produce: every authenticated journey,
the real game runtime, and audio after a genuine user interaction. No authorized staging
account exists for automation, so these paths were owner-verified rather than machine-verified.

---

## Staging deployments used

| Purpose | Deployment | Gate |
|---|---|---|
| Locked-gate certification | `dpl_5KfQBk8c7LAtA96CGpSRvy7HARZu` | locked |
| Owner review | `dpl_DQauRrQwTZLvsmgZttNqX8jf19fU` | temporarily open |
| **Re-locked, final** | **`dpl_9fmx3wVUEToBuowLL28nygRWQRf6`** | **locked** |

All three built from the same `ecb1f0f` tree. Project
`mathnexa-platform-staging` / `prj_O61Cyx9WMjc0jljpM9erCiSXsJA0`, verified through the
Vercel API rather than the local link file before every deployment.

`MVH_STAGING_ACCESS_TOKEN` was never read, printed or rotated at any point — it still
carries its original age in the environment listing. Only
`MVH_STAGING_ACCESS_REQUIRED` was changed, and always through `printf` rather than a
shell pipeline that appends a newline.

### Gate state after re-locking

```
GET /            404, 0 bytes, Cache-Control: no-store, X-Robots-Tag: noindex, nofollow
GET /sign-in     404, 0 bytes      GET /map-prep   404, 0 bytes
GET /account     404, 0 bytes      GET /homework   404, 0 bytes
GET /games       404, 0 bytes      GET /quizzes    404, 0 bytes
GET /sign-in.png 404, 0 bytes      GET /account.webp 404, 0 bytes
```

The last two matter: they are the PH2-04 suffix bypass, which previously returned a fully
rendered 18,450-byte page from a "locked" environment.

**STAGING GATE LOCKED = YES.**

---

## Browser certification

| Engine | Result |
|---|---|
| Chromium | **0 CSP violations** across 8 routes, fresh context each |
| WebKit 26.5 | **0 CSP violations** across 8 routes |
| Firefox | **NOT TESTED** — `spawn UNKNOWN`; the Stripe `form-action` round trip stays unverified |

WebKit is new. It failed to launch in every earlier session with a missing-DLL error and
now runs, so cross-engine verification is no longer Chromium-only. Firefox remains the one
engine this environment cannot provide, and that is reported rather than papered over.

Framing held in both directions: cross-origin framing of `/sign-in` blocked with the engine
logging the `frame-ancestors 'self'` refusal, same-origin game-runtime framing permitted,
anonymous `/game/runtime/index.html` denied with 401. All five `form-action` cases passed,
including the lookalike host `checkout.stripe.com.evil.example` being blocked.

---

## Mutation coverage

Every critical control was broken deliberately and the suite required to notice.

| Control mutated | Tests failed |
|---|---|
| Value-shape redaction disabled | 10 |
| Account-target dimension skipped | 4 |
| Production limiter fail-open | 3 |
| SSRF private-address blocking removed | 2 |
| Admin limiter identity preference swapped to the spoofable header | 2 |
| Spray observation moved back to the success path | 2 |
| Staging gate normalization (`trim`) removed | 1 |

All mutations restored; the working tree is clean. No mutation was ever applied to
production.

---

## Findings

**CRITICAL 0 · HIGH 0 · MEDIUM 0 unresolved.**

ON-01 through ON-13 are all **FIXED** with a standing regression test. MN-06 and MN-11 remain
**ACCEPTED**; MN-07, MN-08 and MN-10 remain **documented INFO**. Nothing is in an UNKNOWN
state — the full disposition of all 45 findings from the interrupted review is in
`interrupted-review-recovery.md`.

---

## Classroom safety contract

Reconfirmed deterministically, not by live traffic:

- **200 valid users behind one school NAT, all succeeding → 0 false spray events, 0 blocks.**
  This is the ON-07 regression, and it is the single most important behaviour in the whole
  phase for this product.
- One account, many attacking addresses, failed credentials → the account-target dimension
  engages.
- Many accounts, one hostile source → spray detection observes without ever blocking.

Successful traffic never increments a failure-only signal. Thresholds were not changed in
this task.

---

## Deferred and owner-gated

| Item | Status |
|---|---|
| PH2-07 — log drain and alert read path | **OWNER-GATED.** Events are written, redacted, correlated and de-duplicated; nothing reads them yet |
| `MVH_AUTH_RATE_LIMIT_SECRET` | **OWNER-GATED.** Absent on staging, so the designed fallback to `MVH_ADMIN_CSRF_SECRET` is what runs. Code support and migration steps are shipped |
| Vercel firewall rules | **OWNER-GATED.** Designed, not applied. School shared-NAT false positives remain the primary constraint |
| `security.txt` | **OWNER-GATED.** Drafted, unpublished |
| HSTS `preload` | **DEFER.** Not added |
| MN-11 | **ACCEPTED.** Locked staging static bundles are equivalent to what production already serves publicly and carry no secret or privileged authority. Routing deliberately unchanged |
| PH2-08 — `admin_auth_rate_limits` has no TTL | **Phase 3.** See below |

### PH2-08 assessment

**Growth.** One row per `(scope, subject_hash)`. Two amplification paths were closed this
phase: the user agent is no longer part of any key (so forged agents cannot mint rows), and
both consumer limiters now require the address to parse as an IP (so arbitrary header text
cannot either). What remains is one row per genuine address, per account, and per failing
address — proportional to real traffic rather than to attacker effort.

**Security impact.** None directly. The risk is indirect and worth stating plainly: the
limiter fails closed, so if the table ever grew large enough to make
`select … for update` slow or error, that degrades into an authentication outage rather than
a security hole. That is an availability path, not a bypass.

**Proposed remediation (Phase 3).** A scheduled delete of rows whose window has rolled and
whose block has expired — a single predicate over `window_started_at` and `blocked_until`,
run daily. It needs a migration and therefore an owner-approved database change, which is
why it is not in this phase.

---

## Verification summary

| Gate | Result |
|---|---|
| `npm run test:security` | **245 passed**, plus both standing bundle audits |
| `npm run test:unit` | 234 core + 476 web pass |
| `npm run typecheck` | clean |
| `npm run lint` | 0 errors (8 pre-existing warnings in an untouched file) |
| `npm run build` | compiled successfully |
| `npm audit --omit=dev` | 0 vulnerabilities |
| Client bundle scan | 0 hits across 13 secret patterns and 10 server-authority symbols |

**Known pre-existing failure, unchanged and not a regression:**
`lib/game-access/canonical-assets.test.ts` fails on Windows from CRLF normalisation at
checkout. Verified that this branch changes neither `docs/index.html` nor `docs/vocab.js`
relative to `v1.2.4`, so it is the same failure that exists on the frozen release.

---

## Production

**Changed = NO.** `https://mathnexa.com` still serves `dpl_7dTiNcKyhWaZKuGGMyAhnDgLypbs`
with all six security headers, `www` still redirects to the apex, the `v1.2.4` tag matches
local and remote, and the rollback deployment `dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd` is still
Ready. No new production deployment, no environment change, no alias move, no tag.

**ShowMe / MAP Prep: unchanged.**
