# MathNexa Quiz PDFs V1 — production release record

Released 2026-09-26 (owner approval: "OWNER PRODUCTION APPROVAL — QUIZ PDFs V1", then
"OWNER DECISION: OPTION A APPROVED"). No secrets appear in this record.

## What shipped

- **Product:** Quiz PDFs, Grade 6, eight topic quizzes — the owner's approved PDFs, stored
  byte-for-byte and served only through the entitlement-protected download route that Homework
  PDFs already use.
- **Organization:** Grade → existing production Topic → Quiz PDF. The eight quizzes were attached
  to the eight Grade 6 curriculum topics that already existed in production (the Homework PDFs
  taxonomy), through the explicit mapping in `content/quiz-pdfs/production-topic-map.json`.
  New shared topics created: **0**. Topics renamed or renumbered: **0**. Lesson assignments
  created for quizzes: **0**. Homework PDFs unchanged (8 topics, 59 published lessons and 167
  lesson assignments before and after).
- **Blueprint reused:** the Homework PDFs route trio, server-side entitlement gate, catalog
  loader, page component, card, private Supabase Storage bucket, signed-URL download proxy
  (`attachment`, `no-store`), responsive CSS and empty states. The quiz page shows one grade
  control, then every topic of that grade as a card ("Quiz Topics"); no Topic or Lesson selector.
- **Answer pages preserved:** every PDF keeps its own final "Answers" page; no separate keys.

| Production topic (existing) | Quiz PDF (verbatim title) | Download filename |
| --- | --- | --- |
| 1 Use Positive Rational Numbers | Positive Rational Numbers Practice | `grade-6-positive-rational-numbers-quiz.pdf` |
| 2 Integers and Rational Numbers | Integers And Rational Numbers | `grade-6-integers-and-rational-numbers-quiz.pdf` |
| 3 Numerical and Algebraic Expressions | Numeric and Algebraic Expressions | `grade-6-numeric-and-algebraic-expressions-quiz.pdf` |
| 4 Equations and Inequalities | Represent and Solve Equations | `grade-6-represent-and-solve-equations-quiz.pdf` |
| 5 Ratios, Rates, and Unit Conversions | Ratios And Rates Practice | `grade-6-ratios-and-rates-quiz.pdf` |
| 6 Percents | Understanding and Using Percent | `grade-6-understanding-and-using-percent-quiz.pdf` |
| 7 Area, Surface Area, and Volume | Area Surface Area Volume Practice | `grade-6-area-surface-area-volume-quiz.pdf` |
| 8 Statistics and Data Distributions | Displaying Describing Summarising Data | `grade-6-displaying-describing-summarising-data-quiz.pdf` |

## Code release

- Branch `feature/quiz-pdfs-v1`; main fast-forwarded `1846076e → d72c788` (merge --ff-only, no
  code change during merge). Application code certified on staging as `074e081f`; `c929306` and
  `d72c788` added tooling, docs and review packs only.
- Post-merge gates on `d72c788`: TypeScript 0 errors; ESLint 0 errors (8 pre-existing warnings);
  web unit 666 (+1 skip); core unit 245; quiz manifest tests and `quiz-pdfs:audit` (8 expected,
  8 valid, 0 broken, 0 duplicates, 0 cross-grade, 0 lesson assignments); quiz route/entitlement
  e2e 14/14 (Chromium + WebKit); phase 9 17/17; production build; security 288 tests + 2 audits.
- Pipeline (`scripts/run-nextjs-hotfix-production.mjs` mechanics, re-pinned): preflight PASS →
  candidate `dpl_97Z79gBiGEA13Gaia4bTAEascGKy` (`--prod --skip-domain`, build `d72c788`) →
  probe-preview PASS 7/7 → promote → probe-live PASS 20/20.
