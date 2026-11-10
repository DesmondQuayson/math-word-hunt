# MathNexa v1.2.44 — free games named everywhere, and Play Free for Polygon Showdown

Released 2026-11-10 (UTC). After v1.2.43 the owner answered "Yes, v1.2.44" to the follow-ups noted in that record,
then approved the release after the candidate probe ("Approve release").

**What changed.**

- `/math-games`: Polygon Showdown's card had no button, while Math Bingo Live has Host a Free Game and Join with a code
  and Math Tug of War has About Math Tug of War. Every free game without a button of its own now gets **Play Free**, to
  its free play route. For a signed-out visitor that route goes to sign in and back to the game, never to pricing. Its
  accessible name is "Play Free Polygon Showdown", as on the homepage cards. The other cards are unchanged, and the
  subscription games still have no button.
- `/help` ("Play a game for free") said only Math Tug of War. It now reads: "Math Tug of War, Math Bingo Live and
  Polygon Showdown are free with any MathNexa account. You do not need a trial or subscription to play them."
- `/about` (What one subscription includes, Math Games): "Math games for whole-class play and quick practice. Math Tug
  of War, Math Bingo Live and Polygon Showdown are free with any MathNexa account."
- `/pricing`, which only signed-in visitors see (signed-out visitors are sent to `/access`): "One monthly subscription
  for every MathNexa resource. No annual plan. Math Tug of War, Math Bingo Live and Polygon Showdown are free with any
  MathNexa account."
- On Help and About each name is a link: Math Tug of War to its public page, as before, and Math Bingo Live and
  Polygon Showdown to their free play routes.
- The Help search description names no game: "How to create a MathNexa account, start the free trial, play a game for
  free, use a school access code, and manage your subscription."

**How the games are chosen.** The same rule as `/math-games` since v1.2.43 (`lib/seo/free-games-statement.ts`): the
published catalog, filtered by `freeToPlay`, which comes from the access policy. A draft or a subscription game is
never named, a game made free or published later is named without editing any page, and Math Tug of War alone is named
when the catalog cannot be read.

The new button and links use `freeGameEntryRoute` (`lib/games/free-game-entry.ts`). It is the play gate's own test:
the policy says `authenticated-free`, and the route is a free destination that sign in can return to. The homepage
cards now use it too, with identical results. `requireGamePlayAccess` is untouched.

Help and About now read the catalog on request (`force-dynamic`), like `/math-games`. On Production both were already
served uncached (`private, no-store`, `x-vercel-cache: MISS`), and their warm response times are unchanged (below).

**Not changed.** `/terms` ("Math Tug of War is free with any signed-in MathNexa account"): it is legal text, so a
change is the owner's decision. Also unchanged: access rules, gameplay, the catalog, the homepage (same cards and
routes), `/games`, wallet, shop, avatar, database, environment and dependencies. No migration.

