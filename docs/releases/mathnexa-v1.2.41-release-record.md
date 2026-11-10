# MathNexa v1.2.41 — Polygon Showdown on the homepage, compact game cards

Released 2026-11-10 (UTC) under the owner's brief "Update the MathNexa homepage after the successful Polygon Showdown
release", which asked for a candidate first, a probe, and promotion only after a pass.

**What changed.** The homepage Featured games section is now a compact library of the published games instead of two
large cards. Each card has a 16:9 thumbnail, the title, a Free or Subscription label with a category, one short line
and a compact button. There are 4 cards per row on large screens, 3 on tablets and small laptops, 2 on phones and 1 on
the narrowest screens.

Polygon Showdown is added and comes first, with its real gameplay thumbnail
(`/media/games/polygon-showdown.webp`, the released catalog asset). Play Free links to `/games/polygon-showdown/play`.

**Order** (the owner's recommendation): Polygon Showdown, Math Bingo Live, Math Tug of War, CrossCalc, Number Logic,
Number Cross, Math Vocabulary Hunt.

**Catalog rules.** Only games published in the catalog are shown. If the catalog cannot be read in time, the full
curated list is used. `lib/games/home-featured-games.ts` owns the presentation only.

**Access and labels.** Only the three games that `lib/games/access-policy.ts` marks authenticated-free carry the Free
badge: Polygon Showdown, Math Bingo Live and Math Tug of War. Their buttons go straight to the play or host route, which
sends a signed-out visitor through sign in and back, never to pricing. CrossCalc, Number Logic, Number Cross and Math
Vocabulary Hunt still need a subscription and are labelled Subscription, with their existing routes.

**Not changed.** No access rule, gameplay, wallet, shop, avatar, database, environment or dependency changed. Only
`.home-featured-games` rules changed, so the `/games` and `/math-games` card styles are untouched.

**Vocabulary Hunt.** It returns to the homepage as one compact library card, as the brief's order asks. The large
promotion card removed in v1.2.28 stays removed.

| | |
| --- | --- |
| Version | `v1.2.41`. Production built from `f9ed730` (`f9ed730b289766ee44fc2cb8cac4724bdb4fbea9`, tree `aec78f5…`); `/api/health` reports it. |
| Base | v1.2.40, `main` `02a4a3c`. |
| Branch / PR | `feature/homepage-compact-game-cards` from `02a4a3c`. PR [#16](https://github.com/DesmondQuayson/math-word-hunt/pull/16), CI 2/2. |
| Merge | origin `main` fast-forwarded `02a4a3c` → `f9ed730`, then to this record. No merge commit, no force. |
| Tag | Annotated `v1.2.41` → `f9ed730`. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-41`, detached at `f9ed730`, `node_modules` junction. Keep it for the rollback commands. |
| Production runtime | `dpl_5jpJfKMbBBQmr2GWpS8r1sbmdMWj` (`https://mathnexa-platform-production-ncsqqyphd-bright-path-ed-tech.vercel.app`), promoted 03:43:23–03:43:44Z. |
| Rollback runtime | `dpl_5r2ShXG5FkW2Cn7NBWNmL2GpNDn2` (v1.2.40, build `11f3b3b`), retained. |
| Database / environment / dependencies | Unchanged. No migration. |

## Gates (local, `f9ed730`)

| Gate | Result |
| --- | --- |
| Typecheck | Clean |
| Lint | 0 errors (8 pre-existing warnings) |
| Unit, core | 245/245 |
| Unit, web | 1,382 passed, 1 skipped, including the rewritten homepage tests and the new `home-featured-games` tests |
| Production build | Passes |
| Phase 9 e2e | 30/30, including large-text reflow and product pages; the 5 homepage visual baselines were regenerated and reviewed |
| Math Tug of War free-access e2e | 8/8: 11 widths from 304 to 1920 px, 200% text, a 44 px button and no sideways scroll |

**Local review.** The local catalog was set to Production's state for the session only: the five local drafts were
switched to published by status flip, then restored exactly. Results:

- Link and free-account check 16/16. A free account (no subscription) clicked Play Free on the homepage, landed on
  Polygon Showdown and saw no subscription prompt. Subscription games still go to subscription review.
- axe found 0 violations on the section at 1366, 390 and 320 px.
- Focus stays visible on the buttons.
- Nothing leaves its card at 200% text.
- `/math-games` still shows 2 cards per row.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=f9ed730`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_5r2ShXG5FkW2Cn7NBWNmL2GpNDn2`,
`RELEASE_PURPOSE=v1.2.41-homepage-game-library`. Logs are in `docs/releases/evidence/mathnexa-v1.2.41/`.

| Stage | Result |
| --- | --- |
| preflight | PASS. The apex served `dpl_5r2Sh…` (the rollback target), which is retained. |
| deploy-preview | PASS. `dpl_5jpJf…` is Ready and protected, with Next 16.4.2 and sharp 0.35.5. |
| probe-preview | PASS, 7/7 checks: health, webhook, canonical host, scheduler closed, no 5xx, image optimizer, remote images refused. |
| promote | PASS (03:43:23–03:43:44Z). `dpl_5r2Sh…` → `dpl_5jpJf…`. |
| probe-live | PASS, 22/22. |

## Live verification

| Check | Result |
| --- | --- |
| Public pages | 26 of 27 are identical to the capture just before promotion. Only `/` changed (its text and links), as intended. Two captures before promotion were identical, so the comparison is stable. |
| Homepage order and labels | Order is Polygon Showdown, Math Bingo Live, Math Tug of War, CrossCalc, Number Logic, Number Cross, Math Vocabulary Hunt. The first three show Free; the rest show Subscription. Every thumbnail has descriptive alt text. |
| Links, signed out | Play Free (Polygon Showdown, Math Tug of War) and Host Game (Math Bingo Live) → 307 `/access?next=<the game>`, never pricing. Join with a code → `/join` 200. Play Now (subscription games) → 307 `/access`. |
| Polygon Showdown access page | Says "Free with a MathNexa account", shows no price, and returns to the game. |
| Page weight | The homepage requests no Polygon game code, 3D or shop assets. Its images now total 106 KB, versus 106–111 KB before: seven thumbnails at 384 px wide instead of two at 750–828 px, all lazy below the fold. |
| Runtime since promotion | 0 5xx, 0 error, 0 fatal (the 2xx control returns rows). Function status counts: 200, 307, 400, 401 and 404 only, from probes and checks. |

**Layout on Production.** "Section" is the height of the Featured games section, from the live captures in
`08-layout-before-after.json`.

| Viewport | Before | After |
| --- | --- | --- |
| 1920×1080 | 2 games, 1 per row, section 914 px | 7 games, 4 + 3, section 917 px |
| 1440×900 | 2 games, 1 per row, section 915 px | 7 games, 4 + 3, section 917 px |
| 1366×768 | 2 games, 1 per row, section 915 px | 7 games, 4 + 3, section 917 px, cards 281×347 |
| 1280×720 | 2 games, 1 per row, section 912 px | 7 games, 4 + 3, section 914 px |
| 1024×768 | 2 games, 1 per row, section 813 px | 7 games, 3 per row, section 1,303 px |
| 768×1024 | 2 games, 1 per row, section 1,499 px | 7 games, 3 per row, section 1,228 px |
| 390×844 | 2 games, 1 per row, section 1,330 px | 7 games, 2 per row, section 1,430 px, cards 173×292–343 |

No viewport scrolls sideways. Side-by-side images: `compare-1366x768.webp` and `compare-390x844.webp`.

**Signed-in check on Production.** Not run. The harness does not create accounts or enter passwords on Production, and
the app's browser was no longer signed in. The same path passed locally with a real free account. The live play route
and its free policy are unchanged since the v1.2.40 signed-in QA.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-41
$env:RELEASE_CERTIFIED_RUNTIME = 'f9ed730'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_5r2ShXG5FkW2Cn7NBWNmL2GpNDn2'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_5r2ShXG5FkW2Cn7NBWNmL2GpNDn2
```

Nothing else to undo: no database or environment change.

**If Polygon Showdown is ever archived** (its game-only rollback), its homepage card disappears on the next request,
because the library shows published games only.
