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
| `apps/platform-web/components/public/teacher-first-home.tsx` | The production homepage component. The Authorize Code container JSX and `HeroActions` stay byte-identical; `FeaturedGames` keeps its markup. |
| `apps/platform-web/components/public/home/home.module.css` (new) | Homepage-only CSS Module: hashed class names cannot match any other page. |
| `apps/platform-web/components/public/home/*.tsx`, `home-copy.ts` (new) | Homepage-only presentational components (worked-problem board, replay button, in-view helper, illustrations, homepage copy). Imported by the homepage component only. |
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

Authorize Code: the container JSX is byte-identical and still sits directly after the hero actions inside
`.teacher-home-copy`; signed-out visitors see it, every signed-in state renders nothing. Sign in, password
Show/Hide, wrong-password and wrong-code errors, sign-out, the trial consent form to checkout, subscriber
access and every redirect behave exactly as on the base.

Not changed, on purpose: the site header (including the Sign in placement), the footer, `/about`, the SEO
title and meta description, every route and every global stylesheet.

Harness note: when `/worksheets` redirects an entitled or code session to ShowMe, the browser follows the
redirect to `https://showme.mathnexa.com/worksheets` (Playwright routes do not intercept redirects). Those
were read-only GETs with a locally signed ticket that production does not accept; every subresource was
blocked. The existing phase 9 Worksheet test exercises the same path.

## Not done here

- Production: not deployed, not merged. Needs the owner's explicit approval.
- Hosted signed-in checks on staging need the owner's vault-backed run (the staging preview is behind
  Vercel SSO).
