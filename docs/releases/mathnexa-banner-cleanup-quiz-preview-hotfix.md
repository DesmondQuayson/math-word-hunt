# MathNexa v1.2.14: banner cleanup + Quiz PDF preview (2026-09-26)

Status: **RELEASED — v1.2.14** (owner approvals 2026-09-26). The one finding from the first live
review (preview header reflow at 320 px with 200% text) is **RESOLVED** by runtime `a86fa50` and
verified live on all 8 quizzes.

| | |
| --- | --- |
| Production (`mathnexa.com`) | `dpl_6uyvVoMMuua6gpG5arrUMW3mnZVZ` (https://mathnexa-platform-production-p8mczo4k3-bright-path-ed-tech.vercel.app), promoted 2026-09-26 20:26:08 UTC (15:26 CDT) |
| Production runtime commit | `a86fa5034c91a991f9486a4ceefa19535cc00487` (fast-forwarded into `main`) |
| Previous (retained, READY) | `dpl_EcP8UnyLf3uHSVAZwXLLWZkAefVv` (runtime `3cbe09d`, live 18:39–20:26 UTC) |
| Rollback (owner-designated, retained, READY) | `dpl_97Z79gBiGEA13Gaia4bTAEascGKy` (v1.2.13, runtime `d72c788`) |
| Tag | annotated `v1.2.14` → runtime `a86fa50` (the repository convention); this record is the docs-only commit that follows it on `main` |
| Branches | `hotfix/remove-banner-authorize-add-quiz-preview` (from `d6f5549`), `hotfix/quiz-preview-200pct-reflow` (from `bef4d32`) |

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
4. **Reflow at 320 px with 200% text** (`a86fa50`): the preview header's grid items may shrink
   below their longest word and a long word in the quiz title wraps, so no preview scrolls sideways.
   Two CSS rules; no change at normal text sizes.
5. **Unchanged:** Quiz PDF content, Homework PDFs, Worksheet Generator, ShowMe Math, Authorize Code
   security, entitlement, Supabase auth, Stripe, price, trial duration, billing, school-code
   validation.

File-by-file description: `docs/quiz-pdfs-v1.md` section 6.

## Commits (`d6f5549..a86fa50`, fast-forwards)

| Commit | Content |
| --- | --- |
| `364ecbe` | banner Authorize Code removal + protected Quiz PDF preview (app, tests, audit, harness, docs) |
| `21046df` | viewer settles its re-fit (48 px + 200 ms); preview checks robust on phones |
| `635d9cb` | staging review pack + first release record (documentation only) |
| `3cbe09d` | removes `apps/platform-web/AGENTS.md`, an agent-rules file `next dev` writes into the app folder that `364ecbe` swept in by accident (owner decision, Option B); first production runtime |
| `bef4d32` | first production record, review packs and review harness (documentation / tooling only) |
| `a86fa50` | the reflow fix (`styles/resources.css`, 2 rules), a regression test over all 8 quizzes at 320 and 390 px with 200% text (fails without the fix), an audit guard for the two rules, and the harness checking every quiz at 200% (owner decision, Option B) |

Release range audit (`d6f5549..3cbe09d`, 81 files: 15 app, 2 dependency (`pdfjs-dist` only), 12
tests, 2 test/audit tooling, 50 docs/review evidence; `3cbe09d..a86fa50`: 1 app stylesheet, 1 test,
2 tooling files, plus the docs of `bef4d32`). No secrets, no env files, no local Supabase config, no
PDF content, no generated instruction files.

## Gates

| Gate | `3cbe09d` (post-merge) | `a86fa50` (reflow fix = merged `main`) |
| --- | --- | --- |
| TypeScript | pass | pass |
| ESLint (root + platform-web) | 0 errors (8 pre-existing warnings in `public/game-suite/natural-voice.js`) | same |
| platform-web unit | 672 passed, 1 skipped | 672 passed, 1 skipped |
| platform-core unit | 245 passed | 245 passed |
| Banner / header | 29 | 29 |
| Authorize Code | 54 | 54 |
| Quiz Preview (unit) | 23 | 23 |
| Entitlement | 42 web + 21 core | 42 web + 21 core |
| Quiz PDFs browser certification (local) | 18/18 (9 Chromium, 9 WebKit) | **20/20** (10 Chromium, 10 WebKit, including the all-quiz 320/390 px 200% text regression test) |
| Phase 9 flow suite | 17/17 | 17/17 |
| Security | 291 + platform bundle audit + Number Cross launch audit | same |
| Offline quiz audit | pass | pass (with the reflow-rule guard) |
| Production build | pass | pass |

## Staging certification

| Deployment | Build | Result |
| --- | --- | --- |
| `dpl_F8pHXRxYjBPXaM8n9hsJqRVeQffP` (https://mathnexa-platform-staging-rm3npo8be-bright-path-ed-tech.vercel.app) | `3cbe09d` | **242 checks passed, 0 failed**, 0 console/page errors in both engines, nothing ignored (its 320 px / 200% check happened to use the one short title that fits) |
| `dpl_H31WsnBjey6x9HzSAfKrA8sHLAc1` (https://mathnexa-platform-staging-bzj5u30gi-bright-path-ed-tech.vercel.app) | `a86fa50` | **311 checks passed, 0 failed**, 0 console/page errors, 0 resource-route refusals; every quiz at 320 and 390 px with 200% text in Chromium and WebKit: 0 px overflow (32/32). Evidence: `owner-review/banner-quiz-preview-hotfix/staging/` |

The first certification attempt on `dpl_H31W…` stopped at its third 1366 px preview on a single 401
for the subscriber's inline file. The full rerun, with the harness recording every refusal on a
resource route and the app's stated reason, saw 0 refusals; the production review also saw 0.
Earlier staging deployments `dpl_J7eKRfY9kKGcZrs2nSGCmkFYtznF` (`364ecbe`),
`dpl_A4agdeJtQ6BL2iMpAJBUpK6z4J4H` (`21046df`) and `dpl_W4Kx9QEC1cup52bHekVRuqGctCJt` (`635d9cb`)
contained the accidental file and are superseded. The staging project's production alias (builds of
`main`) sits behind the app's staging gate and answers 404 to unauthenticated automation, so
certification runs on the branch preview of the identical commit.

Review coverage (both engines, realistic pacing): the banner (six products, no Authorize Code item)
at all nine widths and 320 px at 200% text; every banner destination clicked at 390 px (anonymous
and subscriber); the homepage Authorize Code form in every state (masked, Show/Hide, a typed value
never in the URL or web storage, never submitted); all eight cards with Preview, Details and
Download PDF; all eight previews drawn page by page; no download when Preview is selected; the last
page reachable by scrolling; Download PDF from the preview (exact file); Back to Quiz PDFs; keyboard
order and focus; axe; access states; inline delivery headers and bytes; private storage deep
verification; **every quiz at 320 and 390 px with 200% text**. Console and page errors are
classified; only app errors fail a run (all classes were 0 in the final runs).

## Production releases

| Stage | First release (`3cbe09d`) | Reflow release (`a86fa50`) |
| --- | --- | --- |
| Preflight | PASS (apex `dpl_97Z79…`, build `d72c788`) | PASS (apex `dpl_EcP8…`, build `3cbe09d`) |
| Candidate (`--prod --skip-domain`) | `dpl_EcP8UnyLf3uHSVAZwXLLWZkAefVv` | `dpl_6uyvVoMMuua6gpG5arrUMW3mnZVZ` (tree `99395d2`) |
| Probe candidate | PASS 8/8 | PASS 8/8: health 200, build `a86fa50`, unsigned webhook 400, canonical-host 308, security headers, optimizer, no 5xx |
| Homework safety (read-only) | 8 topics / 59 published lessons / 167 assignments | 8 / 59 / 167; quizzes identical (skip 8, conflicts 0) |
| Promote | 18:39:49 UTC | 20:26:08 UTC |
| Probe live | PASS 23/23 | PASS (every check): apex `dpl_6uyv…`, build `a86fa50`, webhooks, redirects, gated and no-store surfaces, security headers, images, no 5xx, banner six products and no Authorize Code item, homepage Authorize Code form, all eight quiz preview / inline / download routes refuse anonymous access (307 / 401 no-store / 401) |
| Live review | 241 passed, 1 failed (the 200% finding) | **311 passed, 0 failed** |

## Live production review of v1.2.14 (mathnexa.com, runtime `a86fa50`)

`scripts/invoke-quiz-pdfs-production.ps1 -Stage review` (Chromium + WebKit, realistic pacing). Four
temporary synthetic consumer accounts (fresh, used trial, active trial, subscriber) were created on
production and deleted at the end; while they existed they recorded 89 `resource_download_events`
rows (downloads and the inline deliveries behind every preview), whose identity is removed with the
accounts. Evidence: `owner-review/banner-quiz-preview-hotfix/production/`.

**Result: 311 checks passed, 0 failed; 0 console or page errors in both engines; 0 refusals on
resource routes; 0 5xx.**

- Health 200, build `a86fa50`; production publishes 8 of 8 quizzes; database and private-storage
  deep verification 8/8 (bytes, sha256, pages, bucket private, 0 lesson assignments).
- Banner: exactly six products and no Authorize Code item in every state and at every width,
  including 320 px at 200% text. Each destination clicked at 390 px. Anonymous visitors go to
  Home, or to `/access?next=…` for the five products. A subscriber reaches Home, `/games`, Online
  Math Prep (on to `showme.mathnexa.com`), `/homework`, `/quizzes` and the Worksheet Generator
  (`showme.mathnexa.com/worksheets`).
- Authorize Code: the homepage form is present in every state; masked by default; Show/Hide works in
  Chromium and WebKit; a typed value never reached the URL or web storage (never submitted).
- Quiz cards 8/8 (Preview, Details, Download PDF); Details pages 8/8; downloads 8/8 and inline
  deliveries 8/8 with the exact bytes and sha256 of the owner's files; every preview draws every
  page, answers page last.
- Preview: nothing downloads when Preview is selected; the last page is reachable by scrolling;
  Download PDF from the preview saves the exact file (Chromium and WebKit); Back to Quiz PDFs works;
  keyboard order and focus; forced colors render.
- **200% text: every quiz at 320 and 390 px, Chromium and WebKit (32/32): 0 px horizontal
  overflow, the title wraps inside the page, the three actions on screen, every page within the
  width, the last page reachable; Download PDF, axe and Back to Quiz PDFs at 200% on the longest
  title.**
- Access: anonymous preview → 307 `/access?next=/quizzes`, inline 401 no-store, download 401,
  stored copy 404; signed in without access and used trial → `/subscription?next=/quizzes`, inline
  401; active trial and subscriber allowed.
- Responsive at 320 / 375 / 390 / 430 / 768 / 820 / 1180 / 1366 / 1920 without horizontal overflow,
  ≥ 44 px targets on phones; axe 0 serious/critical (library and preview, both engines).

## Resolved finding: preview header reflow at 320 px with 200% text

- **Found** by the first live review (runtime `3cbe09d`): at 320 px with 200% text the preview page
  scrolled sideways for 6 of the 8 quizzes (23 to 217 px). The staging certification had checked
  that size on one quiz only, whose title fits.
- **Cause.** The preview header is a CSS grid whose items kept `min-width: auto`, so the longest word
  of the title at 200% (for example "Understanding" at 80 px) set the width of the column;
  `overflow-wrap: break-word` does not reduce that minimum.
- **Fix** (`a86fa50`): `.resource-preview > *, .resource-preview-header > * { min-width: 0; }` and
  `.resource-preview-header h1 { overflow-wrap: anywhere; }`. No typography, colour, spacing or
  layout change at normal text sizes.
- **Guarded** by a local regression test over all 8 quizzes at 320 and 390 px with 200% text
  (Chromium and WebKit; it fails without the fix), an audit guard for the two rules, and the review
  harness checking every quiz at 200% in both engines.
- **Verified** on staging (311/0) and live on production (311/0): 0 px overflow for all 8 quizzes at
  320 and 390 px, both engines. **Status: RESOLVED.**

## Observations (not defects; for the backlog)

- At 320 px with 200% text, a word longer than the width breaks mid-word without a hyphen (for
  example "Unders / tandin / g"). `hyphens: auto` could make such breaks read better; it would be a
  typography change and needs an owner decision.
- The viewer re-downloads the PDF from the inline route when its width changes by 48 px or more
  (rotation, a real window resize), and each re-download also records a download-evidence row.
  Reusing the loaded document would avoid both.
- Review runs record download-evidence rows for their synthetic accounts (52 for the first live
  review, 89 for this one); the identities are removed with the accounts.

## Rollback

- One step to the previous runtime (preview kept, reflow finding back): `vercel promote
  dpl_EcP8UnyLf3uHSVAZwXLLWZkAefVv --scope bright-path-ed-tech`.
- Owner-designated rollback to v1.2.13 (no preview, the banner item returns): `vercel promote
  dpl_97Z79gBiGEA13Gaia4bTAEascGKy --scope bright-path-ed-tech` (or the release pipeline's
  `rollback` stage). No data migration is involved in either direction.

## Release notes (v1.2.14)

- removed the duplicate banner-level Authorize Code item
- preserved homepage Authorize Code access (form, masked field, Show/Hide, validation, security)
- added a secure Quiz PDF Preview
- Preview / Details / Download available for all 8 Grade 6 quizzes
- private PDF storage preserved (private bucket, no public copy, no permanent public URL)
- server-side access checks preserved (preview page, inline file and download)
- inline PDF rendering added (pdf.js canvases, same private PDF, no-store)
- Quiz Preview reflow fixed at 320 px and 390 px with 200% text (all 8 quizzes, Chromium and WebKit)
- WebKit / iPhone verified (390 px: inline render, all pages, Back, Download, no forced download)
- Homework unchanged (8 topics, 59 lessons, 167 assignments)
- security and accessibility verified (291 security tests + audits, axe 0 serious/critical, keyboard and focus)
