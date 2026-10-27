# MathNexa homepage redesign: online math prep (change control)

Branch `feature/homepage-online-prep-redesign`, cut from `origin/main` `bcc0106` (v1.2.25 release record).
Scope: the public homepage only. Production is not touched without the owner's explicit approval.

**Status: RELEASED as v1.2.26 on 2026-10-27** with the owner's approval, from the reviewed candidate `1f24bba`
(production `dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7`, rollback `dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y`). See
`docs/releases/mathnexa-v1.2.26-release-record.md`.

## Owner rules for this change

- Change the homepage experience, not the website system.
- Sign in, Authorize Code, the 24-hour trial, the $5.99/month subscription, checkout, entitlements,
  protected routes, the Super Admin dashboard, Online Math Prep, games, Homework/Quiz PDFs and the
  Worksheet Generator keep their code, layouts and behaviour.
- No database, Supabase, Stripe, authentication, environment, deployment-setting, API or routing change.
- Homepage-scoped styling only: no global CSS edits.

## Design decisions taken (owner can reverse on staging review)

The owner's design questions were interrupted with the session; the recommended options were used:

1. Scope: the hero is rebuilt around Online Math Prep and new homepage sections are added
   (supersedes "the only section after the hero is Featured games", 2026-09-27).
   Still no pricing, trial terms, Praxis or Coming Soon content on the homepage.
2. Headline: a new prep-first H1. The SEO title, the meta description (the owner's exact sentence, still
   shown as the hero lede), the /about page and every navigation label stay exactly as they are.
3. Imagery: original drawn SVG illustrations animated in CSS, plus the real product screenshots.
   No stock or AI photos of people, no invented testimonials, no statistics.

## ALLOWED files

Homepage-only. Anything not on this list is restricted for this change.

| File | Why |
| --- | --- |
| `apps/platform-web/components/public/teacher-first-home.tsx` | The production homepage component. The Authorize Code block, `HeroActions` and `FeaturedGames` are byte-identical to the pre-redesign homepage (indentation restored in round 3). |
| `apps/platform-web/components/public/home/home.module.css` (new) | Homepage-only CSS Module: hashed class names cannot match any other page. |
| `apps/platform-web/components/public/home/*.tsx`, `home-copy.ts` (new) | Homepage-only presentational components (worked-problem board, replay and in-view play, Your turn, in-view helper, marker underline, homepage copy). Imported by the homepage component only. |
| `apps/platform-web/public/media/home/online-math-prep-preview.webp`, `.avif`, `-source.svg` (renamed from `map-prep-preview.*`, round 3) | The homepage-only preview drawing, retitled "Online Math Prep" and renamed so no browser, CDN or image-optimizer cache can serve the old title. |
| `scripts/audit-phase11-security.mjs` (round 3) | One line: the homepage asset it checks now has the new file name. |
| `apps/platform-web/components/public/home/fonts/patrick-hand-latin.woff2`, `PatrickHand-OFL.txt` (new, P1) | Patrick Hand, Google Fonts Latin subset v25 (23,944 bytes, sha256 `ac5bc903…0bbf0199`), SIL Open Font License 1.1, with its licence. Loaded only by the homepage CSS Module. |
| `apps/platform-web/components/public/teacher-first-home.test.tsx` | Homepage unit test: copy, headings and structure assertions follow the new design; every access-control assertion stays. |
| `apps/platform-web/components/public/home-page-authorize-code.test.tsx` | One line: the homepage H1 it reads. |
| `e2e/phase9/teacher-first-access-flow.spec.ts` | Homepage assertions only (H1, eyebrow, product shelf selector). |
| `e2e/phase9/teacher-first-access-flow.spec.ts-snapshots/teacher-first-home-*.png` | Homepage visual baselines, regenerated. |
| `e2e/number-cross/native-number-cross.spec.ts` | One line: the homepage H1 it waits for. |
| `scripts/run-phase9b-hosted-staging.mjs` | One line: the homepage smoke string. |
| `docs/releases/mathnexa-homepage-online-prep-redesign.md` | This record. |

## RESTRICTED files (must not appear in the diff)

