# MathNexa v1.2.14: banner cleanup + Quiz PDF preview (2026-09-26)

Status: **LIVE IN PRODUCTION; ONE OPEN FINDING** (owner approval 2026-09-26). The live smoke passed
241 of 242 checks. The one failure is a text-zoom reflow issue on the new preview page at 320 px with
200% text (see "Open finding"). It is not a rollback condition: access control, the viewer,
downloads, the banner and Authorize Code all pass. The `v1.2.14` tag is withheld until the owner
decides.

| | |
| --- | --- |
| Production (`mathnexa.com`) | `dpl_EcP8UnyLf3uHSVAZwXLLWZkAefVv` (https://mathnexa-platform-production-8xvmx2e9e-bright-path-ed-tech.vercel.app), promoted 2026-09-26 18:39:49 UTC (13:39 CDT) |
| Production runtime commit | `3cbe09d1685259cedc0f8dcf17f3ba9587aba211` (clean hotfix tip, fast-forwarded into `main`) |
| Rollback (retained, READY) | `dpl_97Z79gBiGEA13Gaia4bTAEascGKy` (v1.2.13, runtime `d72c788`) |
| Tag | `v1.2.14` NOT created yet (owner decision pending, see "Open finding"); by convention it targets the production runtime commit, with this docs-only record following on `main` |
| Branch | `hotfix/remove-banner-authorize-add-quiz-preview` (from `main` `d6f5549`) |

## What shipped

1. **Banner cleanup.** The duplicate banner-level "Authorize Code" item (key icon + link under the
   six-product grid, and the outlined desktop copy beside the call to action) is removed. The banner
   is brand, six products (Home, Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, Worksheet
   Generator), call to action and account menu, in every account state and on every route.
2. **Authorize Code preserved.** The homepage Authorize Code form (and its copies on `/access`,
   `/sign-in`, `/sign-up`) is unchanged: the Code field is masked by default with Show/Hide, server
   validation, the generic denial and the school-access session are untouched. No file under
   school-access, auth, forms, entitlement, billing, Supabase or platform-core changed. Codes never
   enter a URL, a log, `localStorage` or `sessionStorage`.
3. **Secure Quiz PDF Preview.** Every Grade 6 quiz card reads `Preview · Details · Download PDF`,
   and a quiz's details page offers Preview. `/resources/[id]/preview` is gated on the server
   (`requireProductAccess("/quizzes")` in the layout and the page) and shows the **same private PDF**
   through `/resources/[id]/inline`: the download route's authorization step for step (entitlement
   decision, `record_resource_download`, 60-second signed URL fetched server-side and streamed), with
   `Content-Type: application/pdf`, `Content-Disposition: inline`, `Cache-Control: private,
   no-store, max-age=0`. pdf.js (`pdfjs-dist` 6.3.289, pinned) draws each page on a canvas in a
   same-origin worker: no iframe/object/embed, no WebAssembly, no eval, no browser storage, no public
   copy and no permanent public Supabase URL. Downloads keep the unchanged attachment flow.
4. **Unchanged:** Quiz PDF content, Homework PDFs, Worksheet Generator, ShowMe Math, Authorize Code
   security, entitlement, Supabase auth, Stripe, price, trial duration, billing, school-code
   validation.

File-by-file description: `docs/quiz-pdfs-v1.md` section 6.

## Commits (`d6f5549..3cbe09d`, fast-forward)

| Commit | Content |
| --- | --- |
| `364ecbe` | banner Authorize Code removal + protected Quiz PDF preview (app, tests, audit, harness, docs) |
| `21046df` | viewer settles its re-fit (48 px + 200 ms); preview checks robust on phones |
| `635d9cb` | staging review pack + first release record (documentation only) |
| `3cbe09d` | removes `apps/platform-web/AGENTS.md`, an agent-rules file `next dev` writes into the app folder that `364ecbe` swept in by accident (owner decision, Option B). The released tree contains no generated instruction file. |

Release range audit (`d6f5549..3cbe09d`, 81 files): 15 app, 2 dependency (`pdfjs-dist` only),
12 tests, 2 test/audit tooling, 50 docs/review evidence. No secrets, no env files, no local
Supabase config, no PDF content, no generated instruction files.

## Gates (post-merge, on `main` = `3cbe09d`)

| Gate | Result |
| --- | --- |
| TypeScript (`tsc --noEmit`) | pass |
| ESLint (root + platform-web) | pass, 0 errors (8 pre-existing warnings in `public/game-suite/natural-voice.js`) |
| platform-web unit | 672 passed, 1 skipped |
| platform-core unit | 245 passed |
| Banner / header | 29 passed |
| Authorize Code | 54 passed |
| Quiz Preview (unit) | 23 passed |
| Entitlement | 42 web + 21 core passed |
| Quiz PDFs browser certification (local) | 18/18: Chromium 9/9, WebKit 9/9 |
| Phase 9 flow suite | 17/17 |
| Security | 291 passed + platform bundle audit + Number Cross launch audit |
| Offline quiz audit | pass |
| Production build | pass (`/resources/[resourceId]/inline` and `/preview` emitted) |

