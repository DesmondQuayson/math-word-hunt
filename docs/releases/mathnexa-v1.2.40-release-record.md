# MathNexa v1.2.40 release record: Polygon Showdown

Released and published 2026-11-09. Owner instruction: "FINAL STAGING OWNER REVIEW APPROVED ... approved to proceed toward Production release", subject to a final name-clearance preflight.

| | |
| --- | --- |
| Version | `v1.2.40` (annotated tag on the build commit) |
| Certified runtime | `6bf8856`, the staging-reviewed runtime. `11f3b3b` adds production tooling only (`apps`, `packages`, `supabase` and manifests identical). `/api/health` reports `11f3b3b`. |
| Approved source | `staging/polygon-showdown` at `878155f`, from `feature/polygon-showdown-3d-difficulty` at `a1f1298` |
| Staging deployment | `dpl_66txtaun8zAPG6CxnuXnf8N5CoR6` |
| Production runtime | `dpl_5r2ShXG5FkW2Cn7NBWNmL2GpNDn2`, promoted 2026-11-09 05:16Z |
| Rollback runtime | `dpl_3ozmqjmDboK1fYShWL7BQUe5zPca` (v1.2.39, build `428514b`), retained |
| Database | History 44 to 46: `20261109100000_polygon_showdown` then `20261109110000_polygon_showdown_table_privileges`, each dry-run, applied alone and verified |
| Catalog | `polygon-showdown`: draft to published 05:18Z through the same functions as Super Admin; audit event `admin.game.publish` recorded |
| Release worktree | `C:/GitHub/mathnexa-v1-2-40`, detached at `11f3b3b`. Keep it for the rollback commands. |

Redacted evidence: `docs/releases/evidence/mathnexa-v1.2.40/`.

## Name-clearance preflight (product check, not legal advice)

Searched 2026-11-09: USPTO Trademark Search, Apple App Store, Steam, Google Play, itch.io and the open web, including educational products.

| Finding | Assessment |
| --- | --- |
| USPTO, "POLYGON SHOWDOWN" as a phrase, and marks holding both words in any order | 0 results (controls: 107 POLYGON marks, 424 SHOWDOWN marks) |
| Same phrase in use: "Polygon Showdown" by Meedas Guy, GeoJam 2022, itch.io | Free hobby game-jam entry, 5 ratings, 2022. Not commercial, no educational connection |
| Closest live registration: POLYGON MAYHEM, reg. 8175178, Kohavi, Inc., downloadable puzzle games, on the App Store and PS5 | Shares only the word POLYGON, which describes the subject of a geometry game. Different second word and meaning. Not treated as clearly material |
| POLYGON (Vox Media, games journalism and podcasts; others) | Different goods. "Polygon" here names a shape |
| Many live "X SHOWDOWN" game marks | Common word in game titles; none is close to this combination |
| Apple App Store, Steam, Google Play | No app or game with this name found |
| Educational products | No product with this name found |

**Result: no clearly material conflict.** Residual risk, for counsel if heavier marketing is planned: POLYGON MAYHEM in the same goods class, and the jam entry of the same name.

## Order of release, and one change from the plan

The plan asked for game QA on the candidate and before publishing. Neither is possible: a production deployment on any host but `mathnexa.com` redirects every page to the apex (the canonical-host rule, v1.2.7), and the Draft game is closed on Production by design. The owner chose: promote while Draft, confirm health, publish, then QA at once with archive and app rollback ready.

Signed-in QA used the owner's own sign-in to a Production test account, in the app's browser pane. No account was created for the release, no password was handled by tooling, and no wallet was edited: every coin on that account was earned by play.

## Database (`scripts/invoke-polygon-showdown-production.ps1`)

| Stage | Result |
| --- | --- |
| audit (read only) | PASS. Production identity proven by four signals; pending exactly the two Polygon migrations in order; no remote-only versions; no Polygon objects present; 44 in history |
| migrate 1 | PASS. Dry run listed only that file. 8 tables with forced RLS and no browser grants, 14 public functions definer + service-role only, 14 private helpers closed, 153 shop items matching the game, `/join` router and Bingo code guard, catalog row Draft. Accounts 46, auth users 46, other games and history digest unchanged |
| migrate 2 | PASS. Grants set outright; ledger read and append only for the application role (no update, delete or truncate) |
| smoke | PASS. Synthetic room through the service role, code routes to the game, stranger's command refused, browser key refused everywhere, nothing left behind |
| verify | PASS |

Backward compatibility: the migrations are additive. The only change to an existing table is a trigger on `bingo_rooms` that refuses a code already held by an open Showdown room. v1.2.39 kept serving normally between the migrations and the promotion.

