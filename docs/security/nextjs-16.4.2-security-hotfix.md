# MathNexa — Next.js 16.4.2 Security Hotfix (October 14, 2026 advisories)

**Status: on protected staging. Not merged. Not in production. Final verdict 2026-10-18: GO on the owner's approval, with finding A (a benign Next 16.4 redirect-abort) accepted — see "Batch 3 results" and "Final verdict" at the end.** Production and merge need the owner's
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

**2026-10-17: GO for production, on the owner's approval. Superseded 2026-10-18 by the final security release
review below: HOLD — no regression found, but one e2e failure is unclassified and four gates could not run.**
Every local gate, the staging certification and the hosted regressions in this section passed with no new failure. GHSA-p3m5 (Server Actions DoS) is directly reachable on production
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

## Final security release review (2026-10-18)

Owner request, relayed by the release session: close the remaining gates on the existing candidate `ad48cb3` with no new
development, promotion or merge. A temporary base worktree at `0f8475b` (Next 16.3.8, sharp 0.35.4) provided the
A/B runs and was removed afterwards. Gates that already passed on 2026-10-17 (above) were not repeated.

**Verdict: HOLD. Not GO yet, and not a NO-GO on the merits.** Nothing that ran shows a regression caused by the
upgrade. However:

- one e2e failure (number-cross, below) could not be classified against base;
- four gates could not run, because Docker Desktop on the review machine crashes at start and local Supabase is
  unavailable;
- the staging database refused synthetic entitlements on 2026-10-18, for base and candidate alike.

Under the owner's "stop and report anything unexpected" rule, this is reported, not worked around. **Path to GO**
is at the end of this section.

**State at the time of review** (2026-10-18 04:33 UTC, read-only):

- Production still serves `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`, build `fe3e819`.
- `origin/main` is `0f8475b` and the branch is `d1b2f43`.
- The staging alias is `dpl_6L8TQb2Z…`, and preview `dpl_6F7UFDK…` serves build `ad48cb3`.
- No new Next.js advisory since 2026-10-14. 16.4.2 and sharp 0.35.5 are still the latest versions, and GitHub's
  global advisory database still returns 404 for all three advisory IDs.

### Gate table

Hosted results are from 2026-10-17 unless noted. "Base" means `0f8475b` run the same way, or the named release
record.

