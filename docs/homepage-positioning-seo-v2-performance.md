# MathNexa homepage refinement + speed V2

Branch `feature/homepage-refinement-speed-v2` off `main` = `cb465c5` (the v1.2.9 release lineage). Staging only. Production stays `dpl_ZG6MgsFNiibDQjfDqJDEEVrWMbmv` (runtime `9e54cf7`) until the owner approves; MAP Prep / ShowMe untouched. Not merged, not tagged.

## 1. Owner requests

1. Remove the homepage "Coming soon / Praxis" block entirely (no heading, no trademark paragraph, no empty wrapper). Done: the section, its component and its CSS are gone; the hero is followed directly by the page end. `/about` still carries the future middle-school / Praxis note with the ETS non-affiliation sentence (reported separately below; owner decides later).
2. Homepage meta description = the owner's exact sentence, identical to the visible hero description, for `description`, `og:description` and `twitter:description`. Title unchanged.
3. Make every product click feel fast, especially Online Math Prep. Measured first, then fixed.

## 2. Google description

- meta description / og:description / twitter:description (all identical): `Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform.`
- title (unchanged): `MathNexa | Online Math Prep, Homework PDFs, Quiz PDFs & Worksheets`
- The same sentence is the visible hero description, so Google's snippet source and the page agree.
- Snippet reality: changing metadata does not change the search result immediately. Google must recrawl the homepage, and it may still choose visible page text over the meta description. After a later approved production deployment the owner should: Search Console → URL Inspection → `https://mathnexa.com/` → Test Live URL (optional) → Request Indexing; then Indexing → Pages to monitor. No immediate change is promised.

## 3. Measurement method

