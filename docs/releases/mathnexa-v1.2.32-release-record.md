# MathNexa v1.2.32 — public product pages and a /support reflow fix

Released 2026-11-01 (UTC) under explicit owner approval ("Approve release", given after the staging review of
`c09c88c`). It ships the staging candidate `c09c88c` unchanged.

Before this release, search engines could index no page about MathNexa's products. The product routes (`/games`,
`/map-prep`, `/homework`, `/quizzes`, `/worksheets`, `/play`) send signed-out visitors to the noindex `/access` page,
and only the homepage and About described the products. This release adds one public, indexable page per product.
Each page links into its product route, which still checks access exactly as before.

The release also carries the owner-approved `/support` reflow fix. Since the 2026-11-01 support-address change,
`/support` scrolled sideways on phones with 200% text.

These areas are unchanged:
- Sign In, Sign Out, Authorize Code and authentication.
- Pricing amounts, Stripe, free trials and entitlements.
- Supabase, Super Admin, databases, API contracts, environment variables and `proxy.ts`.
- `robots.txt`.
- Game mechanics, Online Math Prep, Homework and Quiz PDF generation, and the Worksheet Generator.
- The header menu and the homepage, including the three-play worked example and its Stop control.
- ShowMe Math Lab.

| | |
| --- | --- |
| Version | `v1.2.32`. Production was built from `c09c88c` (`c09c88c62086bf7c873a788876d208650e69f06a`, tree `e71b109db6771cbef326a9dbf151def60974f33d`). `/api/health` reports build `c09c88c…`. |
| Tag | Annotated tag `v1.2.32` ("MathNexa v1.2.32: public product pages and a /support reflow fix") points at `c09c88c`, the production build. Created and pushed after live verification. |
| Branch | `feature/product-landing-pages` from `main` `857e2af` (v1.2.31 runtime `b54a421` plus its record): `410a0bb`, `b61eba7`, `1384c0e`, `728152e` and `c09c88c`. |
| Merge | `main` was still `857e2af`, so origin `main` was fast-forwarded through `c09c88c` to this record, with no merge commit and no force. The runtime on `main` equals the production build. |
| Certified runtime | `c09c88c`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-p2-staging`, tracked files only, `node_modules` junction). |
| Staging | `dpl_A7ZUffcBXfiA4KQy65yvZ13ve8ir` (`https://mathnexa-platform-staging-cukj66hcj-bright-path-ed-tech.vercel.app`), build `c09c88c`. It was compared with the v1.2.31 staging build (`dpl_5rnfE9FUHEnJv7UCcgSnMLWbDRbp`) and the first P2 build (`dpl_Hf4uvhDfAR2EfTWC4vRUs4DAyaEx`, `728152e`). Unchanged between the owner's approval and the release. |
| Production candidate | `dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh` (`https://mathnexa-platform-production-8q7kptsg9-bright-path-ed-tech.vercel.app`), built from `c09c88c` with `--prod --skip-domain` |
| Production runtime | `dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh`, `production-platform`, payments `live`. Promoted 2026-11-01 14:38:26–14:38:49 UTC. |
| Rollback runtime | `dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE` (v1.2.31, build `b54a421`), retained and Ready. `dpl_AbFeGCcCCyygiTArHSpt85g27ioa` (v1.2.30 with the new support address) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged. The pages read the existing catalog tables through the existing loaders, read-only. `package.json`, the lockfile and `next.config.mjs` are identical to v1.2.31. |

## What changed for visitors and search engines

Each new page has:
- its own title and a 141–153 character description;
- `index, follow` and a self canonical;
- social tags and a single `h1`;
- a visible breadcrumb with matching BreadcrumbList JSON-LD (the only structured data added);
- a "How to get access" section (trial and monthly price from the billing policy, and the 12-hour school code);
- links to the other product pages.

The pages exist only in `production-platform` mode and return 404 elsewhere. They live in new top-level folders, so no
gated layout applies to them.