## Pipeline (`scripts/run-nextjs-hotfix-production.mjs`)

`RELEASE_CERTIFIED_RUNTIME=6bf8856`, `RELEASE_ROLLBACK_DEPLOYMENT=dpl_3ozmqjm…`, `RELEASE_PURPOSE=v1.2.40-polygon-showdown`.

| Stage | Result |
| --- | --- |
| preflight | PASS. Apex served the rollback target; health 200 |
| deploy-preview | PASS. Non-aliased; runtime identical to the certified commit |
| probe-preview | PASS 7/7: health, webhook, canonical host, scheduler closed, no 5xx, optimizer |
| promote | PASS 05:16:16Z |
| probe-live | PASS |

## Live verification on mathnexa.com

| Check | Result |
| --- | --- |
| Guest QA (`-Stage qa`), no account | 63/63. Two real phone browsers from the join link, numeric code and emoji, identical opening boards, same schedule, late join, reconnect, phone reload, leaderboard, creator ranked, every anti-cheat attempt refused, nothing permanent for guests, ledger not rewritable, browser identity refused, music and pictures served, catalog card Free with the approved description |
| Light concurrency | 11 players: 363 requests, median 231 ms, p95 378 ms, max 1,182 ms, no error |
| First Pentagon, Standard | 61.5 to 63.2 s of the room's clock on nine seats; none before 60 s |
| Product pictures | 612 of 612 served files byte-identical to the certified files |
| Signed-in, free account | No subscription prompt. Solo: four shapes, first Pentagon after swap 11. Left, reloaded, Continue Solo: same board, moves, coins and score. Wallet equals run coins |
| Wallet | Insufficient funds refused; invented item refused; same key submitted twice at once charged once at the catalog price with a tampered price ignored; owned item with a new key charged nothing. Final balance 39 equals the ledger sum |
| Shop and Try On | Buy, confirm, Owned, Equip through the real interface. Fourteen representative categories tried on with correct framing |
| Avatar | Saved outfit restored; 9.9 s per turn at the 30 fps cap; rotate buttons, drag, pause and resume after idle, framing chips. Reduced motion is covered by the staging suites |
| Create Showdown | Creator is automatically player one, stays on the same screen, plays. Guest joined by code, independent boards, countdown and timer, live leaderboard with the lead changing hands, reconnect by reload restored board, moves and coins, Lock Joining refused a new player (423), End Showdown, results, reward paid once |
| QR | Lobby QR decoded by an independent reader: `https://mathnexa.com/join?code=737916` |
| Music | `Cosmic Candy Catchers` same-origin; plays in Solo and on the creator's device; toggle works; guest devices stay quiet unless turned on (staging suites) |
| Math Bingo Live production QA | 33/33 |
| Other games | Math Tug of War and Math Bingo Live host open for the signed-in free account with no paywall; all seven games listed in the catalog |
| Public routes against the capture before release | 30/33 identical. The three differences are Polygon's own two routes and the new card on `/math-games`. The homepage is unchanged |
| Runtime logs since 05:10Z | 0 5xx, 0 error, 0 fatal |

Homepage placement was not part of the approved design and was not added. The game is on `/math-games` and in the `/games` catalog ("Free to play", "Play for Free Now").

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-40
$env:RELEASE_CERTIFIED_RUNTIME = '6bf8856'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_3ozmqjmDboK1fYShWL7BQUe5zPca'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_3ozmqjmDboK1fYShWL7BQUe5zPca
```

In this order, stopping at the first step that is enough:

1. **Game only:** `scripts/invoke-polygon-showdown-production.ps1 -Stage archive`. New rooms and joins are refused; players' progress is kept.
2. **App:** the commands above. The migrated database stays: v1.2.39 runs on it, as it did between the migrations and the promotion.
3. **Database, only if genuinely required, after 1 and 2:** `supabase/rollback/polygon_showdown.sql` in one transaction (proven on a local database), then delete the two rows for `20261109100000` and `20261109110000` from `supabase_migrations.schema_migrations`. This deletes every Polygon Coin balance, ledger line, purchase, avatar and Solo run. Needs the owner's approval.

## Known limits

- Hosted capacity: at 50 players a sync takes about 1.5 to 1.7 s at p95 on staging, and the leaderboard refreshes about every two seconds. The bottleneck is the Supabase API layer at the smallest compute, the same tier as production. No upgrade was made.
- The Production test account keeps 39 coins, two items and one Solo run. The ledger cannot be edited, so it is not reset.
- The test room from the signed-in QA expires by itself.
- Real iPhone, iPad and Smart Board results are the owner's reports from the staging round.
