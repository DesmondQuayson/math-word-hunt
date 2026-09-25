# MathNexa v1.2.12 — Subscription Conversion, Product Navigation Banner, Mobile Grid & Worksheet Access Hotfix

| | |
|---|---|
| Tag | `v1.2.12` (annotated, bare platform namespace) |
| Frozen application source | `b7138368745a5ec4778916448d1ae64d50dace4a` — the staging-certified and production-deployed runtime |
| Production deployment | **`dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N`** — `https://mathnexa.com` (promoted 2026-09-25 07:56 UTC, owner-approved) |
| Immediate rollback | **`dpl_FkPQfrBgKVTrdypwoSp7zD3gxvo4`** (Product Navigation Banner V1 runtime `04fc63e4`, READY, retained) |
| Secondary retained rollback | **`dpl_Bofcqy7BTKeF9rXsVfLmm3eJLL8V`** (Subscription Conversion UI V1 runtime `a283a73c`, READY, retained) |
| Prior frozen release | `v1.2.11` → `c860a288e36177366d3ffa9c207387aa917c1417` (unchanged) |
| Database migration | none |
| Scope | Three owner-approved MathNexa website phases released one after the other on top of v1.2.11 and closed together here: Subscription Conversion UI V1, Product Navigation Banner V1, and the Mobile Grid + Worksheet Gate + Authorize Code hotfix with its final polish. Website presentation, navigation and access routing only. |

This record is documentation only and lives outside the tag, as the earlier records do.

## Release train

| Phase | Merged runtime | Production deployment (then) | Staging certification |
|---|---|---|---|
| A. Subscription Conversion UI V1 | `a283a73c8d26ffd3279589a1460d87bc45dfea91` (main `194d453` → `a283a73`, fast-forward) | `dpl_Bofcqy7BTKeF9rXsVfLmm3eJLL8V` (rollback then `dpl_FNf6c8Zv8VsCefNW1EaLZ3uQiFoJ`) | staging preview of the same commit, owner visual review |
| B. Product Navigation Banner V1 | `04fc63e4018229ad53b70abed76dac895d19b98c` (main `a283a73` → `04fc63e`, fast-forward) | `dpl_FkPQfrBgKVTrdypwoSp7zD3gxvo4` (rollback then `dpl_Bofcqy…`) | `dpl_7MYhhE9HdRMa2dDXJs1YSfAnvqwy` |
| C. Mobile Grid + Worksheet Gate + Authorize Code hotfix | `357486f9c0c0b41b0808d0062e1c2e361061e2c5` + polish `b7138368745a5ec4778916448d1ae64d50dace4a` (main `04fc63e` → `b713836`, fast-forward) | `dpl_4QC4MDtdKvR5ie1LxpB3tqYjyR8N` (rollback `dpl_FkPQ…`) | `dpl_Dt4M5vEFcSkjbKyUWD77RhHPjYMw` (357486f9), `dpl_3PHBZxnMZoLqyKskFuovKkfct9cp` (b7138368) |

Every merge was `git merge --ff-only`; no code was introduced during a merge.

## A. Subscription Conversion UI V1

- "Start free trial" call to action in the header, driven only by the server access decision (`resolveHeaderCta`): anonymous and trial-eligible accounts see it; an active trial, a paid subscription, a renewal grace period, a scheduled cancellation and school-code sessions do not.
- Active subscribers are never offered another trial; accounts whose one trial is used see **Subscribe** (→ `/pricing`); payment problems see **Manage subscription**.
- Password show/hide control on every secret field (sign-in, sign-up, password reset, authorized code), re-masked on submit.
- Sign-up and the subscription/trial form redesigned as one onboarding card: account chip, plan summary derived from the commercial policy, trial and billing terms, consent checklist, single primary action with double-submit guard and loading state, success panel after activation.
- Client-side field validation in consumer mode, clearer loading and success states.
- 320px + 200% text reflow across the header, forms and the school-code box; axe 0 serious/critical in Chromium and WebKit.

