# MathNexa v1.2.42 — the homepage shows free games only

Released 2026-11-10 (UTC) under the owner's brief "HOMEPAGE = FREE GAMES ONLY" (after v1.2.41), which asked for a
non-aliased candidate, a probe, and promotion only after a pass.

**What changed.** The homepage games section is now **Free math games**, with the note "Free with a MathNexa account.
No subscription needed." It shows only the games MathNexa classifies as free: Polygon Showdown, Math Bingo Live and
Math Tug of War, in that order. The subscription games (CrossCalc, Number Logic, Number Cross, Math Vocabulary Hunt) are
no longer on the homepage. They stay on `/math-games` and their own routes. A **View all math games** button after the
cards links to `/math-games`. The compact v1.2.41 cards are unchanged, and the grid reflows on its own with no
placeholder slots.

**How "free" is decided.** The catalog table has no access column. The authoritative rule is
`lib/games/access-policy.ts` (`authenticated-free`), enforced by `requireGamePlayAccess` in `lib/access/server.ts`. That
gate admits a signed-in account with no subscription only when two things hold: the policy says `authenticated-free`,
and the game has a free play route that sign in can return to (`FREE_GAME_DESTINATIONS` in
`lib/auth/access-intent.ts`).

`lib/games/home-free-games.ts` (renamed from `home-featured-games.ts`) asks exactly that question. A homepage card needs:

- the game published in the catalog;
- the access rule above saying it is free;
- real artwork.

Nothing on the homepage can make a game free.

**Future games.** The policy's default is `entitled`, so a new catalog game never reaches the homepage unless it is
classified free. A new free game appears without editing any homepage list: it uses its catalog title and the first
sentence of its catalog description, and is placed after the current three, in catalog order. The homepage copy
(category, one line, alt text, button label) is presentation only. Unit tests cover both cases.

**Production catalog audit** (read-only, 2026-11-10). Seven entries, all published:

| Game | Display order | Access policy | Signed out, play route goes to |
| --- | --- | --- | --- |
| Math Vocabulary Hunt | 1 | entitled | `/access?next=/games` |
| Number Cross | 30 | entitled | `/access?next=/games` |
| Number Logic | 31 | entitled | `/access?next=/games` |
| CrossCalc | 32 | entitled | `/access?next=/games` |
| Math Tug of War | 33 | authenticated-free | `/access?next=/games/math-tug-of-war/play` ("Free with a MathNexa account") |
| Math Bingo Live | 34 | authenticated-free | `/access?next=/games/math-bingo-live/host` ("Free with a MathNexa account") |
| Polygon Showdown | 35 | authenticated-free | `/access?next=/games/polygon-showdown/play` ("Free with a MathNexa account") |

So there are 7 live games, 3 classified free, and 3 shown on the homepage.

**Not changed.** Access rules, gameplay, the catalog, `/math-games` (still all 7 games), `/games` (still the subscriber
catalog), wallet, shop, avatar, database, environment and dependencies. No migration.

**Layout.** The approved v1.2.41 container rules are kept as they are. Desktop shows the three cards in one row of the
four-column grid. 1024 and 768 px show one full row of three. Phones show 2 + 1, and the narrowest screens show one per
row. The brief described tablets as 1–2 per row. The approved v1.2.41 layout gives 3 at 768 px, and with three free
games that is one full row, so it was kept.

