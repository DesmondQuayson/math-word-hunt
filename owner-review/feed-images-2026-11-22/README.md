# MathNexa feed images (prepared 22 November 2026)

**Nothing here has been posted, uploaded, shared or scheduled.** These are seven still images for
Facebook feed posts and Instagram-style feeds, kept in the repository so they are ready when the owner
decides to post them from the owner's own accounts. Nothing in the application loads, serves or
publishes them: they are outside `apps/platform-web/public`, so the website never serves them.

| File | Size | What it shows |
| --- | --- | --- |
| `mathnexa-online-math-prep-1080x1350.png` | 1080 x 1350 | Online Math Prep for Grades 3–8 (4:5), practice-question artwork, offer, "Cancel any time" |
| `mathnexa-online-math-prep-1080x1080.png` | 1080 x 1080 | The same, square, without "Cancel any time" |
| `mathnexa-homework-pdfs-1080x1350.png` | 1080 x 1350 | Homework PDFs by grade, topic and lesson (4:5), homework artwork, offer |
| `mathnexa-homework-pdfs-1080x1080.png` | 1080 x 1080 | The same, square |
| `mathnexa-quiz-pdfs-1080x1350.png` | 1080 x 1350 | Quiz PDFs with answer keys (4:5), page 1 and the Answers page of the real Grade 6 quiz, offer |
| `mathnexa-quiz-pdfs-1080x1080.png` | 1080 x 1080 | Quiz PDFs with answer keys (square), the site's quiz-preview artwork, offer |
| `mathnexa-math-games-1080x1080.png` | 1080 x 1080 | Math Bingo Live and Math Race Champions, "Free with a MathNexa account" |

- `images-sheet.png` (1804 x 1368) shows all seven on one sheet.
- `captions.md` has a Facebook caption, an Instagram caption, alt text, a UTM landing URL and a
  suggested date for each image, a pre-post checklist, and the open owner decisions (homework artwork
  patch, games headline, "Cancel any time", the "y = 2.5x" label, landing pages).
- The offer wording is exactly "24-hour free trial, then $5.99 USD a month". Online Math Prep is never
  called free, and answer keys are claimed for Quiz PDFs only. Before posting, check
  https://mathnexa.com/pricing the same day. If the offer has changed, do not post: the images and
  captions need a new render.

## Where they came from

All nine files are byte-for-byte copies (SHA-256 checked) of the owner-review package
`owner-review/organic-2026-11-22/images/` prepared on 22 November 2026. That package stays only in the
owner's local checkout and is not in the repository. It also holds the five vertical videos (233 MB), their
covers, the review sheets and the four-week video plan (`plan.md`). `captions.md` refers to `plan.md`
for posting times and the full checklist; its own checklist has the essential steps.

The images were drawn with code (text in Chrome over approved site and brand artwork, then saved as PNG)
by `build-images.cjs` in that local package. No AI image tool was used. Every text is at least 36 px, nothing
important is within 60 px of an edge, and no text overlaps or wraps.
