# MathNexa homepage positioning + SEO + Google 404 audit (v1)

Branch `feature/homepage-positioning-seo-v1` (off `origin/main` = `c0dbf9c`), runtime commit `9e54cf7`.
Staging only. Production (mathnexa.com) and MAP Prep / ShowMe are unchanged. Premium Conversion C1 is paused.

## 1. Business direction applied

- Primary identity: **online math prep for Grades 3–8** (plus math games, printable homework and quiz PDFs, worksheet generator).
- Missouri MAP: a **supported use case / alignment** inside Online Math Prep, not the identity. Nothing Missouri-related was removed from the product.
- Route paths, entitlement keys, CMS ids and the `map-prep` identifier are unchanged. Only user-visible words changed.

## 2. Live production capture (before, 2026-09-16, read-only)

| Field | Live value on mathnexa.com |
| --- | --- |
| `<title>` | `MathNexa \| Math Games, MAP Prep, Homework and Quizzes` |
| meta description | `Teacher-led math resources in one platform: interactive games, Missouri MAP Prep, image-rich homework PDFs, and classroom-ready quizzes.` |
| canonical | `https://mathnexa.com` |
| robots meta | `index, follow` |
| Open Graph / Twitter | same title + description as above; `og:site_name` MathNexa; `twitter:card` summary |
| eyebrow | Teacher-led classroom math resources |
| H1 | Make every math lesson clearer, more engaging, and ready to teach. |
| hero description | Games, Missouri MAP Prep, image-rich homework, and topic quizzes—one teacher-friendly platform. |
| supporting line | Built for teachers. Useful for families. Engaging for learners. |
| primary nav | Home · Games · MAP Prep · Homework · Quizzes · Subscription · My Account |
| product cards | Math Vocabulary Hunt (Engage · Games) · MAP Prep (Prepare) · Homework (Practice) · Topic Quizzes (Check) |
| connected-system line | One connected system: engage, prepare, practice, check. |
| footer products | Games · MAP Prep · Homework · Quizzes |
| structured data | none |
| `/about` (indexed, in sitemap) | still the account-free public-game copy: "Language practice for mathematical thinking … No account is required … Play Math Vocabulary Hunt" |

Source of truth confirmed in `apps/platform-web/components/public/teacher-first-home.tsx`, `app/page.tsx`, `app/layout.tsx`, `components/site-header.tsx`, `components/site-footer.tsx`, `lib/auth/access-intent.ts`.

## 3. New homepage copy (exact)

- **Eyebrow:** Teacher-led math resources
- **H1:** Make every math lesson clearer, more engaging, and ready to teach.
- **Hero description:** Math games, online math prep for Grades 3–8, Homework PDFs, Quiz PDFs, and a worksheet generator—all in one teacher-friendly platform.
- **Supporting line:** Built for teachers. Useful for families. Designed for classroom instruction, extra practice, and middle school math review.
- **Connected-system line:** One connected system: engage, learn, practice, assess. (smallest change: the verbs now match the card feature lines)

All strings live in `apps/platform-web/lib/seo/platform-positioning.ts` so the hero, nav, footer, access flow and metadata cannot drift apart.

## 4. Product naming

| Surface | OLD | NEW | URL retained |
| --- | --- | --- | --- |
| nav / footer / access heading | Games | Math Games | `/games` |
| nav / footer / access heading | MAP Prep | Online Math Prep | `/map-prep` |
| nav / footer / access heading | Homework | Homework PDFs | `/homework` |
| nav / footer / access heading | Quizzes | Quiz PDFs | `/quizzes` |
| homepage card | Math Vocabulary Hunt · Engage · Games | Math Games · Engage · Practice | `/games` (was `/play`, which itself 307s to `/access?next=/games`; the card now names the catalog, so it links to the catalog) |
| homepage card | MAP Prep · Prepare | Online Math Prep (Grades 3–8) · Learn · Practice · Review · Worksheet Generator | `/map-prep` |
| homepage card | Homework · Practice | Homework PDFs · Practice · Print | `/homework` |
| homepage card | Topic Quizzes · Check | Quiz PDFs · Assess · Print | `/quizzes` |
| access page | Continue to MAP Prep | Continue to Online Math Prep | `/access?next=/map-prep` |
| subscription notice | …includes Games, MAP Prep, Homework, and Quizzes. | …includes Math Games, Online Math Prep, Homework PDFs, and Quiz PDFs. | `/subscription` |
| page `<title>` | Games / MAP Prep / Homework / Quizzes | Math Games / Online Math Prep / Homework PDFs / Quiz PDFs | unchanged paths |
| `/map-prep` page (entitled, unconfigured) | "MAP Prep … MAP Prep is not configured" | "Online Math Prep … opens MathNexa's Grades 3–8 mathematics practice application: Learn, Practice, Review, and a worksheet generator. Includes practice aligned to Missouri MAP-style Grades 3–8 mathematics while also covering broadly useful grade-level math skills." / "Online Math Prep is not configured" | `/map-prep` |
| resource library H1 | Homework / Quizzes | Homework PDFs / Quiz PDFs | unchanged |

