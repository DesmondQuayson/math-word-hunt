# MathNexa Security PH2-07 — Security Observability Read Path

**Branch:** `feature/security-ph2-07-observability-read-path`, cut from `origin/main` at
`579c4374f4afcb26609d0fd32591181fb20c1085` (the `v1.2.7` consolidation; `v1.2.7` →
`1e707ee`, unchanged and reachable).
**Production:** `https://mathnexa.com`, `dpl_DRmcCTJvzQ8ey84gG6tRo4Vs3C3c`. **Changed = NO.**
**ShowMe / MAP Prep:** untouched. **Staging:** locked throughout.

---

## What this phase is

Phase 2 made the platform *write* security events at every denial point. Nothing
read them. They landed in the Vercel runtime log stream — short retention, no
drain, no query, no alert — and the Phase 2 report was blunt that this produced the
appearance of detection rather than detection.

PH2-07 is the read path: **collected → normalized → redacted → classified →
reviewed → alerted**, built as adapters around the existing producers, without
changing what any protective control decides.

```
producer ──► emitOperationalEvent ──► console line (unchanged; Vercel logs / drain)
                    │  (stamps eventId + emittedAt)
                    └─► platformMonitoringAdapter
                            └─ MVH_SECURITY_EVENT_SINK=database ─► after(response) ─► ingestSecurityEvents
                                                                                          │
Vercel Log Drain ──► POST /api/internal/security/ingest (HMAC-SHA1, fail-closed) ─────────┤
Owner synthetic scenario (staging only, AAL2 + CSRF + audit) ─────────────────────────────┤
                                                                                          ▼
                               normalize (registry) → redact AGAIN → classify → security_events (idempotent on eventId)
                                                                                          │
                                                       alert rules (threshold / window) ──┤── claim (atomic cooldown) ──► security_alerts
                                                                                          │                                 + console line
                                                                                          │                                 + optional HTTPS webhook
                                                       Admin ▸ Security (AAL2, no-store) ◄┘
```

Every security decision — sign-in, throttling, spray observation, authorization,
webhook verification — is made and answered **before** the store is touched.
Persistence runs after the response through Next's `after()`. A missing, slow or
broken store cannot slow or change any decision; it reports itself on the console
only, so it cannot recurse into itself.

---

## Existing security signals — inventory (state before this phase)

| Event | Source | Log format | Severity | PII? | Consumed? | Alerted? |
|---|---|---|---|---|---|---|
| `auth-login-failed` | `app/auth-actions.ts` rejected-credential branch | console `SafeEvent` JSON | info | no (scope, coarse UA family, forwarded-for boolean) | no | no |
| `auth-rate-limited` (request / account) | `lib/auth/rate-limit.ts` `reportThrottled` | console JSON, stable correlation | warning | no | no | no |
| `auth-signup-rate-limited`, `auth-recovery-rate-limited` | same | same | warning | no | no | no |
| `auth-spray-suspected` | `rate-limit.ts` `observeFailedSignIn` (rejected credentials only) | console JSON, stable correlation | warning | no | no | no |
| `rate-limiter-unavailable` | `rate-limit.ts` `reportLimiterUnavailable` | console JSON (raw emit) | critical | no | no | no |
| `auth-password-changed` | `app/auth-actions.ts` | console JSON | warning | no — **but its only field was silently dropped (OB-01)** | no | no |
| `authorized-code-failed`, `authorized-code-rate-limited` | `app/school-access-actions.ts` | console JSON | info / warning | no | no | no |
| `staging-access-denied` | `proxy.ts` | console JSON, stable correlation | info | no (cookie-present boolean) | no | no |
| `webhook-signature-invalid`, `webhook-replay-detected` | `lib/billing/consumer-webhook.ts` | console JSON | warning | no | no | no |
| `webhook-api-version-drift`, `webhook-manual-review`, `webhook-processing-failed`, `subscription-*`, `entitlement-mismatch-*`, `reconciliation-sweep-completed` | `lib/billing/consumer-observability.ts` via synchronizer / reconciliation | console JSON (billing) | info–error | redacted 6-char provider suffix only | no | no |
| `admin.login.failure`, `admin.mfa.failure` | `app/admin/actions.ts` `recordAudit` | `admin_audit_log` rows | — | **yes** (ip, user agent in the ledger; not shown in the admin view) | yes — admin Audit Log | no |
| admin rate-limit refusal | `app/admin/actions.ts` | **silent** | — | — | no | no |
| admin CSRF rejection (35 routes) | `validateAdminMutationCsrf` callers | **silent** (redirect only) | — | — | no | no |
| AAL2 / non-admin denial | `inspectAdminAccess` → 404 | **silent** | — | — | no | no |
| SSRF refusal | `checkAdminExternalDestination` → `unsafe` | **silent** | — | — | no | no |
| scheduler auth failure | `/api/internal/billing/reconcile` 401 / 503 | **silent** | — | — | no | no |
| forged game ticket | `verifyGameAssetTicket` → null | **silent** | — | — | no | no |
| malformed staging-gate flag | `stagingAccessRequirement` | **silent** | — | — | no | no |
| catalog integrity (`canonical-entry-missing`) | `lib/games/catalog.ts` | plain `console.error` string | — | no | no | no (left as is) |
| Vercel platform request logs | runtime log stream | platform JSON | — | yes (client IP, UA) | dashboard only, short retention | none configured |

