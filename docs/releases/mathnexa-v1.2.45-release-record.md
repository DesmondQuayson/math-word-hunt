# MathNexa v1.2.45 — Math Bingo Live winner targets and variable winner pacing

Released 2026-11-11 (UTC) under explicit owner approval ("Approve, release", after the owner review of
`owner-review/math-bingo-live-winner-pacing-2026-11-11.md`).

**What changed.** Number of winners is one box (− / + / typed) for every mode: any whole number from 1 to 60 (the room's
player limit); no presets, no per-level capacity cap, no capacity refusal; the host route and the database refuse 0,
negatives, decimals, text, `null`, NaN, Infinity and anything above 60. The lobby shows `Players: N · Winner target: T`
and warns (never resets) when the target is above the players; Start goes ahead and that game ends when every player has
Bingo. The database draws each game's first winner gate from calls 14–17 (Fraction halves to fifths 4–7, to sixths 9–12)
and a fresh gap of 8–11 calls after every new winner event, from the secret game seed; both are stored, never redrawn and
never sent to any screen (the v1.2.38 countdown chip and student line are gone). Players who finish on the same call
share the placement and count toward the target, past it if needed; lines finished while a gate is closed are confirmed
together at the next gate. Everything else from v1.2.35–v1.2.44 is kept.

