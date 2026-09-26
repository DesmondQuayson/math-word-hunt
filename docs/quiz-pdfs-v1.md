# Quiz PDFs V1

Quiz PDFs is the owner's collection of topic-by-topic quiz PDFs, published through the same
protected resource library that already serves Homework PDFs. This document records what was
inspected, what was reused, what changed, how the content is published, and how it is verified.

## 1. The Homework PDFs blueprint (audit)

| Concern | Homework PDFs (existing) | Reused for Quiz PDFs |
| --- | --- | --- |
| Route | `/homework` (`app/homework/{layout,page,loading}.tsx`) | `/quizzes` (`app/quizzes/…`), same three files, same shape |
| Access gate | `requireProductAccess("/homework")` in the layout and the page (`lib/access/server.ts`) | `requireProductAccess("/quizzes")`; module `quizzes` under the single all-access entitlement |
| Anonymous | HTTP 307 → `/access?next=/homework` | 307 → `/access?next=/quizzes` |
| Signed in, no access | 307 → `/subscription?next=/homework` (trial card, or "Trial ended" → `/pricing`) | identical, with `/quizzes` remembered |
| Entitled (trial, subscription, grace, canceling, school code) | page renders | identical |
| Organization | Grade → Topic → Lesson (`content_lessons` + `lesson_resource_assignments`) | Grade → Topic (`topic_resource_assignments`, `resource_scope = topic`, `scope_status = current`) |
| Catalog read | `loadPublicResourceLibrary("homework")` (`lib/resources/catalog.ts`) | `loadPublicResourceLibrary("quizzes")` |
| Page component | `PublicResourceLibrary` (`components/resources/public-resource-library.tsx`) | same component, `kind="quizzes"` branch |
| Card | preview image or grade placeholder, path, title, description, Difficulty / Recommended time / Answer key, Details + Download PDF (+ Answer key) | same card plus a "Quiz PDF" designation label |
| PDF storage | private Supabase Storage bucket `resource-files`, rows in `resource_files` with sha256 and structural validation evidence | identical |
| Download | `/resources/[id]/download`: entitlement decision → `record_resource_download` → 60-second signed URL fetched server-side and streamed as `attachment` with `no-store` | identical |
| View | `/resources/[id]` details page (entitlement re-checked), preview images when published | identical |
| Responsive | `styles/resources.css`: two-column cards ≥ 48rem, one column below, tighter padding ≤ 22rem, forced-colors rules | identical, plus quiz-only rules appended |
| Empty states | truthful "No published … yet" / "Choose …" states, `role="status"` for result states | identical wording pattern |
| Analytics | `resource_download_events` per authorized download | identical |

Nothing in the entitlement model, billing, Stripe, Supabase auth, the product banner, Math Games,
Online Math Prep, the Worksheet Generator, ShowMe Math or the Homework PDFs content changed.

## 2. What changed for Quiz PDFs

- `components/resources/public-resource-library.tsx`: the quiz branch is now topic-by-topic in
  practice, not just in data. One grade control (only grades that have a published quiz), then
  **every topic of that grade as a card** in topic order under "Quiz Topics". No Topic or Lesson
  selector, no placeholder topics. Hero copy: "Topic-by-topic math quizzes for practice, review,
  and assessment." The Homework branch renders exactly as before.
- Cards carry a "Quiz PDF" designation and show "Answer key: Included in PDF" when the published
  version's manifest says so (`lib/resources/catalog.ts`: `answerKeyIncluded`). The details page
  shows the same row only in that case.
- `styles/resources.css`: quiz-only rules (single-column grade control, topic-list heading,
  designation label, forced-colors variant).
- `content/quiz-pdfs/`: the manifest and the byte-identical stored copies of the owner's PDFs
  (outside `public/`, so never served as static files).
- Scripts: `scripts/quiz-pdfs/{manifest,plan,publish}.mjs`, `scripts/publish-quiz-pdfs.mjs`,
  `scripts/audit-quiz-pdfs.mjs`, `scripts/run-quiz-pdfs-e2e.mjs`, `scripts/invoke-quiz-pdfs-staging.ps1`.
- Tests: component (`public-resource-library.test.tsx`), manifest + planning
  (`lib/resources/quiz-pdfs-manifest.test.ts`), protection boundary
  (`test/security/quiz-pdfs-boundary.test.ts`), browser certification (`e2e/quiz-pdfs/`),
  and the phase 9 flow spec now expects no Topic selector on `/quizzes`.

## 3. Inventory (owner upload 2026-09-25, folder `leeson Quiz/grade 6 quiz`)

All eight files are Grade 6, letter size, producer "airSlate inc. Mellivora 3.15", unencrypted,
embedded Poppins fonts, no forms, scripts, launch actions, attachments or external actions. Every
file ends with an "Answers" page, so the answer key is included in the PDF itself; no separate
answer-key files were uploaded and none were generated.

