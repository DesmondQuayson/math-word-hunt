# MathNexa — Next.js 16.4.2 Security Hotfix (October 14, 2026 advisories)

**Status: on protected staging. Not merged. Not in production.** Production and merge need the owner's
personal approval.

| | |
| --- | --- |
| Branch | `fix/security-nextjs-16-4-2`, cut from `origin/main` `0f8475b` (v1.2.23 docs) |
| Commits | `d2ebf23` Next.js 16.4.2 + sharp 0.35.5 + release-tooling asserts; `c1b1511` source-map-js 1.2.2 (separable); `ad48cb3` optimizer harness SVG probes (script only) |
| Certified candidate | `ad48cb3` (tree identical to `c1b1511` outside `scripts/`) |
| Production (unchanged) | `https://mathnexa.com` → `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` (v1.2.23, build `fe3e819`, Next 16.3.8) |
| Staging alias | `https://mathnexa-platform-staging.vercel.app` → **`dpl_6L8TQb2ZW6VcvNWSVSxKe5KGmbqV`** (this candidate; gate locked). Before: `dpl_7G8Ewdw5XtjXV1ahSJwCwJCkyTqN` (main `0f8475b`), retained |
| Staging preview | `dpl_6F7UFDKhYZDF4afZrhCC3qFUDU5X` (`https://mathnexa-platform-staging-bbqcpzhqw-bright-path-ed-tech.vercel.app`, GitHub build of `ad48cb3`, Deployment Protection on) |
| Migration / env / billing / auth | None. Nothing under `supabase/`, no environment variable, no Stripe, no auth or billing source changed |

## Verdict

**GO for production, on the owner's approval.** Every local gate, the staging certification and the hosted
regressions pass with no new failure. GHSA-p3m5 (Server Actions DoS) is directly reachable on production
today, so this patch should not wait for a feature release.

## Advisories (verified 2026-10-17 against nextjs.org and GitHub)