Not renamed (internal / owner-only): admin module labels ("MAP Prep destination"), analytics keys, `map-prep` route, entitlement and CMS identifiers, `PRODUCT_DESTINATIONS`.

## 5. Missouri MAP positioning

- Wording used (Online Math Prep page and About page): "Includes practice aligned to Missouri MAP-style Grades 3–8 mathematics while also covering broadly useful grade-level math skills."
- Verified against the product: the MAP Prep application (ShowMe) ships Grades 3–8 Learn, Practice, Review and the worksheet generator, aligned to Missouri standards.
- About page carries: "MathNexa is an independent product and is not affiliated with or endorsed by the Missouri Department of Elementary and Secondary Education." No DESE branding anywhere.

## 6. Praxis / middle-school message

- Location: a small "Coming soon" section **below the hero** (not inside it) on the homepage, and a matching "Coming soon" section on `/about`. The hero height is unchanged apart from the longer supporting line.
- Exact wording: "Middle School Math Review resources for educators, including content review useful when preparing for Praxis® Mathematics (5164)."
- Non-affiliation line shown with it: "Praxis® is a registered trademark of ETS. MathNexa is an independent product that is not affiliated with, sponsored by, or endorsed by ETS, and does not offer a Praxis preparation course."
- Tests assert the hero never mentions Praxis and that the roadmap never reads as an existing course.

## 7. SEO

