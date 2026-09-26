# Quiz PDFs V1 — owner review pack

Captured 2026-09-25 on the local production-platform rehearsal (real local Supabase auth and
entitlement rows, fixture billing) with the eight Grade 6 quiz PDFs published through the same
RPCs the admin uses. Only Grade 6 is represented by the uploaded corpus, so there are no Grade 3,
4, 5, 7 or 8 screenshots. The red "1 Issue" badge in some captures is the Next.js development
overlay for the pre-existing dev-only CSP `eval()` notice; it does not exist in production builds.

| # | File | What it shows |
| --- | --- | --- |
| 1 | `01-landing-1366-subscriber.png` | Quiz PDFs landing page for a subscriber before a grade is chosen (banner item current). |
| 5 | `05-grade-6-selected-1366.png` | Grade 6 selected: "Quiz Topics", eight topic cards in topic order. |
| 8 | `08-topic-cards-1366.png` | The topic cards region (designation label, path, title, success criteria, answer key, actions). |
| 9 | `09-pdf-view-details-1366.png` | The Details page of a quiz (the blueprint's "view" step) with Download PDF and Back to library. |
| 9 | `09c-downloaded-pdf-page-1.png` | Page 1 of the PDF actually served by the download route, rendered from the downloaded bytes (sha256 equal to the owner's file). |
| 10 | `10-mobile-390-grade-6.png`, `10b-mobile-430-grade-6.png`, `10c-mobile-375-grade-6.png` | Mobile widths with Grade 6 selected. |
| 11 | `11-mobile-320-grade-6.png`, `11b-mobile-320-text-200.png` | 320px, and 320px at 200% text (no horizontal overflow). |
| 12 | `12-tablet-768-grade-6.png`, `12b-tablet-820-grade-6.png` | Tablet widths. |
| 13 | `13-desktop-1366-first-screen.png`, `13b-desktop-1180-grade-6.png` | Desktop 1366 (first screen) and 1180. |
| 14 | `14-desktop-1920-grade-6.png` | Desktop 1920 (Smart Board / large display). |
| 15 | `15-anonymous-quiz-link-1366.png`, `15b-anonymous-quiz-link-390.png` | Anonymous visitor clicks the banner's Quiz PDFs: `/access?next=/quizzes`, "Continue to Quiz PDFs". |
| 15 | `15c-signed-in-trial-eligible-390.png` | Signed-in, trial-eligible account: `/subscription?next=/quizzes`, "Start your free trial". |
| 15 | `15d-used-trial-390.png` | Used-trial account: `/subscription?next=/quizzes` with subscription options, no second trial. |
| 16 | `16-subscriber-390-first-screen.png` | Subscriber state on a phone: banner current item and the first cards. |

`capture-notes.txt` lists, per capture, the URL, horizontal overflow (0 everywhere), the number of
cards (8) and the banner's current item, plus the download proof (HTTP 200, `application/pdf`,
`attachment; filename="grade-6-ratios-and-rates-quiz.pdf"`, 532,861 bytes, sha256 identical to
the manifest).
