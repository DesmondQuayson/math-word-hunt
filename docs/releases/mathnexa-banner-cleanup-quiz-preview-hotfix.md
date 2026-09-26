# MathNexa hotfix: banner cleanup + Quiz PDF preview (2026-09-26)

Status: **STAGING PREVIEW — READY FOR OWNER REVIEW.** Not merged, not tagged, not deployed to
production. Production stays at v1.2.13 (`mathnexa.com` = `dpl_97Z79gBiGEA13Gaia4bTAEascGKy`,
runtime `d72c788`; rollback `dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N`).

## Scope

1. Remove the banner-level "Authorize Code" item (key icon + link under the six-product grid, and
   the outlined desktop copy beside the call to action). The homepage Authorize Code form, the
   Code input with Show/Hide, the server validation, the generic denial, the school-access session
   and every entitlement rule are unchanged. Codes never enter a URL, a log, `localStorage` or
   `sessionStorage`.
2. Add a "Preview" action to every Quiz PDF card (`[Preview] [Details] [Download PDF]`) and to a
   quiz's details page, opening a protected MathNexa preview page that shows the **same private
   PDF** through the entitlement-checked inline route. No replacement PDF, no HTML conversion, no
   public copy, no permanent public Supabase URL.

Out of scope and untouched: billing, pricing, trial rules, Stripe, Supabase auth, entitlement
rules, the Authorize Code form itself, Math Games, Online Math Prep, the Worksheet Generator,
ShowMe Math, the Homework PDFs experience, every PDF file.

## Branch

- `hotfix/remove-banner-authorize-add-quiz-preview`, created from `origin/main` `d6f5549`
  (the v1.2.13 closeout commit; app code unchanged since runtime `d72c788`).
- Hotfix commit `364ecbe` (pushed 2026-09-26). Worktree `C:/GitHub/mathnexa-hotfix-preview`.

## Changes

See `docs/quiz-pdfs-v1.md` section 6 for the file-by-file description. Summary:

| Area | Change |
| --- | --- |
| `components/site-header.tsx`, `components/layout/authorized-code-link.tsx` (deleted), `styles/conversion.css`, `lib/navigation/banner.ts` | banner = brand, six products, call to action, account menu; the `"code code code"` grid row and `.banner-code-link` rules removed |
| `components/resources/public-resource-library.tsx`, `app/resources/[resourceId]/page.tsx` | Preview link first on quiz cards; Preview on the quiz details page; Homework cards unchanged |
| `app/resources/[resourceId]/preview/{layout,page,loading}.tsx` | quiz-only preview page behind `requireProductAccess("/quizzes")` in the layout (HTTP 307 before any shell streams) and again in the page |
| `app/resources/[resourceId]/inline/route.ts` | the download route with `Content-Disposition: inline` (same entitlement decision, same `record_resource_download`, same 60-second signed URL fetched server-side, `no-store`, quiz only) |
| `components/resources/pdf-viewer.tsx`, `pdf-worker.ts`, `types/pdfjs-worker.d.ts`, `package.json` (`pdfjs-dist` 6.3.289) | canvas rendering in a same-origin module worker; no iframe/object/embed, no WebAssembly, no eval, no browser storage |
| `styles/resources.css` | preview header, actions and page canvases |
| Tests, audit, review harness, docs | see below |

## Gates

