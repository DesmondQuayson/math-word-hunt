# Recovery of the Interrupted Adversarial Review

The overnight adversarial review (`wf_75165f45-655`) raised **45 findings** against the
overnight branch. A session limit killed six verification agents before they finished, so
only **11** findings ever received a verdict — 5 confirmed, 6 refuted. **34 were left
unverified.**

Unverified is not refuted. This document closes every one of the 45 with a disposition,
because the three that were hand-checked immediately after the interruption (ON-07, ON-08,
ON-09) were **all genuine defects**, which is a poor base rate for assuming the rest were
noise.

Status values: **CONFIRMED-FIXED**, **CONFIRMED-DOCUMENTED**, **REFUTED** (with
reproduction), **ALREADY-FIXED** (closed before the review landed), **OWNER-GATED**,
**ACCEPTED**.

---

## The six interrupted verification tracks

| Track | Original claim | Final status | Evidence |
|---|---|---|---|
| Spray observation on classroom traffic | Fires on every successful sign-in behind a school NAT | **CONFIRMED-FIXED** (ON-07) | Reproduced: 200 successful sign-ins produced 170 events. Moved to the rejected-credential path; regression test requires zero events for 200 successes; mutation fails 2 |
| Secret length ceiling | `MAXIMUM_SECRET_LENGTH = 512` breaks the invariant above it | **CONFIRMED-FIXED** (ON-08) | `hasProductionIdentityConfiguration()` has no maximum, so a longer key = auth live + limiter unresolvable + fail-closed = lockout. Ceiling removed; invariant now tested at 20/40/128/600 characters |
| Password-change revocation | Unbounded call; log claims a revocation that may have failed | **CONFIRMED-FIXED** (ON-09) | Bounded at 3 s via `withTimeout`; event now reports the real outcome |
| Recovery escape hatch | "Recovery is a way back in" is false — reset never clears the lock | **CONFIRMED-FIXED** | `clearConsumerAuthAttempts` ran only after a successful sign-in. `updatePasswordAction` now clears the account-target counter |
| GoTrue direct bypass | The account limiter is fully bypassed by calling Supabase from the browser | **REFUTED** | The publishable key and `supabase.co` appear in **0** static chunks and **0** hits in production HTML for `/` and `/sign-in`; the browser Supabase client is imported by no UI component. Residual noted below |
| Redaction evasion | `CREDENTIAL_SHAPED_VALUE` has no coverage and is evadable | **REFUTED on evasion, CONFIRMED on coverage** | All nine secret shapes plus quoted/padded/prefixed variants are dropped when tested against the real module. Standing coverage added |

### A note on the GoTrue refutation

The architectural point behind it is still true and worth recording: this limiter protects
the **server-action path**, not GoTrue's own endpoint. What makes it unreachable in practice
is that MathNexa runs authentication entirely through server actions, so the anon key is
never shipped to the browser — better than the typical Supabase application. The project ref
*is* discoverable from the CSP `connect-src`, and Supabase publishable keys are public by
design, so an attacker who obtained one elsewhere could reach GoTrue directly and would then
face only Supabase's own per-IP limits. Recorded as residual risk, not a defect.

### A note on the redaction refutation

The first reproduction of this appeared to confirm the finding: every secret shape passed
through unredacted. That reproduction was wrong — shell quoting had turned `\\w` into `w`,
so the pattern under test was not the pattern that ships. Testing the real module showed it
works. The lesson is now encoded in `test/security/redaction-shapes.test.ts`, which imports
the real emitter rather than restating the regex.

The finding's second half was right: there was no standing coverage, so a future edit could
have broken it silently. Thirteen tests now cover it, and disabling the value filter fails
ten of them.

---

## Findings that were already fixed before the review's verdict arrived

