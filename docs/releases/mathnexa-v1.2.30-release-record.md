# MathNexa v1.2.30 — SEO metadata, structured data, plainer pages and smaller phone images

Released 2026-10-31 (UTC) under explicit owner approval ("Approve release", given after the staging review of
`7f9cffa`). It ships the staging candidate `7f9cffa` unchanged.

The release follows a SEO, AI-discoverability, readability and mobile-image audit of v1.2.29. The full audit, the
staging evidence and the decisions left to the owner are in the review page
(https://claude.ai/artifact/1RteL4tDXizi5td4oGHMWL, private to the owner). Sign In, Sign Out, Authorize Code,
authentication, pricing, Stripe, free trials, entitlements, Supabase, Super Admin, game mechanics, Online Math Prep,
Homework and Quiz PDF generation, the Worksheet Generator, databases, API contracts, environment variables, the
three-play worked example with its Stop control, Featured games and ShowMe Math Lab are unchanged.

| | |
| --- | --- |
| Version | `v1.2.30`. Production was built from `7f9cffa` (`7f9cffac8990522616707cbd484e69252ca34aa5`, tree `31e7651ca8ea0db5614a11b24eaa359aa6827e62`). `/api/health` reports build `7f9cffa…`. |
| Tag | Annotated tag `v1.2.30` ("MathNexa v1.2.30: SEO metadata, structured data, plainer pages and smaller phone images") points at `7f9cffa`, the production build. Created and pushed after live verification. |
| Branch | `feature/seo-discoverability-mobile-images` from `main` `8703f33` (v1.2.29 runtime `a762031` plus its record): `96f6a05`, `ab04ac5`, `191c1d3`, `59ab929` and `7f9cffa` (phase 9 baselines only). |
| Merge | `main` was still `8703f33`, so origin `main` was fast-forwarded `8703f33..7f9cffa` with no merge commit and no force. This record is the next commit on `main`. The runtime on `main` equals the production build. |
| Certified runtime | `7f9cffa`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-v1-2-30`, tracked files only, `node_modules` junction). |
| Staging | `dpl_3Q5T9KA5iEGcXerM2b2mqVymbyHC` (`https://mathnexa-platform-staging-qgfi59636-bright-path-ed-tech.vercel.app`), build `7f9cffa`, compared with v1.2.29 on staging (`dpl_CaaihVwCwHQJpLnxZg25oQX1ZddU`). Unchanged between the owner's approval and the release. |
| Production candidate | `dpl_7Jk4bT58rCjiJ2VLZyY6sqKszf5M` (`https://mathnexa-platform-production-9afgcbv86-bright-path-ed-tech.vercel.app`), built from `7f9cffa` with `--prod --skip-domain` |
| Production runtime | `dpl_7Jk4bT58rCjiJ2VLZyY6sqKszf5M`, `production-platform`, payments `live`. Promoted 2026-10-31 20:13:30–20:13:55 UTC. |
| Rollback runtime | `dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq` (v1.2.29, build `a762031`), retained and Ready. `dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX` (v1.2.28) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged (`package.json`, the lockfile and `next.config.mjs` are identical to v1.2.29) |

## What changed for visitors and search engines

- **Structured data.** The homepage carries one JSON-LD graph: an `OnlineBusiness` (MathNexa, mathnexa.com, the
  512 px app icon as logo, the homepage lede as description, the `/support` address as a customer-support contact)
  and a `WebSite` linked to it. No address, telephone, hours, prices, ratings, reviews, awards or profiles; no
  LocalBusiness, FAQPage, BreadcrumbList or SoftwareApplication. Schema.org validator: 0 errors, 0 warnings.
- **Metadata.** About, Help, Support, Privacy, Terms, Accessibility and Status each have their own meta description
  (all seven used the homepage's before) and clearer titles where the page heading says more. Every public page has
  `og:url`, and every page has the app icon as `og:image` / `twitter:image` with a "summary" card. The homepage title
  and description, canonical URLs, robots directives, `robots.txt` and the sitemap are unchanged.
- **Plainer copy** on About (Online Math Prep first; the free Math Tug of War; a "How to get started" list with the
  24-hour trial and $5.99 USD a month taken from the billing policy), Help, Support and Accessibility. Same facts;
  legal pages were not reworded.
- **Smaller phone and tablet images.** The homepage shelf images' `sizes` now match the layout, so the three small
  thumbnails no longer download 2.7–4.4× the pixels they need. Same images, same art, same layout.
- **Footer links** "About MathNexa" (Products) and "Help" (Account); both pages previously had no internal link.

Files (17 code and test files and 3 phase 9 baseline images): `apps/platform-web/lib/seo/structured-data.ts` (+test),
`lib/seo/public-pages.ts` (+test), `components/seo/json-ld.tsx`, `app/layout.tsx`, `app/page.tsx`,
`app/{about,help,support,privacy,terms,accessibility,status}/page.tsx`,
`components/public/teacher-first-home.tsx` (+test), `components/site-footer.tsx`, and
`e2e/phase9/teacher-first-access-flow.spec.ts-snapshots/teacher-first-home-{mobile,mobile-390,tablet}-win32.png`.

Tested and not shipped: AVIF output (35% smaller, but it visibly smoothed the fine background of the Math Vocabulary
Hunt art; local branch `backup/seo-candidate-with-avif-271a82b`).

## Release gates (on `59ab929`, 2026-10-31 18:27–19:00 UTC, local Supabase; phase 9 rerun on `7f9cffa`)

| Check | Result |
| --- | --- |
| Change control vs `main` `8703f33` | 17 files on the allowed list; nothing in auth, billing, Stripe, entitlements, Supabase, admin, games, Online Math Prep, PDFs, worksheets, API, proxy, env or dependencies |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 947 passed, 1 skipped (12 more than v1.2.29) |
| `test:security`, protection bypass | 321/321, 7/7; platform bundle and Number Cross audits pass |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Functional facts (sign-in, sign-out, Authorize Code, trial and checkout entry, product reach, navigation) | Identical to v1.2.29 except the footer link lists, which gain exactly the two new links |
| Phase 9 | 17/17 on `7f9cffa` (one visual test on `59ab929` failed only on the taller phone footer; three baselines regenerated and checked) |
| School access (Authorize Code) / Tug of War free access | 21/21 / 8/8 |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |

The functional harness's screenshot tests report the same pre-existing homepage-vs-old-baseline failures as
v1.2.26–v1.2.29; above the footer, all 70 protected-page views are pixel-identical to the approved baselines.

## Staging verification (`7f9cffa`, read-only mirrors of both staging builds)

| Check | Result |
| --- | --- |
| Signed-out pages vs v1.2.29 (35 paths) | Status, redirect, head directives, body, header and form controls identical, apart from the intended head and body changes on home, About, Help, Support, Accessibility (head only on Privacy, Terms, Status); footer +2 links |
| Homepage images, 5 throttled cold loads per device | Image bytes −34% (Moto G Power), −28% (390 px phone), −36% (768 px tablet), −27% (desktop); all bytes −9 to −16%. FCP, LCP (text), TBT unchanged within noise; CLS 0 |
| axe (WCAG 2.0–2.2 A/AA), 8 public pages at 1440 and 390 px; reflow at 320/390 px with 100%/200% text | 0 violations; 0/32 overflow |
| Three plays and Stop animation, Chromium and WebKit | All pass |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-v1-2-30` with these values:

- `RELEASE_CERTIFIED_RUNTIME=7f9cffa`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq`
- `RELEASE_PURPOSE=v1.2.30-seo-discoverability-mobile-images`

Logs are in `qa-artifacts/seo-audit/release/` (git-ignored). The evidence JSONs are under `%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 20:08:41–20:08:48 | PASS. The apex served `dpl_DQD28S6CXeo31f…` (the rollback target), retained. |
| probe-live (before) | 20:08:50–20:09:03 | PASS, 22/22 |
| deploy-preview | 20:09:21–20:11:18 | PASS. `dpl_7Jk4bT58rCji…` is Ready, protected and holds no domain. Next 16.4.2, sharp 0.35.5. |
| probe-preview | 20:11:51–20:13:01 | PASS, 7/7. Health reports build `7f9cffa` and payments live. The webhook answers 400. The scheduler answers 401. Every other path 308s to the apex. No 5xx. |
| promote | 20:13:30–20:13:55 | PASS. The alias moved from `dpl_DQD28S6CXeo31f…` to `dpl_7Jk4bT58rCji…`. |
| probe-live | 20:13:55–20:14:08 | PASS, 22/22 |

## Live production verification (2026-10-31 from 20:14 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `7f9cffac8990522616707cbd484e69252ca34aa5`, `production-platform`, payments `live`. The apex serves `dpl_7Jk4bT58rCjiJ2VLZyY6sqKszf5M`. |
| Search output | One JSON-LD graph on the homepage, with the `support@mathnexa.com` contact point; 8 distinct meta descriptions on the 8 indexable pages; `og:image` on every public page; `robots.txt` and `sitemap.xml` byte-identical to v1.2.29; footer links to `/about` and `/help`; every protected route keeps its redirect and noindex. |
| Pages (26 routes at 1440 and 390 px) vs a capture of v1.2.29 just before the release | 52/52 captures keep their status, final URL, form controls, console output and overflow. Outside About, Help, Support and Accessibility (the reworded pages), visible text and links differ only by the two footer links, and page height only by the footer (+96 px on phones, unchanged on desktop). |
| Authorize Code card, hero buttons, Featured games | Hero buttons and Featured games identical. The Authorize Code card is identical except the per-build server-action id and key. |
| Homepage images, real network (one unthrottled load per device) | Image bytes 127.5 → 83.4 KB (Moto G Power profile), 190.8 → 138.1 KB (390 px phone), 225.1 → 144.1 KB (768 px tablet), 114.2 → 83.4 KB (desktop) |
| Three plays on mathnexa.com, Chromium (1440, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | 3 plays (passes ≈ 4320 ms, rests ≈ 3010 ms), then still for 16.3–17.8 s with 0 px changed and no 4th play; interruptions, focus hold, answer and reduced motion pass. All checks pass. |
| Stop animation on mathnexa.com, Chromium (1440, 1024, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | Not in the server HTML; shown while plays remain; pointer and keyboard Stop work with focus moved to the board; gone after the third play; none with reduced motion; inside the hero at 200% text. axe 0 violations at 1440, 390 and 320 px with the button showing. All checks pass. |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4 subscriptions, all live mode (3 active, 1 canceled), Stripe and database matching. Identical to the read before the release. |
| Runtime logs for `dpl_7Jk4…` since promotion | 5xx, error, fatal: 0, 0, 0. The only 4xx responses are the verification probes' expected 400, 401 and 404 answers. |
| ShowMe Math Lab | `showme.mathnexa.com` unchanged: ETag `"7e686cff57eb2b157144fa0128084aab"`, the same before and after. No ShowMe deployment. |
| Deployments | The production project gained exactly one deployment (`dpl_7Jk4…`). |

## Known limitations (not verified by this release)

- **No field data.** Google has no Core Web Vitals field data for mathnexa.com yet; all performance numbers are lab
  measurements.
- **Search and AI results** are not guaranteed by structured data or metadata.
- **Rich Results Test** was not run (it asks for a Google sign-in); the markup passed the Schema.org validator.
- **Firefox.** It cannot run on the review machine (Windows App Control); the owner checks it.
- **Signed-in production use.** Nothing here signs in to production. Signed-in behaviour was proven on the same
  commit locally (functional facts identical to v1.2.29 apart from the footer). The owner's manual checks remain.
- **Pre-existing:** at 1024 px with 200% text the homepage scrolls sideways by 58 px (identical in v1.2.29).
- **Owner decisions still open:** public product pages, one public contact address, two outdated sentences in Terms
  and Privacy, and the AI-crawler policy (see the review page).

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-30
$env:RELEASE_CERTIFIED_RUNTIME = '7f9cffa'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq
```

Fallback: `npx vercel@59 promote dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq --scope bright-path-ed-tech`. A rollback brings back
v1.2.29 (shared meta descriptions, no structured data, larger phone images, no footer links to About and Help). It
touches no data, billing or access rule.
