# MathNexa v1.2.38 — Math Bingo Live strategic winner pacing

Released 2026-11-07 (UTC) under explicit owner approval ("Approve, release", after the staging owner review of
`owner-review/math-bingo-live-pacing-2026-11-06.md`).

**What changed.** Math Bingo Live paces its winners on the server for every mode and level: no Bingo before call 15,
a real opportunity from call 15, and at least ten calls between winners — achieved by how cards are dealt (every
enabled winning line holds a late answer class) and how each question is chosen (`private.bingo_schedule`), never by
refusing a complete line. A line completed while a winner gate is closed is kept as a pending line and confirmed at the
next gate. Capacity (unique questions, answer classes, class size) bounds the winners a level can pace and is shown in
setup, in the lobby and on a refused Start. Standings rank progress → lines at that progress → correct marks and show
ties (`T-2`); response time never ranks. Host chip and student footer show "First / Next Bingo opportunity in N calls"
and "Bingo opportunity OPEN". Fraction Bingo gains Halves to tenths and Halves to twelfths. Everything from
v1.2.35–v1.2.37 (QR + code joining, emoji, unique questions, independent marking, Fraction Bingo, Called history, Free
Space, Winning Ways, winner counts, sounds, music, reconnect, leaderboard, free hosting, security, 30/50-player speed)
is kept.