The seven **silent** rows now emit; the audit rows keep their ledger and additionally
emit a redacted event. Nothing was removed.

---

## Vercel / provider discovery (read-only, via the CLI)

| Capability | Found |
|---|---|
| Team | `bright-path-ed-tech` (a team scope, i.e. a paid tier; the exact plan name is not exposed by the endpoints the CLI could read) |
| Log Drains | **none** |
| Marketplace integrations (Sentry, Datadog, Axiom, …) | **none** |
| Vercel Alerts | **none** (`vercel alerts`: "No alerts found") |
| Web Analytics | enabled on the production project |
| Speed Insights | enabled, no data |
| Crons | `/api/internal/billing/reconcile` daily on production |
| Runtime logs | dashboard only; short platform retention |
| Application telemetry dependencies (Sentry / PostHog / Resend / OpenTelemetry) | **none** in `package.json` or environment names |
| Transactional email provider in application code | **none** — authentication mail is sent by Supabase Auth |

Consequences: no external provider was invented; the store is Supabase (already the
system of record), the durable read surface is the existing admin workspace, and
the alert destination is **record + console line + an optional owner-configured
HTTPS webhook** (`MVH_SECURITY_ALERT_WEBHOOK_URL`; a Slack incoming webhook works
unchanged because the body carries a `text` field). Email alerts are not
implemented because no approved provider exists in the codebase.

---

## The security event contract (schema v1)

```
SecurityEvent {
  version: 1
  eventId            32 hex — identical on every path the same emission travels
  eventType          registered code, e.g. "webhook-signature-invalid"
  category           SafeEvent category
  severity           info | medium | high | critical   (base severity of ONE event)
  occurredAt         ISO UTC, server clock (platform capture → emitter stamp → read time)
  environment        production | staging | preview | local | unknown
  source             producing component label
  outcome            blocked | denied | observed | failed | recovered | ignored | succeeded | unavailable
  correlationId      x-vercel-id-derived request id, or a stable condition id
  actorRefRedacted   null (never collected)
  accountRefRedacted "…abc123" provider-object suffix or null
  networkRefRedacted null (never collected)
  synthetic          true only for owner-run scenarios
  ingestSource       in-process | log-drain | synthetic
  metadataSafe       primitives only, allowlisted at display time
}
```

`lib/observability/security-schema.ts` holds the registry: every code the read path
recognizes, with its category, base severity, outcome and source. A line whose code
is not registered is not a security event and is ignored, which is what keeps
ordinary application logging out of the security store. A test proves the registry
covers every `SECURITY_EVENTS` code, every billing lifecycle code and the Phase 1
limiter outage code.

### Deployment label

`MVH_APP_ENVIRONMENT` is `production-platform` on **both** production and staging by
design. The label that tells them apart is derived from `MVH_APPLICATION_ORIGIN`:
`https://mathnexa.com` is production, any other platform-mode origin is staging —
the same decision the canonical-host redirect already makes. Both inputs are
server-only configuration. Every emitted line now carries `deployment`, and every
alert subject starts with the upper-case banner, so **STAGING is never mistaken for
PRODUCTION**.

---

## Redaction — one definition, two enforcement points

The Phase 2 key-name filter and value-shape filter moved verbatim into
`lib/observability/security-redaction.ts` and are applied:

1. **before emission** — `emitSecurityEvent` (as before), and
2. **at the read boundary** — `normalizeSecurityEvent`, which treats every input as
   untrusted whether it came from the process itself or from the drain.

Additions to the filter set: whole customer / subscription / invoice identifiers,
client-address key names, and an email-address value shape. Metadata is bounded to
24 keys × 120 characters, primitives only, CR/LF stripped. The store's constraints
bound it again (4 KiB, object only).

Tests prove a credential, an email, a whole Stripe id, an address and a nested
object are all refused at the boundary even when they arrive under innocent keys,
and that the alert text — built from the rule table and counts only — cannot carry
metadata at all.

---

## Severity classification

| Severity | Event classes |
|---|---|
| **CRITICAL** | `rate-limiter-unavailable` (production fails closed), `staging-configuration-invalid`, `security-config-error`, `security-dependency-unavailable` |
| **HIGH** | `auth-spray-suspected`, `ssrf-blocked`, `scheduler-auth-failed`, `admin-auth-rate-limited`, `entitlement-mismatch-unresolved`, `subscription-status-unknown`, `authorization-denied` **when the producer marks `anomaly: true`** (authenticated non-admin on an admin surface, forged entitlement ticket) |
| **MEDIUM** | all rate-limit exhaustions, `admin-auth-failed`, `admin-csrf-rejected`, `webhook-signature-invalid`, `webhook-replay-detected`, `webhook-manual-review`, `webhook-processing-failed`, `subscription-reconciliation-unavailable`, `entitlement-mismatch-repaired` |
| **INFO** | `auth-login-failed`, `authorized-code-failed`, `staging-access-denied`, expected `authorization-denied`, `auth-password-changed`, `auth-recovery-cleared-block`, successful synchronizations, `reconciliation-sweep-completed`, `webhook-api-version-drift` |

A *pattern* of events is a different question and belongs to the rules below. A
single rejected sign-in is `info`; one hundred and fifty in fifteen minutes is not.

---

## Alert rules

| Severity | Rule | Events | Threshold | Window | Cooldown | Owner action |
|---|---|---|---|---|---|---|
| CRITICAL | `limiter-unavailable` | `rate-limiter-unavailable` | 1 | 5 min | 15 min | Check Supabase and the limiter secret; every sign-in is refused while this persists |
| CRITICAL | `security-configuration` | `staging-configuration-invalid`, `security-config-error`, `security-dependency-unavailable` | 1 | 5 min | 60 min | Read the component in the metadata and correct the configuration |
| HIGH | `credential-spray` | `auth-spray-suspected` | 1 | 15 min | 30 min | Review failure volume; edge rule only if not a school network |
| HIGH | `ssrf-attempt` | `ssrf-blocked` | 1 | 60 min | 60 min | Only an admin reaches this path; confirm the session is yours |
| HIGH | `scheduler-auth` | `scheduler-auth-failed` | 1 | 60 min | 60 min | Verify `CRON_SECRET`; an unknown caller is probing internal routes |
| HIGH | `admin-auth-attack` | `admin-auth-failed`, `admin-auth-rate-limited` | 3 | 15 min | 30 min | If not your attempts, review the audit log, consider revoking sessions |
| MEDIUM | `admin-csrf` | `admin-csrf-rejected` | 3 | 15 min | 60 min | Single rejections are expired pages; repeats suggest forgery |
| HIGH | `authorization-anomaly` | `authorization-denied` with `anomaly: true` | 3 | 60 min | 60 min | Review surface and reason recorded |
| HIGH | `webhook-signature-spike` | `webhook-signature-invalid` | 5 | 10 min | 60 min | Review delivery source and endpoint secret; Stripe never sends unsigned |
| MEDIUM | `webhook-replay` | `webhook-replay-detected` | 5 | 10 min | 60 min | Idempotency refused them; check Stripe delivery attempts |
| HIGH | `webhook-processing` | `webhook-processing-failed`, `webhook-manual-review` | 3 | 60 min | 60 min | Review parked events in Subscriptions; renewals may wait |
| HIGH | `entitlement-invariant` | `entitlement-mismatch-unresolved`, `subscription-status-unknown` | 1 | 24 h | 6 h | Sync with Stripe for the account; review the reason |
| MEDIUM | `network-throttle` | `auth-rate-limited` (`dimension: request`) | 12 | 15 min | 60 min | A school can hit this on a bad morning; compare with rejected sign-ins |
| MEDIUM | `account-target-throttle` | `auth-rate-limited` (`dimension: account`) | 6 | 15 min | 60 min | Accounts targeted from several addresses; recovery stays open |
| MEDIUM | `rejected-sign-ins` | `auth-login-failed` | 150 | 15 min | 60 min | Well above classroom forgetfulness; review spray/throttle |
| MEDIUM | `recovery-abuse` | `auth-recovery-rate-limited`, `auth-signup-rate-limited` | 3 | 60 min | 60 min | No mail past the budget; review for enumeration |
| MEDIUM | `authorized-code-pressure` | `authorized-code-rate-limited` | 3 | 60 min | 60 min | A school may be mistyping a rotated code; else rotate it |