| Gate | Result |
| --- | --- |
| `tsc --noEmit` (platform-web) | pass |
| `eslint .` (platform-web) + root scripts | pass (pre-existing warnings only, in `public/game-suite/natural-voice.js`) |
| platform-web unit suite (vitest) | 93 files, 672 tests passed, 1 skipped (pre-existing) |
| platform-core unit suite | 35 files, 245 tests passed |
| `scripts/audit-quiz-pdfs.mjs` | pass (8 quizzes; inline route + preview page + banner guards) |
| production build (`npm run build`) | pass; `/resources/[resourceId]/inline` and `/preview` emitted; bundled pdf.js worker chunk present |
| Quiz PDFs browser certification (local production-platform rehearsal, `scripts/run-quiz-pdfs-e2e.mjs`) | Chromium 9/9 passed, WebKit 9/9 passed (anonymous preview 307 + inline 401 for all eight; non-subscriber and used-trial routing; entitled inline delivery with exact bytes, `inline` disposition, `no-store`, evidence rows; all eight previews drawn page by page; nine review widths and a 390 px phone with axe; Back to Quiz PDFs; Homework cards without Preview; keyboard order Preview → Details → Download PDF; clean console apart from React's dev-only eval notice) |
| Phase 9 flow suite (`scripts/run-phase9-e2e.mjs`, Chromium) | 16/16 passed after the five homepage visual baselines were refreshed for the shorter banner (mobile 320, mobile 390, tablet, desktop, smartboard); the rewritten Authorize Code test proves the homepage form, Show/Hide, no banner item in four account states, six product links on `/access`, `/sign-in`, `/pricing`, and nothing in web storage |
| Staging preview review (real browser, Chromium + WebKit, `dpl_A4agdeJtQ6BL2iMpAJBUpK6z4J4H`) | 149 checks passed, 0 failed (details under Staging) |

## Staging

Vercel project `mathnexa-platform-staging` (team `bright-path-ed-tech`), Git-connected: each push
of the branch builds a Preview deployment (target `preview`, never the staging production alias,
never `mathnexa.com`). The staging Supabase project holds the eight Grade 6 quizzes under its
earlier quiz-named taxonomy (known difference from production, see the v1.2.13 record).

| Deployment | Commit | Notes |
| --- | --- | --- |
| `dpl_J7eKRfY9kKGcZrs2nSGCmkFYtznF` (`mathnexa-platform-staging-bt68e8yhg-…`) | `364ecbe` | first preview; the review harness found the phone-width ink threshold too strict for the sparse answers page and a WebKit `networkidle` wait that never settled — both harness/test issues, fixed in `21046df` together with the viewer's settled re-fit rule |
| `dpl_A4agdeJtQ6BL2iMpAJBUpK6z4J4H` (`mathnexa-platform-staging-cxqtayinp-…`) | `21046df` | **review deployment**; results below |

Preview deployments differ from production in one way that matters for the review: Vercel injects
its feedback toolbar script (`vercel.live/_next-live/feedback/feedback.js`) into preview pages.
On the Windows WebKit test build that script rejects on `navigator.storage` (undefined there); the
harness records those errors and counts only the app's own. Production pages carry first-party
scripts only (probed in WebKit on 2026-09-26: `/`, `/quizzes`, `/access`, `/sign-in`, zero page
errors). Second preview-only quirk: WebKit's fetch of a React Server Components payload (`?_rsc=`)
can be refused by the deployment protection, after which Next performs the same navigation as a
full document load; the harness proves the navigation landed and records the message as ignored.

### Review results (`dpl_A4agdeJtQ6BL2iMpAJBUpK6z4J4H`, build `21046df`, Chromium + WebKit)

`scripts/review-quiz-pdfs-staging.mjs` through `scripts/invoke-quiz-pdfs-staging.ps1 -Stage review`:
**149 checks passed, 0 failed** (`owner-review/banner-quiz-preview-hotfix/staging/NOTES.txt`).
Synthetic consumer accounts (fresh, used trial, active trial, subscriber) were created on the
staging project for the run and deleted afterwards.

- Health `200`, build `21046df`; staging publishes 8 of 8 manifest quizzes; deep database and
  private-storage proof for all eight (bytes, sha256, page counts, bucket private, 0 lesson
  assignments).
- Banner: no Authorize Code item and exactly six product links in the anonymous, trial-eligible,
  used-trial, active-trial and subscriber states at 1366 and 390 (Chromium) and at 390 (WebKit);
  the homepage keeps the Authorize Code form (heading, Code field, Show code).
- Anonymous: `/quizzes` → 307 `/access?next=/quizzes`; every preview page → 307
  `/access?next=/quizzes`; every inline delivery → 401 JSON without PDF bytes or storage markers;
  the stored copy is not a web asset (404).
- Signed in without access: preview page → `/subscription?next=/quizzes`, inline → 401.
- Subscriber: every card reads `Preview | Details | Download PDF` with the right hrefs; downloads
  and inline deliveries for all eight return the exact bytes and sha256 of the owner's files
  (`attachment` / `inline` disposition, `private, no-store, max-age=0`); 8 + 8 evidence rows.
- Preview: from the card and by URL, all eight quizzes draw every page (5/4/4/3/4/5/5/5) at 1366
  (Chromium) and at 390 (WebKit); no iframe/object/embed, nothing in web storage, no storage marker
  in the page; 320 / 390 / 768 / 1920 px without overflow and with ≥ 44 px targets; the 390 px
  preview settles after a full-page capture and stays settled; axe 0 serious/critical on the
  preview at 1366 and 390 on both engines; Back to Quiz PDFs returns to `/quizzes` on both engines;
  keyboard order Preview → Details → Download PDF with a visible focus ring (Chromium; the Windows
  WebKit build never Tab-focuses links from a form control, documented policy).
- No 5xx. No console or page errors from the app. Ignored and recorded: 14 errors raised by the
  Vercel preview toolbar script (`vercel.live`, WebKit only) and 11 RSC payload fetch fallback
  messages on the protected preview (WebKit; the navigations landed).

Owner review pack: `owner-review/banner-quiz-preview-hotfix/README.md` (which capture shows what).

## Rollback

Nothing to roll back: production was not touched. If the branch is later promoted and must be
reverted, the retained production rollback remains `dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N` and the
current live deployment `dpl_97Z79gBiGEA13Gaia4bTAEascGKy`.
