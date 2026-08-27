# MathNexa Premium Experience Audit (V1.2)

Baseline: `v1.1.1` (`699bbed`), branch `feature/mathnexa-premium-web-experience-v1.2`.
Method: three parallel read-only audits (routes/products, Safari/SEO reliability, copy/UX) over
`apps/platform-web`, plus live probes of https://mathnexa.com/, its redirect variants, legacy
Vercel hostnames, and WebKit/private-mode rendering. Status marks: **[FIXED]** in this branch,
**[OWNER]** needs an owner decision/action, **[DEFERRED]** documented, intentionally not done now.

## P0 — Broken / blocking

- **No `error.tsx` / `not-found.tsx` anywhere.** Server errors and dead links rendered the
  unbranded framework screen — indistinguishable from "the site did not open". **[FIXED]**
  (branded `app/error.tsx`, `app/not-found.tsx`).
- **Math Vocabulary Hunt was a navigational dead end.** The most-promoted game (`/play` →
  canonical runtime HTML) had no way back to MathNexa; all other games have Back to Games.
  **[FIXED]** — the canonical enhancement injects a styled, fixed Back to Games link
  (safe-area, focus-visible, forced-colors, print handled).
- **Google → Safari "site does not open" report.** Root-cause work in Phase 2 below.

## P1 — High-impact UX / reliability

- **No canonical URL, no `metadataBase`, anywhere.** Google may elect `www` or a
  `*.vercel.app` host as canonical; `mathnexa-platform-production.vercel.app` serves the whole
  site as a 200 duplicate; legacy `mathnexa-production.vercel.app` now 503s (a stale indexed
  result that "does not open"). **[FIXED]** — `metadataBase` + per-route canonical + platform-mode
  host normalization (www/*.vercel.app → apex 308, only when the deployment's configured origin
  is the apex). **[OWNER]** delete or park the dead `mathnexa-production` Vercel project.
- **Homepage serialized on 4+ un-deduped, un-timed Supabase round trips**
  (`force-dynamic`; `getGameAccessView()` ran twice; notices + catalog unbounded). A cold
  provider held first paint hostage. **[FIXED]** — `React.cache()` request-dedupe; notices and
  catalog time-boxed (3–4 s) failing open to their empty states. Auth reads untouched.
- **Sitemap listed redirecting URLs** (`/cancellation`, `/refunds` 307 for crawlers).
  **[FIXED]** — sitemap lists only directly reachable pages.
- **Nav active state never rendered** — the `a[aria-current="page"]` styling existed but no
  caller computed `current`. **[FIXED]** (client `PrimaryNav`).
- **Commercial terms written three times with drift** (pricing bullets ≠ subscription bullets ≠
  consent checkboxes). **[FIXED]** — one `SubscriptionTermsList` source; consent checkboxes stay
  as the deliberate affirmative surface.
- **`/games` promised "Four teacher-ready games" above a dynamic, possibly-empty grid.**
  **[FIXED]** — honest count-free copy; "Retry games" → "Refresh".
- **Game detail buried gameplay** under eyebrow/h1/description/h2/security note. **[FIXED]** —
  back link + compact title on top, frame next, notes demoted below.
- **`role="alert"` on informational page-load notices** interrupted screen readers everywhere.
  **[FIXED]** — live notices are polite `status`; only danger stays `alert`.
- **`/subscription` linked to itself** from its own status block; "Stable billing-management
  route" exposed release-engineering jargon. **[FIXED]** (suppressed self-link; "Manage billing
  (backup link)").
- **Staging-access gate returns a null-body 404** (blank page) when armed, on a session cookie
  Safari drops on quit. Not armed on production (verified env). **[OWNER]** awareness: it IS
  armed on `mathnexa-platform-staging` — owner review needs the bootstrap step.

## P2 — Polish

- Undefined tokens referenced (`--space-14`, `--color-ink`). **[FIXED]** — both defined.
- Duplicate hero copy / long paragraphs on homepage, homework/quizzes heroes, sign-up (same
  prohibition twice), authorized-code panel with zero context, update-password missing the
  password rule shown at sign-up. **[FIXED]** (copy tightened; behavior untouched).
- Library card CTA cluster ("Preview details / Download Homework PDF / Download answer key /
  Download unavailable"). **[FIXED]** — Details / Download PDF / Answer key / "PDF not yet
  published".
- Proof section floated in a half-empty row. **[FIXED]** — heading beside list.
- AVIF siblings exist for homepage art but only the games catalog uses `<picture>`.
  **[DEFERRED]** — `next/image` serves WebP; wiring AVIF into the constellation is an
  incremental byte win.
- ~half of font sizes bypass the type scale (23/48 in platform-pages.css…). **[DEFERRED]** —
  new premium.css uses tokens throughout; retro-tokenizing 2,600 legacy lines is churn without
  visual change. `.page-header` owned by two stylesheets — **[DEFERRED]** same reason.
- Four back-link visual treatments across game bundles. **[DEFERRED]** — bundles are vendored
  game builds; the wrapper-level MVH link now matches the platform language, and unifying the
  in-bundle pills means rebuilding shipped games.

## P3 — Optional

- Four names for `/account` ("My Account", "Your account", "Account", `/my-account`).
  **[DEFERRED]** (nav label consistency only; no route changes).
- Music-credit markup duplicated in three game documents. **[DEFERRED]**.
- Minified one-line pages make copy edits error-prone. **[DEFERRED]**.

## Phase 2 — Safari / MacBook findings (full detail)

Verified live: apex 200 with HSTS; http→https 308; www→apex 308; robots/sitemap 200; WebKit
renders (normal, Google-referrer, private-mode storage-throwing contexts) with zero console
errors; no service worker; no third-party scripts; no hydration-blocking patterns; storage
access is try/catch-wrapped inside game bundles only. The credible failure paths were all
**stale/duplicate hosts** (P1 canonical work above) plus the **armed staging gate's blank 404**
on the staging host. Browserslist is not pinned (Next 16 default Safari 16.4+): SSR HTML still
paints on older Safari; pinning lower is a deliberate **[DEFERRED]** trade (bundle growth vs.
already-degrading-gracefully pages).

## Creative direction implemented

Deep-navy ink (#071525) with restrained turquoise (#20CFE3) / pink (#FF4F9A) accents — bright
values only on dark surfaces, `-ink` derivatives for light-surface contrast. Signature hero:
the **learning constellation** — the real product thumbnails as linked nodes (Engage · Prepare ·
Practice · Check) on a navy field, turquoise paths drawing once. Motion: one-shot entrance
(≤700 ms), one-shot scroll reveals (progressive enhancement — content visible without JS),
hover/focus depth only. Infinite animations in first-party chrome: **one** (the pre-existing
button spinner, reduced-motion-neutralized). Premium footer with product/account/legal columns,
author attribution (Desmond Quayson), clickable contact, copyright.
