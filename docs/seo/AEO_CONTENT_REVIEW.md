# Initial improvement 3 — public homework guidance

Status: implemented on the review branch; **not deployed**. Owner review required.
Target: https://mathnexa.com/homework-pdfs#practice-example
Evidence date: 2026-11-27. Existing live page is HTTP 200 with metadata and
canonical intact; source contains product features and a live catalog summary,
but no worked example or explanation of how to use a homework activity.
No Search Console demand, ranking or conversion measurement is available.

Hypothesis: an answer-first practice routine and original worked example make
this existing canonical page more useful to parents and easier to cite. This
is a content-quality hypothesis, not a predicted ranking or subscription lift.
Priority: medium. Review after release plus a complete 28-day observation window.

The change adds two semantic sections, a durable anchor, three practice items
and expandable answer reasoning. It preserves dynamic catalog facts, metadata,
access CTA, prices, trial copy and all subscription/school gates. No paid lesson
is reproduced. No additional FAQ schema, llms.txt or claimed educator endorsement.
The two earlier access investigations remain counted in the initial cap; this
is the third and final initial website proposal. Future proposals use the shared
maximum of two per Chicago week after this initial review is completed.

## Public resource copy for editorial review

Choose one topic your child is working on. Ask them to explain an example, try
a related problem independently, and check the reasoning together. Return to a
drawing or a simpler example if needed.

3/4 − 1/8 = 5/8. Fractions must refer to the same whole. Draw a rectangle with
eight equal parts; shade six to show 3/4 = 6/8. Cross out one shaded eighth.
Five eighths remain. Check: 5/8 + 1/8 = 6/8 = 3/4. The denominator stays 8
because the size of each part has not changed.

Practice: 1/2 + 1/4 = 3/4; 5/6 − 1/3 = 1/2; 7/8 − 1/4 = 5/8.
The page includes the equivalent-fraction steps for all three answers.
Arithmetic was independently checked with exact rational arithmetic. No grade
alignment, empirical learning effect, search volume or tested classroom outcome
is claimed. Upstream claim-gap lint is supplementary and is not a math verifier.

Validation: production build, workspace typecheck, targeted ESLint and 50 existing
public-page/metadata/catalog tests pass after restoring the existing npm lockfile.
No dependency or lockfile change. PageSpeed mobile returned HTTP 429; no score.
The local production-mode browser smoke could not reach the page because the
app correctly returned 503 with backend credentials disabled. No gate was
bypassed to obtain a preview. Mobile rendering remains a release verification
item on an authorized configured preview; the reviewable source diff is ready.

## Other existing pages inspected

- `/online-math-prep`: already has public Grades 1–8 positioning and a unit-rate
  worked example. Keep it as ShowMe's marketing entry point, not the gated app.
- `/math-games`: public collection/entry descriptions; paid game access remains
  separate. Do not describe all games as free.
- `/quiz-pdfs`: live catalog-driven grades/topics; do not fabricate availability
  or assert universal answer-key coverage.
- `/about`, `/help`, `/math-games/math-tug-of-war`, `/`: included in the public metadata audit.
  Passing the implemented checks is not a complete technical/indexing audit.

No second content proposal is queued until the initial cap and owner review
are reconciled. Release through the existing manual production process; verify
HTTP 200, canonical, anchor, mobile layout and unchanged gated destinations after
release. Rollback only this page's added sections if needed.