## B. Product Navigation Banner V1

- Permanent product navigation for the six destinations, in this order: Home `/`, Math Games `/games`, Online Math Prep `/map-prep`, Homework PDFs `/homework`, Quiz PDFs `/quizzes`, Worksheet Generator (direct ShowMe link at the time; gated in phase C).
- Permanent MathNexa brand picture (first-party 48 px mark) with the wordmark; the picture is never hidden.
- Account menu kept account-oriented: Subscription, My Account, Sign out (or Exit authorized access for a school-code session).
- Subscriber "Start learning" removed from the homepage and header with no replacement.
- Two-row banner below 80rem (horizontally scrolling strip at the time), single row from 80rem.

## C. Mobile Grid + Worksheet Gate + Authorize Code hotfix

### Mobile

- All six products visible simultaneously on phones in a **2 × 3 grid**: Home | Math Games | Online Math Prep, then Homework PDFs | Quiz PDFs | Worksheet Generator.
- Horizontal product scrolling removed on phones; labels may take a second line ("Online / Math Prep") and are never cut off; 44 px targets; brand picture, call to action and account menu keep the top row.
- Verified at **320 / 375 / 390 / 430**; tablets show one row of six; desktops keep the single-row banner (tighter pills between 80rem and 90rem so every label stays on one line beside the Authorize Code entry).
- The navigation is a size container: at 320px with 200% text the grid reflows to one column with no page-level horizontal overflow.

### Worksheet Generator

- Protected internal MathNexa entry route **`/worksheets`** (`app/worksheets/layout.tsx`), added to the exact access-intent allowlist with the label "Worksheet Generator".
- Anonymous → `/access?next=/worksheets`; unconfirmed → confirmation; signed in without entitlement → `/subscription?next=/worksheets` (trial card for a trial-eligible account, "See subscription options" → `/pricing` after a used trial, never a second trial offer).
- Entitled (active trial, paid subscription, grace, scheduled cancellation, school code) → **`https://showme.mathnexa.com/worksheets`** with one server round trip.
- The existing entitlement architecture is reused: `requireProductAccess` with the same MathNexa all-access entitlement as Online Math Prep (module `map_prep`); no second access system, no client-side decision. The banner never links off-site directly.

### Authorize Code

- Permanent homepage access restored: the unchanged school-code form renders in every account state (anonymous, trial eligible, active trial, subscriber, used trial, payment problem, grace and cancellation); a session that already entered a code sees the existing "Authorized access active" exit panel in the same place.
- A permanent banner entry (row 3 on phones and tablets, an outlined action beside the call to action on desktops) scrolls to and focuses the homepage field, or leads to it from other pages. Plain same-origin anchor: no code, query or state. Omitted on `/sign-in` only; never inside the account menu.
- Wording standardized to **Authorize Code** (banner entry and form heading; the field is labelled "Code"). Existing school-code security preserved: validation, server verification, session, expiry, error messages, Show/Hide code.

### Subscription copy and actions

- Worksheet Generator added to the included benefits: the `/subscription` trial card and "Included with your subscription" notice, the trial sign-up plan summary, and the checkout status description now read "Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, and Worksheet Generator".
- Post-activation success action renamed **Go to Math Games** (destination `/games` unchanged).
- User-facing "Start learning" occurrences reduced to **zero** (header, homepage, subscription completion); the remaining repository matches are negative test assertions.

## Commercial policy (document only — unchanged by this release)

| Value | Recorded |
|---|---|
| Trial | 24 hours, one per eligible account, non-renewable |
| Subscription | $5.99 USD monthly, renews automatically until canceled |

Both values are read from the commercial policy record and were not modified.

## Safety record

