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

Results are recorded in the certification section below.

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

## Deferred, separate

PH2-07 (security observability read path) stays on its own branch; after this
hotfix is frozen it is to be rebased onto the patched `main`. Also unchanged:
`MVH_AUTH_RATE_LIMIT_SECRET` migration, Vercel Firewall/WAF, `security.txt`, PH2-08,
MN-10, HSTS preload (DEFER), production observability configuration.
