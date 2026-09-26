# MathNexa v1.2.14 (banner cleanup + Quiz PDF preview): owner review pack

Two captures of the same review (`scripts/review-quiz-pdfs-staging.mjs`, Chromium and WebKit,
realistic pacing, temporary synthetic consumer accounts deleted at the end):

| Folder | Target | Result |
| --- | --- | --- |
| `staging/` | clean release candidate on STAGING: `dpl_F8pHXRxYjBPXaM8n9hsJqRVeQffP` (https://mathnexa-platform-staging-rm3npo8be-bright-path-ed-tech.vercel.app), build `3cbe09d` | **242 checks passed, 0 failed**, 0 console/page errors, nothing ignored |
| `production/` | LIVE PRODUCTION `https://mathnexa.com` = `dpl_EcP8UnyLf3uHSVAZwXLLWZkAefVv`, build `3cbe09d`, after promotion on 2026-09-26 | **241 checks passed, 1 failed** (preview at 320 px with 200% text: 23 px overflow; see the release record's "Open finding"), 0 console/page errors, 0 5xx |

`NOTES.txt` in each folder lists every check (ok/FAIL) with the measured values: banner link counts,
card actions, inline delivery headers and sha256, pages drawn per preview, overflow, target sizes,
axe, keyboard order, access-state routing, and the console/page error classification.

## Banner: Authorize Code removed

| File | What it shows |
| --- | --- |
| `21-banner-anonymous-1366.png` | Desktop banner, signed out: brand, six products, Start free trial, account menu. No key icon, no Authorize Code. |
| `21b-banner-anonymous-390.png` | Phone banner, signed out: the two-row product grid, nothing under it. |
| `21g-banner-anonymous-320-text-200.png` | 320 px at 200% text: six products still on screen. |
| `21d-banner-subscriber-1366.png`, `21e-banner-subscriber-320.png`, `21f-banner-subscriber-820-ipad.png` | Subscriber banner at desktop, 320 px and iPad width. |
| `25-webkit-390-banner.png` | The phone banner in WebKit (the iPhone engine). |
| `21c-homepage-authorize-code-form-390.png` | The homepage Authorize Code form, unchanged (heading, masked Code field, Show code, Continue). |
| `18-anonymous-1366.png`, `18b-anonymous-390.png`, `18c-signed-in-trial-eligible-390.png`, `18d-used-trial-390.png`, `19b-active-trial-390.png` | Access, subscription and entitled states; no Authorize Code item in any banner. |

## Quiz PDF cards: Preview, Details, Download PDF

| File | What it shows |
| --- | --- |
| `02-grade-6-selected-1366.png`, `03-all-topic-cards-1366.png` | Grade 6: all eight topic cards, each with `Preview · Details · Download PDF`. |
| `04-card-ratios-and-rates-1366.png` … `11-card-data-1366.png` | Each card close up. |
| `11-pdf-details-1366.png` | A quiz's details page with Preview, Download PDF and Back to library. |
| `13-mobile-390-grade-6.png`, `13b-mobile-375-grade-6.png`, `13c-mobile-430-grade-6.png`, `14-mobile-320-grade-6.png`, `14b-mobile-320-text-200.png`, `15-tablet-768-grade-6.png`, `15b-tablet-820-grade-6.png`, `16b-desktop-1180-grade-6.png`, `16c-desktop-1366-grade-6.png`, `17-desktop-1920-grade-6.png` | The library at every review width (and 320 px at 200% text). |
| `12-downloaded-pdf-page-1.png`, `12b-downloaded-pdf-answers-page.png` | Page 1 and the answers page rendered from the bytes the download route served (sha256 identical to the owner's file). |

## Preview

| File | What it shows |
| --- | --- |
| `22-preview-1366-first-screen.png`, `22b-preview-1366-full.png` | Preview opened from the first card: path, title, Back to Quiz PDFs · Details · Download PDF, page count, every page of the same private PDF (answers last). |
| `24-preview-320.png`, `24b-preview-390.png`, `24f-preview-430.png`, `24c-preview-768.png`, `24g-preview-820-ipad.png`, `24d-preview-1920.png` | Preview at phone, iPad and desktop widths. |
| `24b2-preview-390-full.png`, `24e-preview-320-text-200.png` | The whole 390 px preview page; 320 px at 200% text. |
| `25b-webkit-390-preview.png`, `25c-webkit-390-preview-full.png`, `25d-webkit-390-preview-last-page.png` | WebKit at 390 px: the PDF shows inline (nothing downloads when Preview is selected), every page, the last page reached by scrolling. Download PDF and Back to Quiz PDFs are checked in the notes. |
