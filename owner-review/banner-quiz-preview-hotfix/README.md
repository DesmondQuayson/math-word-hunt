# MathNexa v1.2.14 (banner cleanup + Quiz PDF preview, with the 200% text reflow fix): owner review pack

Two captures of the same review (`scripts/review-quiz-pdfs-staging.mjs`, Chromium and WebKit,
realistic pacing, temporary synthetic consumer accounts deleted at the end), both of the final
runtime `a86fa50`:

| Folder | Target | Result |
| --- | --- | --- |
| `staging/` | STAGING preview `dpl_H31WsnBjey6x9HzSAfKrA8sHLAc1` (https://mathnexa-platform-staging-bzj5u30gi-bright-path-ed-tech.vercel.app), build `a86fa50` | **311 checks passed, 0 failed**, 0 console/page errors, 0 resource-route refusals |
| `production/` | LIVE `https://mathnexa.com` = `dpl_6uyvVoMMuua6gpG5arrUMW3mnZVZ`, build `a86fa50`, after promotion on 2026-09-26 20:26 UTC | **311 checks passed, 0 failed**, 0 console/page errors, 0 resource-route refusals, 0 5xx |

`NOTES.txt` in each folder lists every check (ok/FAIL) with the measured values: banner link counts,
card actions, inline delivery headers and sha256, pages drawn per preview, overflow, target sizes,
the 200% text reflow result for every quiz at 320 and 390 px in both engines, axe, keyboard order,
access-state routing, the console/page error classification and any refusal on a resource route.

The earlier packs for runtime `3cbe09d` (staging 242/0; live 241/1, the 200% finding this release
fixes) are in the repository history at commit `bef4d32`.

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
| `24-preview-320.png`, `24b-preview-390.png`, `24f-preview-430.png`, `24c-preview-768.png`, `24g-preview-820-ipad.png`, `24d-preview-1920.png` | Preview at phone, iPad and desktop widths (normal text). |
| `24b2-preview-390-full.png` | The whole 390 px preview page. |
| `26-chromium-preview-320-text-200-longest-title.png`, `26b-chromium-preview-320-text-200-longest-title-full.png`, `26-webkit-…`, `26b-webkit-…` | The quiz with the longest title word ("Understanding and Using Percent") at 320 px with 200% text, Chromium and WebKit: the title wraps inside the page, the actions stack, every page fits (the reflow fix). |
| `25b-webkit-390-preview.png`, `25c-webkit-390-preview-full.png`, `25d-webkit-390-preview-last-page.png` | WebKit at 390 px: the PDF shows inline (nothing downloads when Preview is selected), every page, the last page reached by scrolling. Download PDF and Back to Quiz PDFs are checked in the notes. |