- **Production deployment:** `dpl_97Z79gBiGEA13Gaia4bTAEascGKy`
  (https://mathnexa-platform-production-3a4op0iix-bright-path-ed-tech.vercel.app) on
  mathnexa.com, www and the configured webhook host. Source commit `d72c788`.
- **Rollback (retained, READY):** `dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N` (v1.2.12 hotfix runtime
  `b7138368`): `node <scratch>/release-quiz.mjs --stage=rollback` from the release worktree, or
  `vercel promote dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N --scope bright-path-ed-tech`. Rolling the
  code back leaves the published quiz content in place; the previous page shape renders it too.

## Content release (production database)

- Actor: the real owner admin row (sole active MFA-enrolled owner), through
  `scripts/invoke-quiz-pdfs-production.ps1 -Stage apply -TopicMap content/quiz-pdfs/production-topic-map.json`
  (vault production project ref and service key only; nothing printed). No synthetic owner.
- Plan before apply: grade reused, topics reused 8 / created 0, quizzes created 8, files 8,
  deletes 0, conflicts 0. Apply: created 8, published 8, skipped 0.
- Deep verify (`-Stage verify-deep`): 8/8 — resource published and topic-scoped; correct grade and
  mapped topic; verbatim title; private bucket (`resource-files`, public = false); object
  downloaded and re-hashed equal to the owner's file (sha256 and byte size); valid PDF header and
  end marker; page counts 4/3/4/5/5/4/5/5 confirmed with poppler; unique object paths; 0 lesson
  assignments.
- Homework safety: Grade 6 topics 8 → 8; lessons 59 → 59 (published 59 → 59); lesson assignments
  167 → 167; titles, slugs and sort orders unchanged.

## Live verification (mathnexa.com, after promotion)

See `owner-review/quiz-pdfs-v1/production/` (captures + `NOTES.txt`). Summary lines are filled
in from that run; anonymous, non-subscriber, used-trial, active-trial and subscriber states were
exercised with temporary synthetic accounts that were deleted at the end of the run.

- Result: **87/87 checks** (Chromium + WebKit), health build `d72c788`, 0 console/page errors, 0 5xx.
- Anonymous: `/quizzes` → 307 `/access?next=/quizzes`; all eight downloads → 401 (no PDF bytes);
  guessed stored-copy path → 404; banner Quiz PDFs click lands on the access page.
- Signed-in without access (trial-eligible) → `/subscription?next=/quizzes` ("Start your free
  trial"); used trial → `/subscription?next=/quizzes` ("Trial ended", no second trial);
  active trial and subscriber → Quiz PDFs page.
- Page: one grade control offering exactly the existing grade row; no Topic or Lesson selector;
  8 cards in production topic order (Topics 1–8, existing titles) each with its verbatim quiz
  title, "Quiz PDF" designation and "Answer key: Included in PDF"; no lesson wording; banner item
  current.
- Downloads (subscriber): all eight 200 `application/pdf`, `attachment; filename="grade-6-…-quiz.pdf"`,
  byte counts and sha256 equal to the owner's files; 8 download events recorded; details page
  and "Back to library" work.
- Responsive: 320 / 375 / 390 / 430 / 768 / 820 / 1180 / 1366 / 1920 — 8 cards, 0 px overflow,
  0 clipped labels, touch targets ≥ 44 px; 320 at 200% text 0 px overflow; forced colors render.
- Accessibility: axe 0 serious/critical (landing and grade selected, 1366 and 390, both engines);
  Chromium keyboard walk reaches Details and Download PDF with a visible focus ring; WebKit
  keyboard walk not run (documented Windows WebKit sequential-focus policy, unchanged).
- Security (live): private bucket, no PDF under `public/`, anonymous raw download denied,
  guessed content path 404, entitlement enforced server-side, `no-store` download proxy,
  60-second signed URL preserved, no secret in client assets (security audits pass).

## Known follow-ups (not part of this release)

- The production Grade 6 row is titled "grade 6" (lowercase) in the existing taxonomy; the quiz
  page shows that title as it is. Changing it is an owner content-label decision.
- Quiz cards show "Difficulty: Not specified" and "Recommended time: Not specified" (the PDFs do
  not state them); the owner can set both through the admin revise flow.
- Next platform tag: v1.2.13 (owner closeout; this record is committed docs-only after promotion,
  following the pattern of earlier records).

## Release closeout (2026-09-26, v1.2.13)

- **Tag:** annotated `v1.2.13` → runtime commit `d72c788` ("MathNexa v1.2.13 — Quiz PDFs V1"), following the
  repository convention (v1.2.10–v1.2.12 tag the runtime commit; the release record is a docs-only commit
  after the tag). Main at closeout: `a522df3` + this closeout commit; production still serves `d72c788`
  (health build confirmed at closeout), `dpl_97Z79gBiGEA13Gaia4bTAEascGKy` on the apex.
- **Read-only re-verification at closeout:** production plan shows 8 quizzes already published with the
  identical files (skip 8, conflicts 0); deep verify 8/8; Grade 6 inventory unchanged (8 topics, 59 published
  lessons, 167 lesson assignments, one published quiz per topic, no Topics 9–15, 0 quiz lesson assignments).
  No database writes were made during closeout.
- **Rollback (unchanged, do not delete):** `dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N` (READY). Procedure:
  `vercel promote dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N --scope bright-path-ed-tech`, then confirm
  `https://mathnexa.com/api/health` reports build `b7138368…`. Rolling the code back keeps the published quiz
  content; the previous page shape renders it with a Topic selector.
- **Staging difference (known, not reconciled):** staging holds the earlier quiz-specific Grade 6 topic
  taxonomy created during staging certification; production uses the approved Option A mapping onto the
  existing Grade 6 curriculum topics. Backlog: *Align Quiz PDFs staging taxonomy with production topic
  mapping before the next Quiz PDFs content expansion.* No code or database change now.
- **Backlog (recorded, not implemented):**
  - A. Grade label capitalization: production grade row title is "grade 6"; a future label could be "Grade 6"
    (owner content-label decision; the quiz page shows the row title as stored).
  - B. Quiz metadata: cards show "Difficulty: Not specified" and "Recommended time: Not specified" (not stated
    in the PDFs; do not invent values; settable through the admin revise flow).
  - C. Additional grades: the quiz corpus is Grade 6 only; Grades 3, 4, 5, 7 and 8 require actual
    owner-approved quiz PDFs before any publication.
- **Cleanup:** temporary worktrees `C:/GitHub/mathnexa-quiz-pdfs` (feature development, staging
  certification) and `C:/GitHub/mathnexa-release-d72c788` (pristine production release source) removed after
  confirming main, the release docs and the tag were pushed and no unique review evidence remained only there
  (all review packs are committed under `owner-review/quiz-pdfs-v1/`). The main checkout
  `C:/GitHub/mathnexa-platform`, the approved source PDFs and the production/rollback deployments were not
  touched. The local branch `feature/quiz-pdfs-v1` is kept (merged).