| Page | Title | What it shows |
| --- | --- | --- |
| `/online-math-prep` | Online Math Prep for Grades 3–8 | How each idea is taught (learn, guided practice, independent practice, quick check, mastery), Grades 3–8, the homepage's Grade 6 ratio example written out, tool training, the Worksheet Generator, and the Missouri alignment and formative-practice notes. Button: `/map-prep`. |
| `/math-games` | Math games for the classroom | Every published game from the live catalog: artwork, title, description, catalog grades and skills. Math Tug of War is marked free and links to its page. Button: `/games`. |
| `/math-games/math-tug-of-war` | Math Tug of War: free online math game | The three modes, the rules (one step per correct answer, wrong answers never move the rope, no timer, 7 steps wins), the six skills with their number ranges, and names and online rooms. All of it comes from the game code. Button: `/games/math-tug-of-war/play`. |
| `/homework-pdfs` | Printable math homework PDFs | How the library is organized, preview before download, and the live grades and topics. Button: `/homework`. |
| `/quiz-pdfs` | Printable math quizzes by topic | One quiz per topic, the live grades and topics, and an answer-key line shown only when every listed quiz has a key. Button: `/quizzes`. |

**Live catalog reads.** The lists use the existing published-only loaders:
- `loadPublicGameCatalog(false)` skips the canonical-entry reconcile RPC that the homepage may run, so the pages never
  write.
- A good read is held for five minutes per server instance, and a failed or empty read is never held.
- A slow provider costs a page at most four seconds, after which the page renders its general text without the list.
- The summaries carry display fields only: no ids, file ids, or preview, download or launch addresses.
- The three list pages render on request, never at build time. The Online Math Prep and Math Tug of War pages are static.

**Also changed:**
- **Footer** (every page): the Products links open the new pages. The tagline now ends "…required to provide access to
  its resources" instead of "…protected game access". Its first sentence is unchanged, because the phase 7b test pins it.
- **About and Help:** About links each product name, and Help links Math Tug of War.
- **`/pricing` heading:** "One monthly subscription for every MathNexa resource. No annual plan. Math Tug of War is free
  with any MathNexa account." This replaces "…no permanent free gameplay tier", which contradicted the Terms. Copy
  only.
- **`/support` reflow:** notices wrap long words (`.notice-content { min-width: 0; overflow-wrap: anywhere }`). The
  support address no longer pushes `/support` 192 px sideways at 320 px with 200% text. Notices without a long word
  render as before.
- **Sitemap:** 7 to 12 URLs; the five pages are added and nothing is removed.

**Owner decisions** (2026-11-01):
- All five pages, in one release.
- The footer links change; the header and homepage do not.
- The lists come from the live catalog.
- Only accurate art: game art and the Online Math Prep drawing. Not the homepage quiz and homework drawings, and no real
  PDF previews.
- The `/pricing` sentence is fixed.
- Catalog grade ranges are shown.
- The `/support` fix is included ("Yes, add it").

Files (26, including tests):
- `app/{online-math-prep,math-games,math-games/math-tug-of-war,homework-pdfs,quiz-pdfs}/page.tsx`
- `components/public/{product-landing,game-summary-cards,pdf-catalog-summary}.tsx`
- `lib/seo/{product-pages,catalog-summaries}.ts`, plus `public-pages.ts` and `structured-data.ts`
- `components/site-footer.tsx`, `app/{about,help,pricing}/page.tsx`, `app/sitemap.ts`
- `styles/{platform-pages,components}.css`
- unit tests, `e2e/phase9/product-landing-pages.spec.ts` and `e2e/phase9/notice-reflow.spec.ts`

## Release gates (on `c09c88c`, 2026-11-01 13:28–14:02 UTC, local Supabase; first run on `728152e` 12:12–12:45 UTC)