Thresholds are set against this product's traffic: a whole classroom sits behind
one address and produces a steady trickle of mistyped passwords, so single
rejections never alert, while a single refused scheduler call or SSRF block does
because nothing legitimate produces those.

**De-duplication.** Evaluation runs at ingest for the rules the batch touched.
`claim_security_alert` is an atomic database claim per `(rule, partition)`: the
first crossing inside a cooldown fires, everything after it is absorbed. A hundred
identical attacks produce one message that says "a hundred". Real and synthetic
events are counted in **separate partitions** — a synthetic scenario can neither
raise nor mask a real alert.

**Content.** Environment banner, severity, event, rule, window, count/threshold,
correlation id, fired-at, recommended action; synthetic alerts are prefixed
`[SYNTHETIC TEST]` and carry a closing line saying no action is required. No
metadata, payload, identifier or secret can appear, structurally.

---

## Read path — Admin ▸ Security

A new section of the existing admin workspace (`/admin?section=security`), behind
the same `inspectAdminAccess` gate every other section uses: admin allowlist, AAL2,
bound server session, `Cache-Control: no-store`, `noindex`, anonymous → 404. It
shows:

- observability pipeline status: deployment label, sink mode, drain receiver,
  alert webhook, last event received, per-source last delivery, retention;
- real events by severity over the last hour / 24 hours / 7 days (synthetic shown
  separately);
- top event classes (24 h) and every class seen in 7 days, grouped by control;
- alerts fired (newest first), with count / threshold / window / delivery;
- recent events (up to 60): time, severity, class, outcome, kind, allowlisted
  detail, correlation id — never a payload, address or identifier;
- the rule table;
- the synthetic scenario form (staging / preview / local only).

Windows are computed by the database clock (`now()`); nothing trusts a browser
clock. Tables are labelled, focusable, horizontally scrollable regions with
`scope`d headers; severity is always a word, colour is decoration; forced-colours
mode is handled; the layout collapses at 375 px without overflowing identifiers.

### Synthetic scenarios (alert test mode)

`POST /admin/security/synthetic` — authorized admin, same-origin CSRF token,
required reason, explicit confirmation, immutable audit entry
(`admin.security.synthetic-test`). It **does not exist on production**: the
deployment-label check runs before the form is read, and an unreadable identity is
refused too. Scenarios: webhook signature spike, rejected sign-in, network
throttle, account-target throttle, admin auth denial, SSRF block, cross-user
authorization denial, pipeline heartbeat. Every generated event is flagged
`synthetic`, uniquely correlated, ingested through the real store and the real
rules, and reported back as "N stored, M synthetic alerts fired".

---

## Ingest paths

| Path | Auth | Fail-closed behaviour |
|---|---|---|
| in-process (`MVH_SECURITY_EVENT_SINK=database`) | n/a — same process | store missing / slow (3 s) / broken → console-only self-report, request unaffected |
| `POST /api/internal/security/ingest` (Vercel Log Drain) | `x-vercel-signature` = HMAC-SHA1(body, `MVH_SECURITY_DRAIN_SECRET`), constant-time | no secret → 404 (route does not exist); unsigned / mis-signed → 401 before parsing; > 4 MiB → 413; store failure → 503 so the platform retries (event ids make retries safe); `x-vercel-verify` echoed for endpoint-ownership verification |
| synthetic (`/admin/security/synthetic`) | AAL2 admin + CSRF | production → 404 |
| `GET|POST /api/internal/security/retention` (daily cron `41 6 * * *`) | `Authorization: Bearer <CRON_SECRET>`, same helper as billing reconciliation | non-platform → 404; secret missing → 503 + `security-config-error`; wrong bearer → 401 + `scheduler-auth-failed` |