- All of `apps/platform-web/app/**`: `app/page.tsx` (server-side `authState`), `app/layout.tsx`,
  `app/globals.css`, every route, every `*-actions.ts`.
- `apps/platform-web/components/auth/**`, `components/consumer/**`, `components/admin/**`,
  `components/games/**`, `components/resources/**`, `components/layout/**`, `components/ui/**`,
  `components/motion/**`, `components/site-header.tsx`, `components/site-footer.tsx`.
- `apps/platform-web/lib/**`, including `lib/seo/platform-positioning.ts` (shared with the layout
  metadata, /about, navigation, footer and the access flow).
- `apps/platform-web/styles/**` (global stylesheets).
- `apps/platform-web/proxy.ts` / middleware, `next.config.*`, `vercel.json`, any `.env*`.
- `supabase/**`, `packages/**`, `package.json`, `package-lock.json`.
- Every other test, script and release pipeline file.

## Regression method

Baseline = `bcc0106` (untouched), candidate = this branch, same machine, same local Supabase
(37 migrations, latest `20260930100000`), same fixture billing provider (no real Stripe calls).
Evidence lives in `qa-artifacts/homepage-redesign/` (git-ignored).

Harness (git-ignored, `qa-artifacts/homepage-redesign/harness/`): `next dev` in local
production-platform rehearsal mode, fixture billing, Super Admin enabled, an authorized code configured.
Synthetic local accounts: signed out, signed in without access, trial-active, authorized-code session,
Super Admin owner (MFA enrolled through the real UI).

- 90 full-page screenshots, desktop 1280 and phone 390: sign-in, sign-up, forgot password, `/access`
  (Authorize Code), pricing, subscription, account, Math Games, Online Math Prep, Homework PDFs,
  Quiz PDFs, Worksheet Generator, game access, admin sign-in, about, help, privacy, terms, and the
  Super Admin dashboard plus its Games, Homework and Online Math Prep sections, in every account state.
  Emails, dates and times are masked.
- Functional facts compared key by key: anonymous protected-route redirects; sign-in with a wrong
  password (error text) and the right one; password Show/Hide; account menu; sign-out and the redirect
  after it; Authorize Code on the homepage (masked field, Show/Hide, wrong code error, right code to
  `/games`, code never in the URL, exit control) and on `/access`; header trial call to action; trial
  entry through the consent form to the fixture checkout; product reach for an entitled and a
  no-access account; primary navigation and footer links and titles on five pages.
- Existing suites, base and candidate: phase 9 homepage/access/checkout/worksheet gating, school-access
  (Authorize Code), Math Tug of War free access, Quiz PDFs, Number Cross (Super Admin MFA + game launch).

## Results (2026-10-26, local, final code)

| Check | Base `bcc0106` | Candidate |
| --- | --- | --- |
| Protected-page screenshots (90) | baseline | 80 pixel-identical; 8 homepage captures changed (intended); Super Admin `/admin` desktop + phone differ only inside the live-data panels (see below) |
| Functional facts (6 flow files) | recorded | identical, 0 differences; candidate re-run 343 facts, 0 differences |
| phase 9 (homepage, access, checkout, worksheet gating) | 17/17 | 17/17 (homepage visual baselines regenerated) |
| school-access (Authorize Code) | 21/21 | 21/21 |
| Math Tug of War free access | 8/8 | 8/8 |
| Quiz PDFs | 20/20 | 20/20 |
| Number Cross (Super Admin MFA, game launch) | 1/1 | 1/1 |
| Unit: core / web | — | 245/245; 906 passed, 1 skipped (v1.2.25: 902 + 4 new homepage tests) |
| `test:security` | — | 321/321; bundle audit (38 client assets); Number Cross launch audit; protection bypass 7/7 |
| Phase 11 and Quiz PDF audits | — | pass |
| typecheck / lint / build | — | clean / 0 errors (8 pre-existing warnings) / pass |
| Homepage axe (1440, 768, 390, 320) | — | 0 violations; no console errors; no horizontal overflow |