| Check | Result |
| --- | --- |
| Change control vs `main` `857e2af` | 26 files, all on the allowed list. Nothing changed in auth, billing logic, Stripe, entitlements, Supabase, admin, games, product routes, API, proxy, env, dependencies, the header or the homepage. |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass. Build: Online Math Prep and Math Tug of War are static, and the three list pages are dynamic. |
| Unit core / web | 245/245; 993 passed, 1 skipped (45 more than v1.2.31) |
| `test:security`, protection bypass | 321/321, 7/7; platform bundle and Number Cross audits pass |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Phase 9 | 26/26, including 9 new checks. Each page: 200, `index, follow`, self canonical, one `h1`, breadcrumb JSON-LD, its product route still redirecting to noindex `/access`, and no file addresses. Also: sitemap and footer links, the free game listed, axe and 320 px reflow, and `/support` with a long address at 320 px and 200% text. |
| School access (Authorize Code) / Tug of War free access | 21/21 / 8/8 |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |
| `/support` reflow check, before and after the fix | Fails without the CSS rule (111 px of sideways scroll) and passes with it |

The functional harness fails the same four "screens" tests as v1.2.30 and v1.2.31, because their baselines are older
than v1.2.30's footer. Compared with the v1.2.31 run:
- 78 of 82 screenshots differ only inside the footer (the tagline).
- Three show the new About and Help links.
- One differs only in the width of a masked test date.
- The `/support` fix changed none of the 82 (identical before and after `c09c88c`).

## Staging verification (read-only mirrors of the staging builds)

| Check | Result |
| --- | --- |
| 32 signed-out routes vs v1.2.31 staging | Existing pages are identical apart from the footer sentence: status, redirect, robots, canonical, title, visible text and JSON-LD. The five new pages went from 404 to 200, and the sitemap from 7 to 12 URLs. `c09c88c` serves the same 32 pages as `728152e`; the `/support` fix is CSS only. |
| Search metadata (crawl) | Each new page: unique title and description, `index, follow`, self canonical, `og:*` and Twitter summary tags, one `h1`, BreadcrumbList |
| Accessibility and reflow | axe (WCAG 2.0–2.2 A/AA) found 0 violations on 13 public pages at 1440 and 390 px. Overflow at 320 and 390 px with 100% and 200% text: 0 of 52 cases, down from 2, both on `/support`. WebKit (iPhone 13) showed 0 overflow. |
| Readability (Flesch–Kincaid grade) | 4.3 (Tug of War), 5.2 (Math Games), 5.4 (Homework and Quiz PDFs), 7.6 (Online Math Prep). About is 8.9 and Help 6.4, both unchanged. |
| Phone loading (lab, through the mirror) | CLS 0 on every page and device. Image bytes: 31–48 KB on Online Math Prep and Tug of War, 92 KB on Math Games, 13 KB on the PDF pages. Pages weigh 189–329 KB. |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-p2-staging` with these values:

- `RELEASE_CERTIFIED_RUNTIME=c09c88c`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE`
- `RELEASE_PURPOSE=v1.2.32-product-landing-pages`