| | |
| --- | --- |
| Version | `v1.2.44`. Production built from `af44f4f` (`af44f4f542e2556b524b9b7905e7bfbe2520e3b5`, tree `4aef0c8…`); `/api/health` reports it. |
| Base | v1.2.43, `main` `3793f34`. |
| Branch / PR | `fix/free-games-follow-ups` from `3793f34`. PR [#19](https://github.com/DesmondQuayson/math-word-hunt/pull/19), CI 2/2, merged 12:23:12Z. |
| Merge | origin `main` fast-forwarded `3793f34` → `af44f4f`, then to this record. No merge commit, no force. |
| Tag | Annotated `v1.2.44` → `af44f4f`. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-44`, detached at `af44f4f`, `node_modules` junction. Keep it for the rollback commands. |
| Production runtime | `dpl_3D9Kw82kCLF4dTP3Bf8wS9MXH49q` (`https://mathnexa-platform-production-19jftwh8i-bright-path-ed-tech.vercel.app`), promoted 12:01:42Z. |
| Rollback runtime | `dpl_48RVKcdmUTbs8EFpCcfBf1wAzP7D` (v1.2.43, build `8bdd9f5`), retained. |
| Database / environment / dependencies | Unchanged. No migration. |

## Gates (local, `af44f4f`)

| Gate | Result |
| --- | --- |
| Typecheck | Clean |
| Lint | 0 errors (8 pre-existing warnings) |
| Unit, core | 245/245 |
| Unit, web | 1,419 passed, 1 skipped (v1.2.43: 1,395), including the 24 new tests |
| Production build | Passes; `/help` and `/about` are now dynamic routes |
| Phase 9 e2e | 31/31, including the new Help and About check. The first run failed that new test on its own locator, which also matched the header navigation's "Math Games" item; scoped to `main`, the whole suite passed. |
| Math Tug of War free-access e2e | 8/8, including the homepage free games, which now share `freeGameEntryRoute` |
| Math Bingo Live security e2e, free access | 1/1. A DRAFT Math Bingo Live is named on none of `/math-games`, `/help` and `/about` |
| Polygon Showdown solo e2e, anonymous visitors | 1/1. A draft Polygon Showdown is named on none of the three |

The new unit tests:

- `free-game-copy.test.tsx` renders Help, About and signed-in Pricing with Production's catalog. It checks the three
  names, their links and "them"; one free game gives "is" and "it"; a draft is left out; no free game drops the Help
  section; the catalog-unavailable fallback names Math Tug of War; a signed-out visitor is still sent to sign in from
  `/pricing`.
- `free-game-entry.test.ts` covers the route for each of the seven Production games, unknown keys, and the homepage
  sharing the rule.
- `product-landing.test.tsx` covers Polygon Showdown's Play Free (route, accessible name, style), the unchanged cards,
  and a game marked free with no free play route getting no button.
- New cases in `free-games-statement.test.ts` and `public-pages.test.ts`.

**Local review.** For this session only, the local catalog was set to Production's state: the five local drafts were
switched to published by status flip, then restored exactly. A free account and a subscriber were created for it and
deleted afterwards. 51/51 checks passed:

- **Signed out.** Polygon Showdown's card has one button, Play Free, to `/games/polygon-showdown/play`, with the
  accessible name "Play Free Polygon Showdown". It leads to the free-game access page, with no price. The other cards
  are unchanged. Help and About name the three games with the expected links, the Help description names no game, and
  `/pricing` still goes to sign in.
- **A free account.** `/pricing` names the three games. Play Free opens Polygon Showdown with no trial, pricing or
  purchase prompt, and the Math Bingo Live and Polygon Showdown links on Help open those games.
- **A subscriber.** `/pricing` names the three games and still offers Continue playing.
- **Accessibility.** axe found 0 violations, and nothing scrolls sideways, on `/math-games`, `/help` and `/about` at
  1366, 390 and 320 px. Play Free is 48 px tall on phones.

The same signed-out review against live v1.2.43 passed 34/42. The 8 failures were the gaps this release closes.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=af44f4f`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_48RVKcdmUTbs8EFpCcfBf1wAzP7D`,
`RELEASE_PURPOSE=v1.2.44-free-games-follow-ups`. Evidence is in `docs/releases/evidence/mathnexa-v1.2.44/`; the
`.log` files there are git-ignored and stay on the release machine, as in earlier releases.

| Stage | Result |
| --- | --- |
| preflight | PASS. The apex served `dpl_48RVK…` (the rollback target), which is retained. |
| deploy-preview | PASS. `dpl_3D9Kw…` is Ready and protected, with Next 16.4.2 and sharp 0.35.5. |
| probe-preview | PASS, 7/7 checks: health, webhook, canonical host, scheduler closed, no 5xx, image optimizer, remote images refused. |
| promote | PASS (12:01:19–12:01:42Z), after the owner's approval. `dpl_48RVK…` → `dpl_3D9Kw…`. |
| probe-live | PASS, 22/22. |

The candidate's own host redirects every page to `mathnexa.com`, so the pages were checked live straight after
promotion, with the rollback ready. Two captures of the live public pages before promotion (one after the candidate
probe, one just before promotion) were identical to each other and to the v1.2.43 release capture.

## Live verification

| Check | Result |
| --- | --- |
| Public pages | 30 of 33 are identical to the capture just before promotion. `/math-games` (the Play Free button), `/help` (its sentence and its search description) and `/about` (its sentence) changed, as intended. |
| `/math-games` | Polygon Showdown has one button, Play Free → `/games/polygon-showdown/play`, accessible name "Play Free Polygon Showdown". Signed out, the route answers 307 `/access?next=/games/polygon-showdown/play`, and clicking the button shows the free-game access page ("Free with a MathNexa account", no price). Math Tug of War and Math Bingo Live keep their buttons, and the subscription games have none. The intro is unchanged. |
| `/help` | The new sentence, with Math Tug of War → `/math-games/math-tug-of-war`, Math Bingo Live → `/games/math-bingo-live/host` and Polygon Showdown → `/games/polygon-showdown/play`. No subscription game is named. The new search description. |
| `/about` | The new sentence, with the same three links. |
| `/pricing` | Signed out: still 307 `/access?next=/subscription`. Signed in, with the owner's existing session in the app's browser (read only; no password entered by the harness): the new sentence, and Continue playing. |
| Review | 45/45 signed out (live v1.2.43: 34/42). axe found 0 violations, and nothing scrolls sideways, on the three pages at 1366, 390 and 320 px. Play Free is 48 px tall on phones. |
| Health | `/api/health` reports build `af44f4f…` in `production-platform`. |
| Runtime since promotion | 0 5xx, 0 error and 0 fatal logs for the new deployment; the 2xx control returns 915 rows. Function status counts from 12:05 to 12:20Z are 200 and 307 only. |
| Response times | Time to first byte, median of 8, before → warm after: `/help` 380 → 387 ms, `/about` 325 → 329 ms, `/math-games` 302 → 346 ms, `/privacy` 315 → 305 ms. Right after promotion every page, including `/privacy`, which this release does not touch, had cold-start spikes (up to 10.3 s on `/privacy`); they were gone about ten minutes later. |

Side-by-side images, live v1.2.43 against live v1.2.44: `compare-polygon-card-1366x768.webp`,
`compare-polygon-card-390x844.webp`, `compare-help-free-1366x768.webp` and `compare-about-games-1366x768.webp`.

**Observed, not changed: prefetched links to gated routes.** On a production build, Next prefetches the links in view.
A link to a free game's play route answers 307 to `/access?next=…`, and the browser keeps that follow-up `/access`
request open, so a page with such a link in view never reaches "network idle". The homepage free-game cards (and Join
with a code) have done this since v1.2.42, and `/help` and `/about` now do too. The server is not holding those
requests: fetched directly they finish in 0.2–0.34 s, and each link is prefetched once per page view. Visitors see
nothing. The release review therefore reads pages after "load" instead of waiting for network idle. A later tidy-up
could set `prefetch={false}` on links to gated routes, which would also save the 307 and `/access` requests each such
link costs per page view. Details are in `11-prefetch-observation.txt`.

**Still open.** `/terms` names only Math Tug of War as free. It is legal text, so a change is the owner's decision.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-44
$env:RELEASE_CERTIFIED_RUNTIME = 'af44f4f'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_48RVKcdmUTbs8EFpCcfBf1wAzP7D'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_48RVKcdmUTbs8EFpCcfBf1wAzP7D
```

There is nothing else to undo: no database or environment change.