- **Production, anonymous visitor** (what a signed-out teacher feels; the signed-in owner journey cannot be measured on production without the owner's credentials): Playwright click-to-usable timing on `https://mathnexa.com`, medians of 2 runs, cold = fresh browser context (no cache), warm = second click in the same context, Chromium desktop, Chromium mobile (Pixel 7 profile), WebKit. The click is issued after the homepage entry animation has finished; an earlier pass that clicked during the animation over-counted card journeys by ~1–1.5 s.
- **Production, ShowMe direct load**: `https://showme.mathnexa.com/` cold and warm, three engines, medians of 3.
- **Entitled journey** (the owner's experience): the project's Phase 9 environment (local Supabase, `next dev`, an entitled fixture account, a MAP Prep destination published through the real CMS functions and pointing at the production ShowMe origin). Absolute numbers are local-dev numbers (dev compilation, ~5 ms database hops instead of ~50–100 ms), so the honest comparison is hop counts, duplicate work and the shape of the journey; the new `e2e/phase9/navigation-performance.spec.ts` prints medians and enforces the structure.
- **Homepage weight**: resource timing on production.

## 4. Root cause of "Online Math Prep feels slow"

Journey before (entitled click, measured locally, identical code to production `9e54cf7`):

| Step | Request | What ran | Result |
| --- | --- | --- | --- |
| 1 | RSC fetch `/map-prep` (client router) | session + entitlement (2–4 Supabase calls) **and** CMS destination lookup (2 calls) | 200 at ~75 ms, payload = redirect to `/map-prep/launch` |
| 2 | RSC fetch `/map-prep/launch` | session + entitlement again, CMS lookup again, **awaited** analytics RPC | Route Handler answers 303 to `https://showme.mathnexa.com/`; the browser's fetch follows the cross-origin redirect and fails (CORS) → "Failed to fetch RSC payload… Falling back to browser navigation" |
| 3 | RSC fetch `/map-prep/launch` (retry) | same again | same failure |
| 4 | full navigation `/map-prep/launch` | session + entitlement a third time, CMS lookup a third time, analytics a **second** time | 303 at ~1 176 ms |
| 5 | `https://showme.mathnexa.com/` | ShowMe cold load | usable at ~1 827 ms (median) |

So the MathNexa side cost four hops, three server executions, roughly ten sequential Supabase round trips and a duplicated launch counter before ShowMe even started, purely because the internal redirect hop landed on a Route Handler whose external 303 a client-side navigation cannot follow. ShowMe itself is fast (below).

Journey after:

| Step | Request | What runs | Result |
| --- | --- | --- | --- |
| 1 | RSC fetch `/map-prep` | entitlement decision (unchanged, server-side) **in parallel with** the destination lookup (now cached for 60 s per instance) | 200 at ~75 ms, payload = external redirect → the router performs `location.href` to ShowMe |
| 2 | `https://showme.mathnexa.com/` | ShowMe load | usable |

The launch counter is recorded with `after()` once the redirect has been sent (never awaited on the user path). `/map-prep/launch` still exists for direct hits, bookmarks and the hosted contract, with the same parallelism and `after()`.

Local strict spec (3 runs, entitled): hops 4 → **1**, duplicate navigation requests 3 → **0**, RSC fetch failures 2 per click → **0**, click→usable median 1 827 ms → 1 672 ms locally (the remaining time is the real ShowMe network leg from this machine; the MathNexa server side dropped from ~1 176 ms to ~75 ms before the browser leaves for ShowMe).

## 5. Latency classification (owner's list)

| Class | Finding | Fix |
| --- | --- | --- |
| A. client navigation | fine; card presses now have an `:active` state and every product route paints "Opening …" instantly via a loading boundary | loading.tsx for /games, /map-prep, /homework, /quizzes, /subscription, /account |
| B. server rendering | product pages ran access then data serially | access + public data now in parallel (games, homework, quizzes, map-prep) |
| C. auth/session | 1 Supabase auth call per server execution; executions per click cut from 3 to 1 for Online Math Prep | fewer executions, decision itself unchanged |
| D. entitlement | same as C | unchanged, still server-side |
| E. CMS destination | 2 Supabase queries per execution, executed 3× per click | 60 s in-memory TTL cache (`createTtlCache`), invalidated on admin publish on the same instance; other instances converge within a minute |
| F. analytics | awaited RPC on the user path, executed twice per click | `after()` on both the page and the launch route; recorded once |
| G. redirect chain | page → launch → ShowMe, with a failed RSC hop | page → ShowMe |
| H. cross-origin connection | ShowMe cold connect+TLS ≈ 120–140 ms | preconnect **measured, no gain** (see §7), not added |
| I. ShowMe HTML | TTFB ≈ 110 ms cold, 35 ms warm | ShowMe untouched |
| J. ShowMe JS/CSS/fonts | 164 KB JS, 12 KB CSS, 0 fonts, 12 KB images | ShowMe untouched |
| K. hydration | not a factor (heading visible at DCL) | – |
| L. unnecessary blocking requests | 17 idle RSC prefetches per homepage view, every product/account route fetched twice | footer copies of nav routes opt out of prefetch (`prefetch={false}` on 6 links); nav and cards keep default prefetch, now with loading boundaries to prefetch |

## 6. Production baseline (anonymous, before) — click → meaningful heading, medians

| Destination | Chromium cold | Chromium warm | Mobile cold | Mobile warm | WebKit cold | WebKit warm | Final |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Math Games card | 378 | 365 | 1858* | 362 | 817 | 669 | `/access?next=/games` |
| Online Math Prep card | 722 | 367 | 377 | 372 | 729 | 686 | `/access?next=/map-prep` |
| Homework PDFs card | 991 | 363 | 380 | 348 | 8573** | 8573** | `/access?next=/homework` |
| Quiz PDFs card | 454 | 362 | 354 | 360 | 684 | 580 | `/access?next=/quizzes` |
| Nav → My Account | 419 | 352 | 363 | 345 | 873 | 8637** | `/access?next=/account` |
| Nav → Subscription | 365 | 385 | 489 | 361 | 1224 | 664 | `/access?next=/subscription` |

TTFB ≈ 100–145 ms cold, ≈ 30–40 ms warm on every route. \* one slow run of two; \*\* WebKit harness stalls on this Windows build (identical 8.5 s in two runs, other WebKit rows normal); treated as harness noise, not site behaviour. Anonymous journeys are already inside the 800 ms desktop / 1.2 s mobile targets; the owner's slow clicks are the entitled journeys above.

## 7. ShowMe leg and connection warming

| | click→heading | DNS | connect | TLS | TTFB | DCL | load |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Chromium cold | 379 | 1 | 77 | 66 | 113 | 254 | 340 |
| Chromium warm | 174 | 0 | 0 | 0 | 35 | 60 | 107 |
| Mobile cold | 346 | 1 | 64 | 53 | 94 | 231 | 323 |
| WebKit cold | 289 | 0 | 0 | 0 | 33 | 120 | 243 |

Preconnect A/B (real intermediate page with `<link rel="preconnect">` + `dns-prefetch`, 5 runs, Chromium): plain 404 ms / connect 69 / TLS 58 vs preconnect 403 ms / connect 66 / TLS 54. A top-level cross-site navigation does not reuse the pre-opened socket, so preconnect gives nothing measurable and was **not** added.

## 8. Homepage weight (production)

JS 150 KB, CSS 24 KB, fonts 0 files / 0 KB (system font stacks), hero images as before; no long-task or hydration problem observed (heading visible at DOMContentLoaded). Not changed beyond the prefetch trim.

## 9. Staging (filled after deployment)

See §10 below once the staging deployment and its measurements exist.