| # | Exact uploaded filename | Pages | Bytes | Topic (quiz card path) | Quiz title (verbatim page-1 title) | Download filename |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | `Ratios And Rates Practice (1).pdf` | 5 | 532,861 | Ratios and Rates | Ratios And Rates Practice | `grade-6-ratios-and-rates-quiz.pdf` |
| 2 | `Understanding and Using Percent (1).pdf` | 4 | 478,014 | Understanding and Using Percent | Understanding and Using Percent | `grade-6-understanding-and-using-percent-quiz.pdf` |
| 3 | `Positive Rational Numbers Practice (1).pdf` | 4 | 1,060,871 | Positive Rational Numbers | Positive Rational Numbers Practice | `grade-6-positive-rational-numbers-quiz.pdf` |
| 4 | `Integers And Rational Numbers (1).pdf` | 3 | 145,654 | Integers and Rational Numbers | Integers And Rational Numbers | `grade-6-integers-and-rational-numbers-quiz.pdf` |
| 5 | `Numeric and Algebraic Expressions (1).pdf` | 4 | 737,164 | Numeric and Algebraic Expressions | Numeric and Algebraic Expressions | `grade-6-numeric-and-algebraic-expressions-quiz.pdf` |
| 6 | `Represent and Solve Equations (1).pdf` | 5 | 609,316 | Represent and Solve Equations | Represent and Solve Equations | `grade-6-represent-and-solve-equations-quiz.pdf` |
| 7 | `Area Surface Area Volume Practice (1).pdf` | 5 | 682,816 | Area Surface Area Volume | Area Surface Area Volume Practice | `grade-6-area-surface-area-volume-quiz.pdf` |
| 8 | `Displaying Describing Summarising Data (1).pdf` | 5 | 619,124 | Displaying Describing Summarising Data | Displaying Describing Summarising Data | `grade-6-displaying-describing-summarising-data-quiz.pdf` |

Classification notes (nothing inferred beyond the file itself):

- The topic title is the PDF's own page-1 title without the trailing word "Practice"; "And" is
  written "and" where the file used title case. No words were added; files 7 and 8 keep their
  original wording without added punctuation, and file 8 keeps the spelling "Summarising".
- The quiz title on the card is the page-1 title verbatim. The description is the PDF's own
  "Success Criteria" bullets plus the sentence "Answers are included on the final page."
- Difficulty and recommended time are not stated in the files, so the cards show
  "Not specified" (the blueprint's wording); the owner can set them later through the admin.
- Topic order: the files carry no numbering, so the manifest follows the Missouri Grade 6 strand
  order MathNexa Online Math Prep already uses (ratios/proportional relationships → number sense →
  expressions/equations/inequalities → geometry/measurement → data/statistics). This is recorded
  in the manifest (`topicOrder`) and is the only editorial decision in the corpus.
- sha256 of each stored copy equals the owner's file; the download route streams those exact bytes.

## 4. Publishing the manifest (runbook)

The manifest is published through the same RPCs the admin interface uses; nothing is written to
the database by hand.

```bash
npm run quiz-pdfs:audit            # offline: manifest, files, no public PDF, app wiring
npm run quiz-pdfs:plan             # read-only plan against the local Supabase stack
npm run quiz-pdfs:publish:local    # publish locally with a synthetic owner (revoked afterwards)
npm run quiz-pdfs:verify:local     # DB proof + anonymous route probes against :3000
npm run quiz-pdfs:staging -- -Stage plan|apply|verify   # STAGING project only (vault launcher)
```

Rules the planner enforces:

- An existing grade (matched by grade number) or topic (matched by slug, then by title ignoring
  case/punctuation) is reused; a grade that already has topics keeps its numbering and new topics
  are appended after them, so existing "Topic N" labels never move.
- A quiz that is already published with the identical file is skipped; a different file or a
  second quiz in the same topic is a conflict that stops the run (the database allows one current
  published quiz per topic).
- Writes to a hosted project need `--confirm-host`; the production project additionally needs
  `--production` and a real owner actor (`--actor-email` / `--actor-admin-id`, MFA-enrolled).
  A synthetic owner is never created on production.

Production publication is a separate owner-gated step and is not part of this phase.

## 5. Verification

- `npm run test:quiz-pdfs` — unit: manifest integrity and structural PDF validation, planning
  rules, component behaviour for both libraries, protection-boundary guards; then the offline audit.
- `npm run test:e2e:quiz-pdfs` — browser certification on the local production-platform rehearsal
  (Chromium and WebKit): anonymous 307 + 401, non-subscriber and used-trial routing, entitled
  browsing Grade → Topic with all eight cards in order, byte-identical downloads with the blueprint's
  headers, details page, Homework blueprint unchanged, nine review widths without overflow, 200%
  text at 320px, forced colors, axe (0 serious/critical) and keyboard focus.
- Existing gates: typecheck, lint, web + core unit suites, phase 9 flow suite, production build,
  security baseline (`test/security` now includes the quiz boundary test).
