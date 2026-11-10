# MathNexa v1.2.43 — Math Games names every free game

Released 2026-11-10 (UTC). The owner answered "Yes, fix it" to fixing the `/math-games` sentence that left out Polygon
Showdown (noted in the v1.2.42 record), then approved the release after the candidate probe ("Approve release").

**What changed.** The public Math Games page used to say "Every game is included with a MathNexa subscription, and Math
Tug of War and Math Bingo Live are free with any MathNexa account". That sentence was written by hand in v1.2.37 and
was not updated when Polygon Showdown became free in v1.2.40. It now reads:

> Every game is included with a MathNexa subscription, and Math Tug of War, Math Bingo Live and Polygon Showdown are
> free with any MathNexa account.

The page's search description used to name only Math Tug of War. It now names no game: "Math games for whole-class
play and quick practice, with the grades and skills for each game. Some are free with any MathNexa account."

**How the names are chosen.** `lib/seo/free-games-statement.ts` names the free games among the games the page already
lists:

- each game's `freeToPlay` comes from the access policy (`summarizeGames` asks `isFreeToPlayGame`, the policy behind
  `requireGamePlayAccess`);
- the games are the published catalog, in catalog order.

So the sentence always matches the Free badges on the cards below it. A game made free or published later is named
without editing the page. A draft or a subscription game is never named. If the catalog cannot be read, the page
keeps its Math Tug of War fallback card and names that game. The search description is static metadata, so it names
no game and cannot go stale; metadata stays synchronous, in the head.

**Not changed.** Access rules, gameplay, the catalog, the cards and their buttons, the homepage, `/games`, wallet,
shop, avatar, database, environment and dependencies. No migration.

