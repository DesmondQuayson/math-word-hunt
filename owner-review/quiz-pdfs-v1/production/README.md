# Quiz PDFs V1 — live production review pack

Captured 2026-09-26 on https://mathnexa.com after promotion of `dpl_97Z79gBiGEA13Gaia4bTAEascGKy`
(source `d72c788`) and after the eight Grade 6 quiz PDFs were published into the production
database under the existing Grade 6 curriculum topics (`content/quiz-pdfs/production-topic-map.json`).
Everything went through the real production sign-in with temporary synthetic consumer accounts
(fresh, used trial, active trial, subscriber) that were deleted at the end of the run
(`scripts/review-quiz-pdfs-staging.mjs`, launched by `scripts/invoke-quiz-pdfs-production.ps1 -Stage review`).
`NOTES.txt` is the run log: 87 checks, all `ok`.

The grade label reads "grade 6" because that is the title of the existing production grade row;
the topic labels are the existing production topic titles; the quiz titles are the PDFs' own titles.

| Step | File | What it shows |
| --- | --- | --- |
| 1 | `01-landing-1366-subscriber.png` | Quiz PDFs landing page (subscriber) before a grade is chosen. |
| 2 | `02-grade-6-selected-1366.png` | Grade selected: "Quiz Topics", the eight existing topics in production order, one quiz card each. |
| 3 | `03-all-topic-cards-1366.png` | The cards region on its own. |
| 4–10 | `04-card-…` … `11-card-…-1366.png` | One capture per card, in manifest order (file names follow the quiz, the card shows its production topic). |
| 11 | `11-pdf-details-1366.png` | The Details page of the first card's quiz. |
| 12 | `12-downloaded-pdf-page-1.png`, `12b-downloaded-pdf-answers-page.png` | Page 1 and the final "Answers" page rendered from the bytes production actually served (sha256 equal to the owner's file). |
| 13 | `13-mobile-390-grade-6.png`, `13b-mobile-375-grade-6.png`, `13c-mobile-430-grade-6.png` | Phone widths. |
| 14 | `14-mobile-320-grade-6.png`, `14b-mobile-320-text-200.png` | 320px, and 320px at 200% text. |
| 15 | `15-tablet-768-grade-6.png`, `15b-tablet-820-grade-6.png` | Tablet widths. |
| 16 | `16-desktop-1366-first-screen.png`, `16b-desktop-1180-grade-6.png`, `16c-desktop-1366-grade-6.png` | Desktop. |
| 17 | `17-desktop-1920-grade-6.png` | 1920px. |
| 18 | `18-anonymous-1366.png`, `18b-anonymous-390.png` | Anonymous visitor: banner Quiz PDFs → `/access?next=/quizzes`. |
| 18 | `18c-signed-in-trial-eligible-390.png`, `18d-used-trial-390.png` | Signed-in without access → `/subscription?next=/quizzes` (trial card; "Trial ended" → subscription options). |
| 19 | `19-subscriber-390-first-screen.png`, `19b-active-trial-390.png` | Entitled accounts (subscriber, active trial) on the Quiz PDFs page. |
| 20 | `20-webkit-390-grade-6.png` | WebKit render of the populated page. |
