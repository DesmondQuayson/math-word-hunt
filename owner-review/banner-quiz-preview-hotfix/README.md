# Banner cleanup + Quiz PDF preview hotfix — owner review pack

Captured 2026-09-26 against the STAGING preview deployment `dpl_A4agdeJtQ6BL2iMpAJBUpK6z4J4H`
(`https://mathnexa-platform-staging-cxqtayinp-bright-path-ed-tech.vercel.app`, built from commit
`21046df` of `hotfix/remove-banner-authorize-add-quiz-preview`) by
`scripts/review-quiz-pdfs-staging.mjs` through the staging launcher: real sign-in with temporary
synthetic accounts (created on the staging project and deleted at the end), Chromium and WebKit
(Safari engine), production build (no development overlay). Nothing was merged or deployed to
production; `mathnexa.com` still serves v1.2.13.

All captures are in `staging/`; `staging/NOTES.txt` lists every check (ok/FAIL) with the measured
values (banner link counts, card actions, inline delivery headers and sha256, pages drawn per
preview, overflow, axe, keyboard order).

## Banner: Authorize Code removed (requested screenshots 1–4)

| File | What it shows |
| --- | --- |
| `21-banner-anonymous-1366.png` | Desktop banner, signed out: brand, six products, Start free trial, account menu. No key icon, no Authorize Code. |
| `21b-banner-anonymous-390.png` | Phone banner, signed out: two-row product grid, nothing under it. |
| `21c-homepage-authorize-code-form-390.png` | The homepage Authorize Code form is unchanged (heading, Code field, Show code, Continue). |
| `21d-banner-subscriber-1366.png` | Desktop banner for a subscriber: still six products, no Authorize Code. |
| `25-webkit-390-banner.png` | The same phone banner rendered by WebKit (Safari engine). |
| `18-anonymous-1366.png`, `18b-anonymous-390.png`, `18c-signed-in-trial-eligible-390.png`, `18d-used-trial-390.png`, `19b-active-trial-390.png` | Access, subscription and entitled states: the banner carries no Authorize Code item in any of them. |

## Quiz PDF cards with Preview (requested screenshots 5–6)

| File | What it shows |
| --- | --- |
| `02-grade-6-selected-1366.png`, `03-all-topic-cards-1366.png` | Grade 6 selected: all eight topic cards, each with `Preview · Details · Download PDF`. |
| `04-card-ratios-and-rates-1366.png` … `11-card-data-1366.png` | Each card close up (designation, path, title, success criteria, answer key included, the three actions). |
| `11-pdf-details-1366.png` | The details page of a quiz now offers Preview beside Download PDF and Back to library. |
| `13-mobile-390-grade-6.png`, `14-mobile-320-grade-6.png`, `15-tablet-768-grade-6.png`, `16c-desktop-1366-grade-6.png`, `17-desktop-1920-grade-6.png` | The card grid with the new action at the review widths. |

## Preview page (requested screenshots 7–13)

| File | What it shows |
| --- | --- |
| `22-preview-1366-first-screen.png` | Preview opened from the first card on desktop: path, title, Back to Quiz PDFs / Details / Download PDF, "5 pages", page 1 drawn in place. |
| `22b-preview-1366-full.png` | The whole preview page: all five pages of the same private PDF, the answers page last. |
| `24-preview-320.png`, `24b-preview-390.png`, `24c-preview-768.png`, `24d-preview-1920.png` | Preview at 320, 390, 768 and 1920 px (first screen). |
| `24b2-preview-390-full.png` | Full preview page at 390 px (Chromium). |
| `25b-webkit-390-preview.png`, `25c-webkit-390-preview-full.png` | WebKit (Safari engine) at 390 px: the PDF displays inline, no download prompt, all five pages; Back to Quiz PDFs returns to the library (checked in NOTES). |
| `12-downloaded-pdf-page-1.png`, `12b-downloaded-pdf-answers-page.png` | Rendered from the bytes the download route served: the same file the preview shows (sha256 identical to the owner's upload). |

## What the checks prove (see `staging/NOTES.txt`)

- Anonymous: `/quizzes` → 307 `/access?next=/quizzes`; every `/resources/[id]/preview` → 307
  `/access?next=/quizzes`; every `/resources/[id]/inline` → 401 JSON, no PDF bytes, no storage URL.
- Signed in without access (trial-eligible, used trial): preview page → `/subscription?next=/quizzes`,
  inline → 401.
- Subscriber: inline delivery for all eight quizzes = HTTP 200, `application/pdf`,
  `Content-Disposition: inline; filename="…"`, `Cache-Control: private, no-store, max-age=0`, exact
  byte count and sha256 of the owner's file; evidence rows recorded like downloads.
- Every preview draws one canvas per PDF page (5/4/4/3/4/5/5/5), no iframe/object/embed, nothing in
  web storage, no storage marker in the page, no horizontal overflow at 320–1920, touch targets
  ≥ 44 px, axe 0 serious/critical on the preview at 1366 and 390 (Chromium and WebKit), keyboard
  order Preview → Details → Download PDF with a visible focus ring, Back to Quiz PDFs returns to
  `/quizzes` on both engines, no 5xx and no console or page errors from the app across the run.
  (Two preview-only quirks are listed in the notes as ignored: Vercel injects its feedback toolbar
  script, `vercel.live`, into preview deployments and on the Windows WebKit test build that script
  rejects on `navigator.storage`; and WebKit's fetch of a React Server Components payload can be
  refused by the deployment protection, after which Next performs the same navigation as a full
  page load, which the checks prove landed. Production carries first-party scripts only and has no
  deployment protection.)