Logs are in `qa-artifacts/seo-audit/p2-product-pages/release/` (git-ignored). The evidence JSONs are under `%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 14:34:22–14:34:31 | PASS. The apex served `dpl_J964YU7xQVDG…` (the rollback target), retained. |
| probe-live (before) | 14:34:31–14:34:43 | PASS, 22/22 |
| deploy-preview | 14:34:51–14:36:55 | PASS. `dpl_7sprSZ1P5fQe…` is Ready and protected. Next 16.4.2, sharp 0.35.5, tree `e71b109`. |
| probe-preview | 14:37:03–14:38:15 | PASS, 7/7. Health reports build `c09c88c` and payments live. The apex still reported `b54a421` afterwards. |
| promote | 14:38:26–14:38:49 | PASS. The alias moved from `dpl_J964YU7xQVDG…` to `dpl_7sprSZ1P5fQe…`. |
| probe-live | 14:38:50–14:39:04 | PASS, 22/22 |

## Live production verification (2026-11-01 from 14:39 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `c09c88c62086bf7c873a788876d208650e69f06a`, `production-platform`, payments `live`. The apex serves `dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh`. |
| Pages (32 routes) vs a capture just before the release | The five new pages went from 404 to 200, each with its title, description, `index, follow`, self canonical and BreadcrumbList. The other 26 routes are unchanged apart from the footer sentence. `robots.txt` is byte-identical. The sitemap went from 7 to 12 URLs, with exactly the five pages added. |
| Live lists (production catalog) | Math Games lists 5 published games: Math Vocabulary Hunt, Number Cross, Number Logic, CrossCalc, and Math Tug of War marked free. Quiz PDFs lists "grade 6" with 8 topics and the answer-key line. Homework PDFs lists "grade 6" (8 topics) and Grade 7 (3 topics), without an answer-key line because not every listed PDF has a key. |
| Accessibility and reflow on mathnexa.com | axe (WCAG 2.0–2.2 A/AA) at 1440 and 390 px found 0 violations on the five new pages and seven other public pages. On the homepage (unchanged in this release), axe run at the instant of load flags the hero text while its entrance animation runs. Three seconds later it reports 0, in 4 of 4 runs. Reflow at 320 and 390 px with 100% and 200% text: 0 of 52 cases, including `/support` (192 px before the release). WebKit (iPhone 13): no overflow on any of the 13 pages. |
| Three plays on mathnexa.com, Chromium (1440, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | 3 plays (passes ≈ 4320 ms, rests ≈ 3010 ms), then still for 16.3–17.7 s with 0 px changed and no 4th play. Interruptions, focus hold, answer and reduced motion pass. All checks pass. |
| Stop animation on mathnexa.com, Chromium (1440, 1024, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | Not in the server HTML and shown while plays remain. Pointer and keyboard Stop work, with focus moved to the board. The button is gone after the third play, absent with reduced motion, and inside the hero at 200% text. axe: 0 violations at 1440, 390 and 320 px with the button showing. All checks pass (14:39–14:58 UTC). |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4 subscriptions, all live mode (3 active, 1 canceled), Stripe and the database matching. Identical to the read before the release. |
| Runtime logs for `dpl_7sprSZ1P…` since promotion | 5xx, error, fatal: 0, 0, 0. The 4xx responses are the live probe's expected answers: webhook 400, scheduler 401, Tug of War online 401, game runtime 401, admin 404 and billing fixture 404. |
| ShowMe Math Lab | `showme.mathnexa.com` unchanged: ETag `"7e686cff57eb2b157144fa0128084aab"`, the same before and after |
| Deployments | The production project gained exactly one deployment (`dpl_7sprSZ1P…`). |

## Known limitations and owner follow-ups

- **Catalog data is shown as written.**
  - Math Vocabulary Hunt still says Grades 5–8; its lessons cover Grades 6–8. Correct it in Super Admin.
  - The production grade title is lowercase "grade 6"; rename it to "Grade 6" in Super Admin if wanted.
  - The pages pick up catalog changes within five minutes.
- **Online Math Prep wording** (method, tool training, "progress kept on your device") follows the learning app's public
  home page. The owner reviews it.
- **Search.** Indexing and ranking are not guaranteed. Next steps for the owner:
  - Submit the sitemap again in Search Console, and request indexing for the five pages.
  - No score claims without a comparable rerun.
- **Not exercised here:** Firefox (the owner checks it) and signed-in production use. Signed-in behaviour was proven on
  the same commit locally by the gates.
- **Pre-existing:** at 1024 px with 200% text the homepage scrolls sideways by 58 px. axe run at the instant of load flags
  the homepage hero text during its entrance animation, and reports 0 once the page has settled.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-p2-staging
$env:RELEASE_CERTIFIED_RUNTIME = 'c09c88c'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE
```

Fallback: `npx vercel@59 promote dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE --scope bright-path-ed-tech`.

A rollback returns v1.2.31:
- the five pages return 404, and the sitemap goes back to 7 URLs;
- the footer, About, Help and `/pricing` wording return;
- `/support` reflows badly again at 200% text.

It touches no data, billing or access rule.