| | |
| --- | --- |
| Version | `v1.2.43`. Production built from `8bdd9f5` (`8bdd9f508e0c7b6e99091bfdf70140d411606a07`, tree `c495276…`); `/api/health` reports it. |
| Base | v1.2.42, `main` `511546b`. |
| Branch / PR | `fix/math-games-free-games-copy` from `511546b`. PR [#18](https://github.com/DesmondQuayson/math-word-hunt/pull/18), CI 2/2, merged 10:21:43Z. |
| Merge | origin `main` fast-forwarded `511546b` → `8bdd9f5`, then to this record. No merge commit, no force. |
| Tag | Annotated `v1.2.43` → `8bdd9f5`. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-43`, detached at `8bdd9f5`, `node_modules` junction. Keep it for the rollback commands. |
| Production runtime | `dpl_48RVKcdmUTbs8EFpCcfBf1wAzP7D` (`https://mathnexa-platform-production-4fgwlpq0l-bright-path-ed-tech.vercel.app`), promoted 10:14:12Z. |
| Rollback runtime | `dpl_9URSK6GmGqrZ623JRpiymn3Eu292` (v1.2.42, build `fa22f38`), retained. |
| Database / environment / dependencies | Unchanged. No migration. |

## Gates (local, `8bdd9f5`)

| Gate | Result |
| --- | --- |
| Typecheck | Clean |
| Lint | 0 errors (8 pre-existing warnings) |
| Unit, core | 245/245 |
| Unit, web | 1,395 passed, 1 skipped (v1.2.42: 1,386), including the 9 new tests for the statement, the Math Games page and its description |
| Production build | Passes |
| Phase 9 e2e | 30/30, including the new check of the local intro sentence |
| Math Tug of War free-access e2e | 8/8 |
| Math Bingo Live security e2e, free access | 1/1. Bingo is a DRAFT in that run, so the test now expects `/math-games` not to name it, instead of relying on the old hand-written sentence |
| Polygon Showdown solo e2e, anonymous visitors | 1/1, including "a draft is not on `/math-games`" |

The new unit tests run Production's catalog (7 published games, in display order) through the real `summarizeGames`
and access policy. They check that the three free games are named, that the subscription games and a new entitled game
are never named, that a game without Polygon Showdown gives two names and one game gives "is", that the statement is
empty when nothing listed is free, and that a game made free is named in catalog order.

**Local review.** For this session only, the local catalog was set to Production's state: the five local drafts were
switched to published by status flip, then restored exactly. On a local production-platform server, 19/19 checks
passed: the intro names exactly the three games whose cards say Free, in card order, and none of the four subscription
games; the search description is the game-free sentence, once, in the head; the h1 is unchanged; and at 1366, 390 and
320 px nothing scrolls sideways and axe finds 0 WCAG 2.2 A/AA violations. The same review against live v1.2.42 passed
16/19: its intro left out Polygon Showdown, so it did not match the Free badges, and its description named only Math
Tug of War.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=8bdd9f5`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_9URSK6GmGqrZ623JRpiymn3Eu292`,
`RELEASE_PURPOSE=v1.2.43-math-games-free-games`. Logs are in `docs/releases/evidence/mathnexa-v1.2.43/`.

| Stage | Result |
| --- | --- |
| preflight | PASS. The apex served `dpl_9URSK…` (the rollback target), which is retained. |
| deploy-preview | PASS. `dpl_48RVK…` is Ready and protected, with Next 16.4.2 and sharp 0.35.5. |
| probe-preview | PASS, 7/7 checks: health, webhook, canonical host, scheduler closed, no 5xx, image optimizer, remote images refused. |
| promote | PASS (10:13:51–10:14:12Z), after the owner's approval. `dpl_9URSK…` → `dpl_48RVK…`. |
| probe-live | PASS, 22/22. |

The candidate's own host redirects every page to `mathnexa.com` (the canonical-host rule), so `/math-games` could not
be viewed there before promotion. It was checked live straight after promotion, with the rollback ready. Three captures
of the live public pages before promotion (two during the review, one just before promotion) were identical.

## Live verification

| Check | Result |
| --- | --- |
| Public pages | 32 of 33 are identical to the capture just before promotion. Only `/math-games` changed: its intro sentence and its search description, as intended. |
| `/math-games` intro | "Every game is included with a MathNexa subscription, and Math Tug of War, Math Bingo Live and Polygon Showdown are free with any MathNexa account." It names exactly the three games whose cards say Free, in card order, and none of the four subscription games. |
| Search description | "Math games for whole-class play and quick practice, with the grades and skills for each game. Some are free with any MathNexa account." Once, in the head. |
| `/math-games` review | 19/19 (live v1.2.42: 16/19). The h1 is unchanged. At 1366, 390 and 320 px nothing scrolls sideways and axe finds 0 WCAG 2.2 A/AA violations. |
| Health | `/api/health` reports build `8bdd9f508e0c…` in `production-platform`. |
| Runtime since promotion | 0 5xx, 0 error and 0 fatal logs for the new deployment; the 2xx control returns 152 rows. Function status counts are 200 and 307 from 10:15Z to 10:25Z; the first check (10:10–10:20Z, which includes the live probe) also shows 400, 401 and 404 from the probe's refusals. No 5xx. |

Side-by-side images of the first screen, live v1.2.42 against live v1.2.43: `compare-math-games-1366x768.webp` and
`compare-math-games-390x844.webp`. The only visible change is the intro sentence, which takes one more line.

**Noted, not changed.**

- On `/math-games`, the Polygon Showdown card has no button. Math Bingo Live has Host a Free Game and Join with a code;
  Math Tug of War has About Math Tug of War.
- `/help` and `/about` say "Math Tug of War is free with any MathNexa account". That is true, but it names one of the
  three free games. `app/pricing/page.tsx` has the same sentence (signed-out visitors to `/pricing` are sent to
  `/access`).
- `/terms` says "Math Tug of War is free with any signed-in MathNexa account". It is legal text, so a change is the
  owner's decision.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-43
$env:RELEASE_CERTIFIED_RUNTIME = '8bdd9f5'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_9URSK6GmGqrZ623JRpiymn3Eu292'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_9URSK6GmGqrZ623JRpiymn3Eu292
```

There is nothing else to undo: no database or environment change.