| | |
| --- | --- |
| Version | `v1.2.45`. Production built from `5dc155f`; `/api/health` reports it. App code identical to the staging-certified `29d01fd` (`5dc155f` adds the rollback hardening, the suite rename 41 → 42, the owner-review record and evidence; `git diff 29d01fd 5dc155f -- apps packages package*.json` is empty). |
| Certified runtime | `5dc155f`. |
| Tag | Annotated `v1.2.45` → `5dc155f`, pushed after live verification. |
| Branch / PR | `feature/math-bingo-live-winner-pacing` from `main` `299366d` (v1.2.44): `29d01fd` feature, `5dc155f` rollback hardening + record. PR [#20](https://github.com/DesmondQuayson/math-word-hunt/pull/20). |
| Merge | origin `main` fast-forwarded `299366d` → `5dc155f`, then to this record. No merge commit, no force. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-45`, detached at `5dc155f`, `node_modules` junctions. Keep it for the rollback commands. |
| Staging | `dpl_7f4JyjbevwmqupAkMizdPeMjP6yr` (build `29d01fd`, migration `20261111100000` applied and verified): review 41/41 (gate 16; Bingos at calls 16, 26, 35), production QA harness 33/33, loads at 10/20/30/40/50 students. |
| Production runtime | `dpl_2KufePPCeqSs1msZRq3hmccwLDGr` (`https://mathnexa-platform-production-dvwsepgfg-bright-path-ed-tech.vercel.app`), promoted 19:00:57Z. |
| Rollback runtime | `dpl_3D9Kw82kCLF4dTP3Bf8wS9MXH49q` (v1.2.44, build `af44f4f`), retained. |
| Database | Production migration `20261111100000_math_bingo_live_winner_targets.sql` (helper functions, replaced function bodies, the unique placement index replaced by a plain one), applied 18:59:45Z, after the candidate was deployed and probed and ~70 s before the promote; history 46 → 47. Rollback: `supabase/rollback/math_bingo_live_winner_targets.sql`. |
| Environment / dependencies | Unchanged / unchanged. |

## Gates (local, `5dc155f` = `29d01fd` app code)

Typecheck clean; lint 0 errors (8 pre-existing warnings in `public/game-suite/natural-voice.js`); content audit pass; unit
core 245/245, web 1,421 passed / 1 skipped; pgTAP `42_math_bingo_live_winner_targets` 147, Bingo 37/38/39/40
179/97/76/74, full `supabase test db` 1,600/1,601 (known `99_phase7d` cleanup leftover only); rollback proven on the local
database (it closes the in-progress and tied rooms, keeps the rest; v1.2.44's suites pass on the rolled-back database,
177/97/76/72; the migration re-applies); `test:security` 326 with both audits; production build pass. 10,000-room draws:
first gate 14/15/16/17 = 24.78/25.55/24.79/24.88% (χ² 1.64), gaps 8/9/10/11 = 25.25/24.89/24.73/25.13% of 50,000 (χ² 3.27).
Pacing simulator through the real database functions: 913 games, 0 violations. Playwright: Chromium 10/10, WebKit 7/7 (one
rerun after a CPU-contention miss on a 2.2 s banner), devices 4/4; Polygon Showdown `/join` 2/2.

## Database stages (`scripts/invoke-math-bingo-live-production.ps1`)

| Stage | UTC | Result |
| --- | --- | --- |
| audit (read only) | 18:52:52 | PASS. Production identity proven (API matches database, quiz fingerprint); pending exactly `20261111100000`; no remote-only versions; earlier Bingo migrations applied; Bingo objects present; all seven games `published`. |
| migrate | 18:59:09–18:59:45 | PASS. Dry run listed exactly this file; applied with the Supabase CLI; history 46 → 47 (other rows unchanged, digest equal); catalog 7 / versions 17, accounts 48, auth users 48, entitlements 6, subscriptions 6, resources 225 and the other games unchanged. |
| verify | 19:00:05 | PASS. Tables, RLS, grants, definer + service-role-only functions, catalog `published`, other games unchanged. |
| smoke | 19:00:08 | PASS. Synthetic room contract; browser key refused on the table and the functions; 0 synthetic rows left. |

Old app + new database were compatible during the ~70 s window (proven locally: v1.2.44's create, Start and states work
on the new database; its Start payload's gate numbers are ignored and the database draws its own; only its "Everyone"
(0) winner choice is refused).

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=5dc155f`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_3D9Kw82kCLF4dTP3Bf8wS9MXH49q`,
`RELEASE_PURPOSE=v1.2.45-math-bingo-live-winner-pacing`, `HOTFIX_VERCEL_CLI=npx --yes vercel@59`. Logs:
`docs/releases/evidence/mathnexa-v1.2.45/` (production project ref redacted).

| Stage | Result |
| --- | --- |
| preflight | PASS (18:54:05Z). Apex served `dpl_3D9Kw82k…` (rollback target), retained; health 200. |
| deploy-preview | PASS (18:56:30Z). `dpl_2KufePPC…` Ready, candidate commit `5dc155f` / tree `ada3743…`, Next 16.4.2, sharp 0.35.5. |
| probe-preview | PASS, 7/7 (health, webhook, canonical host, scheduler fail-closed, no server errors, optimizer, remote refused). The first invocation was refused before probing (operator omitted `--url` / `--deployment`). |
| promote | PASS (19:00:57Z). `dpl_3D9Kw82k…` → `dpl_2KufePPC…`. |
| probe-live | PASS, 22/22 (apex serves `dpl_2KufePPC…`; webhook hosts, redirects, public pages, private no-store, fail-closed surfaces, security headers, images). |

## Live verification

| Check | Result |
| --- | --- |
| `/api/health` | `{"status":"ready","environment":"production-platform","build":"5dc155ff…","searchIndexing":"enabled","payments":"live"}` |
| Public routes | `/` 200, `/join` 200, `/math-games` 200, `/sitemap.xml` 200, `/robots.txt` 200; `/games/math-bingo-live/host` signed out → 307 `/access?next=…`; `/games/math-bingo-live/play` → 307 host |
| Student runtime served | `/join` references `math-bingo-live/src/player.js?v=fdbf0e6a67d3e50a` (this release's runtime hash); served `host.js` carries the winner box (`winners-count`), no file carries the countdown (`pacingText`, "Bingo opportunity") or presets; `settings.js` has `MAX_WINNERS = MAX_PARTICIPANTS` |
| Production gameplay QA (`-Stage qa`, finished 19:02:50Z) | **33/33**. Synthetic rooms through the service role and the public `https://mathnexa.com` API: 50 students joined with a code and a name (emoji kept, markup and off-list emoji refused), QR on WebKit and Chromium phones, numeric code, repeated-question deck refused, all cards dealt at Start, 50 simultaneous same-answer taps accepted and repeats not counted, Free Space announcements, own marks only, two winners in order with distinct places (the legacy fixed-deck path), already-won refusal, the configured limit ended the game, leaderboard with shared ranks, unique Called history, reconnect, Play Again, Fraction Bingo; 0 synthetic rooms left. |
| Staging-certified behaviour | The paced game itself (first gate drawn 14–17, gaps 8–11, hidden gates, same-call ties, any target, lobby warning) was certified on staging preview `dpl_7f4Jyjbe…` (same app code) by the browser review (41/41), five loads and the Playwright matrix; production QA drives the service-role functions with the legacy fixed deck. |

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-45
$env:RELEASE_CERTIFIED_RUNTIME = '5dc155f'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_3D9Kw82kCLF4dTP3Bf8wS9MXH49q'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_3D9Kw82kCLF4dTP3Bf8wS9MXH49q
```

- **App only:** the commands above return the apex to v1.2.44. The migrated database stays (v1.2.44 works on it; only
  its "Everyone" winner choice is refused), so no database step is needed.
- **Game only:** `scripts/invoke-math-bingo-live-production.ps1 -Stage archive` (owner's instruction).
- **Database (only if ever required, after the app rollback):** `supabase/rollback/math_bingo_live_winner_targets.sql` in
  one transaction. It closes, as the host's Close does, every room with a game in progress under the new rules and every
  room whose winners share a place, then restores every function exactly as `20261108110000` left them, drops the new
  helpers and rebuilds the unique placement index.

## Known limitations (from the owner review)

Above ~30 students the poll, tap and host p95s exceed the harness limits as in v1.2.38 (Supabase API layer; staging
database time stays at ~18 ms per poll and ~35 ms per tap under 50 students); small levels with big classes produce large
same-call ties (29 sharing 10th at 50 students on Facts to 20); targets near the class size on small levels can run out of
questions; ties can pass the target; WebKit on Windows stood in for Safari (real iPhone/iPad/Smart Board checks remain
the owner's).