| | |
| --- | --- |
| Version | `v1.2.42`. Production built from `fa22f38` (`fa22f389315dbdb140c57ffb8de5d66a05412ebd`, tree `80b0a53…`); `/api/health` reports it. |
| Base | v1.2.41, `main` `2148c88`. |
| Branch / PR | `feature/homepage-free-games-only` from `2148c88`. PR [#17](https://github.com/DesmondQuayson/math-word-hunt/pull/17), CI 2/2, merged 06:16:54Z. |
| Merge | origin `main` fast-forwarded `2148c88` → `fa22f38`, then to this record. No merge commit, no force. |
| Tag | Annotated `v1.2.42` → `fa22f38`. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-42`, detached at `fa22f38`, `node_modules` junction. Keep it for the rollback commands. |
| Production runtime | `dpl_9URSK6GmGqrZ623JRpiymn3Eu292` (`https://mathnexa-platform-production-40qrzf9x2-bright-path-ed-tech.vercel.app`), promoted 06:10:48Z. |
| Rollback runtime | `dpl_5jpJfKMbBBQmr2GWpS8r1sbmdMWj` (v1.2.41, build `f9ed730`), retained. |
| Database / environment / dependencies | Unchanged. No migration. |

## Gates (local, `fa22f38`)

| Gate | Result |
| --- | --- |
| Typecheck | Clean |
| Lint | 0 errors (8 pre-existing warnings) |
| Unit, core | 245/245 |
| Unit, web | 1,386 passed, 1 skipped, including the new `home-free-games` tests and the updated homepage tests |
| Production build | Passes |
| Phase 9 e2e | 30/30; the 5 homepage visual baselines were regenerated and reviewed |
| Math Tug of War free-access e2e | 8/8. Covers free games only, View all math games, Math Vocabulary Hunt still on `/math-games`, 11 widths from 304 to 1920 px, and 200% text |

**Local review.** For this session only, the local catalog was set to Production's state: the five local drafts were
switched to published by status flip, then restored exactly. The test accounts were deleted afterwards. 32/32 checks
passed:

- **Signed out.** Exactly the three free games appear, each with the Free badge, and there is no Subscription label. Every
  card link goes to sign in and then back to the game, never to pricing. View all math games goes to `/math-games`, which
  lists all 7.
- **A free account (no subscription).** It clicked every homepage card. Polygon Showdown opened its game home, Math Bingo
  Live its host screen and Math Tug of War its game. No trial, pricing or purchase prompt appeared, and the buttons are
  44 px tall on a phone. The four subscription games still send this account to subscription review.
- **A subscriber.** Its homepage is the same free-only section. The four subscription games still open for it: Math
  Vocabulary Hunt through its usual redirect into the game runtime. `/games` lists all 7.
- **Accessibility.** axe found 0 violations on the section at 1366, 390 and 320 px. Focus is visible. Nothing leaves its
  card at 200% text.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=fa22f38`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_5jpJfKMbBBQmr2GWpS8r1sbmdMWj`,
`RELEASE_PURPOSE=v1.2.42-homepage-free-games-only`. Logs are in `docs/releases/evidence/mathnexa-v1.2.42/`.

| Stage | Result |
| --- | --- |
| preflight | PASS. The apex served `dpl_5jpJf…` (the rollback target), which is retained. |
| deploy-preview | PASS. `dpl_9URSK…` is Ready and protected, with Next 16.4.2 and sharp 0.35.5. |
| probe-preview | PASS, 7/7 checks: health, webhook, canonical host, scheduler closed, no 5xx, image optimizer, remote images refused. |
| promote | PASS (06:10:48Z). `dpl_5jpJf…` → `dpl_9URSK…`. |
| probe-live | PASS, 22/22. |

The candidate's own host redirects every page to `mathnexa.com` (the canonical-host rule), so its homepage could not
be viewed before promotion. The homepage content was checked live straight after promotion, as in v1.2.41, with the
rollback ready.

## Live verification

| Check | Result |
| --- | --- |
| Public pages | 26 of 27 are identical to the capture just before promotion. Only `/` changed (its text and links), as intended. Two captures before promotion were identical. |
| Homepage | Heading "Free math games" and the note. The cards are Polygon Showdown, Math Bingo Live and Math Tug of War, each Free, with no Subscription label, no Play Now and no subscription game. View all math games → `/math-games`. |
| Links, signed out | Play Free (Polygon Showdown, Math Tug of War) and Host Game (Math Bingo Live) → 307 `/access?next=<the game>`, never pricing. Join with a code → `/join` 200. The Polygon Showdown access page says "Free with a MathNexa account" and shows no price. 15/15. |
| `/math-games` | Still lists all 7 games, with the Free badge on the same three. |
| `/games` | Unchanged: signed out it goes to `/access?next=/games`. |
| Access rules | Each game's signed-out redirect is identical before and after (table above). |
| Page weight | The homepage requests no game code, 3D or shop assets. Game images: 4 requests, 45 KB (before: 7 requests, 62 KB), lazy below the fold. |
| Accessibility | axe found 0 violations on the section at 1366, 390 and 320 px. Focus is visible. Nothing leaves its card at 200% text. |
| Runtime since promotion | 0 5xx, 0 error and 0 fatal logs for the new deployment; the 2xx control returns 953 rows. Function status counts are 200, 307, 400, 401 and 404 only, from probes and checks. |

**Layout on Production.** "Section" is the height of the games section, from the live captures in
`08-layout-before-after.json`.

| Viewport | Before (v1.2.41) | After |
| --- | --- | --- |
| 1920×1080 | 7 games, 4 + 3, section 917 px | 3 games in one row, section 616 px |
| 1440×900 | 7 games, 4 + 3, section 917 px | 3 games in one row, section 616 px |
| 1366×768 | 7 games, 4 + 3, section 917 px | 3 games in one row, section 616 px, cards 281×346 |
| 1280×720 | 7 games, 4 + 3, section 914 px | 3 games in one row, section 612 px |
| 1024×768 | 7 games, 3 + 3 + 1, section 1,303 px | 3 games in one row, section 606 px, cards 307×361 |
| 768×1024 | 7 games, 3 + 3 + 1, section 1,228 px | 3 games in one row, section 588 px, cards 222×365 |
| 390×844 | 7 games, 2 + 2 + 2 + 1, section 1,430 px | 3 games, 2 + 1, section 876 px, cards 173×343 |

No viewport scrolls sideways, and the 16:9 thumbnails keep their shape. Side-by-side images: `compare-1366x768.webp`
and `compare-390x844.webp`.

**Signed-in check on Production.** This used the owner's own session, already signed in in the app's browser; no
password was entered by the harness. That account has MathNexa access.

- Its homepage shows the same three free cards.
- Play Free on Polygon Showdown opened `/games/polygon-showdown/play` on the game's home screen (PLAY SOLO, SHOP, CREATE
  SHOWDOWN, Customize Avatar), with no subscription, pricing or trial prompt.
- `/math-games` lists all 7.
- For this account, the CrossCalc, Number Cross and Number Logic play routes and `/games` answer 200, so subscriber
  entitlement is unchanged.

A Production account without a subscription was not available to the harness. The free-account path rests on the local
review of the same commit, where such an account opened every homepage card.

**Noted, not changed.** The `/math-games` description still says "Math Tug of War and Math Bingo Live are free with any
MathNexa account" and does not mention Polygon Showdown. That page was out of scope for this release.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-42
$env:RELEASE_CERTIFIED_RUNTIME = 'fa22f38'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_5jpJfKMbBBQmr2GWpS8r1sbmdMWj'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_5jpJfKMbBBQmr2GWpS8r1sbmdMWj
```

There is nothing else to undo: no database or environment change.
