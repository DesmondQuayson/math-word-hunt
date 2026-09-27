# MathNexa v1.2.16 — Math Tug of War V1 (production release record)

Released 2026-09-27 under explicit owner approval.

| | |
| --- | --- |
| Version / tag | `v1.2.16` (annotated, tag object `00ddc3a0`) |
| Runtime commit | `83aabfc` (app code identical to the staging-reviewed `4afa073`) |
| Main | `83aabfc` at release; this record follows as a docs-only commit |
| Production deployment | `dpl_C2FLfRVupPRsRkQcjTnx5xNwjfRT` (mathnexa-platform-production-hrmtek1wz) |
| Previous / rollback | `dpl_3DUHT7Lcfy1VvGWStF9JLGnnkyyN` (v1.2.15, READY) |
| Production database | `hdtnbuowvdjwnkdqtdbv` |

## What shipped

- **Math Tug of War**: VS Robot, Two Teams, Online Match.
- Six skills: Addition, Subtraction, Multiplication, Addition & Subtraction of Integers, Opposite of
  Integers, Absolute Value.
- Absolute Value mixes two families: standard `|x|` and negative-outside `−|x|` (about 40 %).
- Win at **7 net pulls**; a wrong answer never pulls; an opponent's pull moves the rope back.
- **Access: free with a MathNexa account.** Authentication required; no subscription, trial or school
  code. Anonymous visitors go to sign in / create account and return to the game — never pricing,
  checkout, subscription or trial. Policy lives only in `apps/platform-web/lib/games/access-policy.ts`;
  every other game and product keeps its rules. No analytics were added (no existing privacy-safe
  pipeline).
- **Homepage**: "Featured games" — Math Vocabulary Hunt beside Math Tug of War ("FREE with a MathNexa
  account", "Solve the math. Pull the rope. Beat the other side!", **Play for Free Now**). Math Games
  page: "Free to play" badge.

## Production database

Applied 2026-09-27 14:49 UTC with `scripts/invoke-math-tug-of-war-production.ps1 -Stage migrate`
(gated `supabase db push`, which records each history row itself):

1. `20260927100000_math_tug_of_war.sql` — recorded (38 statements)
2. `20260928100000_math_tug_of_war_seven_pulls.sql` — recorded (7 statements)

- Read-only audit first. Identity was proven by four independent signals: the ref is not staging; the
  pooler authenticated `postgres.<ref>`; the REST API matched the pooler data; and the 8 production
  quiz ids were present. The pending set was exactly these two, with no remote-only versions,
  PH2-07 not involved, and no Tug object present beforehand.
- History 33 → 35; older rows byte-identical (digest compared).
- Catalog 4 → 5: Math Tug of War once, published, display order 33. Catalog versions 11 → 12.
- Accounts 10, entitlements 1, subscriptions 1, resources 225 and auth users 10 are unchanged, and
  still unchanged after the live review.
- `tug_rooms` / `tug_join_failures`: RLS enabled + forced, no anon/authenticated privileges.
- Six `tug_*` functions: SECURITY DEFINER, execute for service_role only.
- Position check −7…7; `tug_rooms_winner_state_check` (leave-after-win fix) present, old rule gone;
  submit function uses ±7.
- Smoke on production with synthetic hashes, 0 rows left:
  - create/join, pull, replay rejected, wrong answer no pull, opponent pull back, full room;
  - 6 pulls no win, 7th wins;
  - leave after win;
  - expired room refused.
- Manual recovery plan: `docs/releases/math-tug-of-war-v1-manual-rollback.sql` (not executed; an app
  rollback alone hides the card because older builds drop unregistered internal keys).

## Pipeline

`scripts/run-nextjs-hotfix-production.mjs` with `RELEASE_CERTIFIED_RUNTIME=4afa073`,
`RELEASE_ROLLBACK_DEPLOYMENT=dpl_3DUHT7Lcfy1VvGWStF9JLGnnkyyN`:

- **preflight** PASS
- **deploy-preview**: non-aliased `--prod --skip-domain` deployment, runtime diff vs 4afa073 empty
- **probe-preview** 6/6
- **promote** PASS
- **probe-live** 22/22, including:
  - Tug route → `/access?next=/games/math-tug-of-war/play`
  - Tug API 401 when anonymous
  - `/games/number-logic/play` still protected
  - security headers, webhooks, images, no 5xx

## Live production review (mathnexa.com, Chromium + WebKit) — 94/94

`scripts/invoke-math-tug-of-war-production.ps1 -Stage review`: four synthetic accounts, deleted
afterwards, plus two rooms removed.

- Homepage card beside Math Vocabulary Hunt, with thumbnail, copy and CTA.
- Logged-out: sign in / create account, never pricing; direct route and API refused.
- Create account: the form carries no card, trial or subscription wording.
  - Production policy: the account was created administratively, with no email to a synthetic
    address.
  - Sign-in returns straight to the game.
  - No trial, subscription or entitlement row was created.
- Signed-in non-subscriber plays free (exit goes Home); every other game and product still requires
  a subscription.
- Subscriber plays (exit goes to Math Games); Free to play badge on Math Games; other cards
  unchanged.
- All 6 skills: ranges, wrong answer no pull, correct pull, alternating pulls keep centre.
  - Absolute Value questions accepted in both families.
- Keypad sign rules; Two Teams simultaneous touches; 6 net pulls no win, 7th wins; Play Again.
- Smart Board 1920×1080, phones 320–430, iPad (WebKit), reduced motion; no overflow.
- VS Robot, Two Teams, Online Match:
  - non-subscriber vs subscriber, including a WebKit guest;
  - two non-subscribers;
  - simultaneous answers, reconnect, rematch, leave (no fake win);
  - replay rejected; 7-pull win.
- Page errors: only WebKit's aborted in-flight loads during navigation ("access control checks" on
  prefetches, one aborted chunk that serves 200). No application errors; 0 unexpected.

## Gates on the release runtime

| Gate | Result |
| --- | --- |
| TypeScript, ESLint | clean |
| Platform-web unit (engine, 60k-question audit, 10k match simulations, access policy) | 774 |
| Core | 245 |
| pgTAP (fresh replay of every migration) | 836/836 |
| Local e2e (Chromium, WebKit, Pixel 7, iPhone 13, iPad; responsive 304–1920, 200 %, axe, audio, reduced motion) | 107/107 |
| Online two-client + free-access (create account, sign-in return, access matrix, both online pairings, homepage 304–1920 + 200 % + axe) | 12/12 |
| Security suite + bundle / launch audits | 292 + audits |
| Media audit, production build | pass |
| Staging review / share-link check | 92/92 / 31/31 |

School-code sessions are covered by the access-policy and online-route tests. A live school-code run
needs the code and was not run.

## Cleanup

- Staging Shareable Links revoked (`regenerate: false`) on `dpl_5itQ…`, `dpl_BEJuv…` and `dpl_Bqd…`.
  Each link now answers with the Vercel login, and Deployment Protection is still on.
- The owner's staging account is kept.
- Synthetic production accounts and rooms are deleted.
- No secrets in the repository, tag or this record.
