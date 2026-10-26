# MathNexa homepage redesign: online math prep (change control)

Branch `feature/homepage-online-prep-redesign`, cut from `origin/main` `bcc0106` (v1.2.25 release record).
Scope: the public homepage only. Production is not touched without the owner's explicit approval.

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
| `apps/platform-web/components/public/teacher-first-home.tsx` | The production homepage component. The Authorize Code container JSX and `HeroActions` keep the same code (the Authorize Code block is indented one level deeper inside the new wrapper); `FeaturedGames` keeps its markup. |
| `apps/platform-web/components/public/home/home.module.css` (new) | Homepage-only CSS Module: hashed class names cannot match any other page. |
| `apps/platform-web/components/public/home/*.tsx`, `home-copy.ts` (new) | Homepage-only presentational components (worked-problem board, replay and in-view play, Your turn, in-view helper, illustrations, homepage copy). Imported by the homepage component only. |
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

Authorize Code: the container JSX is the same code (indented one level deeper) and still sits directly after the hero actions inside
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

## Not done here

- Production: not deployed, not merged. Needs the owner's explicit approval.
- Hosted signed-in checks on staging need the owner's vault-backed run (the staging preview is behind
  Vercel SSO).