Both machine routes are exact-path exemptions from the staging gate, like the Stripe
webhook: they authenticate themselves more strongly than the gate cookie does and
reveal nothing when unconfigured.

---

## Data minimization and retention

Stored: event id, time, label, class, category, severity, source, outcome,
correlation id, optional redacted provider suffix, synthetic flag, ingest source,
bounded allowlisted metadata. **Never** stored: passwords, tokens, JWTs, keys,
cookies, authorization headers, card data, email addresses, whole customer /
subscription / invoice ids, client addresses, user agents, request bodies.

Retention: events **30 days** (`MVH_SECURITY_EVENT_RETENTION_DAYS`, bounded 7–90 in
code and again in SQL), alerts **90 days**, purged daily by the scheduled job.
Nothing is kept "just in case".

---

## Findings this phase

| ID | Sev | Finding | Status |
|---|---|---|---|
| **OB-01** | LOW | `AUTH_PASSWORD_CHANGED` recorded `{ otherSessionsRevoked }`, but the Phase 2 key-name filter refuses any key containing `session`, so the ON-09 outcome field never reached the log — the line said nothing. | **Fixed**: key renamed to `otherDevicesSignedOut`; a standing test asserts the value is logged |
| **OB-02** | HIGH · **OWNER-URGENT** | `next@16.2.12` (production runtime) carries two critical advisories published 2026-08-25 and listed in the GitHub advisory database 2026-09-08: GHSA-p293-qw3h-jr36 (unauthenticated RCE, **Windows-hosted servers only — not applicable on Vercel**) and GHSA-2xp9-vwfh-vxw4 (unauthenticated RCE in the Image Optimization API via `libheif`/`sharp` when AVIF input is processed; CVSS 9.5). `sharp@0.35.3` (< 0.35.4) is present. `/_next/image` answers 200 on production and eight components use `next/image`. No `images.remotePatterns` are configured, so the optimizer only fetches same-origin paths, and no unauthenticated surface lets an attacker place an AVIF there — practical exposure is **low**, but the framework is on an affected version. Fix available: `next@16.3.4` (patch-level, non-major). | **Not changed in this branch** (out of PH2-07 scope; a framework bump needs its own staging rehearsal and full regression). Recommended as the **first** owner action after this review. Interim mitigation if the bump must wait: `images.unoptimized: true` |
| OB-03 | INFO | The locked staging gate conceals every `/api/internal/*` route, so the billing reconciliation cron cannot run on locked staging (it 404s at the gate). Production has no gate and is unaffected. | Documented; deliberately not changed here (billing surface). The two new security machine routes are exempted exactly |
| OB-04 | INFO | `admin_audit_log` stores client IP and user agent (Phase 8a design, owner-only ledger, not shown in the admin view). The security store deliberately stores neither. | Documented |
| OB-05 | INFO | The platform stream is the only place security events lived, with short retention and nothing reading it. | Addressed by this phase once the sink is enabled |

---

## Production plan — DRY RUN, NOT APPLIED

Minimal, in order. Nothing below has been done.

1. **Database** — apply `supabase/migrations/20260909010000_security_observability_read_path.sql`
   to the production project (33 → 34 migrations) through the established
   production pipeline pattern. Additive only: three tables, seven functions. Rollback:
   `supabase/rollback/security_observability_read_path.sql`.
2. **Environment (production project)** —
   `MVH_SECURITY_EVENT_SINK=database` (enables in-process persistence; this alone
   is the complete minimal read path — no drain needed), optionally
   `MVH_SECURITY_EVENT_RETENTION_DAYS=30`. Set with `printf`, never a shell pipe
   (MN-09).
3. **Deploy** the reviewed candidate (a new build is required for the environment
   change; the retention cron registers with it).
4. **Optional log drain** (platform-level coverage, second ingest path) — generate a
   43-character base64url `MVH_SECURITY_DRAIN_SECRET`, set it on production,
   redeploy, then create a configurable Log Drain in the Vercel team dashboard:
   endpoint `https://mathnexa.com/api/internal/security/ingest`, project
   `mathnexa-platform-production`, environment production, sources `lambda` (and
   `edge`), delivery format `json` or `ndjson`, secret = the same value. The
   endpoint answers the `x-vercel-verify` ownership check itself.
