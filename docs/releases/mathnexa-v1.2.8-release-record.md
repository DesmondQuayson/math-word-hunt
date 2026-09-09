# MathNexa v1.2.8 — Next.js Security Hotfix

| | |
|---|---|
| Tag | `v1.2.8` (annotated, bare platform namespace) |
| Frozen application source | `13d307d0337f4073150f153872ad51b29f9c0f8a` — the staging-certified and production-deployed runtime |
| Production deployment | **`dpl_FVvfWkimRriNgzmuRyzbHadGm5yw`** — `https://mathnexa.com` (promoted 2026-09-09 03:28 UTC, owner-approved) |
| Immediate rollback | **`dpl_DRmcCTJvzQ8ey84gG6tRo4Vs3C3c`** (v1.2.7 runtime, READY, retained) |
| Prior frozen release | `v1.2.7` → `1e707eeb05c0d47d459586f5cbab7e16d13d2a13` (unchanged) |
| Database migration | none |
| Scope | Framework security patch only: `next` 16.2.12 → 16.3.4, `eslint-config-next` aligned, `sharp` 0.35.3 → 0.35.4 through Next's own requirement. No application source changed; no billing, auth, admin, school-access, staging-gate, ShowMe / MAP Prep or observability change. |

This record is documentation only and lives outside the tag, as the v1.2.7 record does.
The application runtime on `main` after consolidation is identical to `13d307d`; the
commits after it carry tests, production-safe ops scripts and documentation only.

## What was patched

| Package | Before | After |
|---|---|---|
| `next` | 16.2.12 | **16.3.4** (exact pin, stable) |
| `eslint-config-next` / `@next/eslint-plugin-next` | 16.2.12 | **16.3.4** |
| `sharp` (optional dependency of `next`) | 0.35.3 | **0.35.4** — libvips 8.18.6, **libheif 1.23.2** |
| `react`, `react-dom`, `stripe`, `@supabase/*`, `jose`, `fflate` | unchanged | unchanged |

Lockfile: 44 entries changed, every one attributable to those three packages.

## Advisories closed

| Advisory | Nature | Applicability on Vercel production |
|---|---|---|
| GHSA-p293-qw3h-jr36 / CVE-2026-75604 | Unauthenticated RCE on Windows-hosted Next.js servers | Not applicable at runtime (Linux functions); patched regardless |
| GHSA-2xp9-vwfh-vxw4 (+ libheif GHSA-g89c-p67h-r497 / GHSA-2jg2-4ch7-h545, sharp GHSA-rgj7-g3m4-5g8c) | Unauthenticated RCE in the Image Optimization API via `libheif` in `sharp` on attacker-controlled AVIF | Not reachable: `/_next/image` is served by Vercel's platform optimizer, no unauthenticated surface can place an AVIF on a same-origin path, and the admin upload validator admits PNG/JPEG/WebP only; patched regardless |

```
npm audit --omit=dev   BEFORE  next 16.2.12   2 vulnerabilities (1 critical, 1 high)
npm audit --omit=dev   AFTER   next 16.3.4    0 vulnerabilities
```

Both advisories are absent from the audit after the patch; nothing else remains.

## Image optimizer regression evidence

* Local `next start` on 16.3.4 with benign malformed AVIF fixtures written before
  boot: 25 probes, 0 failed — legitimate PNG/WebP/AVIF sources optimized to WebP,
  remote / protocol-relative / traversal / bad width refused (400), truncated and
  oversized-box AVIF passed through unmodified, empty and garbage AVIF refused
  (400), no 5xx, no internals leaked, server healthy afterwards.
* Staging (`dpl_3woUYZcKnmW1qDwhtzH3U28M84kN`): static png/avif/webp/svg 200,
  platform optimizer 200 on gate-exempt sources, refusals 400, Chromium 8 pages with
  no broken images and no console errors.
* Production (`dpl_FVvf…`): brand, icon, `number-cross.avif/.webp`,
  `math-vocabulary-hunt.webp`, `crosscalc.svg` 200; optimizer icon/brand/webp → 200
  `image/webp`, AVIF source → 200 `image/avif`; remote / traversal → 400; Chromium
  home page renders four images through `/_next/image`, 0 broken, 0 console errors.
  No `images.unoptimized`, no `remotePatterns`.

## Webhook regression evidence (v1.2.7 fix preserved)

| Host | Unsigned `POST /api/billing/webhook` |
|---|---|
| `mathnexa-platform-production.vercel.app` (Stripe-configured) | **400 `invalid-signature`**, `x-matched-path: /api/billing/webhook` — no 308, no 404, no 5xx |
| `https://mathnexa.com` | **400 `invalid-signature`**, no `Location` |
| `www.mathnexa.com` | 308 → apex (Vercel domain-level, unchanged; no endpoint configured there) |

Proven on the staged candidate before promotion (through the CLI protection
bypass), immediately after promotion, and again at the freeze. Stripe endpoint and
signing secret untouched.

## Billing lifecycle preserved

No billing source file changed. `test:subscription-lifecycle` 37 + 121 passed
(renewal-safe period advancement, idempotent duplicates, stale / superseded guards,
self-heal, cancel-at-period-end, grace and recovery). Read-only comparison of the one
live consumer subscription (`…BhAsSa`) before and after promotion and at the freeze:
Stripe `active`, local `active`, entitlement `subscription-active`, period end
`2026-10-06T22:17:50Z` on both sides, no additional charge, no repair, refund or
cancellation.

## Gates at the freeze (branch tip, runtime = `13d307d`)

| Gate | Result |
|---|---|
| core unit | 245 / 245 |
| web unit | 547 passed, 1 skipped, 1 failed — `canonical-assets` Windows CRLF artifact, identical on untouched main |
| security baseline | 278 / 278 |
| subscription lifecycle | 37 + 121 |
| game launch | 24 + 20 |
| proxy / middleware and environment | 41 / 41 |
| billing security audit | PASS (980 files) · capability audit PASS |
| mutations | 11 / 11 caught |
| typecheck / lint | clean / 0 errors |
| build | ✓ (static 1,099,834 B / 34 files; same runtime tree as the deployed build, whose log shows Next.js 16.3.4) |
| `npm audit --omit=dev` | 0 |
| leak scan | 0 markers in build output and in the live production bundles |

## Owner production verification

**PASS** — mathnexa.com loads, sign-in works, Account works, subscription remains
Active, MAP Prep opens, a premium game opens, images render correctly, no new
billing charge.

## Promotion method

`scripts/run-nextjs-hotfix-production.mjs`: preflight (apex identity = rollback
target) → `deploy-preview` (`--prod --skip-domain`, no alias moved) → `probe-preview`
through `vercel curl` (deployment protection bypassed by the CLI session; no
protection setting changed) → `promote` → `probe-live` (19 / 19). Staging certification:
`scripts/run-nextjs-hotfix-staging.mjs`. Full record:
`docs/security/nextjs-16.3.4-security-hotfix.md`.

## Untouched

PH2-07 (`feature/security-ph2-07-observability-read-path`, `54179a1`) — unmerged,
production observability not configured; to be refreshed onto the patched `main`
in a separate owner-gated phase. Stripe, Supabase (schema and data), Vercel Log
Drain, firewall / WAF, `MVH_AUTH_RATE_LIMIT_SECRET`, ShowMe / MAP Prep — unchanged.
