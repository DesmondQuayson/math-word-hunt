# MathNexa v1.2.15: homepage Authorize Code card for signed-out visitors only (2026-09-26)

Status: **RELEASED — v1.2.15** (owner brief "Final UI hotfix before project closeout — hide
Authorize Code form after sign-in", 2026-09-26). Staging certified, production promoted and
verified live. The automation bypass credential exposed during the release session was rotated
afterwards (see "Security rotation").

| | |
| --- | --- |
| Production (`mathnexa.com`) | `dpl_3DUHT7Lcfy1VvGWStF9JLGnnkyyN` (https://mathnexa-platform-production-qeq2snwkc-bright-path-ed-tech.vercel.app), promoted 2026-09-26 22:53:23 UTC (17:53 CDT) |
| Production runtime commit | `2532244a1dd64db2e4c0fde6e7cdbbdb7d3b043c` (fast-forwarded into `main`) |
| Rollback (retained, READY) | `dpl_6uyvVoMMuua6gpG5arrUMW3mnZVZ` (v1.2.14, runtime `a86fa50`) |
| Also retained | `dpl_EcP8UnyLf3uHSVAZwXLLWZkAefVv` (runtime `3cbe09d`), `dpl_97Z79gBiGEA13Gaia4bTAEascGKy` (v1.2.13, runtime `d72c788`) |
| Tag | annotated `v1.2.15` → runtime `2532244` (the repository convention); `v1.2.14` untouched. This record is the docs-only commit that follows the runtime on `main` |
| Branch | `hotfix/hide-authorize-code-after-signin` (from `main` `ed17ed4`) |
| Starting state | `main` `ed17ed4`; production runtime `a86fa50` (v1.2.14); production deployment `dpl_6uyvVoMMuua6gpG5arrUMW3mnZVZ` |

## The problem and its cause

A signed-in visitor saw the homepage "Authorize Code" card (heading, Code field, eye control,
Continue). v1.2.12 (`357486f`) had made the card permanent in every account state so that the
banner's "Authorized code" link always had a target. v1.2.14 removed that banner link, but the card
stayed unconditional. For a signed-in account it could never work: the server action
(`authorizeSchoolAccessAction`) already redirects any authenticated session to its destination
without looking at the code.

## What shipped (runtime `2532244`)

- `apps/platform-web/components/public/teacher-first-home.tsx`: the whole card container
  (`<div id={AUTHORIZED_ACCESS_ANCHOR} className="teacher-home-authorized-access">`, holding the
  Authorize Code form, or the existing "Authorized access active" exit panel for a code session)
  renders only when `authState === "signed-out"`. This restores the homepage rule from before
  v1.2.12.
- The rule is "an authenticated session exists", not entitlement. `authState` comes from the
  server-side session on the homepage route (`app/page.tsx`, `getGameAccessView()`): `anonymous` and
  `unconfigured` are signed out; `unconfirmed`, a missing account row and every account status
  (`active`, `suspended`, `deletion-pending`) are authenticated. Non-subscriber, trial eligible,
  active trial, used trial, subscriber, scheduled cancellation, renewal grace and payment problem
  all get no card.
- The page is rendered on the server (`force-dynamic`), so the card is never sent to a signed-in
  browser: no CSS hiding, no flicker, no empty space (the hero copy ends on its actions).
- Signed out, nothing changed: the card, masked Code field, Show/Hide, Continue, server validation,
  the generic denial and the school-access exit panel.
- Unchanged everywhere: the form component, school-code validation, the rate limit, the school-access
  session and cookie, the `/access`, `/sign-in` and `/sign-up` forms, the account page's code section,
  entitlement, billing, Supabase auth, the banner (six products, no Authorize Code item), Quiz PDF
  preview, Homework, Worksheet Generator.

### Security confirmation

Hiding the card for signed-in sessions does not expose school codes, change validation, alter
server authorization, put codes into URLs, `localStorage` or `sessionStorage`, or weaken
entitlement. The only runtime change is one rendering condition in one component. No file under
`lib/school-access`, `app/school-access-actions.ts`, `lib/auth`, `lib/game-access`, billing,
Supabase or `packages/platform-core` changed. Source guards pin this (security boundary test and
offline audit: the signed-out condition wraps the container, no stylesheet hides it, the form's
action and field are unchanged, the form reads no URL or web storage).

## Commits

| Commit | Content |
| --- | --- |
| `2532244` | the rendering condition; route-level and component unit tests; security guard and audit guard; phase 9 browser spec; review harness (anonymous card at every width, one refused dummy code, a payment-problem account, signed-in homepages without the card, owner screenshots); `docs/quiz-pdfs-v1.md` section 7 |
| docs commit after the runtime | this record, the owner review packs (`owner-review/authorize-code-signed-in-hotfix/`), and the harness accepting a staging preview's missing school-access configuration (production must still refuse the dummy code) |

Release range audit (`ed17ed4..2532244`, 8 files): 1 app component, 3 unit/security test files (1
new), 1 browser spec, 2 tooling scripts, 1 doc. No secrets, no env files, no local Supabase config,
no generated instruction files (`AGENTS.md` / `CLAUDE.md`).

## Tests (each new test fails against the v1.2.14 component)

- `components/public/home-page-authorize-code.test.tsx` (new): the real homepage route through
  every session the server can report. Anonymous and unconfigured show the card with a working
  Show/Hide; an active school-code session keeps its exit panel; unconfirmed, missing account,
  non-subscriber, no evidence, active trial, trial pending, subscriber, scheduled cancellation,
  grace, used trial, payment problem, ended subscription, suspended and deletion-pending render no
  card (each fixture is checked to really be entitled or not).
- `components/public/teacher-first-home.test.tsx`: A (signed out: card present, Show/Hide works,
  `next=/games`, under the hero actions) and B-F (no container, heading, field, eye control or
  Continue for any signed-in state; the hero copy ends on its actions; H1 the only heading).
- `test/security/quiz-pdfs-boundary.test.ts` and `scripts/audit-quiz-pdfs.mjs`: source guards.
- `e2e/phase9/teacher-first-access-flow.spec.ts`: anonymous card at all nine widths with Show/Hide
  and nothing in the URL or web storage; signed-in non-subscriber (B), active trial (C), subscriber
  (D), used trial (E) and payment problem (F) with the card absent from the document (count 0, not
  hidden), 0 px trailing space, the next section at the ordinary gap, no horizontal overflow; B and D
  at all nine widths; the card back after sign-out.

Mutation check: with the v1.2.14 component, 3 unit tests, the security guard, the audit and the
browser test fail (the browser test at "B signed in, non-subscriber, 1366px": card count 1).

## Gates (runtime `2532244`, fresh LF worktree)

| Gate | Result |
| --- | --- |
| TypeScript | pass |
| ESLint (root + platform-web) | 0 errors (8 pre-existing warnings in `public/game-suite/natural-voice.js`) |
| platform-web unit | 677 passed, 1 skipped |
| platform-core unit | 245 passed |
| Homepage (`components/public`) | 11 |
| Authorize Code | 58 |
| Auth / session / school-access unit | 58 |
| Banner / header | 29 |
| Quiz Preview (unit) | 24 |
| Entitlement | 42 web + 21 core |
| Quiz PDFs browser suite (local) | 20/20 (10 Chromium, 10 WebKit) |
| Phase 9 flow suite | 17/17 |
| Security | 292 + platform bundle audit + Number Cross launch audit |
| Offline quiz audit | pass (with the signed-out guard) |
| Production build | pass |

Not run: the school-access browser suite (`e2e/school-access`) needs the real
`MATHNEXA_SCHOOL_ACCESS_CODE` secret, as in earlier releases. Its unit tests (actions, config, rate
limit, session) ran in the gates, and production refused a wrong dummy code live (below).

## Staging certification

Branch preview `dpl_3Xfo94Q6e67zCp26ytLPuR8szHyj`
(https://mathnexa-platform-staging-lwy83rc3a-bright-path-ed-tech.vercel.app), build `2532244`.

| Run | Result |
| --- | --- |
| 1 | Chromium only (the staging launcher does not set the engine list): 275 passed, 1 failed. The failure was the new dummy-code submission: the preview answered "Authorized access is temporarily unavailable." because the staging project sets `MATHNEXA_SCHOOL_ACCESS_CODE` and `MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET` for its Production environment only, so branch previews have no school-access configuration (unchanged for 34 days, unrelated to this release). The harness now accepts and records that answer on a staging preview only; production must refuse the code. |
| 2 | Chromium + WebKit: **337 passed, 0 failed**, 0 console/page errors, 0 resource-route refusals, 0 5xx. Evidence: `owner-review/authorize-code-signed-in-hotfix/staging/` |

## Production release

| Stage | Result |
| --- | --- |
| Preflight | PASS: apex `dpl_6uyv…`, build `a86fa50`, health 200, webhooks 400, runtime certified (`next` 16.3.4, `sharp` 0.35.4) |
| Candidate (`--prod --skip-domain`) | `dpl_3DUHT7Lcfy1VvGWStF9JLGnnkyyN` (tree `70c8557`), READY, protected, alias unmoved |
| Probe candidate | first attempt: the unsigned webhook probe got no HTTP response (the Vercel CLI `curl` printed only its own debug output after "Telemetry subprocess killed due to timeout"; the same request by hand answered 400). Second attempt with CLI telemetry off: **PASS 8/8** (health 200, build `2532244`, unsigned webhook 400, canonical-host 308, security headers, optimizer, remote image refused, no 5xx) |
| Homework safety (read-only plan) | 8 topics / 59 published lessons / 167 lesson assignments; quizzes identical (skip 8, conflicts 0) |
| Promote | 22:53:23 UTC |
| Probe live | **PASS 23/23**: apex `dpl_3DUH…`, build `2532244`, webhooks, redirects, gated and no-store surfaces, admin and scheduler fail closed, security headers, images, no 5xx, banner six products and no Authorize Code item, anonymous homepage card present, all eight quiz preview / inline / download routes refuse anonymous access |
| Live review | **337 passed, 0 failed** |

## Live production review (mathnexa.com, runtime `2532244`)

`scripts/invoke-quiz-pdfs-production.ps1 -Stage review -Engines chromium,webkit` with
`-ExpectBuild 2532244…`. Five temporary synthetic consumer accounts (trial eligible, used trial,
active trial, subscriber, payment problem) were created on production and deleted at the end;
they recorded 89 `resource_download_events` rows (identity removed with the accounts). Evidence:
`owner-review/authorize-code-signed-in-hotfix/production/`.

**Result: 337 checks passed, 0 failed; 0 console or page errors in both engines; 0 refusals on
resource routes; 0 5xx.**

- Signed out: the card at all nine widths (320 to 1920 px) with heading, Code field, Show code and
  Continue; masked by default, Show/Hide works in Chromium and WebKit; a typed value never reached
  the URL or web storage. **Continue works:** one wrong dummy code was refused by the server with
  "Code not accepted. Invalid authorized code."; the page stayed on `/`, nothing in the URL or web
  storage.
- Signed in: no card in the document for the trial-eligible, used-trial, payment-problem and
  active-trial accounts at 390 px, the subscriber at all nine widths, and the WebKit subscriber at
  390 px; 0 px trailing space, the next section at the ordinary gap on single-column layouts, 0 px
  overflow.
- Banner: six products, no Authorize Code item, every state and width, 320 px at 200% text.
- Quiz PDFs unchanged: 8/8 cards with Preview, Details and Download PDF; details pages; downloads and
  inline deliveries with the owner's exact bytes; every preview drawn page by page in both engines;
  every quiz at 320 and 390 px with 200% text 32/32 at 0 px; Download PDF from the preview in both
  engines; axe 0 serious or critical.

## Rollback

```bash
vercel promote dpl_6uyvVoMMuua6gpG5arrUMW3mnZVZ --scope bright-path-ed-tech
```

That restores v1.2.14 (runtime `a86fa50`), whose only difference is the card showing for signed-in
accounts. No data or configuration changed in this release.

## Observations (not defects; owner decision)

1. Desktop signed-in hero: the hero grid bottom-aligns its two columns (rule from 2026-08-08), so
   without the card the text column starts lower beside the product artwork. This is how the
   signed-in desktop homepage looked before v1.2.12; nothing was changed.
2. Staging branch previews cannot exercise a real school code: the staging project's school-access
   variables exist for its Production environment only.
3. Vercel CLI 60 prints debug output in this environment. When the webhook probe was repeated by
   hand, that output displayed the production project's "Protection Bypass for Automation" token in
   the operator's console. It is not in the repository, the pipeline logs or the evidence files.
   It was rotated after the release (see "Security rotation").
4. The live dummy-code check records one refused attempt (`AUTHORIZED_CODE_FAILED`, the code itself
   is never recorded) and uses one of the 20 attempts per 15 minutes the reviewing network gets.

## Security rotation (2026-09-26, after the release)

Vercel Deployment Protection automation bypass credential was rotated after release because debug
output exposed the previous token in a local release session.

- The owner regenerated the production project's "Protection Bypass for Automation" secret in the
  Vercel project settings and revoked the previous one. No credential value, partial value or hash
  appears in this record, the repository, the release evidence or the logs.
- Verified without printing any credential (status codes only):
  - the previous credential is rejected: a protected production-project deployment URL answers 302
    to the Vercel login with it, exactly as with no credential (it answered 200 before the rotation);
  - the new credential works through the Vercel CLI workflow the release pipeline uses (`vercel curl`
    reads it from the project settings): `/api/health` 200, ready, build `2532244`;
  - the staging review automation still reaches the staging preview (200). Its vault entry is the
    staging project's own credential, a different value, so it needed no change.
- Production unchanged: `mathnexa.com` still serves `dpl_3DUHT7Lcfy1VvGWStF9JLGnnkyyN`, build
  `2532244`; no deployment was created and nothing was redeployed. The application never reads this
  credential, so no refresh was needed. No production data changed.
- Closeout checks (read-only): signed-out homepage card, banner (six products, no Authorize Code
  item) and anonymous refusal of all 8 quiz preview / inline / download routes in Chromium and WebKit
  (17/17, 0 console errors, 0 5xx); Homework 8 topics / 59 lessons / 167 assignments, 0 changes;
  tags `v1.2.14` unchanged (`27f201d5` → `a86fa50`) and `v1.2.15` (`bdcc806` → `2532244`).
- Housekeeping: the seven temporary release worktrees were removed after checking each was clean and
  pushed; disposable scratch scripts, copies and traces were deleted. Release records and
  owner-review evidence are unchanged.

## v1.2.15 release notes (annotated tag)

- the homepage Authorize Code card renders for signed-out visitors only
- any authenticated session gets no card and no empty space (non-subscriber, trial eligible,
  active trial, used trial, subscriber, scheduled cancellation, grace, payment problem, unconfirmed,
  suspended, deletion pending)
- decided on the server from the existing session, not from entitlement; no CSS hiding, no flicker
- signed-out behavior, server validation, school-code security, entitlement, billing, the banner,
  Quiz PDF preview and Homework unchanged
- verified: gates, staging 337/0 and live 337/0 in Chromium and WebKit