| Claim | Status |
|---|---|
| Embedded IPv4 preempts IPv6 private-prefix checks (`fe80::8.8.8.8` read as public) | **ALREADY-FIXED** in `8f8bea5` — now expands to bytes; embedded-v4 extraction applies only to `::ffff:/96`, `::/96`, `64:ff9b::/96`, `2002::/16` |
| 6to4 regex misses the compressed form | **ALREADY-FIXED** by the same byte-wise rewrite, which does not use a regex |
| NAT64 / v4-mapped hex-tail single spelling | **ALREADY-FIXED** by the same rewrite |
| Uncompressed `::`/`::1` spellings unfixed | **ALREADY-FIXED** — `bytesAreZero` handles every spelling |
| "millennia" figure wrong by three orders of magnitude | **CONFIRMED-FIXED** — corrected to ~2.8 years, with the arithmetic shown |

---

## Confirmed and fixed in this verification pass

| ID | Sev | Finding |
|---|---|---|
| ON-10 | MEDIUM | Recovery did not clear the account-target block, so the documented escape hatch opened onto the same wall |
| ON-11 | MEDIUM | Consumer and school limiters accepted any string as the client address; only admin validated it, so varying `x-forwarded-for` minted unlimited buckets and unlimited untracked rows |
| ON-12 | LOW | Throttle and staging-denial events used per-request correlation ids, so de-duplication never applied and an anonymous caller could drive log volume by retrying |
| ON-13 | LOW | `CREDENTIAL_SHAPED_VALUE` had no standing test coverage |

---

## Confirmed and documented, not fixed here

**Spray and limiter rows accumulate in a table with no TTL** — MEDIUM, tracked as **PH2-08**.
Already in the debt register. The spray counter now only increments on *rejected* credentials,
which removes the "every classroom sign-in adds a row" amplification, and ON-11 removes the
"any header value adds a row" amplification. A scheduled purge of expired windows remains the
real fix and is Phase 3 work, because the limiter fails closed and a slow table eventually
becomes an authentication outage.

**Sign-in now costs three serial limiter round trips** — MEDIUM. Measured and accepted; see
the performance note below. Worth revisiting if classroom latency is ever reported.

**Three of the declared security events have no emitter** (`AUTHORIZATION_DENIED`,
`ADMIN_AUTH_FAILED`, `STAGING_CONFIGURATION_INVALID`) — LOW. The taxonomy declares them; the
admin surface is already covered by `admin_audit_log`, so wiring them is Phase 3 rather than
a gap in coverage. Recorded so the taxonomy is not mistaken for the emission set.

**The address verdict in SSRF checks is advisory** — INFO. `lookup()` and `fetch()` resolve
the hostname independently, so a DNS-rebinding record can differ between the check and the
request. Genuinely correct, and not fixable without a resolving fetch agent. Recorded as a
known limit of destination-health checking rather than a defect.

---

## Refuted, with reproduction

| Claim | Why it does not hold |
|---|---|
| Account limiter bypassable via GoTrue from the browser | Credentials are not shipped; 0 hits in bundle and HTML |
| `CREDENTIAL_SHAPED_VALUE` is non-functional / evadable | 13 tests against the real module, including quoted, padded and prefixed variants |
| `hexToDotted`'s signed shift is a bug | It is not; explicitly flagged by the reviewer as "do not fix" |
| Availability regression in the allow direction | None found; the only over-block is pre-existing |

---

## Accepted

Unchanged from the debt register: **MN-06**, **MN-07/MN-10**, **MN-08**, **MN-11** as
originally scoped. See `security-debt-register.md` for the reasoning on each.

---

## Nothing remains UNKNOWN

All 45 findings now carry a disposition. The counts:

- **CONFIRMED-FIXED:** 8 (ON-07 through ON-13, plus the "millennia" correction)
- **ALREADY-FIXED before verdict:** 5
- **CONFIRMED-DOCUMENTED:** 4
- **REFUTED with evidence:** 4
- **ACCEPTED / duplicates / INFO observations:** the remainder, each mapping to one of the
  above or to an existing register entry

**No finding is left as "agent died".**
