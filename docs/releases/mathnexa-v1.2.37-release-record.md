# MathNexa v1.2.37 — Math Bingo Live on the homepage

Released 2026-11-06 (UTC) under explicit owner approval ("yes add it. it still free for now", then "Yes, release it").

**What changed.** The homepage's Featured games shows Math Bingo Live after Math Tug of War ("Free to host with a
MathNexa account"), with **Host a Free Game** (`/games/math-bingo-live/host`; a signed-out teacher goes through sign in)
and **Join with a code** (`/join`; students need no account). The Math Games page's Math Bingo Live card has the same
two buttons, and its intro says Math Tug of War and Math Bingo Live are free with any MathNexa account. No access rule,
game code or database object changed; Math Bingo Live stays free (`authenticated-free`).

| | |
| --- | --- |
| Version | `v1.2.37`. Production built from `f837b6e` (`f837b6e86aba6becd4df8126e226bbc85d098c23`, tree `634bbfb…`); `/api/health` reports it. |
| Certified runtime | `f837b6e` (the staged build). |
| Tag | Annotated `v1.2.37` → `f837b6e`, pushed after live verification. |
| Branch / PR | `feature/math-bingo-live-home-card` from `main` `1c4891f`. PR [#13](https://github.com/DesmondQuayson/math-word-hunt/pull/13), CI 2/2. |
| Merge | origin `main` fast-forwarded `1c4891f` → `f837b6e`, then to this record. No merge commit, no force. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-37`, detached at `f837b6e`, `node_modules` junction. |
| Staging | `dpl_3ainxuXuV1VykkL3kiry6ktdW4Nx` (build `f837b6e`): both featured cards, host link → sign in, `/join` 200. |
| Production runtime | `dpl_617Nre9Xt98mPSpLHv6z5Ta6NtVm` (`https://mathnexa-platform-production-8btz2dswm-bright-path-ed-tech.vercel.app`), promoted 09:18:40Z. |
| Rollback runtime | `dpl_5WiDy4qAJEkU5qHCWwubiWPtiSBN` (v1.2.36, build `52568df`), retained. |
| Database / environment / dependencies | Unchanged / unchanged / unchanged. |

## Gates (local, `f837b6e`)

Typecheck clean; lint 0 errors (8 pre-existing warnings); unit core 245/245, web 1,185 passed / 1 skipped (new Math Games
card test); Phase 9 e2e 30/30 with the homepage visual baselines regenerated for the new card (desktop and 390 px
reviewed); Math Tug of War free-access e2e 8/8 (now two featured cards).

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=f837b6e`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_5WiDy4qAJEkU5qHCWwubiWPtiSBN`,
`RELEASE_PURPOSE=v1.2.37-math-bingo-live-home-card`. Logs: `qa-artifacts/math-bingo-live/production/release-v1.2.37/`.

| Stage | Result |
| --- | --- |
| preflight | PASS. Apex served `dpl_5WiDy4qA…` (rollback target), retained. |
| deploy-preview | PASS. `dpl_617Nre9X…` Ready and protected, Next 16.4.2. |
| probe-preview | PASS, 7/7. |
| promote | PASS (09:18:40Z). `dpl_5WiDy4qA…` → `dpl_617Nre9X…`. |
| probe-live | PASS, 22/22. |

## Live verification

| Check | Result |
| --- | --- |
| 27 public routes vs a capture just before | 25 identical; only `/` and `/math-games` changed (their visible text: the new card and buttons), as intended |
| Homepage | Featured cards `math-tug-of-war`, `math-bingo-live`; Host a Free Game → `/games/math-bingo-live/host`; Join with a code → `/join` |
| Math Games | Host a Free Game on the Math Bingo Live card; intro names both free games |
| Links | Host signed out → 307 `/access?next=/games/math-bingo-live/host`; `/join` 200 |
| Runtime logs since promotion | 5xx, error, fatal: 0, 0, 0 |

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-37
$env:RELEASE_CERTIFIED_RUNTIME = 'f837b6e'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_5WiDy4qAJEkU5qHCWwubiWPtiSBN'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_5WiDy4qAJEkU5qHCWwubiWPtiSBN
```

Nothing else to undo (no database or environment change).

Still open from v1.2.36: the owner's real-phone QR scan and a game hosted from the owner's account.