## Staging certification (clean candidate)

`dpl_F8pHXRxYjBPXaM8n9hsJqRVeQffP` (https://mathnexa-platform-staging-rm3npo8be-bright-path-ed-tech.vercel.app),
built from `3cbe09d`, reviewed with `scripts/review-quiz-pdfs-staging.mjs` (Chromium + WebKit,
realistic pacing): **242 checks passed, 0 failed**, 0 console or page errors in both engines,
nothing ignored. Evidence: `owner-review/banner-quiz-preview-hotfix/staging/`.

Coverage: the banner (six products, no Authorize Code item) at all nine widths and 320 px at 200%
text for anonymous and subscriber states; every banner destination clicked at 390 px (anonymous and
subscriber); the homepage Authorize Code form present in every state, masked by default, Show/Hide
working in Chromium and WebKit, a typed value never reaching the URL or web storage (never
submitted); all eight quiz cards with Preview, Details and Download PDF; all eight previews drawn
page by page; selecting Preview downloads nothing; the last page reachable by scrolling at every
width; Download PDF from the preview saves the exact owner file (Chromium and WebKit); Back to Quiz
PDFs; keyboard order and focus; axe 0 serious/critical; access states (anonymous gated, signed in
without access and used trial sent to the subscription flow, active trial and subscriber allowed);
inline delivery headers and exact bytes for all eight; private storage deep verification.

Earlier staging deployments `dpl_J7eKRfY9kKGcZrs2nSGCmkFYtznF` (`364ecbe`), `dpl_A4agdeJtQ6BL2iMpAJBUpK6z4J4H`
(`21046df`) and `dpl_W4Kx9QEC1cup52bHekVRuqGctCJt` (`635d9cb`) contained the accidental file and
are superseded. The staging project's production alias (`dpl_HVYYiQdWmfTx4BEn2C9yf1tCvqs1`, `main`
= `3cbe09d`) sits behind the app's staging gate and answers 404 to unauthenticated automation, so
the certification ran on the branch preview of the identical commit.

Review-harness findings during certification (tooling only, no app change): Vercel injects its
feedback toolbar into preview deployments, and it throws on the Windows WebKit test build; the
review now sends `x-vercel-skip-toolbar: 1`. WebKit reports a Next.js prefetch that a navigation
cancels as "Fetch API cannot load … due to access control checks" / "Failed to fetch RSC payload …
Load failed". Early runs triggered this by starting their next navigation within milliseconds of a
client-side one. Step-tagged diagnostics traced every such message to that race, and the same flows
with human pacing were clean on staging and on production. The review now waits until in-flight
requests finish before it navigates.

## Production release

| Stage | Result |
| --- | --- |
| Preflight | PASS: apex served `dpl_97Z79gBiGEA13Gaia4bTAEascGKy` (build `d72c788`); tree = certified runtime `3cbe09d`; Next 16.3.4, sharp 0.35.4 |
| Candidate (`--prod --skip-domain`) | `dpl_EcP8UnyLf3uHSVAZwXLLWZkAefVv`, source `3cbe09d` (tree `473a436`), Ready, not holding any production alias |
| Probe candidate | PASS 8/8: health 200 ready, build `3cbe09d`, unsigned webhook 400, canonical-host 308 for every proxied route, security headers intact, image optimizer 200 / remote refused, no 5xx |
| Homework safety (read-only) | Grade 6: 8 topics, 59 published lessons, 167 lesson assignments; quizzes identical (skip 8, conflicts 0) |
| Promote | PASS 2026-09-26 18:39:49 UTC; previous `dpl_97Z79gBiGEA13Gaia4bTAEascGKy` retained |
| Probe live | PASS 23/23: apex serves `dpl_EcP8…`, health build `3cbe09d`, webhooks 400 on the configured host / apex / www, redirects, public pages, product and private surfaces gated with no-store, admin / scheduler / fixture / game runtime / forged access closed, security headers, images, no 5xx, **banner = six products and no Authorize Code item, homepage Authorize Code form present, all eight quiz preview / inline / download routes refuse anonymous access (307 / 401 no-store / 401)** |

## Live production smoke (mathnexa.com, after promotion)

The same review as on staging, run on the apex through `scripts/invoke-quiz-pdfs-production.ps1
-Stage review` (Chromium + WebKit, realistic pacing). Four temporary synthetic consumer accounts
(fresh, used trial, active trial, subscriber) were created on production and deleted at the end;
while they existed they recorded 52 `resource_download_events` rows (downloads + the inline
deliveries behind every preview), whose identity is removed with the accounts. Evidence:
`owner-review/banner-quiz-preview-hotfix/production/` (`NOTES.txt` lists every check).

**Result: 241 checks passed, 1 failed; 0 console or page errors in both engines (nothing
ignored); 0 5xx.**