Super Admin `/admin`: 0 changed pixels outside the "System health" and "Recent admin actions" panels.
Inside them, the audit list gained the harness's later admin sign-ins (append-only), and the Webhooks badge
went from "NO EVENTS" to "HEALTHY" because the base-code phase 9 checkout test wrote the first local webhook
event (received 03:36:17Z) after the baseline capture (03:20Z). Data, not code.

Authorize Code: the container JSX is the same code (byte-identical again since round 3) and still sits directly after the hero actions inside
`.teacher-home-copy`; signed-out visitors see it, every signed-in state renders nothing. Sign in, password
Show/Hide, wrong-password and wrong-code errors, sign-out, the trial consent form to checkout, subscriber
access and every redirect behave exactly as on the base.

Not changed, on purpose: the site header (including the Sign in placement), the footer, `/about`, the SEO
title and meta description, every route and every global stylesheet.

Harness note: when `/worksheets` redirects an entitled or code session to ShowMe, the browser follows the
redirect to `https://showme.mathnexa.com/worksheets` (Playwright routes do not intercept redirects). Those
were read-only GETs with a locally signed ticket that production does not accept; every subresource was
blocked. The existing phase 9 Worksheet test exercises the same path.

## P1 round (owner-approved 2026-10-26, after the acceptance review)

The acceptance review recommended NO-GO on design as it stood; the owner approved six homepage-only fixes:

1. The worked example plays when it is seen. Where the board starts below the fold (phones, portrait
   tablets), its CSS animations are held at the first frame off screen and released when a quarter of
   the board is visible. Without JavaScript, IntersectionObserver or motion nothing is held.
2. "Your turn": after the example, "How many cups make 28 bars?" with 6, 7 and 8 cups. A wrong pick says
   how many bars it would make; the right one shows 7 × 4 = 28. Browser-only; nothing is stored or sent.
3. The stamp no longer implies grading: "Check: 5 cups × 4 = 20 bars".
4. One handwriting face on every device: Patrick Hand (SIL OFL 1.1), self-hosted, loaded only by the
   homepage CSS Module. The drawn sticky note now reads "Fri: quiz" (the font has no check-mark glyph).
5. LCP: the sheet and the problem text slide in without fading, so the largest text paints at once.
6. The Worksheet Generator step links to `/worksheets`, the existing gated route the header uses.

Found and fixed during the P1 run: at 320 px with 200% text the first P1 build overflowed by 67 px (phase 9
reflow tests failed). Causes: the Worksheet Generator link landed in the step card's icon column, and a
no-wrap on the check line. A third no-wrap from the first round (feature phrases on the shelf, which the
original page lets wrap below 360 px) was also removed. The narrow-screen sheet tilt is halved.

P1 results (local, 2026-10-26, final P1 code):