| Field | New value |
| --- | --- |
| `<title>` | `MathNexa \| Online Math Prep, Homework PDFs, Quiz PDFs & Worksheets` (66 characters; Google may truncate after ~60, the owner-specified title was kept verbatim) |
| meta description | `MathNexa offers math games, online math prep for Grades 3–8, printable homework and quiz PDFs, and a worksheet generator for teachers and families.` (147 characters) |
| canonical | `https://mathnexa.com` (unchanged mechanism: `metadataBase` + `alternates.canonical: "./"`) |
| robots meta | `index, follow` (unchanged) |
| Open Graph | explicit `og:title`, `og:description` (same as above), `og:url` https://mathnexa.com, `og:site_name` MathNexa, `og:type` website |
| Twitter/X | `summary` card with the same title and description |
| root layout default description (other platform pages) | same new description |
| structured data | none existed; none added (nothing to contradict; no speculative Organization/Product/ratings). Candidate for a later, separate decision. |
| `/about` | rewritten in production-platform mode to the new positioning (it is indexed and listed in the sitemap); the public-site branch is untouched |
| 404 page | `app/not-found.tsx` now exports `robots: noindex, nofollow, noarchive, nocache` and title "Page not found"; verified in the staging production build (previously the 404 carried the layout's `index, follow` plus a self canonical) |

The same factual concepts (math games, online math prep for Grades 3–8, homework and quiz PDFs, worksheet generator) appear in the visible hero, so the snippet source is consistent.

## 8. 404 discovery audit (live mathnexa.com, read-only BFS crawl from `/` plus seeds)

Every link in the header, homepage, footer and every page reached from them resolves to 200 (product/account routes 307 → `/access?next=…` or `/sign-in?next=…` for anonymous crawlers, then 200). **No current internal link points to a 404 (no CASE A).** No renamed or deleted public routes exist in git history (`git log --diff-filter=DR` over `app/**/page.tsx` is empty; `/my-account` and `/pricing` already 307 to their replacements). **No CASE B redirects are needed.**

| URL | Status | Source | Classification | Action |
| --- | --- | --- | --- | --- |
| `/`, `/about`, `/help`, `/privacy`, `/terms`, `/accessibility`, `/support`, `/status` | 200, self canonical, index,follow | header/footer/sitemap | OK | none |
| `/games`, `/map-prep`, `/homework`, `/quizzes`, `/play`, `/subscription`, `/account`, `/map-prep/launch` | 307 → `/access?next=…` → 200 (noindex) | header/home/footer | OK (auth gate) | none; labels renamed, paths kept |
| `/cancellation`, `/refunds`, `/subscriber-management`, `/game-access` | 307 → `/sign-in?next=…` → 200 (noindex) | footer/help/support | OK (auth gate) | none (already excluded from sitemap) |
| `/my-account` | 307 → `/account` → `/access` | seed | OK (legacy alias already redirected) | none |
| `/pricing` | 307 → `/access?next=/subscription` | seed | OK (legacy alias already redirected) | none |
| `/resources`, `/content`, `/game`, `/checkout` | 404 (branded not-found) | seed only, never linked | CASE C (route directories with sub-routes only) | keep 404; now `noindex` instead of `index, follow` |
| `/pilot`, `/teacher`, `/admin` | 404 (proxy restricted routes, `X-Robots-Tag: noindex`) | seed only | CASE D (intentionally unavailable on the platform) | keep 404 |
| `/manifest.webmanifest`, `/icon.svg`, `/network-check` | 404 | seed only (ShowMe / school-network branch artefacts, never linked from mathnexa.com) | CASE C | keep 404 |
| `/sitemap.xml`, `/robots.txt`, `/api/health` | 200 | seed | OK | none |

Repository source and built output contain no internal href whose production destination 404s (all hrefs in the rendered public pages were crawled).

## 9. Google Search Console

- **Exact Search Console affected URL still requires opening the Indexing report.** The owner's screenshot shows the "Not found (404)" reason without the URL.
- The live crawl found no linked 404. The only candidates the site itself produces are the unlinked route-directory paths above (`/resources`, `/content`, `/game`, `/checkout`) and old ShowMe/Pages-era paths; any of these would be a legitimate 404 that Google should simply drop. Nothing here is claimed to be Google's reported URL.
- Manual steps after a later, owner-approved production deployment:
  1. URL Inspection → `https://mathnexa.com/` → Request indexing (title/description/homepage changed).
  2. Pages → Indexing report.
  3. Open the "Not found (404)" reason.
  4. Copy/export the affected URLs.
  5. For each URL: intentionally missing (CASE C/D → leave as 404) or a real page (fix the link / add a redirect only then).
  6. "Validate fix" only for URLs that genuinely should exist.
  7. Do not redirect unknown 404s to the homepage.

## 10. Sitemap

- Present at `/sitemap.xml` (7 URLs: `/`, `/about`, `/help`, `/privacy`, `/accessibility`, `/terms`, `/support`).
- Every URL returns 200 in one hop, self-canonical, `index, follow`. Product routes are correctly excluded (they redirect for anonymous crawlers). `/cancellation` and `/refunds` are correctly excluded (sign-in redirects).
- Result: **unchanged**. No 404, redirect-only, private or noindex URL is listed.

## 11. Robots

- `/robots.txt`: `Allow: /` with the private deny list (`/access`, auth, account, subscription, pricing, checkout, game-access, subscriber-management, admin, api) and `Sitemap: https://mathnexa.com/sitemap.xml`.
- Homepage and public marketing/product pages crawlable. Result: **unchanged, correct**.

## 12. Mobile

Checked at 320, 375, 390, 430, 768, 1024 and 1440 px (Chromium) and 390/768/1440 (WebKit): no horizontal overflow, one H1, hero readable. The narrow "Online Math Prep (Grades 3–8)" card previously wrapped its feature line raggedly (4 right-aligned lines at 1440); the caption on narrow nodes now stacks left-aligned with balanced title wrapping and feature phrases that never break mid-phrase ("Worksheet Generator" stays together). Below 360 px phrases may wrap. Navigation is the existing wrapping pill list (4 rows at 390 px with the longer labels).

## 13. Accessibility

axe-core (WCAG 2.0/2.1 A + AA) at every viewport: 0 violations. Exactly one H1; H2s: authorized-code form, "Coming soon", footer Products/Account/Legal. First Tab stop is the skip link with a visible 3 px outline. All links have accessible names; card link names read "Online Math Prep (Grades 3–8) Learn · Practice · Review · Worksheet Generator". No visual-only abbreviations.

## 14. Tests and checks

| Check | Result |
| --- | --- |
| `tsc --noEmit` (platform-web) | pass |
| eslint (changed files) | pass |
| vitest platform-web (full) | 589 passed, 1 failed = pre-existing Windows-only `canonical-assets` sha256 CRLF mismatch (fails identically on main; CI is the gate) |
| new `lib/seo/platform-positioning.test.ts` | title, description (≤160 chars), hierarchy, product names + retained paths, access labels, Missouri + Praxis wording, old phrase absent |
| updated `teacher-first-home.test.tsx` | one H1, new copy, old phrase and "MAP Prep" absent, cards + routes, roadmap outside hero, non-affiliation |
| updated `access-intent.test.ts` | destination labels |
| `npm run build` (production) | pass |
| e2e `e2e/phase9/teacher-first-access-flow.spec.ts` | strings updated to the new title/description/labels; **not run locally** (needs local Supabase/Docker, unavailable on this machine). Its `toHaveScreenshot` visual baselines will need regeneration on the next CI/local run because the homepage copy changed. |
| local production-rehearsal crawl (`next dev` + rehearsal env) | all checks pass |
| staging crawl through the gate (Chromium + WebKit) | all checks pass; `/api/health` build = `9e54cf7` |

## 15. Staging

- Project `mathnexa-platform-staging` (team bright-path-ed-tech), deployed from the clean worktree with `vercel deploy . --project mathnexa-platform-staging --prod --yes --env MVH_SOURCE_REVISION=9e54cf7…`.
- Previous staging deployment: `dpl_AXVR8P7dVCqZTbCEX3ryooGpqfCX` (main `c0dbf9c`).
- New staging deployment: `dpl_D5EXvXksnD9DMVGgDBgyYWx2w3XL` → alias `https://mathnexa-platform-staging.vercel.app` (Ready).
- Rollback: `vercel promote dpl_AXVR8P7dVCqZTbCEX3ryooGpqfCX --scope bright-path-ed-tech` (or `vercel rollback`).
- The staging alias keeps its app-level gate (404 / 0 bytes without the cookie); the owner uses the existing staging bootstrap step to review.
- Owner URLs: `/`, `/about`, `/games`, `/map-prep`, `/homework`, `/quizzes` (access-flow naming), `/definitely-not-a-page` (404), `/sitemap.xml`, `/robots.txt` on the staging alias.

## 16. Production safety

- MathNexa production: unchanged (`mathnexa.com` still serves `c0dbf9c`, old title).
- MAP Prep / ShowMe production: unchanged.
- No database migration, no Stripe change, no Supabase change, no entitlement change, no billing/AESM code touched.
- Not merged to main. No tag.

## 17. Owner staging PASS → final certification and production candidate (2026-09-16/17)

Owner reviewed staging `dpl_D5EXvXksnD9DMVGgDBgyYWx2w3XL` and passed it (wording, labels, worksheet generator, mobile, Praxis note, `/about`, product URLs, 404). Runtime is unchanged since `9e54cf7`; the two later commits are docs (`a1d0605`) and test-only (`5cc0823`). `git diff 9e54cf7 HEAD -- apps packages` is empty.

### Phase 9 e2e (local Docker + Supabase, the project's own runner)

- Docker Desktop was started for this run; `supabase start` applied the migrations; the suite ran through `npm run test:e2e:phase9` (`next dev` on 127.0.0.1:3000 with the runner's production-platform environment).
- **Baseline on main first**: main's own spec against main (`c0dbf9c`, fresh `npm ci` in a throwaway worktree) = **5 failed / 4 passed**. The failures predate this branch: the active nav item carries a visually hidden "Current" label so `{ name: "Home", exact: true }` never matched; the access page button reads "Create account"; the homepage no longer has an "Open MAP Prep" link; the footer adds a second "My Account" link (strict-mode violation); and the five visual baselines were captured from the pre-V1.2 homepage (showcase span, "Math Word Hunt", Number Cross card). Two further stale assertions were masked behind those (game launch URL now carries `?launch=<generation>`, and invalid `next` values fall back to Home, not My Account).
- **Branch, repaired spec**: functional tests **8/8 pass**, then with regenerated baselines the full suite is **9/9 pass** (two consecutive full runs).
- Spec changes are assertion repairs only (labels, image names, the four constellation cards, `waitForURL` for the launch generation, the Home fallback, scoping "My Account" to the primary navigation) plus a test-only `e2e/phase9/screenshot.css` that hides the Next dev overlay badge (`nextjs-portal`) during capture so baselines never depend on dev-time console output. Two regex edits initially lost their backslashes through the editing tool; they now use `[(]…[)]` classes.

### Visual baselines (5 regenerated, all reviewed)

| Baseline | Old (pre-V1.2 homepage) | Main's current rendering | New | Legitimate differences |
| --- | --- | --- | --- | --- |
| desktop 1440 | 1440×3161 | 1440×1488 | 1440×1693 | nav labels, eyebrow, hero description, longer supporting line (column below it shifts), card titles/feature lines, connected-system verbs, new "Coming soon" section, footer product labels |
| smartboard 1920 | 1920×3221 | 1920×1531 | 1920×1737 | same set |
| tablet 768 | 768×4942 | 768×2910 | 768×3152 | same set + nav wrapping with the longer labels |
| mobile 390 | 390×4956 | 390×3084 | 390×3439 | same set + caption stacking on the narrow cards |
| mobile 320 | 320×4986 | 320×2999 | 320×3450 | same set + feature phrases wrapping below 360 px |

Diff images against main's current rendering (scratchpad `snapshot-deltas-vs-main`) show the brand mark, H1, account and legal links unchanged; every changed band maps to the approved copy/label changes or the vertical shift they cause. No unrelated UI change.

### Final gates (branch head `5cc0823`, runtime `9e54cf7`)

| Gate | Result |
| --- | --- |
| typecheck | pass |
| lint (app + root) | pass |
| unit platform-core | 245/245 |
| unit platform-web | 589 pass, 1 skipped, 1 fail = `canonical-assets` sha256; **same test, same expected/actual sha on a fresh main (`c0dbf9c`) CRLF checkout; passes on the LF checkout of the same commit** (Windows line-ending artefact, unrelated) |
| production build | pass |
| Phase 9 e2e | 9/9 |
| SEO/positioning unit tests | pass |
| staging crawl (HTTP + Chromium/WebKit + axe + console/page errors) | pass; 0 console/page errors on every viewport; the intentional 404 visit logs only its own 404 |
| internal-link crawl / 404 audit / sitemap / robots | unchanged from §8–§11, re-verified on staging |

### Production candidate (NOT promoted)

- Built from a pristine detached checkout of `9e54cf7` (tree `aae1e15eff5bdfa2ebb04912b26dee9a2e7ce54f`) with `vercel deploy . --project mathnexa-platform-production --prod --skip-domain --env MVH_SOURCE_REVISION=9e54cf7…` (deployment-scoped, no project env change).
- Candidate: **`dpl_ZG6MgsFNiibDQjfDqJDEEVrWMbmv`**, `https://mathnexa-platform-production-a01bvkfay-bright-path-ed-tech.vercel.app`, target production, **Ready**, holds no domain.
- Apex before and after: `dpl_GwdaqjPPjVgsyfaVJtFU94gjdZkq` (unchanged, = rollback target).
- Probes through the CLI protection bypass (`vercel curl --deployment`): `/api/health` 200 `{"status":"ready","environment":"production-platform","build":"9e54cf7…","searchIndexing":"enabled","payments":"live"}`; `/`, `/about`, `/games`, `/map-prep`, `/homework`, `/quizzes`, `/subscription`, `/account`, `/definitely-not-a-page`, `/sitemap.xml`, `/robots.txt` all **308 → https://mathnexa.com/<same path>** with `X-Robots-Tag: noindex` on the deployment host; no 5xx.
- Candidate = staging runtime: same commit `9e54cf7`, same tree, same `build` stamp in `/api/health` (staging reported `9e54cf7…` too). Page content cannot be rendered from the candidate host by design (production canonical-host redirect), and the vault's automation bypass secret is staging-scoped (the production deployment answers with Vercel SSO), so homepage content, metadata, navigation, routes and 404 behaviour are proven on staging (identical source) in Chromium + WebKit, and the candidate is proven on its HTTP contract. Content on the apex is verified after promotion, as in every previous MathNexa promotion.

### Google Search Console

Exact affected URL: **UNKNOWN UNTIL OWNER OPENS INDEXING REPORT**. After promotion: Search Console → Indexing / Pages → "Not found (404)" → open/export the affected URLs; then decide per URL (fix link / 301 / keep 404 / 410). Then inspect `https://mathnexa.com/` and request indexing.

### State

- Production: unchanged (`c0dbf9c`). MAP Prep / ShowMe: unchanged. Stripe, Supabase, migrations, entitlements: untouched.
- Main: not merged. Tag: none. Candidate: not promoted.
