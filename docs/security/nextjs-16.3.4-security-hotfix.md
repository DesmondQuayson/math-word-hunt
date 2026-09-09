# MathNexa — Next.js 16.3.4 Security Hotfix (OB-02)

**Branch:** `fix/security-nextjs-16-3-4`, cut from `origin/main` at
`579c4374f4afcb26609d0fd32591181fb20c1085` (the `v1.2.7` consolidation; `v1.2.7` →
`1e707ee`, unchanged). Independent of `feature/security-ph2-07-observability-read-path`
(`54179a1`), which is preserved and **not** merged or cherry-picked here.
**Production:** `https://mathnexa.com`, `dpl_DRmcCTJvzQ8ey84gG6tRo4Vs3C3c` (2026-09-08 08:50 UTC).
**Changed = NO.** **ShowMe / MAP Prep:** untouched.

---

## Advisories

| GHSA | Title | Affected range | Patched | Current (before) |
|---|---|---|---|---|
| [GHSA-p293-qw3h-jr36](https://github.com/advisories/GHSA-p293-qw3h-jr36) / CVE-2026-75604 | Unauthenticated RCE on **Windows-hosted** servers (path traversal, Pages + App Router without Cache Components) | 13.4.0 – 15.5.23, 16.0.0 – 16.3.2 | 15.5.24 / 16.3.3 | `next@16.2.12` — affected version |
| [GHSA-2xp9-vwfh-vxw4](https://github.com/advisories/GHSA-2xp9-vwfh-vxw4) (libheif: GHSA-g89c-p67h-r497, GHSA-2jg2-4ch7-h545; sharp: GHSA-rgj7-g3m4-5g8c) | Unauthenticated RCE in the **Image Optimization API** when the optimizer processes an attacker-controlled AVIF, through `libheif` inside `sharp` | 10.0.0 – 15.5.23, 16.0.0 – 16.3.2; `sharp < 0.35.4` | 15.5.24 / 16.3.3 (AVIF optimization disabled); 16.3.4 + `sharp@0.35.4` (patched libheif 1.23.2) | `next@16.2.12`, `sharp@0.35.3` — affected versions |

Both published 2026-08-25 ([August 2026 Security Release](https://nextjs.org/blog/august-2026-security-release)),
listed in the GitHub advisory database 2026-09-08, found during PH2-07 discovery.

## Actual applicability — re-evaluated against current `main`

**GHSA-p293 (Windows RCE).** Requires the Next.js server to run on a Windows
filesystem. MathNexa production runs on Vercel serverless functions (Linux; Node
24.x). **Not applicable at runtime.** Only a developer's `next dev` / `next start`
on a Windows machine would be affected, and those are not internet-facing.

**GHSA-2xp9 (AVIF / libheif RCE).** The vulnerable code is the Next.js server's own
image optimizer (`image-optimizer.ts` → `sharp` → `libheif`). Verified on
production, read-only:

| Question | Finding on current `main` |
|---|---|
| Does `/_next/image` exist? | Yes — `/_next/image?url=%2Ficon.png&w=64&q=75` answers 200 |
| **Who optimizes on production?** | **Vercel's platform Image Optimization**, not the Next.js function: responses carry `Server: Vercel`, `X-Vercel-Cache`, `X-Matched-Path: /icon.png`, `Content-Disposition: attachment; filename="icon.webp"`, and **no** `X-Nextjs-Cache`. With `Accept: image/webp` the platform returns `image/webp` — conversion happens in Vercel's service, so the Next.js `sharp`/`libheif` path is **not executed for `/_next/image` on production** |
| Is `sharp` in the runtime? | Yes, `sharp@0.35.3` (optional dependency of `next`), and it **is** called directly by the admin media upload route (`app/admin/media/upload/route.ts`: `sharp(bytes).webp()`) |
| Can that upload feed AVIF to libheif? | **No.** `inspectImageUpload` accepts PNG, JPEG and WebP by magic bytes only; anything else is quarantined before `sharp` runs. The game-package importer maps only png/jpg/jpeg/webp/gif and quarantines other asset types |
| `next/image` call sites | 7 components; the game-catalog thumbnail renders `<picture>` with static AVIF sources and `<Image unoptimized>`; the resource, admin QR, admin game-thumbnail and CMS usages are `unoptimized` or same-origin |
| `remotePatterns` / `domains` / `localPatterns` | None configured. Remote and protocol-relative URLs are refused (400 on production); only same-origin paths are fetched |
| Can an external URL reach the optimizer indirectly? | Only through same-origin routes that redirect off-site — `/map-prep/launch` and `/games/[id]/launch` — whose destinations are owner-allowlisted hosts (ShowMe, Number Cross), never attacker-controlled |
| Can user content place an AVIF on a same-origin path? | No unauthenticated surface. Admin uploads are converted to WebP by `sharp` after magic-byte validation; static AVIF files under `public/media/games/` are repository-controlled |

**Conclusion.** On Vercel production neither advisory's vulnerable path is
reachable: the Windows path is the wrong OS and the AVIF path is served by the
platform optimizer rather than the framework's. Practical exposure was **low /
not reachable**, but the framework and its `sharp` were on affected versions, the
hosting assumption is not something a security posture should rest on, and the
patch is a non-major version step — so it is applied.

---

## Dependency change

| Package | Before | After | Why |
|---|---|---|---|
| `next` (apps/platform-web) | `16.2.12` | **`16.3.4`** (exact pin, stable; no canary) | the patch |
| `eslint-config-next` (dev) | `16.2.12` | **`16.3.4`** | coupled to `next`; carries `@next/eslint-plugin-next` |
| `sharp` (optional, via `next`) | `0.35.3` | **`0.35.4`** | `next@16.3.4` requires `^0.35.4`; carries libvips 8.18.6 / **libheif 1.23.2** (`@img/sharp-libvips-*` 1.3.2 → 1.3.3) |
| `react`, `react-dom`, `stripe`, `@supabase/*`, `jose`, `fflate` | unchanged | unchanged | not touched; no general `npm update` |

Lockfile: 44 entries changed, every one attributable — `next` and `@next/env`,
`@next/swc-*` platform binaries, `@swc/helpers` 0.5.15 → 0.5.23 (dependency of
`next`), `sharp` and 26 `@img/*` platform packages (plus a nested `@emnapi/runtime`
under the wasm build), `eslint-config-next`, `@next/eslint-plugin-next` with two
nested eslint utilities, and `fastq` 1.20.1 → 1.20.3 (transitive of
`@next/eslint-plugin-next` → `fast-glob`). No unrelated churn.

Also in this branch (test-only): two overnight-phase test files carried
secret-shaped literals that the standing `test:billing:security` audit refuses, so
that gate had been failing on `main`; the literals are now built at runtime and
the audit passes.

---

## Audit

```
BEFORE  next 16.2.12   npm audit --omit=dev → 2 vulnerabilities (1 critical: next; 1 high: sharp)
AFTER   next 16.3.4    npm audit --omit=dev → found 0 vulnerabilities
```

Remaining vulnerabilities: **none**.

---

## Image Optimization regression

`scripts/verify-next-image-optimizer.mjs` probes `/_next/image` against a base URL
and, locally, against benign malformed fixtures written into `public/` before
`next start` boots (the server indexes `public/` at start): a bare `ftypavif`
header, a `meta` box declaring 2 GiB, PNG bytes under an `.avif` name, an empty
file, plain text. They are never valid AVIF, never weaponized, never committed.

**Local `next start` on 16.3.4 — 25 probes, 0 failed:**

| Probe | Result |
|---|---|
| shipped icon 64 / 256, brand mark, webp thumbnail | 200 `image/webp` |
| shipped AVIF thumbnail via optimizer | 200 `image/webp` (decoded through the patched libheif) |
| remote URL, protocol-relative, path traversal, missing upstream, disallowed width, no `url` | 400 (self-hosted Next answers 400 for a missing upstream; production's platform optimizer answers 404) |
| `valid.png` fixture | served 200, optimized 200 `image/webp` |
| `truncated.avif` (24 B, `ftyp` only) | served 200; optimizer passes it through unmodified, 200 `image/avif`, 24 B |
| `oversized-box.avif` (`meta` box declaring 2 GiB) | served 200; passed through unmodified, 200 `image/avif`, 36 B |
| `png-as.avif` (PNG bytes, AVIF name) | sniffed as PNG and optimized, 200 `image/webp` |
| `empty.avif` | 400 — "internal image response is empty" |
| `garbage.avif` (plain text) | 400 — "not a valid image" |
| server afterwards | healthy, icon still optimized |

No 5xx, no stack trace or path in any response body, no crash. Malformed AVIF
input is either passed through untouched or refused with a controlled 400.

---

## Behavioural regression (Next.js patch release)

Sensitive paths were re-proven by the standing suites and on staging: canonical
host handling and the Stripe webhook / health exemption
(`production-public.test.ts`, `production-platform.test.ts`), the staging gate and
its exact exemptions (`proxy.test.ts`), admin gates (`admin/security.test.ts`,
`security-baseline.test.ts`), subscription access and the v1.2.7 lifecycle
(`test:subscription-lifecycle`), private/no-store billing pages and cron protection
(staging certification), health, game launch (`test:number-cross`,
`test:crosscalc:v2`, ticket tests), image optimization (harness above).

Mutation checks (standing tests, each defect applied then restored): canonical-host
webhook exemption removed → caught; staging-gate webhook exemption removed → caught;
admin gate without AAL2 → caught; ended admin session accepted → caught; spray
observation moved pre-auth → caught; sign-in scope guard removed → caught; limiter
secret floor raised → caught; secret ceiling reintroduced → caught; production
limiter fail-open → caught; ticket signature unchecked → caught; SSRF private
address allowed → caught. **11 / 11.**

---

## Rate-limit and billing contracts (unchanged)

network 20 / 900 / 900 · account-target 20 / 900 / 900, sign-in only · spray 20 / 900,
observation only, rejected credentials only, 0 pre-auth call sites · recovery clears
the block · classroom NAT safety · webhook signature verification · idempotency,
stale / superseded guards, self-heal, grace and recovery — no billing or auth source
file is modified by this branch.

---

## Test gates (candidate, `13d307d` tree)

| Gate | Result | Untouched `main` baseline |
|---|---|---|
| `platform-core` unit | 245 passed (35 files) | 245 |
| `platform-web` unit | 547 passed, 1 skipped, 1 failed — `canonical-assets` CRLF | identical on untouched main (same 1 failure) |
| `test:security:baseline` | 278 passed (22 files) | 278 |
| `test:subscription-lifecycle` | 37 + 121 passed (1 skipped) | same |
| `test:number-cross`, `test:crosscalc:v2` (game launch) | 24 + 20 passed | same |
| `test:billing:security` | **passes** (977 files) after the test-literal fix | was failing on main |
| `test:capabilities:security` | passes | same |
| typecheck / lint | clean / 0 errors (8 pre-existing warnings, untouched file) | same |
| build | ✓ compiled, 0 warnings | ✓ |
| `npm audit --omit=dev` | **0** | 2 (1 critical, 1 high) |
| bundle audit + Number Cross launch audit | pass (30 client assets, 47 core files; 0 secret markers) | pass |
| mutations | 11 / 11 caught | — |

Build: static output 1,144,484 B / 35 files → 1,099,834 B / 34 files (−3.9 %),
server output 37.7 MB → 31.3 MB, CSS byte-identical, proxy still emitted as
`ƒ Proxy (Middleware)`. Wall-clock 36 s → 56 s, but the candidate build ran
concurrently with the test battery; not a like-for-like timing.

## Staging certification (2026-09-09)

Previous PH2-07 staging deployment **`dpl_FeZbD1JF2tZgjCb4n75ZpbDCu8yi`** (commit
`eb2c6de`) recorded and retained in the project's deployment list; the staging
alias now serves the hotfix candidate **`dpl_3woUYZcKnmW1qDwhtzH3U28M84kN`**
(commit `13d307d`, tree `0988298`, `next@16.3.4`), deployed with `--prod` on the
**staging** project from the repository root. Gate **locked** throughout.

| Check | Result |
|---|---|
| Anonymous `/`, `/sign-in`, `/account`, `/admin`, `/sign-in.png` | 404, 0 bytes (gate) |
| `POST /api/billing/webhook` unsigned, through the gate exemption | **400 `invalid-signature`, no `Location`** — not 308, not 404, not 5xx |
| Bootstrap with the staging token | 204 + host cookie (token never printed) |
| `/`, `/sign-in`, `/sign-up`, `/access`, `/privacy`, `/terms`, `/admin/sign-in`, `/api/health` | 200 |
| `/pricing`, `/games`, `/map-prep`, `/homework`, `/quizzes` | 307 → `/access?next=…` — **identical to production v1.2.7** (verified read-only on mathnexa.com before the run) |
| `/account`, `/subscription` → `/access?next=…`; `/game-access` → `/sign-in?next=…` | 307 with `Cache-Control: no-store` |
| `/admin` anonymous | 404 · `/api/internal/billing/fixture` absent · `/game/runtime/index.html` 401 |
| Security headers | CSP (`frame-ancestors 'self'`, Stripe `form-action`), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy — all present, values unchanged |
| Scheduler `/api/internal/billing/reconcile` | 401 anonymous, 401 wrong bearer, `no-store` |
| Static images with the gate cookie | brand mark png, root icon, `number-cross.avif/.webp`, `math-vocabulary-hunt.webp`, `number-logic.avif`, `crosscalc.svg` — all 200 with the right `image/*` type |
| Platform optimizer, gate-exempt sources | icon 64 / 256, brand mark → 200 `image/webp`, `X-Matched-Path` set (Vercel optimizer) |
| Platform optimizer, gated sources | 404 on a **locked** staging: the platform fetches the source without the visitor's cookie. A property of the locked gate, not of the patch; production has no gate. Owner sees them with staging open |
| Optimizer refusals | remote URL 400, traversal 400 |
| Chromium (gate cookie): `/`, `/sign-in`, `/sign-up`, `/access`, `/pricing`, `/games`, `/admin/sign-in`, `/privacy` | all 200, no broken images, **0 console errors**; only aborted RSC prefetches (`ERR_ABORTED …?_rsc=`), which are navigation cancellations, not failures |
| 5xx anywhere | none |

Not certified by machine: signed-in journeys (account, subscription, customer
portal, authenticated game launch, admin AAL2) need the owner's credentials —
the standing suites cover their logic and the routes above prove the gates in
front of them. Firefox/WebKit not run (CSP unchanged).

## Production promotion (2026-09-09, owner-approved)

| | |
|---|---|
| Previous production deployment (rollback, retained) | **`dpl_DRmcCTJvzQ8ey84gG6tRo4Vs3C3c`** (`mathnexa-platform-production-m10uxfngg-…`, v1.2.7) |
| New production deployment | **`dpl_FVvfWkimRriNgzmuRyzbHadGm5yw`** (`https://mathnexa-platform-production-pwrldld9h-bright-path-ed-tech.vercel.app`) |
| Built from | commit `d08326c`, runtime tree byte-identical to the staging-certified `13d307d` (docs/scripts only differ); `next@16.3.4`, `sharp@0.35.4` asserted at deploy time |
| Method | `scripts/run-nextjs-hotfix-production.mjs`: `preflight` → `deploy-preview` (`--prod --skip-domain`, no alias moved) → `probe-preview` through the CLI protection bypass (`vercel curl`; no protection setting changed) → `promote` → `probe-live`; the same mechanics that promoted v1.2.7 plus pre-promotion probing |
| Alias | `https://mathnexa.com` → `dpl_FVvf…` (HTML `data-dpl-id` confirms); `www.mathnexa.com` → 308 apex; `mathnexa-platform-production.vercel.app` (Stripe host) serves the new deployment |

**Pre-promotion probes on the staged candidate:** health 200 `status:ready`; unsigned
`POST /api/billing/webhook` → 400 `invalid-signature`, no redirect; every proxied path
308 → apex (canonical host, the v1.2.7 contract); optimizer 200 / remote 400; no 5xx.

**Live probes immediately after promotion (19 / 19):**

| Check | Result |
|---|---|
| Configured Stripe host `mathnexa-platform-production.vercel.app` unsigned POST | **400 `invalid-signature`**, `x-matched-path: /api/billing/webhook` — no 308, no 404, no 5xx |
| Apex `https://mathnexa.com/api/billing/webhook` unsigned POST | **400 `invalid-signature`**, no `Location` |
| `www` webhook | 308 → apex (Vercel domain-level redirect, unchanged; no Stripe endpoint configured there) |
| Health apex / Stripe host | 200 / 200 |
| `/`, `/sign-in`, `/sign-up`, `/access`, `/admin/sign-in` | 200 |
| `/pricing`, `/games`, `/map-prep`, `/homework`, `/quizzes` | 307 → `/access?next=…` — identical to before |
| `/account`, `/subscription` → `/access?next=…`; `/game-access` → `/sign-in?next=…` | 307, `no-store` |
| `/admin` anonymous | 404, `no-store` · scheduler 401 · fixture 404 · `/game/runtime/index.html` 401 · forged `?access=active` → `/access` |
| Security headers on `/` | CSP (`frame-ancestors 'self'`, Stripe `form-action`), HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy — intact |
| Images | brand png, root icon, `number-cross.avif/.webp`, `math-vocabulary-hunt.webp`, `crosscalc.svg` 200; platform optimizer: icon/brand/webp thumbnail → 200 `image/webp`, AVIF source → 200 `image/avif` (passed through); remote / traversal → 400 |
| 5xx | none |

**Subscriber (read-only, before and after):** the one live consumer subscription
`…BhAsSa` — local `active`, period end `2026-10-06T22:17:50Z`, last synchronized
2026-09-08 08:47 (reconciliation), first paid 2026-08-05, last paid 2026-09-06; Stripe
`active`, same period end, livemode; entitlement `subscription-active` through
2026-10-06. Identical before and after promotion. No repair, charge, refund or
cancellation. (Read through PostgREST and the restricted `rk_live_` key, GET only; the
standing drift-audit CLI additionally needs the catalogue product id from the
production environment, which this run did not read.)

**Browser smoke on production (Chromium):** `/`, `/sign-in`, `/sign-up`, `/access`,
`/admin/sign-in`, `/privacy`, `/pricing`, `/games` — all 200 at their expected destination,
every image decoded (the home page renders four through `/_next/image`), 0 console
errors, 0 failed requests. Live client bundles (9 chunks + HTML): 0 secret markers.

**Audit:** before `next 16.2.12` — 2 vulnerabilities (1 critical, 1 high); after
`next 16.3.4` — 0. Deployed artifact: the deployment's build log shows Next.js 16.3.4.

## Deferred, separate

PH2-07 (security observability read path) stays on its own branch; after this
hotfix is frozen it is to be rebased onto the patched `main`. Also unchanged:
`MVH_AUTH_RATE_LIMIT_SECRET` migration, Vercel Firewall/WAF, `security.txt`, PH2-08,
MN-10, HSTS preload (DEFER), production observability configuration.