5. **Optional alert destination** — `MVH_SECURITY_ALERT_WEBHOOK_URL` (HTTPS; a Slack
   incoming webhook works). Without it alerts are recorded and logged only.
6. **Verify** — `/api/internal/security/ingest` returns 404 without a secret and 401
   unsigned; Admin ▸ Security shows "console + database (in-process)"; the next
   day's "last event received" is populated; the retention job answers 200 to the
   scheduler.

Retention recommendation: 30 days events / 90 days alerts (defaults). Cost: one
post-response RPC per emitted security event, bounded table growth, optional
webhook egress.

---

## Staging certification (2026-09-09)

Staging project `mathnexa-platform-staging` / `prj_O61Cyx9WMjc0jljpM9erCiSXsJA0`.
Deployment **`dpl_FeZbD1JF2tZgjCb4n75ZpbDCu8yi`** (`3l3heal7s`), built from commit
`eb2c6de`, tree `274c1f6`, deployed with `--prod` on the **staging** project; one
earlier attempt (`ib7xw668r`) errored at build (wrong upload root) and never served.
Gate **locked** throughout: `/`, `/sign-in`, `/account`, `/admin`, `/sign-in.png` all
404 with 0 bytes.

| Check | Result |
|---|---|
| Migration `20260909010000` on the staging database | applied (33 → 34), 7 functions, 3 tables with enabled + forced RLS; business row counts unchanged |
| pgTAP `21_security_observability.test.sql` | **26 / 26 ok** through the management API (`pgtap-remote`; Docker is unavailable on the host, so `supabase test db` could not run) |
| Staging environment | `MVH_SECURITY_EVENT_SINK=database`, `MVH_SECURITY_DRAIN_SECRET` (generated, staging-only, vault `SECURITY_DRAIN_SECRET_STAGING`), gate flag untouched |
| Ingest unsigned / mis-signed | 401 / 401, `no-store` |
| Ingest ownership verification | 200, echoes `x-vercel-verify` |
| Ingest signed synthetic delivery, twice | 200 `stored:1`, then 200 `stored:0` — idempotent |
| Retention without bearer / with staging bearer | 401 → `scheduler-auth-failed` event; 200 `purged`, 0 deleted (nothing older than 30 / 90 days) |
| Real events | 6 unsigned webhook posts → 6 `webhook-signature-invalid` rows (`in-process`, `staging`, real); 2 `staging-access-denied` rows from the gate probes (proxy path persists via `after()`); 1 `scheduler-auth-failed` |
| Real alerts | `webhook-signature-spike` fired at 5 / 5 (HIGH, STAGING, `webhook: not-configured`); `scheduler-auth` fired at 1 / 1 — both recorded in `security_alerts` and announced as `security-alert-raised` in the runtime log |
| Drain path | signed delivery stored as `synthetic`, `ingest_source = log-drain` |
| Redaction scan of the store | 0 hits for key, token, JWT, email, whole-id or address shapes; no identity column exists |
| Runtime log lines | carry `deployment: "staging"`, `eventId`, `emittedAt` — a drain would deliver exactly these |
| Console-line dedup | throttle / spray / gate lines keep their stable correlation; nothing changed |

**Latency, before → after** (same probes, same locked staging, warm samples):
unsigned webhook 257–274 ms → 78–198 ms; gated `/sign-in` 187–204 ms → 57–167 ms;
anonymous `/admin` 148–208 ms → 70–73 ms. No degradation; persistence runs after the
response.

**Not certified by machine:** the Admin ▸ Security page itself needs an owner AAL2
session, which no automation holds. Its structure, labels, no-store gating and the
synthetic form were verified by component tests and a static render with the real
stylesheets at 375 / 768 / 1280 / 1920 px; the owner sees it live at
`/admin?section=security` after unlocking staging.

## Deferred, unchanged

`MVH_AUTH_RATE_LIMIT_SECRET` migration · Vercel Firewall/WAF · `security.txt` ·
PH2-08 `admin_auth_rate_limits` TTL · MN-10 stale health build id · HSTS preload
(**DEFER**). None combined into this phase.
