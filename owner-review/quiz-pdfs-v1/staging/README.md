# Quiz PDFs V1 — staging owner review pack

Captured 2026-09-26 against the STAGING deployment `dpl_3wUMF9WLvpTYaGDg4RB9bvGMoZDs`
(https://mathnexa-platform-staging-hn4udr7xa-bright-path-ed-tech.vercel.app, build `074e081f`)
after the eight Grade 6 quiz PDFs were published into the staging database and private storage
with `npm run quiz-pdfs:staging -- -Stage apply`. Everything below went through the real staging
sign-in with synthetic consumer accounts that were deleted at the end of the run
(`scripts/review-quiz-pdfs-staging.mjs`, launched by `-Stage review`). Only Grade 6 exists in the
uploaded corpus, so there are no Grade 3, 4, 5, 7 or 8 captures. Production was not touched.

| Step | File | What it shows |
| --- | --- | --- |
| 1 | `01-landing-1366-subscriber.png` | Quiz PDFs landing page (subscriber) before a grade is chosen. |
| 2 | `02-grade-6-selected-1366.png` | Grade 6 selected: "Quiz Topics", the eight cards in topic order. |
| 3 | `03-all-topic-cards-1366.png` | The cards region on its own. |
| 4–10 | `04-card-ratios-and-rates-1366.png`, `05-card-percent-1366.png`, `06-card-positive-rational-numbers-1366.png`, `07-card-integers-and-rational-numbers-1366.png`, `08-card-expressions-1366.png`, `09-card-equations-1366.png`, `10-card-geometry-measurement-1366.png`, `11-card-data-1366.png` | One capture per topic card (designation, path, verbatim title, success criteria, answer key, Details / Download PDF). |
| 11 | `11-pdf-details-1366.png` | The Details page of the Ratios and Rates quiz. |
| 12 | `12-downloaded-pdf-page-1.png`, `12b-downloaded-pdf-answers-page.png` | Page 1 and the final "Answers" page rendered from the bytes staging actually served (sha256 equal to the owner's file). |
| 13 | `13-mobile-390-grade-6.png`, `13b-mobile-375-grade-6.png`, `13c-mobile-430-grade-6.png` | Phone widths. |
| 14 | `14-mobile-320-grade-6.png`, `14b-mobile-320-text-200.png` | 320px, and 320px at 200% text. |
| 15 | `15-tablet-768-grade-6.png`, `15b-tablet-820-grade-6.png` | Tablet widths. |
| 16 | `16-desktop-1366-first-screen.png`, `16b-desktop-1180-grade-6.png`, `16c-desktop-1366-grade-6.png` | Desktop. |
| 17 | `17-desktop-1920-grade-6.png` | 1920px (Smart Board / large display). |
| 18 | `18-anonymous-1366.png`, `18b-anonymous-390.png` | Anonymous visitor: banner Quiz PDFs → `/access?next=/quizzes`. |
| 18 | `18c-signed-in-trial-eligible-390.png`, `18d-used-trial-390.png` | Signed-in without access → `/subscription?next=/quizzes` (trial card; "Trial ended" → subscription options). |
| 19 | `19-subscriber-390-first-screen.png`, `19b-active-trial-390.png` | Entitled accounts (subscriber, active trial) on the Quiz PDFs page. |

`NOTES.txt` is the run log: every check (`ok` / `FAIL`), the eight downloads with byte counts and
sha256, the responsive measurements, the axe results and the account cleanup.