| # | Gate | Command / suite | Candidate `ad48cb3` | Base / reference | Where |
| --- | --- | --- | --- | --- | --- |
| 1 | Upload unit | `vitest platform-core src/admin-files src/public-api.test.ts` | 12/12 (image validation 2, PDF validation 3, public API) | validator source unchanged since `53f6f16` | local |
| 1 | Admin route surface | `vitest platform-web test/security/security-baseline.test.ts lib/admin` | 136/136 (admin gate and CSRF on all 31 admin routes incl. `media/upload`; admin session) | `test:security` 315/315 on 10-17 | local |
| 1 | Upload validator + sharp pipeline probe | scratch `final-review/upload-probe.mjs` (real `inspectImageUpload`, then the route's exact `sharp()` pipeline) | 14/14 — see note | — | local |
| 1 | Admin media upload e2e | `test:e2e:phase8f` (owner TOTP, real PNG through `/admin/media/upload` → draft-saved → published → served 200) | 1/1 | v1.2.20 battery pass | local `next dev` |
| 1 | Admin PDF resource upload e2e | `test:e2e:phase8d` | 1/1 | v1.2.20 pass | local |
| 1 | Hosted admin upload | — | not run: needs the owner's AAL2 admin session | — | — |
| 2 | Auth unit | `vitest platform-web lib/auth components/auth components/forms components/site-header.test.tsx components/consumer lib/staging-access lib/school-access`; `test:phase11` | 126/126; 14/14 | — | local |
| 2 | Consumer identity e2e | `test:e2e:phase7b` (sign-up minimum data and confirmation, signed-out redirects, protected assets deny, forged entitlement refused, 24-h trial) | 10/10 | v1.2.20 pass | local |
| 2 | Access-flow e2e | `test:e2e:phase9` (account-intent paths, entitled navigation, Sign out shown, navigation budgets, Smart Board visual baseline) | 17/17 | v1.2.20 pass | local |
| 2 | Admin auth e2e | `test:e2e:phase8a` (only sign-in public, non-admin genuine 404, TOTP, 2-h / idle session, revocation, a signed-in non-admin's "Sign out and continue" Server Action) | 5/5 | v1.2.20 pass | local |
| 2 | Hosted sign-in and sign-up through the real forms | Tug classic review | 99/99 | v1.2.23 99/99 | hosted preview |
| 2 | Staging gate certification | `invoke-nextjs-hotfix-staging.ps1 -Stage all` | PASS | v1.2.8 pass | hosted alias |
| 2 | School access e2e | `test:e2e:school-access` | **not run**: needs local school-access config (generated for the rerun), then blocked by Docker | — | local |
| 2 | Consumer header Sign out click | scratch `final-review/auth-signout-probe.mjs` | **not run**: blocked by Docker | — | local |
| 3 | Number Logic | `test:number-logic`, `:native`, `test:e2e:number-logic` | 26/26, 7/7, 2/2 | — | local |
| 3 | Number Cross | `test:number-cross`, `:native`, `test:e2e:number-cross` | 26/26 (10-17), 5/5, **e2e 1 failed** (finding A) | base rerun blocked by Docker | local |
| 3 | CrossCalc V2 | `test:crosscalc:v2`, `test:e2e:crosscalc:v2`, `:native` | 22/22 (10-17), 2/2, native 7/9 (finding C, environment) | — | local |
| 3 | Game suite | `test:e2e:game-suite` | **not completed**: PostgREST startup race after the runner's DB reset (finding D); rerun blocked by Docker | v1.2.20 pass | local |
| 3 | Math Vocabulary Hunt | `test:e2e:mvh-session`, `test:e2e:mvh-audio`, `test:e2e:mvh-real-runtime`, `test:mvh-audio-version-atomic` | 4/4, 8/8, 40/40, 3/3 | — | local |
| 3 | Math Tug of War local, classic | `run-math-tug-of-war-e2e.mjs` (desktop Chromium/WebKit, Pixel 7, iPhone 13, iPad) | 107 passed, 13 skipped | v1.2.23 107/13 | local static harness |
| 3 | Math Tug of War local, 3D | same runner, 3D projects | Chromium 25 passed / 2 skipped; WebKit desktop 11/13 (finding B) | v1.2.23 Chromium 25/2; WebKit 12/13 with one page loss per run | local |
| 3 | Hosted-only games | Tug classic and 3D reviews | 99/99, 57/57 | v1.2.23 99/99, 57/57 | hosted preview |
| 4 | Multiplayer | `run-math-tug-of-war-online-e2e.mjs` (`next dev` + local Supabase Realtime) | 13 passed, 1 skipped | v1.2.23 13/1 | local |
| 4 | Multiplayer, hosted | Tug classic review: Online Match create/join (2 rooms removed); Tug 3D review: Chromium host + WebKit guest (1 room) | pass | v1.2.23 pass | hosted preview |
| 5 | Mobile / tablet / desktop contract | `test:e2e:mobile-gameplay` (Chromium + WebKit, desktop + mobile) | 151 passed, 41 skipped by project design | — | local |
| 5 | Mobile audit | `audit:mobile-gameplay` | 16/16 | — | local |
| 5 | Hosted devices | 3D review: desktop 1366, phones 390 / 430 / Pixel 7, Smart Board 1920×1080, iPad 820×1180 and 1180×820 WebKit, WebKit desktop 1366×768; staging Chromium 8 pages | pass | v1.2.23 pass | hosted |
| 5 | Smart Board | exists (see below) | all pass | — | local + hosted |
| 6 | Performance | see "Performance and runtime" | no regression measured | — | local + hosted |
| 7 | Rope grip, owner criterion | see "Rope grip evidence" | all six characters, both hands, every device: pass | v1.2.23 | hosted + local |
| 8 | Lockfile / advisories | `npm ci`; `npm ls next sharp source-map-js eslint-config-next`; `npm audit` | clean `npm ci`, lockfile unchanged; next 16.4.2, sharp 0.35.5, source-map-js 1.2.2; production audit 0; full 7 (dev-only, unchanged) | before: production 2 high | local |

**Upload probe** (`gates/upload-probe.txt`), with sharp 0.35.5, libvips 8.18.7 and librsvg 2.63.2:

- **Converted to WebP:** PNG, JPEG and VP8X WebP.
- **Quarantined:**
  - SVG, SVG named `.png` or declared `image/webp`;
  - AVIF, AVIF named `.png`, GIF;
  - PNG bytes declared `image/jpeg`;
  - a PNG declaring 9000×9000;
  - an empty file;
  - a PNG-signature + SVG-body polyglot. It passes the magic check, but libvips picks the PNG loader and rejects
    it ("corrupt header"); the route catches that as `media-decoder-rejected`. No SVG decoder runs.
- **Pre-existing limitation (not a regression, fail-closed):** the validator reads WebP dimensions only from a
  `VP8X` header. So simple lossy (`VP8`) and lossless (`VP8L`) WebP uploads are quarantined with
  `invalid-dimensions`. `image-validation.ts` is unchanged since `53f6f16`.

**Smart Board (1920×1080) coverage.** The suites listed below exist, and all of them passed:

- Phase 9 "teacher-first homepage matches mobile, desktop, and smartboard visual baselines".
- The mobile-gameplay contract: "tablet, landscape phones, desktop and Smart Board" for every game, Math
  Vocabulary Hunt "desktop and Smart Board keep the full teacher bar", and CrossCalc "fits the 1440 × 900 desktop and
  the Smart Board".
- The mobile audit at 1920×1080.
- The game-suite, Number Cross, Number Logic and CrossCalc 1920 viewports.
- Tug local `chromium-3d-smart-board` (visual acceptance) and the 1920×1080 reflow check.
- Hosted 3D `smart-board-1920x1080` (grip and frame time).
- The hosted classic 1920 badge check.

### Rope grip evidence (owner's criterion: all six characters visibly hold the rope with both hands)

**Assertions.**

- **Hosted** (`scripts/review-math-tug-of-war-3d-staging.mjs`, probe `e2e/math-tug-of-war/player-camera-hands.ts`).
  For every puller (`turquoise-0..2`, `pink-0..2`) and each hand, the review counts from the gameplay camera:
  - the hand's visible pixels, which must be at least 10, or at least 4 on a phone;
  - its pixels touching the rope, which must be at least 8, or at least 3 on a phone.

  It does this at rest and after a pull, on 8 devices: 6 characters × 2 hands × 2 states × 8 devices =
  **192 hand measurements on the staging candidate: all pass**.
- **Local.** `scene-3d.spec.ts` "visual acceptance: from the ordinary gameplay camera every puller visibly holds the
  rope with both hands" runs the same probe at rest, mid-heave, mid-yank both ways, after strong pulls both ways,
  when tired, and at the release. It is **7/7** on `chromium-3d`, `webkit-3d`, `chromium-3d-mobile` (Pixel 7),
  `chromium-3d-smart-board`, `webkit-3d-ipad`, `webkit-3d-ipad-portrait` and `webkit-3d-iphone`. Per-hand
  rest pixels are in `grip/local-visual-acceptance-hands.txt`.

**Per character** (hosted, candidate vs v1.2.23 staging `3d23c9c`). Each cell gives the hands on the rope, then the
weaker hand's visible/touching px, with v1.2.23 in brackets. The full per-character table is
`grip/grip-per-character.md`. Per device, the minima over all twelve hands:

| Device / state | Fewest visible / touching px over all 12 hands, candidate (v1.2.23) | All 6 × 2 hands on rope |
| --- | --- | --- |
| desktop 1366, rest · after pull (≥10/8) | 22/19 (21/18) · 16/14 (16/12) | yes · yes |
| phone 390×844, rest · after pull (≥4/3) | 9/9 (9/9) · 9/9 (9/9) | yes · yes |
| phone 430×932, rest · after pull (≥4/3) | 12/12 (12/12) · 13/12 (13/13) | yes · yes |
| Pixel 7, rest · after pull (≥4/3) | 11/11 (10/10) · 11/11 (12/12) | yes · yes |
| Smart Board 1920×1080, rest · after pull (≥10/8) | 42/35 (43/34) · 40/29 (41/28) | yes · yes |
| iPad 820×1180 WebKit, rest · after pull (≥10/8) | 22/20 (24/21) · 22/20 (22/19) | yes · yes |
| iPad 1180×820 WebKit, rest · after pull (≥10/8) | 15/14 (13/13) · 13/13 (13/13) | yes · yes |
| WebKit desktop 1366×768, rest · after pull (≥10/8) | 25/20 (19/16) · 19/16 (18/15) | yes · yes |

**Screenshots** (hosted candidate, real pixels; `qa-artifacts/nextjs-16-4-2/`):

- `grip/grip-closeups-desktop-rest-v1.2.23-top-candidate-bottom.png`: per-character 3× close-ups, v1.2.23 above and
  candidate below. All twelve fists are on the rope in both.
- `grip/grip-teams-desktop-pull-v1.2.23-top-candidate-bottom.png`: both teams mid-pull. All twelve fists are on the
  rope in both; the frames are captured at different rope positions.
- `grip/candidate-{rest,pull}-{turquoise,pink}-{left,middle,right}-3x.png`: single-character close-ups.
- Full device shots: `tug-3d/30–35-staging-3d-*.png`.

**Why the grip cannot have moved.** The game document is served by a route handler as standalone HTML, and the
served runtime hash `79574206b9401535` is identical to production v1.2.23. Locally, the harness, runtime and specs
are byte-identical to base.

### Performance and runtime

| Measure | Base `0f8475b` | Candidate | Where / method |
| --- | --- | --- | --- |
| Build | route table, 70 static pages | identical; client JS −0.6 %, CSS byte-identical, server −4.5 % | local build (10-17) |
| Navigation budgets | — | Phase 9 `navigation-performance.spec.ts` budgets pass | local |
| Server TTFB, staging previews of base and candidate (same project and env, `vercel curl`, median of 4, after a warm-up) | `/` 527 ms · `/sign-in` 395 · `/access` 414 · `/api/health` 259 | 529 · 472 · 436 · 242 | hosted; ranges overlap (e.g. `/sign-in` 377–424 vs 354–533); Brotli HTML +~140 B |
| 3D frame time (hosted review, 8 devices) | v1.2.23 run 2026-10-14: 7.2–10.4 ms | 10-17 run: 8.5–16.3 ms, same draw calls (155/167), tier `medium`, 0 downgrades | hosted; cross-day — see note |

**Page weight**, local A/B: production-public builds of both trees, `next start`, Chromium 1366×900, median of 5 cold
loads, alternating. Bytes are the encoded (gzip) bodies transferred.

| Route | Status | All bytes | JS (files) | CSS | TTFB ms | DCL ms | Load ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `/` | 200 | 200,040 → 201,218 | 147,668 → 148,865 (8/8) | 24,308 → 24,308 | 19 → 18 | 310 → 294 | 310 → 294 |
| `/sign-in` | 200 | 189,907 → 192,080 | 139,393 → 140,569 (7/7) | = | 9 → 9 | 250 → 244 | 250 → 250 |
| `/sign-up` | 200 | 190,971 → 191,050 | 139,393 → 140,569 (7/7) | = | 9 → 8 | 246 → 246 | 248 → 246 |
| `/access` | 200 | 197,397 → 197,530 | 141,078 → 142,234 (8/8) | = | 15 → 16 | 268 → 263 | 268 → 264 |
| `/privacy` | 200 | 197,520 → 198,680 | 145,004 → 146,214 (8/8) | = | 12 → 11 | 254 → 257 | 254 → 257 |
| `/terms` | 200 | 197,505 → 198,704 | 145,004 → 146,214 (8/8) | = | 11 → 11 | 260 → 255 | 260 → 255 |
| `/admin/sign-in` (404 in production-public) | 404 | 193,201 → 194,331 | 139,393 → 140,569 (7/7) | = | 13 → 15 | 104 → 111 | 304 → 229 |

Client JS is about +1.2 kB per page (+0.8 %, the newer React 19.3 snapshot). Chunk counts are the same, CSS is
byte-identical, and the timings are equal within noise. There were no page errors on either side.

**3D frame times.** The 2026-10-17 candidate run is 19–62 % slower per frame than the 2026-10-14 v1.2.23 run. Both
runs used the same GPU-bound measuring browser on the review machine, on different days, and the candidate run came
straight after a full local battery. The difference cannot come from this change:

- the game page is a route-handler HTML document, with no React or Next client runtime;
- its runtime bytes are identical;
- draw calls, quality tier and downgrades are unchanged.

A same-session A/B (base preview vs candidate preview) was attempted on 2026-10-18. Both runs stopped at the same
setup step: the staging database refused the synthetic entitlement (finding G). So the frame-time comparison is
**not closed**.

### Findings

- **A — Number Cross e2e (candidate, `next dev`), unclassified.** The flow completed: admin TOTP sign-in, draft
  preview, sign-in, play, publication model. The final hygiene assertion
  `expect(failedRequests).toEqual([])` then received `["/admin/mfa", "/admin/mfa"]`: two browser requests to
  `/admin/mfa` reported `requestfailed` during the admin TOTP enrollment and verification. Both MFA Server Actions
  returned 200 in the server log. This pattern (navigation-cancelled RSC/action requests, `ERR_ABORTED`) matches the
  known Chromium quirk recorded for `/sign-up`, but it was seen once and not reproduced. The trace was lost when the
  next suite cleared `test-results/`, and the base/candidate A/B (2 runs each) could not start because of finding F.
  The same admin MFA flow passes in Phase 8A (5/5), which does not assert on aborted requests. **Status: open; must be
  classified before GO.**
- **B — Math Tug of War `webkit-3d` (local, WebKit on Windows): pre-existing, not a regression.**
  - `every hand closes around the rope…` fails on "after the pull: turquoise-2 Right rope along the fist":
    `channelDeg` 50 / 51 vs the limit `< 50`.
  - It reproduced on **base `0f8475b` 1 of 3** and on the **candidate 2 of 3**, with byte-identical runtime and
    specs. It fails the same way on both sides.
  - The same hand passed the earlier assertions in that loop: on the rope, the rope through the fist, reach and
    wrist angle. The test then stops on the angle, so that hand's coverage check did not run.
  - `3D layer loads…` failed once with "Target page, context or browser has been closed", the known Windows
    WebKit page loss (it passed 3/3 in the A/B).
  - The owner-criterion test, visual acceptance, passes on `webkit-3d`.
- **C — CrossCalc V2 native provenance (environment).** 2 of 9 fail with "standalone source missing": the
  standalone CrossCalc checkout (`CROSSCALC_SOURCE_DIR` or `../../crosscalc`) does not exist on this machine. The 7
  runtime assertions pass.
- **D — Game suite (environment).** `PGRST002 "Could not query the database for the schema cache"` came right after
  the runner's own `supabase db reset`. The runner waits only for Auth, not for PostgREST, so it is a readiness
  race. The rerun is blocked by F.
- **E — School access e2e (configuration).** The runner needs `MATHNEXA_SCHOOL_ACCESS_CODE` and
  `MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET`. The follow-up run generates throwaway local values; it is blocked by F.
- **F — Docker Desktop crashes at start (review machine, environment).** After the session's process restart,
  Docker Desktop 4.83.0's backend fails with "initializing Inference manager: listening on
  unix://…/AppData/Local/Docker/run/dockerInference: remove …: The file cannot be accessed by the system". Three
  stale AF_UNIX socket reparse points from 2026-10-14 sit in `%LOCALAPPDATA%\Docker\run\`. Docker shows an error
  dialog, and local Supabase is unavailable. **Not repaired:** that changes the owner's Docker installation. Repair,
  with Docker Desktop quit: delete `dockerInference`, `dockerEthernetVfkit` and `userAnalyticsOtlpHttp.sock` in
  that folder, then start Docker Desktop and run `npx supabase start`.
- **G — Staging database refuses synthetic entitlements (environment, 2026-10-18).** The hosted 3D review creates a
  synthetic subscriber. The user is created, but the `consumer_accounts` update or the `consumer_game_entitlements`
  insert then fails (`synthetic-entitlement-failed`). This happened identically on the base preview `0f8475b` and on
  the candidate preview, and the review deleted its user each time. The same script passed 57/57 on 2026-10-17, so
  the staging database changed in between. That is outside this branch, and the schema was not inspected. Production
  is unaffected (separate project; checked read-only).

### Path to GO

1. Repair Docker Desktop (F) and start local Supabase.
2. Run `scratchpad/batch3.sh` as archived in `final-review/` (about 25 minutes, all local):
   - Number Cross e2e: candidate, base, candidate, base. If base shows the same `/admin/mfa` aborts, A is
     pre-existing. If only the candidate does, it is a 16.4 behaviour change to investigate.
   - the game suite;
   - school access with generated local config;
   - the sign-in / Sign out probe.
3. Find out what changed in the staging database (G). Then repeat the same-session hosted 3D A/B for frame times;
   this is optional for security, and needed only to close the performance comparison.
4. If A is pre-existing and the reruns pass, the verdict returns to **GO on the owner's approval**. The release plan
   above is unchanged.

Evidence for this section: `qa-artifacts/nextjs-16-4-2/gates/` (final-review logs, upload probe, lockfile
consistency, hosted TTFB raw and summary, page-weight A/B JSON, partial 2026-10-18 3D results) and
`qa-artifacts/nextjs-16-4-2/grip/` (per-character table, close-ups, local visual-acceptance JSON and per-hand
annotations, WebKit A/B logs).

### Follow-up 2026-10-18: Docker repair attempt (owner-approved), still blocked

The owner approved the Docker repair and a rerun of batch 3 (relayed by the release session). The outcome:

- **Docker Desktop was already not running**: there was no Docker process to quit and no error dialog left open.
- **The three stale entries in `%LOCALAPPDATA%\Docker\run\` could not be removed from Windows.** They are
  `dockerInference`, `dockerEthernetVfkit` and `userAnalyticsOtlpHttp.sock`: 0 bytes, reparse points, 2026-10-14
  19:07–19:08 local.
  - `Remove-Item`, `del /f` and `fsutil reparsepoint query` all fail with error 1920, "The file cannot be accessed
    by the system".
  - Git Bash `rm -f` only suppresses "no such file" and leaves them in place.
  - The session is not elevated.
  - They are WSL special files, created through WSL's view of `C:`. WSL's `docker-desktop` distro sees them at
    `/mnt/host/c/Users/quays/AppData/Local/Docker/run/` (a read-only `ls` confirmed this).
- **Removal through WSL was refused by this session's permission policy** (irreversible local deletion). A relayed
  approval does not override that, and the policy was not worked around. The distro was stopped again with
  `wsl --terminate docker-desktop`. Nothing in the Docker install or settings changed, and the three files are
  untouched.
- **So batch 3 did not run.** That means the Number Cross A/B, the game suite, school access and the sign-out probe.
  Finding A remains **unclassified**, and the verdict stays **HOLD**.

**For the owner** (PowerShell, Docker Desktop not running): remove the three files through WSL, stop the distro,
then start Docker Desktop.

```powershell
wsl -d docker-desktop -- rm /mnt/host/c/Users/quays/AppData/Local/Docker/run/dockerInference /mnt/host/c/Users/quays/AppData/Local/Docker/run/dockerEthernetVfkit /mnt/host/c/Users/quays/AppData/Local/Docker/run/userAnalyticsOtlpHttp.sock
wsl --terminate docker-desktop
```

After that: `npx supabase start` in the worktree, then batch 3 from `qa-artifacts/nextjs-16-4-2/gates/final-review/`
(about 25 minutes). It needs the base worktree `C:/GitHub/mathnexa-nextjs-base` at `0f8475b`, recreated with
`git worktree add --detach` and `npm ci`.

**Decision rule for finding A.**

- If base `0f8475b` also reports aborted `/admin/mfa` requests, or neither side reproduces in 2 + 2 runs, A is not a
  regression. With the game suite, school access and sign-out passing, the verdict becomes **GO on the owner's
  approval**.
- If only the candidate reproduces, it is a Next.js 16.4 behaviour change in the admin MFA flow, to investigate
  before release.
- **Owner's alternative.** The owner may accept A as an unclassified, low-impact finding and release now. The
  evidence for that:
  - the admin MFA flow completes (Phase 8A 5/5, and the Number Cross flow passed through MFA);
  - the server returned 200 for both MFA actions;
  - the same pattern exists as a known Chromium quirk.

## Production release procedure (only after the owner's explicit GO)

PowerShell, from `C:\GitHub\mathnexa-nextjs-16-4`, with the Vercel CLI signed in.

**The pipeline fails closed** at each of these checks:

- the tree is clean;
- the code under review is byte-identical to `ad48cb3` (`apps`, `packages`, `supabase`, manifests, lockfile);
- `next` is 16.4.2 and `sharp` is 0.35.5 in `node_modules`;
- the apex serves the expected rollback deployment;
- the staged deployment holds no production alias.

**Every stage prints an `EVIDENCE` JSON path.** Keep those files for the release record.

```powershell
Set-Location C:\GitHub\mathnexa-nextjs-16-4
git fetch origin
git status -sb                      # clean; at origin/fix/security-nextjs-16-4-2 (docs-only commits after ad48cb3)
Test-Path apps\platform-web\.env.local   # must be False (a local env file would be uploaded)
npm ci
$env:RELEASE_CERTIFIED_RUNTIME   = 'ad48cb3'
$env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv'
$env:RELEASE_PURPOSE             = 'nextjs-16.4.2-security-hotfix'

# 1. Read-only: the apex must serve dpl_3dkm5…; health, webhook and host behaviour are recorded.
node scripts/run-nextjs-hotfix-production.mjs --stage=preflight
# 2. Upload the certified runtime to the PRODUCTION project without moving any alias (--prod --skip-domain).
#    Prints PREVIEW {"previewUrl":"https://mathnexa-platform-production-<id>-bright-path-ed-tech.vercel.app","deploymentId":"dpl_…"}
node scripts/run-nextjs-hotfix-production.mjs --stage=deploy-preview
# 3. Probe the staged deployment through the CLI's protection bypass: health/build, webhook 400, canonical host,
#    admin concealed, scheduler 401, forged access refused, images and the optimizer.
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-preview --url=<previewUrl> --deployment=<deploymentId>
#    Optional, as for v1.2.23: compare the deployment's file uids with ad48cb3 (npx vercel@59 api /v6/deployments/<deploymentId>/files).
# 4. Promote: move https://mathnexa.com to the candidate. This is the irreversible step that needs the owner's word.
node scripts/run-nextjs-hotfix-production.mjs --stage=promote --url=<previewUrl>
# 5. Probe the live apex and webhook host: 22 checks.
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=<deploymentId>
```

**Post-release checks** (the same day):

1. `curl.exe -s https://mathnexa.com/api/health`. Expect `build` to be the deployed commit, `environment` to be
   `production-platform` and `payments` to be `live`. The apex HTML `data-dpl-id` must be the new deployment.
2. `node scripts/verify-next-image-optimizer.mjs --base=https://mathnexa.com`. Expect 14/14: shipped assets 200,
   SVG via the optimizer 400, remote, traversal and bad width refused.
3. Hosted reviews on the apex. They use synthetic production accounts, deleted afterwards, as in v1.2.21 to
   v1.2.23. Expect classic 99/99 and 3D 57/57 or better.

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-tug-of-war-production.ps1 -Stage review -ExpectBuild <deployed commit>
   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-math-tug-of-war-production.ps1 -Stage review-3d -ExpectBuild <deployed commit>
   ```

4. Runtime logs for the new deployment. Expect 0 results for each query.

   ```powershell
   $env:MSYS_NO_PATHCONV = '1'
   npx --yes vercel@59 logs --project mathnexa-platform-production --deployment <deploymentId> --status-code 5xx --since 2h --scope bright-path-ed-tech
   npx --yes vercel@59 logs --project mathnexa-platform-production --deployment <deploymentId> --level error --since 2h --scope bright-path-ed-tech
   npx --yes vercel@59 logs --project mathnexa-platform-production --deployment <deploymentId> --level fatal --since 2h --scope bright-path-ed-tech
   ```

5. Owner's manual checks, which automation never does with real credentials:
   - admin sign-in with TOTP, and one real admin media upload (PNG → WebP);
   - one subscriber sign-in, a game launch, and Sign out.

**Rollback** (rehearsed command; v1.2.23 is Ready and retained; there is no database or environment change to undo):

```powershell
$env:RELEASE_CERTIFIED_RUNTIME   = 'ad48cb3'
$env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv
```

Fallback: `npx vercel@59 promote dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv --scope bright-path-ed-tech`. Always use the
full deployment id; an elided id makes the stage fail closed.

**After a verified release, each step only on the owner's word:**

1. Release record `docs/releases/mathnexa-v1.2.24-release-record.md`: the evidence JSONs, probe results, reviews
   and logs.
2. Annotated tag on the commit production was built from, which is the `build` reported by `/api/health`:
   `git tag -a v1.2.24 <deployed commit> -m "MathNexa v1.2.24: Next.js 16.4.2 security hotfix (sharp 0.35.5, source-map-js 1.2.2)"`,
   then `git push origin v1.2.24`.
3. Fast-forward `main`, with no force:
   - check: `git merge-base --is-ancestor origin/main <commit>`;
   - push: `git push origin <commit>:refs/heads/main`.

   `origin/main` `0f8475b` is an ancestor of the branch. The production Vercel project has no Git link, so this
   push does not deploy production. It rebuilds the staging project's alias from `main`.
4. Retire the follow-ups: the `sharp-source-map-js-remediation-plan.md` patch (on `ce4d251`) is superseded by this
   release.

### Batch 3 results (2026-10-18, after the owner's Docker repair)

The owner deleted the three stale entries through WSL and restarted Docker Desktop (engine 29.6.2). Local Supabase
then started. The base worktree `0f8475b` (Next 16.3.8, sharp 0.35.4) was recreated and used; the candidate tree is
`2210a47`, whose code under review is identical to `ad48cb3` (Next 16.4.2, sharp 0.35.5). All runs were local, on
`next dev` with local Supabase. Synthetic users were deleted. The staging database was not touched.

| Gate | Command | Candidate | Base `0f8475b` |
| --- | --- | --- | --- |
| Number Cross e2e (A/B) | `npm run test:e2e:number-cross` | **1 of 4 passed**: run 1 pass; runs 2, 3 and the original 10-17 run failed on `failedRequests` | **3 of 3 passed** (2 today, plus the v1.2.20 battery) |
| Game suite | `npm run test:e2e:game-suite` | 6/6 | v1.2.20 pass |
| School access | `npm run test:e2e:school-access` (throwaway local code and secret generated per run) | 21/21 | v1.2.20 pass |
| Header sign-in → Sign out | scratch `auth-signout-probe.mjs` (real form, `signInAction` / `signOutAction`, 1 synthetic user deleted) | 10/10; cookies cleared; `/account`, `/subscription`, `/game-access` gated again; no aborted requests, no page errors | — |

Two Number Cross attempts (one per side) never reached a test: `PGRST002` "Could not query the database for the
schema cache", because each runner resets the local database at teardown. They were rerun with a PostgREST readiness
wait (`final-review/batch3-rerun/batch3b.sh`). This is a harness race, not a result.

**Finding A, classified: a Next.js 16.4 client behaviour change. Benign; candidate only.** The Playwright traces
(`gates/test-results-number-cross-cand-2/`, `-cand-3/`) show the aborted requests are **Server Action POSTs that end
in `redirect()`**:

- `adminSignInAction` → `/admin/mfa` (run 2);
- the MFA verify action → `/admin` (runs 2 and 3).

In each case:

- The response is `200` with `x-action-redirect: /admin;push`, `x-action-revalidated: 1` and the session
  `Set-Cookie` headers (`mvh-admin-session`, `sb-…-auth-token`, and clearing `mvh-admin-mfa-pending`).
- Then the browser reports `net::ERR_ABORTED` while the body (the inline RSC payload of the redirect target) is
  still streaming. These redirect responses take about 2 s, because the admin session is created server-side.
- With 16.4.2 the client router acts on the redirect header and navigates without consuming the rest of that body.
  Base (16.3.8) never
  shows an abort (0 of 3 runs).
- The MFA enroll action, which does not redirect, completes normally.

**Impact:**

- The action has run on the server, and the cookies arrive with the headers.
- The navigation lands on the redirect target, the admin session works, and the rest of the test passes (admin
  games, draft preview, consumer sign-in, play, publication).
- There are no console errors and no page errors.
- The only observable effect is a cancelled request in the browser's network log, which the Number Cross spec's
  strict `expect(failedRequests).toEqual([])` counts.

Consumer sign-in and sign-out (a fast redirect) showed no abort in the probe. **Not a security or functional
regression**, but the established Number Cross e2e suite is red on the candidate in 3 of 4 runs.

**Unchanged open items** (not release blockers, and not caused by the candidate):

- **G.** The staging database has refused synthetic entitlements since 2026-10-17, for base and candidate alike.
  It needs an owner investigation of staging. The production database is separate.
- **3D frame times.** The same-session hosted A/B is still not possible because of G. This change cannot move 3D
  frame times: the game is a route-handler HTML document with identical runtime bytes.
- **B.** The WebKit 3D grip-angle flake predates this change.

### Final verdict (2026-10-18): GO on the owner's approval, with finding A accepted

Every gate now has a base comparison or a reference, and none shows a functional, security or grip regression. The
security exposure being fixed is current and direct: GHSA-p3m5, the Server Actions DoS, applies to six modules in
production today. **Recommendation:** release with the procedure below, recording A as a known Next 16.4 behaviour
change. Then, as a separate reviewed test-only change, narrow the Number Cross spec so it ignores `net::ERR_ABORTED`
**only** for POST requests whose response carried `x-action-redirect`; everything else stays strict.

`e2e/` is outside the pipeline's certified-runtime diff (`apps`, `packages`, `supabase`, manifests), so that change
would not alter the certified candidate. **If the owner wants the suite green before release, it is NO-GO until that
test change is reviewed**; the runtime candidate stays `ad48cb3` either way.

**The release procedure above is current.**

- `RELEASE_CERTIFIED_RUNTIME=ad48cb3`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`,
  `RELEASE_PURPOSE=nextjs-16.4.2-security-hotfix`.
- The pipeline asserts next 16.4.2 / sharp 0.35.5 from `npm ci`.
- Commits after `ad48cb3` are docs only, so the runtime diff is empty.
- Production was still `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` (build `fe3e819`) at the last read-only check, 2026-10-18T06:01:15Z.