| Item | Changed |
|---|---|
| Billing calculations | NO |
| Subscription price | NO |
| Trial duration | NO |
| Core entitlement rules | NO |
| Stripe implementation | NO |
| Supabase auth | NO |
| School-code validation | NO |
| ShowMe Worksheet Generator implementation | NO |

The release diff (`04fc63e4..b7138368`) touches no billing, entitlement, commercial-policy, school-access or password-field source; it contains no environment files, keys or credentials.

## Test summary (final production release, on the merged commit `b7138368`)

| Gate | Result |
|---|---|
| TypeScript | PASS (0 errors) |
| ESLint | PASS (0 errors; 8 pre-existing warnings in `public/game-suite/natural-voice.js`) |
| Web unit | 651 passed / 1 skipped |
| Core unit | 245 passed |
| Phase 9 e2e | 17 / 17 (worksheet gate, Authorize Code matrix, mobile grid, no "Start learning", refreshed homepage baselines) |
| Phase 7c e2e | 11 / 11 |
| Journey (nine account states, real entitlement rows) | 84 / 84 |
| Click-through (signed-in subscriber) | 24 / 24 |
| Security | 284 tests + platform bundle and Number Cross launch audits PASS |
| Build | PASS — `/`, `/games`, `/map-prep`, `/homework`, `/quizzes`, `/worksheets`, `/subscription`, `/pricing`, `/account`, `/sign-in`, `/access` present |
| Chromium accessibility (axe, overflow, 200% text, keyboard, reveal controls) | PASS, 180 / 180 |
| WebKit accessibility | 178 / 180 — the two are the known test-build Option+Tab focus-policy exceptions, identical to the approved staging behaviour |
| axe serious / critical | 0 (harness and live, both engines) |
| Production smoke on `https://mathnexa.com` | PASS, 96 / 96 (Chromium + WebKit): routes, grid at 320/375/390/430, Authorize Code, CTA, subscription copy, account menu, 320px + 200% text, health build = `b7138368`, payments live, 0 console errors (7 WebKit aborted-prefetch messages, harness noise) |

## School-code test note

- Secure school-code e2e credential: **not configured locally**. Secret-dependent e2e (`test:e2e:school-access`): **NOT RUN**. This is a test-environment fact, not a product failure; no replacement secret was created and no security was weakened.
- Verified without a secret, anonymous and subscriber: the existing school-code implementation is unchanged (zero diff), the Authorize Code control renders, the input is masked by default, Show/Hide code works and re-masks, submit goes through the same-origin server action (POST with the Next-Action header, never a GET), and no code is written to the URL, localStorage or sessionStorage. A signed-in submit redirects to the remembered destination, as it did before this release.

## Rollback record

| Role | Deployment | Runtime |
|---|---|---|
| Primary rollback | `dpl_FkPQfrBgKVTrdypwoSp7zD3gxvo4` | Product Navigation Banner V1, `04fc63e4` |
| Secondary retained rollback | `dpl_Bofcqy7BTKeF9rXsVfLmm3eJLL8V` | Subscription Conversion UI V1, `a283a73c` |

Method: the established pipeline's `--stage=rollback` (moves the production alias back to the primary rollback) or `vercel promote <deployment> --scope bright-path-ed-tech`. Both deployments remain READY; neither is to be deleted.

## Promotion method

The repository's established safe Vercel workflow (`scripts/run-nextjs-hotfix-production.mjs`, constants pinned to this release): preflight (apex served by `dpl_FkPQ…`) → deploy-preview (`vercel deploy --prod --skip-domain` of the certified runtime, `MVH_SOURCE_REVISION=b7138368`) → probe-preview through the CLI protection bypass (health build = commit, unsigned webhook 400, canonical-host 308s, optimizer refusals, no 5xx) → promote → probe-live (all checks PASS) → live browser smoke. Production was not redeployed for this closeout.

## Untouched

Billing and Stripe, Supabase authentication, entitlement rules, commercial policy, school-code validation, PDFs, games, ShowMe Math content and the ShowMe host configuration.