- Health 200, build `3cbe09d`; production publishes 8 of 8 quizzes; database and private-storage
  deep verification 8/8 (bytes, sha256, pages, bucket private, 0 lesson assignments).
- Banner: exactly six products and no Authorize Code item in every state checked and at every
  width, with 320 px at 200% text included. Each destination clicked at 390 px. Anonymous visitors
  go to Home, or to `/access?next=…` for the five products. A subscriber reaches Home, `/games`,
  Online Math Prep (continues to `showme.mathnexa.com`), `/homework`, `/quizzes`, and the Worksheet
  Generator (`showme.mathnexa.com/worksheets`).
- Authorize Code: the homepage form is present in every state and at every width; the Code field
  is masked by default and Show/Hide works in Chromium and WebKit; a typed value never reached the
  URL or web storage (never submitted).
- Quiz cards: 8/8 with Preview, Details and Download PDF in that order; Details pages 8/8.
- Downloads 8/8 and inline deliveries 8/8: exact bytes and sha256 of the owner's files,
  `attachment` / `inline`, `private, no-store, max-age=0`. Rendered page 1 and the answers page from
  the served bytes are in the pack; every preview draws every page, answers page last.
- Preview: all eight drawn at 1366 (Chromium) and at 390 (WebKit); nothing downloads when Preview
  is selected; the last page is reachable by scrolling; Download PDF from the preview saves the
  exact file (Chromium and WebKit); Back to Quiz PDFs works; keyboard order and focus ring on the
  preview page and the cards; forced colors render.
- Access: anonymous preview → 307 `/access?next=/quizzes`, inline 401 no-store, download 401,
  stored copy 404; signed in without access and used trial → `/subscription?next=/quizzes`, inline
  401; active trial and subscriber allowed.
- Responsive: library and preview at 320 / 375 / 390 / 430 / 768 / 820 / 1180 / 1366 / 1920 with
  no horizontal overflow and ≥ 44 px targets on phones; library at 320 px with 200% text clean.
- Accessibility: axe 0 serious/critical on the library and the preview (Chromium and WebKit).
- **Failed (1): the preview page at 320 px with 200% text**, checked on "Positive Rational Numbers
  Practice": 23 px of horizontal overflow, and the 4 pages are wider than the screen.

## Open finding: preview header reflow at 320 px with 200% text

- **What.** On the new preview page, at 320 px with text enlarged to 200%, the page scrolls
  sideways for quizzes whose title contains a long word. Reproduced locally on the released code
  for 6 of the 8 quizzes (23 to 217 px). "Ratios And Rates Practice" and "Area Surface Area Volume
  Practice" fit. At normal text sizes every quiz fits at every width, on both engines.
- **Why staging passed.** The staging certification's 320 px / 200% check happened to use Ratios
  (topic order differs between the staging and production databases); production used Positive
  Rational Numbers.
- **Cause.** The preview header is a CSS grid whose items keep the default minimum width, so the
  longest word of the title at 200% (for example "Understanding" at 80 px) sets the width of the
  whole column; `overflow-wrap: break-word` does not reduce that minimum.
- **Tested fix, not applied.** Two lines in `apps/platform-web/styles/resources.css`:
  `.resource-preview > *, .resource-preview-header > * { min-width: 0; }` and
  `.resource-preview-header h1 { overflow-wrap: anywhere; }`. Verified locally: 0 px overflow for
  all 8 quizzes at 320 px with 200% text in Chromium and WebKit. It would ship as its own reviewed
  hotfix, with the review checking every quiz at 320 px / 200% instead of one.
- **Impact.** Visual only, at the smallest phone width with doubled text: the reader scrolls
  sideways. Access control, the viewer, downloads and every other check are unaffected.

## Rollback

One step: `vercel promote dpl_97Z79gBiGEA13Gaia4bTAEascGKy --scope bright-path-ed-tech` (or the
release pipeline's `rollback` stage). It restores v1.2.13 (runtime `d72c788`): the banner item
returns and Preview disappears; no data migration is involved in either direction.

## Release notes (for the v1.2.14 tag, once the owner decides)

- removed the duplicate banner-level Authorize Code item
- preserved homepage Authorize Code access (form, masked field, Show/Hide, validation, security)
- added a secure Quiz PDF Preview
- Preview / Details / Download available for all 8 Grade 6 quizzes
- private PDF storage preserved (private bucket, no public copy, no permanent public URL)
- server-side access checks preserved (preview page, inline file and download)
- inline PDF rendering added (pdf.js canvases, same private PDF, no-store)
- WebKit / iPhone verified (390 px: inline render, all pages, Back, Download, no forced download)
- Homework unchanged (8 topics, 59 lessons, 167 assignments)
- security and accessibility verified (axe 0 serious/critical, keyboard and focus, 291 security tests + audits)
- open: preview header reflow at 320 px with 200% text (see "Open finding")