| Check | Result |
| --- | --- |
| Protected-page screenshots (90) vs the `bcc0106` baseline | 78 pixel-identical; 8 homepage (intended); Super Admin `/admin` x2: 0 changed pixels outside the two live-data panels; trial `/subscription` x2: a 7 x 20 px sliver at the end of the masked "Access ends" date (the synthetic trial's end date is now a different calendar date) |
| Functional facts | 343 facts, 0 differences from the first-round candidate (which matched the base) |
| phase 9 (homepage baselines regenerated) / school-access / Tug free access | 17/17 / 21/21 / 8/8 |
| Quiz PDFs / Number Cross | 20/20 / 1/1 |
| Unit core / web | 245/245 / 908 passed, 1 skipped (+2 homepage tests) |
| `test:security`, bundle audit, Number Cross launch audit, protection bypass | 321/321, pass, pass, 7/7 |
| Phase 11 and Quiz PDF audits, typecheck, lint, build | pass, clean, 0 errors (8 pre-existing warnings), pass |
| Production-mode review (Chromium + WebKit, 320–1920) | CLS 0 everywhere, no overflow, no console errors; desktop LCP 0.45–0.61 s (base 0.62 s; first round 1.42 s) |
| Phone hold | off screen 6 s after load: 22 of 22 board animations paused; scrolled in: playing; 5 s later: finished |
| Reduced motion | 0 running animations, replay hidden |
| Page weight vs base | JS +1.9 KB, CSS +5.9 KB compressed, plus the 23.9 KB font on the homepage only |

## Round 3: owner's final visual corrections (2026-10-26)

Requested after the owner reviewed the P1 staging preview; animations preserved by instruction.

1. Removed the "Inside Online Math Prep" section ("A prep session, one step at a time": intro, the four
   step cards and icons, the Worksheet Generator link, "Explore Online Math Prep"), with its CSS, copy and
   in-view strokes.
2. Removed "Made for the kitchen table and the classroom" (both drawn scenes, their copy and the
   "Find a Homework PDF" / "Find a Quiz PDF" links), with its CSS and drawings. Homework PDFs and Quiz PDFs
   stay reachable from the header, the footer and the toolkit cards.
3. The preview drawing's title now reads "MathNexa · Online Math Prep". The drawing is homepage-only
   (`online-math-prep-preview-source.svg`, rendered to WebP/AVIF); only the title strip of the shipped image
   was replaced (0 changed pixels elsewhere, exact lossless WebP), so the question, table, graph and tools
   are untouched. The real Online Math Prep application (ShowMe) is not in this repository and was not changed.
4. Preserved, unchanged: the worked-problem board (all 564 lines of its CSS and its three components are
   byte-identical to the P1 code), Your turn, replay, play-when-seen, the headline highlighter, the toolkit
   heading marker, reduced-motion behaviour.
5. Polish: flat warm hero band (no decorative gradients), a toolkit heading about preparation ("Prepare
   online, practice on paper, check what stuck"), a visible "Open Online Math Prep" call to action on the
   feature card, balanced card titles, tighter section rhythm, and phone rows for the three supporting
   cards (stacked again when enlarged text needs the room). "Each topic" was dropped from the feature card.
6. The Authorize Code block, `HeroActions` and `FeaturedGames` are byte-identical to the pre-redesign
   homepage again, indentation included.

Round 3 results (local, 2026-10-26):

| Check | Result |
| --- | --- |
| Protected-page screenshots (90) vs the `bcc0106` baseline | 80 pixel-identical (Super Admin included); 8 homepage (intended); trial `/subscription` x2: a 9 x 21 px sliver at the end of the masked "Access ends" date (data) |
| Functional facts | 343 facts, 0 differences |
| phase 9 (homepage baselines regenerated) / school-access / Tug free access | 17/17 / 21/21 / 8/8 |
| Quiz PDFs / Number Cross | 20/20 / 1/1 |
| Unit core / web | 245/245 / 908 passed, 1 skipped |
| `test:security`, bundle audit, Number Cross launch audit, protection bypass | 321/321, pass, pass, 7/7 |
| Phase 11 and Quiz PDF audits, typecheck, lint, build | pass, clean, 0 errors (8 pre-existing warnings), pass |
| Production-mode review at 320, 360, 390, 430, 768, 1024, 1440, 1920 (Chromium) and iPad portrait/landscape and iPhone 390 (WebKit) | no overflow, CLS 0, no console errors; page 35% shorter (1440: 5,173 to 3,367 px) |
| 320 px with 200% text | no overflow, no clipped text |
| Animations | board code and its 564 CSS lines byte-identical to P1; finished board pixel-identical except a 5 x 38 px sliver of background where the removed gradient was; phone hold: 22/22 held off screen, played on scroll; reduced motion: 0 running, replay hidden |
| Desktop LCP | 0.47–0.52 s (base 0.62 s) |
| Share of page height at 1440 | hero 27.9%, toolkit 34.8% (Online Math Prep is its full-width card), Featured games 23.3% |

## Final acceptance checks (2026-10-26)

Requested by the owner before production. One correction (`cc81f83`); everything else is evidence.

1. **Signed in.** Local production builds of `bcc0106` and this branch were served side by side
   against the same local database (fixture billing). Synthetic accounts signed in through the real form:
   no access, trial active, subscription active and subscription canceled through period end, plus an
   Authorize Code session, at 1440 and 390 px. Results:
   - Same in both builds: landing after sign-in, banner and account menu markup, banner pixels in all
     10 runs, hero account actions, the absent Authorize Code card when signed in, the code session's
     active panel and exit control, product reach on 9 routes per state, and sign-out. The only markup
     difference is Next's per-build server-action id.
   - Only intended difference: the new toolkit card for Online Math Prep, which links to `/map-prep`.
   - Visible, not a change: the secondary hero buttons ("Sign in", "My Account") use the shared
     transparent `.button-secondary` style. They now show the warm hero band (since P1) instead of the
     pale blue page. Their markup, CSS, size and behaviour are unchanged, and `/sign-in` is pixel-identical.
   - Not run: a signed-in walk-through on the hosted staging preview (owner's Vercel SSO and vault-held
     staging accounts).
2. **Firefox: unverified.** Windows App Control still blocks Playwright's Firefox on the review
   machine (`spawn UNKNOWN`), and no other Firefox is installed. A static check of the homepage's CSS and
   browser APIs found nothing newer than Firefox 121; `text-wrap: balance` is optional.
3. **Featured Games weight.** At 1440 px the Math Vocabulary Hunt neon art (toolkit thumbnail plus
   Featured games) covers 5.6% of the page. It carries 20% of the page's CIELAB chroma and 90% of its
   dark-neon pixels; the Online Math Prep picture is 6.3% of the area and 4.6% of the chroma.
   Proposed, **not applied**: show the existing Math Tug of War screen in the toolkit's Math Games card,
   so the neon art appears once, in Featured games. That is one image path and its alt text. Measured:
   the toolkit's dark-neon share falls from 31% to 4.5%. **Closed 2026-10-26: the owner decided to keep
   Featured Games as it is.** The proposal was not applied; Featured games ships byte-identical to v1.2.25.
4. **Sticky note.** "find 1 cup first" became "find the unit rate" (`cc81f83`). Online Math Prep shows
   hints only on request ("Show a hint"), so a note that appears by itself could read as an automatic hint.
   The new text names what the arrowed step computes.
5. **Animations unchanged.**
   - The board's CSS and its other four components are byte-identical to round 3.
   - 24 animations, with identical names, targets, durations, delays and fills at 1440 and 390 px.
   - With every animation held at 17 timeline points (0–5 s), the only changed pixels are inside the note
     and its arrow.
   - Phone hold: 22/22 held, then played. Reduced motion: 0 running.
   - Page height is identical to round 3 at all 11 review sizes.

Final acceptance results (local, `cc81f83`):

| Check | Result |
| --- | --- |
| Protected-page screenshots (90) vs the `bcc0106` baseline | 80 pixel-identical (Super Admin included); 8 homepage (intended); trial `/subscription` x2: the same 189 px date-mask sliver as round 3 |
| Functional facts | 199 shared with the base run identical; 343/343 identical to round 3 |
| phase 9 / school-access / Tug free access | 17/17 / 21/21 / 8/8 (homepage baselines still match; no snapshot changed) |
| Quiz PDFs / Number Cross | 20/20 / 1/1 |
| Unit core / web | 245/245 / 908 passed, 1 skipped |
| `test:security`, bundle audit, Number Cross launch audit, protection bypass | 321/321, pass, pass, 7/7 (re-run on a fresh build: the e2e runners had cleared `.next`) |
| Phase 11 and Quiz PDF audits, typecheck, lint, build | pass, pass, clean, 0 errors (8 pre-existing warnings), pass |
| Production-mode review, 11 sizes (Chromium + WebKit) | no overflow, CLS 0, no console errors, heights identical to round 3; Firefox skipped (blocked) |
| Desktop LCP / section shares at 1440 | 0.46 s / hero 27.9%, toolkit 34.8%, Featured games 23.3% (unchanged) |

## Owner decisions and release

- Featured Games: kept as it is (owner, 2026-10-26). The proposal above is closed, not applied.
- Firefox: the owner checks it; it cannot run on the review machine.
- Production: released as v1.2.26 on 2026-10-27 from `1f24bba` with the owner's explicit approval, after the
  full regression was re-run on that commit. PR #2 merged by fast-forwarding `main`. Deployment, verification
  and rollback: `docs/releases/mathnexa-v1.2.26-release-record.md`.
- Still the owner's manual checks: a signed-in production session, an Authorize Code entry and a subscriber's
  product access (nothing in the release signs in to production).