| | |
| --- | --- |
| Version | `v1.2.38`. Production built from `093f5a6` (app code identical to the staging-certified `db0fee3`; `298602c` and `093f5a6` add the scheduler-tune migration, runner lists, tests and evidence). `/api/health` reports it. |
| Certified runtime | `093f5a6`. |
| Tag | Annotated `v1.2.38` → `093f5a6`, pushed after live verification. |
| Branch / PR | `feature/math-bingo-live-pacing` from `main` `eb9bd40` (v1.2.37): `3054af4` pacing, `db0fee3` header chip + review assertions, `298602c` scheduler urgency, `093f5a6` tests + evidence. PR [#14](https://github.com/DesmondQuayson/math-word-hunt/pull/14). |
| Merge | origin `main` fast-forwarded `eb9bd40` → `093f5a6`, then to this record. No merge commit, no force. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-38`, detached at `093f5a6`, `node_modules` junction. Keep it for the rollback commands. |
| Staging | `dpl_AAqbivFsTCJUDj16f2isqVYdGQoR` (build `db0fee3`, migrations `20261108100000` + `20261108110000` applied): review 52/52 (Bingos at calls 16, 26, 36), loads at 30 and 50 students. |
| Production runtime | `dpl_BrcgEH24X3AaoFqdteCqdaXfF38o` (`https://mathnexa-platform-production-k4p2dpytd-bright-path-ed-tech.vercel.app`), promoted 06:47:18Z. |
| Rollback runtime | `dpl_617Nre9Xt98mPSpLHv6z5Ta6NtVm` (v1.2.37, build `f837b6e`), retained. |
| Database | Production migrations `20261108100000_math_bingo_live_pacing.sql` (additive: `bingo_room_questions`, `bingo_rooms.pacing`, participant `best_lines` / `pending_*`, scheduler, paced Start, card check) and `20261108110000_math_bingo_live_pacing_tune.sql` (scheduler only), applied before the deploy; history 42 → 44. Rollback: `supabase/rollback/math_bingo_live_pacing.sql`. |
| Environment / dependencies | Unchanged / unchanged. |

## Gates (local, `093f5a6` app code)

Typecheck clean; lint 0 errors; unit core 245/245, web 1,200 passed / 1 skipped (pacing suite 9/9); pgTAP
`40_math_bingo_live_pacing` 72/72, legacy 37/38/39 177/97/76, full `supabase test db` 41 files / 1,349 tests (known
99_phase7d cleanup leftover only); rollback script proven on the local database (v1.2.37 suites pass after it; the
migration re-applies cleanly); `test:security` 322/322 with both audits; production build pass (72 pages). Pacing
simulator through the real database functions: 1,924 complete matches (classes of 3–50, 1/2/3/5 winners, every mode),
0 contract violations, earliest Bingo call 15, minimum winner gap 10, join order never predicts wins. Playwright matrix
(Chromium, WebKit, devices) 19/19.

## Database stages (`scripts/invoke-math-bingo-live-production.ps1`)

| Stage | UTC | Result |
| --- | --- | --- |
| audit (read only) | 06:41:28 | PASS. Production identity proven; pending exactly `20261108100000`, `20261108110000` in order; no remote-only versions; earlier Bingo migrations applied; Bingo objects present; catalog row `published`. |
| migrate | 06:42:43 | PASS. Both files applied in order with the Supabase CLI; history 42 → 44, the other rows unchanged (digest); catalog 6 / versions 14, accounts 37, auth users 37, entitlements 4, subscriptions 4, resources 225 and the five other games unchanged; RLS forced on every `bingo_*` table, no browser grants; `bingo_host_start_paced` present. |
| verify | 06:43:29 | PASS. Tables, RLS, grants, definer + service-role-only functions, catalog `published`, other games unchanged. |
| smoke | 06:43:33 | PASS. Synthetic room contract; browser key refused on the table and the functions; 0 synthetic rows left. |

Old app + new database were compatible during the window (legacy `bingo_host_start` rooms keep the fixed deck;
`bingo_next_question` dispatches on `pacing is null`), as the v1.2.37 pgTAP suites against the migrated local database
showed.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=093f5a6`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_617Nre9Xt98mPSpLHv6z5Ta6NtVm`,
`RELEASE_PURPOSE=v1.2.38-math-bingo-live-pacing`. Logs: `qa-artifacts/math-bingo-live/production/release-v1.2.38/`.

| Stage | Result |
| --- | --- |
| preflight | PASS (06:43:45Z). Apex served `dpl_617Nre9X…` (rollback target), retained; health 200. |
| deploy-preview | PASS (06:43:57Z). `dpl_BrcgEH24…` Ready, candidate commit `093f5a6` / tree `dd22013…`, Next 16.4.2, sharp 0.35.5. |
| probe-preview | PASS, 7/7 (health, webhook, canonical host, admin, scheduler fail-closed, forged access, images). |
| promote | PASS (06:47:18Z). `dpl_617Nre9X…` → `dpl_BrcgEH24…`. |
| probe-live | PASS, 22/22 (apex serves `dpl_BrcgEH24…`; webhook host, security headers, images, fail-closed surfaces). |

## Live verification

| Check | Result |
| --- | --- |
| `/api/health` | `{"status":"ready","environment":"production-platform","build":"093f5a6a…","searchIndexing":"enabled","payments":"live"}` |
| Public routes | `/` 200, `/join` 200, `/math-games` 200, `/sitemap.xml` 200, `/robots.txt` 200; `/games/math-bingo-live/host` signed out → 307 `/access?next=…`; `/games/math-bingo-live/play` → 307 host |
| Student runtime served | `/join` references `math-bingo-live/src/player.js?v=0da28eb369cc30e2` (this release's runtime hash) |
| Production gameplay QA (`-Stage qa`, 06:48Z and 06:55Z) | **33/33** on the second run (first run 32/33: the harness's leaderboard check still expected unique ranks; it now accepts shared ranks for ties — `5abdf08`, scripts only). Synthetic room through the service role and the public `https://mathnexa.com` API: 50 students joined with a code and a name (emoji kept, markup and off-list emoji refused), WebKit and Chromium phones joined from the QR link, Start dealt every card in one request (53/53), 50 identical answers at the same instant 50/50 accepted and the repeats never counted, Free Space announcements with emoji, every card holds exactly its own marks, two winners in order with distinct places, a winner cannot mark again, the limit ended the game, Called history 16 questions all different, reconnect restores seat/card/emoji, Play Again gave new cards and a fresh history, no phone script errors, close ends every seat, Fraction Bingo called every fraction once. Logs: `docs/releases/evidence/mathnexa-v1.2.38/`. |
| Staging-certified behaviour | The paced game itself (first Bingo from call 15, ten calls between winners, pending lines, ties, capacity messages) was certified on staging preview `dpl_AAqbivFsTCJUDj16f2isqVYdGQoR` (same app code) by the browser review (52/52), the 30/50-student loads and the Playwright matrix; production QA drives the service-role functions with the legacy fixed deck, so the owner's own first production game is the first paced game on production. |

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-38
$env:RELEASE_CERTIFIED_RUNTIME = '093f5a6'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_617Nre9Xt98mPSpLHv6z5Ta6NtVm'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_617Nre9Xt98mPSpLHv6z5Ta6NtVm
```

- **App only:** the commands above return the apex to v1.2.37. The migrated database stays (compatible functions), so
  no database step is needed; rooms started as paced games must be closed before any database rollback.
- **Game only:** `scripts/invoke-math-bingo-live-production.ps1 -Stage archive` (owner's instruction).
- **Database (only if ever required, after the app rollback):** `supabase/rollback/math_bingo_live_pacing.sql` in one
  transaction (restores every function and constraint as `20261107100000` left them; drops the universe table, the
  pacing / pending columns and the scheduler).
