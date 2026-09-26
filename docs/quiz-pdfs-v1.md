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
| View | `/resources/[id]` details page (entitlement re-checked), preview images when published | identical, plus (hotfix 2026-09-26, section 6) an in-app PDF preview at `/resources/[id]/preview` for quizzes only |
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

## 6. Hotfix 2026-09-26: banner cleanup + Quiz PDF preview

Branch `hotfix/remove-banner-authorize-add-quiz-preview` (from `main` d6f5549, the v1.2.13 state).
Released as **v1.2.14** on 2026-09-26: production runtime `a86fa50` (`mathnexa.com` =
`dpl_6uyvVoMMuua6gpG5arrUMW3mnZVZ`), which adds the preview header reflow fix for 320 px with 200%
text (branch `hotfix/quiz-preview-200pct-reflow`) to the first production runtime `3cbe09d`; record:
`docs/releases/mathnexa-banner-cleanup-quiz-preview-hotfix.md`. Two focused changes, nothing else:

### 6a. Authorize Code removed from the banner

- The banner's "Authorize Code" item (key icon + link, the third banner row below 80rem and the
  outlined action beside the call to action from 80rem) is gone: `components/layout/authorized-code-link.tsx`
  deleted, `site-header.tsx` no longer renders it, `styles/conversion.css` lost the `"code code code"`
  grid row and every `.banner-code-link` rule. The banner is brand | six products | call to action |
  account menu, in every account state and on every route.
- The homepage Authorize Code form is unchanged (`components/public/teacher-first-home.tsx`, anchor
  `AUTHORIZED_ACCESS_ANCHOR`; since v1.2.15 it renders for signed-out visitors only, see section 7),
  as are the copies on `/access`, `/sign-in` and `/sign-up`, the
  password-style Code field with Show/Hide, the server validation, the generic denial and the
  school-access session. No code is ever placed in a URL, a log, `localStorage` or `sessionStorage`.
- Tests: `components/site-header.test.tsx` (no Authorize Code link in ten account states and ten
  routes, exactly six product links, every banner link a known destination), phase 9 flow spec
  (form + Show/Hide + web storage untouched, banner link count 0 at 390 and 1366, six product
  links on `/access`, `/sign-in` and `/pricing`), `test/security/quiz-pdfs-boundary.test.ts`
  and `scripts/audit-quiz-pdfs.mjs` (source guards).

### 6b. Preview on every Quiz PDF

- Quiz cards now read `[Preview] [Details] [Download PDF]`; the details page of a quiz offers
  Preview too. Homework cards are untouched (no Preview).
- `/resources/[id]/preview` (`app/resources/[resourceId]/preview/{layout,page,loading}.tsx`): quiz
  resources only (`quiz_pdf` with an accepted primary PDF, otherwise 404), guarded by
  `requireProductAccess("/quizzes")` in the layout **and** the page, exactly like `/quizzes`
  (anonymous → HTTP 307 `/access?next=/quizzes`, signed in without access → 307
  `/subscription?next=/quizzes`). The layout gate matters: with a `loading.tsx` boundary a redirect
  issued only by the page would stream as a 200 shell, so the layout refuses first. Header: grade /
  topic path, quiz title, lead sentence, then Back to Quiz PDFs, Details and Download PDF.
- `/resources/[id]/inline` (`app/resources/[resourceId]/inline/route.ts`): a copy of the download
  route with the same authorization step for step (entitlement decision → `record_resource_download`
  for a consumer principal → 60-second signed URL fetched server-side and streamed), quiz resources
  only, and `Content-Disposition: inline` instead of `attachment`. `Content-Type: application/pdf`,
  `Cache-Control: private, no-store, max-age=0`, `nosniff`, `Referrer-Policy: no-referrer`. The
  same private object, the same bytes (sha256 verified), no public URL, no redirect to storage.
  Each authorized inline delivery is recorded in `resource_download_events` like a download.
- `components/resources/pdf-viewer.tsx`: pdf.js (`pdfjs-dist` 6.3.289) in a same-origin bundled
  module worker (`components/resources/pdf-worker.ts`, allowed by `worker-src 'self'`), fetching
  the inline route with credentials and drawing one `<canvas role="img">` per page, fitted to the
  page width and re-fitted when the width moves by 48px or more (rotation, a real resize; the
  ~17px scrollbar that appears once pages exist is ignored so the viewer never clears and loops).
  No `<iframe>`, `<object>` or `<embed>` (iOS Safari cannot scroll a framed PDF and would otherwise
  offer a download), no WebAssembly, no eval, no browser storage. If drawing fails the viewer says
  so and offers the same inline route in a new tab plus the download. The quiz PDFs embed all
  their fonts (Poppins) and use plain JPEG images, so no standard-font or decoder assets are
  needed.
- Known, pre-existing and dev-only: the local dev server prints React's "eval() is not supported
  in this environment" console error on every page because the app's CSP carries no
  `'unsafe-eval'` (React development builds only; production builds never eval). The local e2e
  ignores that one message; the staging review (a production build) asserts a clean console.
- `styles/resources.css`: preview header, action row and page canvases (max 60rem wide, one
  column, forced-colors variant).