Source: [Next.js Security Update for Upstream Vulnerabilities](https://nextjs.org/blog/nextjs-security-update-october-14-2026)
(2026-10-14) and the `vercel/next.js` repository advisories (published 2026-10-14 17:46–17:47 UTC). The fixes
shipped only in **16.4.1** (Active LTS, 2026-10-14) and 15.5.28; there is no 16.3.x backport.

| Advisory | Severity | Affected 16.x | Patched | MathNexa on 16.3.8 |
| --- | --- | --- | --- | --- |
| [GHSA-p3m5-59mp-jv5r](https://github.com/vercel/next.js/security/advisories/GHSA-p3m5-59mp-jv5r) — DoS in App Router using Server Actions (React upstream GHSA-h3gv-c5rc-p453) | High | 16.0.0 – 16.4.0 | 16.4.1 | **Applies directly.** App Router with six `"use server"` modules: `app/auth-actions.ts`, `billing-actions.ts`, `consumer-actions.ts`, `school-access-actions.ts`, `teacher-actions.ts`, `admin/actions.ts`. The advisory's only precondition is App Router with at least one Server Action; it names no authentication requirement. |
| [GHSA-2464-fhr4-w9xw](https://github.com/vercel/next.js/security/advisories/GHSA-2464-fhr4-w9xw) / CVE-2026-96889 — RCE in the Image Optimization API when SVG files are used (librsvg in sharp, glibc Linux) | Critical | > 16.0.0 – 16.4.0 | 16.4.1, or sharp ≥ 0.35.5 | **Not reachable, patched anyway.** See below. |
| [GHSA-673q-mjm6-r5xr](https://github.com/vercel/next.js/security/advisories/GHSA-673q-mjm6-r5xr) — RCE in `use cache` functions returning typed arrays (React upstream GHSA-xqc2-xf4c-x3h3) | Critical | 16.0.0 – 16.4.0 | 16.4.1 | **Not reachable.** No `"use cache"`, no `cacheComponents`, no `unstable_cache` anywhere in `apps/platform-web`. The advisory says to upgrade even without such functions. |

**Why `npm audit` showed nothing.** These are repository advisories. On 2026-10-17 GitHub's global advisory
database still answers 404 for all three IDs, and npm audit reads that database. `npm audit` therefore reported
`next@16.3.8` as clean although it is inside all three ranges. The same lag was seen on ShowMe.

**16.4.2 vs 16.4.1.** 16.4.2 (2026-10-15) adds only Turbopack and docs backports on top of the security
release (turbo-tasks snapshot consistency, GC edge fixes, lazy dynamic-import chunk-list collisions, realpath
errors during resolution, code-frame char boundaries). It is the latest 16.4.x patch.

### GHSA-2464 (SVG / librsvg) exposure

- **Production `/_next/image` is Vercel's platform optimizer**, not Next's sharp path (re-checked 2026-10-17,
  read-only): `Server: Vercel`, `X-Matched-Path: /icon.png`, no `X-Nextjs-Cache`. An SVG source
  (`/media/games/crosscalc.svg`) is refused with **400**.
- **No `images` config**, so `dangerouslyAllowSVG` is off. Next refuses SVG content by sniffing, whatever the
  file name: the extended local harness proves `plain.svg` and SVG bytes named `svg-as.png` are both 400.
- **`next/image` is imported by 7 files** (not 1): `teacher-first-home.tsx` (optimized, six shipped `/media/**` WebP files), and
  `game-catalog-thumbnail`, `structured-cms-content`, `public-resource-library`, `resources/[resourceId]/page`,
  `admin-game-package-library` and `admin-auth-forms`, which all use `unoptimized` or same-origin sources.
- **The admin upload route** calls `sharp()` directly, but `inspectImageUpload` admits only PNG/JPEG/WebP magic
  bytes behind an MFA-verified admin session and a CSRF token; libvips picks its loader by content, so `svgload`
  never runs (analysis in `sharp-source-map-js-remediation-plan.md` on `ce4d251`).
- After the upgrade sharp is **0.35.5** (libvips 8.18.7, librsvg 2.63.2, libheif 1.23.5). The Next server and
  the upload route traces both carry `sharp-*-0.35.5.node` and nothing else changed in tracing. On Vercel the
  lockfile pins `@img/sharp-linux-x64@0.35.5` and `@img/sharp-libvips-linux-x64@1.3.4`; the preview build log
  shows the install from that lockfile (`changed 9 packages`, the Linux subset of the diff) and `Next.js 16.4.2`.

## Dependency change

| Package | Before | After | Notes |
| --- | --- | --- | --- |
| `next` | 16.3.8 | **16.4.2** (exact) | the patch |
| `eslint-config-next` (dev) | 16.3.8 | **16.4.2** (exact) | coupled to `next` |
| `sharp` (optional, via `next`) | 0.35.4 | **0.35.5** | `next@16.4.2` requires `^0.35.5`; the stale root override `0.35.3` is now `0.35.5` |
| `@img/sharp-libvips-*` | 1.3.3 | 1.3.4 | librsvg 2.63.2 |
| `source-map-js` (build-time, via PostCSS) | 1.2.1 | **1.2.2** | root override, own commit `c1b1511`, see below |
| `react`, `react-dom` | 19.2.8 | 19.2.8 | unchanged; App Router uses Next's vendored React |
| Vendored App Router React | 19.3.0-canary-cbb046ab-20260731 | 19.3.0-canary-278794d7-20261002 | carries the upstream React fixes |

**Lockfile:** commit `d2ebf23` changes exactly 39 package entries (`next`, `@next/env`, 8 `@next/swc-*`,
`@next/eslint-plugin-next`, `eslint-config-next`, `sharp`, 16 `@img/sharp-*` and 10 `@img/sharp-libvips-*`);
`c1b1511` changes exactly one (`source-map-js`). Nothing else moved; no major change; no `npm audit fix`, no
`--force`.

**source-map-js** (GHSA-68fv-2mgg-jv7q, event-loop DoS in indexed source maps) is build-only: it is traced into no
server function. It was included because it was the only remaining production-audit advisory, it is a patch
inside PostCSS's `^1.2.1`, and it was already planned with sharp 0.35.5. It is a separate commit; reverting
`c1b1511` alone removes it.

**Release tooling** (scripts, no runtime effect): `run-nextjs-hotfix-staging.mjs` and the production preflight in
`run-nextjs-hotfix-production.mjs` assert `next` 16.4.2 and `sharp` 0.35.5 (they asserted 16.3.8 / 0.35.4); the
staging runner takes its deployment purpose from `RELEASE_PURPOSE`. `verify-next-image-optimizer.mjs` gained the
SVG probes. `dependency-security-review.md`'s override table is up to date.

## Audit

| | Before (`0f8475b`) | After (`ad48cb3`) |
| --- | --- | --- |
| `npm audit --omit=dev` | **2 high**: sharp < 0.35.5 (GHSA-wq5f-xc86-pv6w), source-map-js ≤ 1.2.1 (GHSA-68fv-2mgg-jv7q) | **0** |
| `npm audit` (all) | 9: 7 high, 2 moderate | 7: 5 high, 2 moderate — all dev-only |
| Not in `npm audit` (see above) | next 16.3.8 inside GHSA-p3m5, GHSA-2464, GHSA-673q | patched |

Remaining dev-only findings, unchanged and out of scope: the `braces` → `micromatch` → `fast-glob` →
`@next/eslint-plugin-next` → `eslint-config-next` lint chain (`eslint-config-next@16.4.2` still pins
`fast-glob@3.3.1`; npm's only "fix" is a semver-major downgrade, which must not be applied), and `vitest` /
`@vitest/mocker` ≤ 4.1.10 (GHSA-82fw-gwwq-j7x9, test runner only).

## Local gates (clean `npm ci` worktree, Windows, Node 24.18.0)

The untouched base `0f8475b` was run first in the same worktree.

| Gate | Base `0f8475b` | Candidate |
| --- | --- | --- |
| TypeScript (both workspaces) | clean | clean |
| ESLint (root + platform-web) | 0 errors, 8 warnings | 0 errors, the same 8 warnings |
| Unit: platform-core | 245/245 | 245/245 |
| Unit: platform-web | 891 passed, 1 skipped | 891 passed, 1 skipped |
| Production build | built (39 s) | built (41 s) |
| `test:security` (baseline 315 + bundle + launch audits + bypass 7) | — | 315/315, audits pass, 7/7 |
| `test:subscription-lifecycle` | — | 37/37 + 133 passed, 1 skipped |
| `test:number-cross`, `test:crosscalc:v2` | — | 26/26, 22/22 |
| `test:production-public` | — | 44/44 + 70/70 |
| Proxy and environment (`lib/staging-access/proxy.test.ts lib/environment`) | — | 74/74 |
| `test:content` | — | pass |
| All 28 `scripts/audit-*.mjs` security audits (billing 1,196 files, capability, bundle 37 client assets / 47 core files, production-default, phases 4–11, quiz PDFs, game-suite media…) | — | all pass |
| Image optimizer harness, local `next start` with fixtures | — | **31/31** (below) |
| Playwright `test:e2e:production-public` (real `next start`, production-public mode) | — | 7/7 |

**Image optimizer harness (16.4.2, local).** Shipped PNG/WebP/AVIF optimize to WebP (200). The shipped SVG is
served statically (200) and **refused by the optimizer (400)**; the `plain.svg` and `svg-as.png` fixtures are
refused (400). Remote, protocol-relative, bad width and missing `url` → 400; traversal and missing file → 404
(16.3.4 answered 400 for traversal; both are refusals). Truncated and oversized-box AVIF pass through unmodified;
PNG-as-AVIF is sniffed and optimized; empty and garbage AVIF → 400. No 5xx, no leaked internals, server healthy
afterwards.

### Next 16.4 build changes (React 19.3 snapshot, chunking)

| | 16.3.8 | 16.4.2 |
| --- | --- | --- |
| Route table (70 static pages, ○/ƒ per route, `ƒ Proxy (Middleware)`) | — | **identical** |
| Client static files / bytes | 43 / 2,810,231 B | 43 / 2,794,246 B (−0.6 %) |
| Client JS | 35 files, 2,527,423 B | 35 files, 2,511,438 B |
| CSS | 147,644 B | 147,644 B (byte-identical) |
| Server output | 1,886 files, 35.6 MB | 2,175 files, 34.0 MB (−4.5 %) |
| Function traces (`.nft.json`) | 120 | 120; sharp still only in the admin upload route and `next-server.js` |

Server output now splits into more, smaller chunks around a shared `[turbopack]_runtime.js`; root client chunk
names changed, as expected for a new compiler version. `next-env.d.ts` is restored by the build wrapper, so no
generated-file change is committed.

## Staging

**1. Staging alias, through the locked staging gate** (`scripts/invoke-nextjs-hotfix-staging.ps1 -Stage all`,
`RELEASE_PURPOSE=nextjs-16.4.2-security-hotfix`): deployed `ad48cb3` with `--prod` on the **staging** project
(production project never touched) → `dpl_6L8TQb2ZW6VcvNWSVSxKe5KGmbqV`. Certification **PASS**:

| Check | Result |
| --- | --- |
| Anonymous `/`, `/sign-in`, `/account`, `/admin`, `/sign-in.png` | 404, 0 bytes (gate locked) |
| Unsigned `POST /api/billing/webhook` | 400 `invalid-signature`, no redirect |
| Bootstrap with the staging token | 204 + host cookie |
| `/`, `/sign-in`, `/sign-up`, `/access`, `/privacy`, `/terms`, `/admin/sign-in`, `/api/health` | 200 |
| `/pricing`, `/games`, `/map-prep`, `/homework`, `/quizzes`; `/account`, `/subscription`, `/game-access` | 307 to `/access?next=…` or `/sign-in?next=…`, private ones `no-store` |
| `/admin` 404 · billing fixture 405 · `/game/runtime/index.html` 401 | as expected |
| Scheduler `/api/internal/billing/reconcile` | 401 anonymous, 401 wrong bearer |
| Security headers | CSP (`frame-ancestors 'self'`, Stripe `form-action`), HSTS, XFO, nosniff, Referrer-Policy, Permissions-Policy present |
| Static images (png, avif, webp, svg) | 200 with correct types |
| Platform optimizer (icon 64/256, brand mark) | 200 `image/webp`, `X-Matched-Path` set; remote and traversal 400; gated sources 404 on a locked gate (expected) |
| Chromium, 8 pages | all 200, 0 broken images, **0 console errors**; one aborted RSC prefetch (`ERR_ABORTED …?_rsc=`), the known navigation-cancellation quirk |

**2. Protected preview** `dpl_6F7UFDKhYZDF4afZrhCC3qFUDU5X` (GitHub build of `ad48cb3`, Vercel log: `Next.js
16.4.2 (Turbopack)`), hosted regressions through the confined protection bypass, synthetic staging users
deleted afterwards:

| Review | Result |
| --- | --- |
| Math Tug of War classic (`invoke-math-tug-of-war-staging.ps1 -Stage review`) — signs in and signs up through the real forms, i.e. **Server Actions** on Vercel | **99/99** (v1.2.23 baseline 99/99); deployment serves `ad48cb3`; 4 synthetic users and 2 rooms removed. Only page errors: WebKit's aborted RSC prefetches ("access control checks"), pre-existing since v1.2.16 |
| Math Tug of War 3D (`-Stage review-3d`) — runtime hash, CSP, hardware GL, devices | **57/57** (v1.2.23 staging 57/57); served runtime hash `79574206b9401535`, identical to production v1.2.23; 2 synthetic users and 1 room removed |

**Restore point.** If the owner wants the staging alias back on main before approval:
`npx vercel@59 promote dpl_7G8Ewdw5XtjXV1ahSJwCwJCkyTqN --scope bright-path-ed-tech` (staging project; never the
production project). The next push to `main` also rebuilds the staging alias.

## Production

Unchanged. Read-only checks before and after the staging work (2026-10-17): the apex HTML carries
`data-dpl-id="dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv"`; `/api/health` reports `build`
`fe3e81968f5d0452ab0607ef5aff4d4dcc973b9d`, `environment` `production-platform`; `/_next/image` is the platform
optimizer; SVG via the optimizer 400. Last check 2026-10-17 07:45 UTC, after all staging work: same deployment and build; the newest production-project deployment is still `…-in25ou19j` (`dpl_3dkm5…`, 2 days old), so nothing was deployed there; the extended optimizer harness against `https://mathnexa.com` (shipped assets only) passed 14/14, including the SVG refusal (400).

## Release plan (owner approval required)

1. Owner approval in chat for production.
2. `scripts/run-nextjs-hotfix-production.mjs` with `RELEASE_CERTIFIED_RUNTIME=ad48cb3`,
   `RELEASE_ROLLBACK_DEPLOYMENT=dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`, `RELEASE_PURPOSE=nextjs-16.4.2-security-hotfix`:
   `preflight` (now asserts next 16.4.2 / sharp 0.35.5) → `deploy-preview` (`--prod --skip-domain`) →
   `probe-preview` → `promote` → `probe-live`. Then the hosted Tug reviews on the apex and the optimizer harness
   against `https://mathnexa.com` (14 shipped-asset probes, no fixtures; 14/14 on v1.2.23 today).
3. **Rollback:** `--stage=rollback` to `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` (v1.2.23), then
   `--stage=probe-live --expect-deployment=dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`.
4. Proposed version `v1.2.24`; tag and fast-forward `main` only on the owner's word.

Not covered by machine: signed-in admin (AAL2) journeys and live billing, which need the owner's credentials;
the standing suites cover their logic and the gates in front of them are certified above. No exploit was
attempted against any hosted environment.

## Evidence

Git-ignored, in this worktree: `qa-artifacts/nextjs-16-4-2/` — `logs/` (every gate log, before/after `npm audit` JSON,
build stats, staging certification evidence, hosted review transcripts), `tug-classic/` and `tug-3d/` (the hosted
review screenshots and `staging-3d-results.json`; the tracked owner-review baselines were restored).