- Tests: `components/resources/pdf-viewer.test.tsx` (credentials + no WebAssembly, one labelled
  canvas per page, failure fallback, worker released on unmount); `test/security/quiz-pdfs-boundary.test.ts`
  (the inline route's query chain and authorization are byte-for-byte the download route's, the
  preview page is quiz-only and entitlement-gated, the viewer embeds and stores nothing); e2e
  `e2e/quiz-pdfs/` (anonymous preview 307 + inline 401 for all eight, non-subscriber routing,
  entitled inline delivery with exact bytes / inline disposition / no-store / evidence, all eight
  previews drawn page by page on Chromium and WebKit, review widths and a 390 px phone with axe,
  Back to Quiz PDFs, Homework cards without Preview, keyboard order Preview → Details → Download PDF).
- Review harness (`scripts/review-quiz-pdfs-staging.mjs`, staging launcher or production
  launcher): the banner (six products, no Authorize Code item) at all nine widths and 320 px at
  200% text, each banner destination clicked at 390 px (anonymous and subscriber), the homepage
  Authorize Code card for signed-out visitors at all nine widths (masked, Show/Hide, a typed value
  never in the URL or web storage, one wrong dummy code refused by the server's existing validation)
  and its absence for every signed-in state (section 7), every card's Preview / Details / Download PDF, all eight previews drawn,
  no download when Preview is selected, last page reachable by scrolling, Download PDF from the
  preview (exact bytes, Chromium and WebKit), Back to Quiz PDFs, keyboard order and focus on the
  preview page, access states, inline delivery headers and bytes, axe, and every quiz preview at
  320 and 390 px with 200% text in both engines (no horizontal overflow, the title wraps, actions and
  pages on screen, last page reachable). Any refusal a page meets on a resource route is recorded with
  the app's stated reason. Console and page errors are
  classified (preview-toolbar / aborted / RSC / app); only app errors fail a run. On protected
  previews it sends `x-vercel-skip-toolbar: 1`, and it waits until in-flight requests finish before
  its own navigations (WebKit reports a Next.js prefetch cancelled by a navigation as "access
  control checks"; Playwright's `networkidle` does not re-check once reached). The review accounts'
  download-evidence rows are counted in the notes before the accounts are deleted.

## 7. Hotfix 2026-09-26: the homepage Authorize Code card is for signed-out visitors only (v1.2.15)

Branch `hotfix/hide-authorize-code-after-signin` (from `main` ed17ed4, the v1.2.14 state). One
rendering condition, nothing else:

- `components/public/teacher-first-home.tsx` renders the whole card container
  (`<div id={AUTHORIZED_ACCESS_ANCHOR} className="teacher-home-authorized-access">`) only when
  `authState === "signed-out"`. Inside it nothing changed: the Authorize Code form, or the existing
  "Authorized access active" exit panel for a visitor who already entered a code.
- `authState` is computed on the server by the homepage route (`app/page.tsx`) from
  `getGameAccessView()`: `anonymous` / `unconfigured` (no user session) is signed out;
  `unconfirmed` and every account status (`active`, `suspended`, `deletion-pending`, a missing
  account row) is an authenticated session. The decision is "an authenticated session exists", not
  entitlement: non-subscribers, trial-eligible, active-trial, used-trial, subscriber, scheduled
  cancellation, renewal grace and payment-problem accounts all get no card. The page is rendered on
  the server (`force-dynamic`), so the card is never sent and then hidden: no flicker, no CSS hiding,
  no empty space (the hero copy ends on its actions).
- This restores the rule the homepage had before v1.2.12, which made the card permanent so the
  banner's Authorize Code link had a target; v1.2.14 removed that link. The server action already
  refused codes from signed-in sessions (`authorizeSchoolAccessAction` redirects any
  non-anonymous context to its destination), so a signed-in visitor had a form that could not work.
- Unchanged: the form component, the masked Code field and Show/Hide, server validation, the
  generic denial, the rate limit, the school-access session and cookie, the `/access`, `/sign-in`
  and `/sign-up` copies, the account page's code section, entitlement, billing, the banner (still six
  products and no Authorize Code item). No code in any URL, log, `localStorage` or `sessionStorage`.
- Tests: `components/public/home-page-authorize-code.test.tsx` (the real homepage route through
  every session the server can report: anonymous and unconfigured show the card with a working
  Show/Hide; an active school-code session keeps its exit panel; unconfirmed, missing account,
  non-subscriber, no evidence, active trial, trial pending, subscriber, scheduled cancellation,
  grace, used trial, payment problem, ended subscription, suspended and deletion-pending render no
  card), `components/public/teacher-first-home.test.tsx` (A: signed out present with Show/Hide;
  B-F: no container, heading, field, eye control or Continue for any signed-in state, the hero copy
  ends on its actions), `test/security/quiz-pdfs-boundary.test.ts` and `scripts/audit-quiz-pdfs.mjs`
  (source guards: the signed-out condition wraps the container, no stylesheet hides it, the form's
  action and field unchanged), phase 9 flow spec (anonymous card at all nine widths; signed-in
  non-subscriber, used trial, payment problem, subscriber and active trial with the card absent from
  the document, no trailing space in the hero copy, the next section at the ordinary gap and no
  horizontal overflow, the non-subscriber and subscriber at all nine widths; the card back after
  sign-out). Each new test fails against the v1.2.14 component.
- Review harness: the anonymous card at all nine widths plus one wrong dummy code sent with Continue
  (the server's generic refusal, nothing in the URL or web storage); a payment-problem synthetic
  account; no card on the homepage for the trial-eligible, used-trial, payment-problem and
  active-trial accounts at 390 px, the subscriber at all nine widths, and the WebKit subscriber at
  390 px; owner screenshots `26a`-`26g`.
