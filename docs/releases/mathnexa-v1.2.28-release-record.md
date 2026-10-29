# MathNexa v1.2.28 — homepage final corrections

Released 2026-10-29 (UTC) under explicit owner approval ("Approve release", given after the staging review of
`d6376c7`). It ships the staging candidate `d6376c7` unchanged.

Only the homepage changed. The Math Vocabulary Hunt promotional card is gone from Featured games, and the worked
example has no Replay or Pause/Play buttons. The game itself, its routes and its place on Math Games are unchanged.
There is no database migration, no environment change and no dependency change. Sign In, Sign Out, Authorize Code,
free-trial rules, pricing, Stripe, entitlements, Supabase, Super Admin, protected pages, Online Math Prep, the other
Math Games, Homework and Quiz PDFs, the Worksheet Generator, API contracts and ShowMe Math Lab are unchanged.

| | |
| --- | --- |
| Version | `v1.2.28`. Production was built from `d6376c7` (`d6376c798543eee25f111f5690fcacd7a3c0b07c`, tree `6242e7432c1dc24c46029e8bde91054866078ecc`). `/api/health` reports build `d6376c7…`. |
| Tag | Annotated tag `v1.2.28` ("MathNexa v1.2.28: homepage final corrections") points at `d6376c7`, the production build. It was created and pushed after live verification. `v1.2.27` is unchanged. |
| Branch | `feature/homepage-final-corrections` from `v1.2.27` `main` (`f2f9285`), two commits: `16de337` (removals) and `d6376c7` (featured artwork fix and new homepage baselines). |
| Merge | `main` was still `f2f9285`, so origin `main` was fast-forwarded `f2f9285..d6376c7` with no merge commit and no force. This record is the next commit on `main`. The runtime on `main` equals the production build. |
| Certified runtime | `d6376c7`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-v1-2-28`, tracked files only). The pipeline's runtime diff from the certified commit is empty. |
| Staging | `dpl_8vgiProQ6LYXJ17K4pVBtJz8F4c9` (`https://mathnexa-platform-staging-9wtvo7ot9-bright-path-ed-tech.vercel.app`), build `d6376c7`. Unchanged between the owner's approval and the release. |
| Production candidate | `dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX` (`https://mathnexa-platform-production-54bs6yom9-bright-path-ed-tech.vercel.app`), built from `d6376c7` with `--prod --skip-domain` |
| Production runtime | `dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX`, `production-platform`, payments `live`. Promoted 2026-10-29 10:25:42–10:26:05 UTC. |
| Rollback runtime | `dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS` (v1.2.27, build `398149f`), retained and Ready. `dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7` (v1.2.26) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged (`package.json` and the lockfile are identical to v1.2.27) |

## What changed for visitors

- **Featured games.** The Math Vocabulary Hunt card (artwork, "Included with MathNexa access", heading,
  description and Play button) is removed. Math Tug of War is the only featured game and fills the row. From 960 px
  wide its artwork sits beside the text, so no empty column is left; narrower screens stack as before.
- **Math Vocabulary Hunt.** Still reached through Math Games (`/games`) and its existing routes. The homepage's
  Math Games card keeps the Vocabulary Hunt artwork. `/play` stays linked from the footer ("Game access").
- **Worked example.** The Replay and Pause/Play buttons and their row are gone. The board still starts when it
  comes into view, plays its pass (about 4.3 s), rests 3 s on the finished board and replays while on screen. It
  holds its frame off screen or in a hidden tab, holds while keyboard focus is on a "Your turn" answer, stops after
  a "Your turn" answer so the answer stays visible, and shows the solved board at once with reduced motion.
- **Page height.** 1440 px: 3367 → 3115 px. 390 px: 5267 → 4719 px. Nothing else moved.

Files (15): `components/public/teacher-first-home.tsx` and its test; `components/public/home/` `board-loop.ts`,
`board-loop.test.tsx`, `prep-board-replay.tsx`, `prep-board.tsx` (comment) and `home.module.css`;
`styles/games.css`; `e2e/math-tug-of-war/free-access.spec.ts`; `scripts/review-math-tug-of-war-staging.mjs`; and
the five Phase 9 homepage baselines.

## Release gates (on `d6376c7`, 2026-10-29 04:45–05:23 UTC, local Supabase)

| Check | Result |
| --- | --- |
| Change control vs `v1.2.27` | 15 files, all on the allowed homepage list. No dependency, env, migration or other app file. |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 925 passed, 1 skipped (one fewer than v1.2.27: the Pause test was removed) |
| `test:security`, bundle audit, Number Cross launch audit, protection bypass | 321/321, pass, pass, 7/7 |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Functional facts (sign-in, sign-out, Authorize Code, trial and checkout entry, product reach, navigation) | 343/343 identical to v1.2.27 |
| Phase 9 | 17/17, with the five homepage baselines regenerated and reviewed (only the removed controls row, the hero centring and Featured games changed) |
| School access (Authorize Code) | 21/21 |
| Tug of War free access | 8/8 (includes the featured card at 200% text from 304 to 1920 px) |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |

The harness reports "4 failed": the same four homepage-vs-old-baseline screen tests as the v1.2.26 and v1.2.27
releases.

## Staging verification (the certified build's own bytes, read-only mirror)

| Check | Result |
| --- | --- |
| Homepage links vs production | Same 21 links. All 20 internal links end on the same page after the same redirects. `/play` appears once (footer) instead of twice. |
| Signed-out pages vs the v1.2.27 staging build | 33 pages: 31 identical; `/privacy` and `/cancellation` identical as a set of RSC rows (stream order only) |
| Absence | "Included with MathNexa access", the Vocabulary Hunt card and description, Replay and Pause: 0 on the page |
| Chromium loops: 10 at 1440 px; 4–5 each at 768, 390 and 320 px | Pass ≈ 4316 ms, rest ≈ 3010 ms. At most 1 rest timer, 0 remounts, no loop layout shift. Focus hold, answer stop, scroll away/back, hidden tab, reduced motion: pass. |
| WebKit (iPhone 13, iPad, 1440) | Full 4320 ms passes, 0 overlaps; rest readings jitter the same as on the v1.2.27 staging build |
| axe | 0 violations at 1440 and 390 px, with and without reduced motion |
| Responsive | No overflow on 7 viewports. The featured card stays inside its card at 15 widths, normal and 200% text. |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-v1-2-28` with these values:

- `RELEASE_CERTIFIED_RUNTIME=d6376c7`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS`
- `RELEASE_PURPOSE=v1.2.28-homepage-final-corrections`

Logs are in `qa-artifacts/homepage-final-corrections/release/release-*.log` (git-ignored). The evidence JSONs are
under `%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 10:20:55–10:21:06 | PASS. The apex served `dpl_8c5F18Rk2bmE…` (the rollback target) from `mathnexa-platform-production`. |
| probe-live (before) | 10:21:14–10:21:28 | PASS, 22/22 |
| deploy-preview | 10:21:58–10:23:52 | PASS. `dpl_7cW8oFWQeSbB…` is Ready and holds no domain. Next 16.4.2, sharp 0.35.5. |
| probe-preview | 10:23:59–10:25:09 | PASS, 7/7. Health reports build `d6376c7` and payments live. The webhook answers 400. The scheduler answers 401. Every other path 308s to the apex. No 5xx. |
| promote | 10:25:42–10:26:05 | PASS. The alias moved from `dpl_8c5F18Rk2bmE…` to `dpl_7cW8oFWQeSbB…`. |
| probe-live | 10:26:05–10:26:20 | PASS, 22/22 |

## Live production verification (2026-10-29 from 10:26 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment. Evidence is in
`qa-artifacts/homepage-final-corrections/release/` and `qa-artifacts/homepage-redesign/release/`
(`live-v1228-before/`, `live-v1228-after/`), all git-ignored.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `d6376c798543eee25f111f5690fcacd7a3c0b07c`, `production-platform`, payments `live`. The apex `data-dpl-id` is `dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX`. |
| Removed items | On mathnexa.com: "Included with MathNexa access" 0, Vocabulary Hunt card 0, "Replay the worked example" 0, Pause/Play labels 0. Math Tug of War is the one featured card. "Math Vocabulary Hunt" remains only as the Math Games card's image text. |
| Pages (26 routes at 1440 and 390 px) vs a capture of v1.2.27 just before the release | 50/50 non-home pages identical in final URL, status, visible text, form controls, links, height and console. On the homepage the only text changes are the removed Vocabulary Hunt card and "Replay the worked example"; the links are identical; 0 console errors, 0 overflow. |
| Authorize Code card, hero buttons | Hero buttons identical. The Authorize Code card is identical except the per-build server-action id. |
| Loop on mathnexa.com, Chromium | 10 passes at 1440 px, 4 at 768 px and 5 each at 390 and 320 px. Pass ≈ 4316 ms, rest ≈ 3017 ms, period ≈ 7333 ms. At most 1 timer, 0 remounts, no layout shift. No Replay or Pause control and no space left for them. Focus hold, a Your turn answer (feedback stays, loop stops), hidden tab and reduced motion: pass. |
| Loop on mathnexa.com, WebKit | Clock probe on iPhone 13, iPad and 1440 px: every pass runs its full 4320 ms at `playbackRate` 1, 0 overlaps, 0 errors. iPhone 13 hidden tab: the frame is held (0 running) for 4 s and resumes on return, 3/3 runs. iPhone 13 focus hold, answer, reduced motion: pass. iPad and 1440 loops pass. The frame sampler's iPhone 13 pass lengths (4.0–4.5 s) fail its ±0.3 s check, exactly as on live v1.2.27 (4.0–4.6 s); the animation clocks above show this is sampling lag. |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4/4 matched, all live mode. Entitlements: 3 active, 1 expired. Identical to the read before the release. |
| Runtime logs for `dpl_7cW8…` since promotion | 5xx, error, fatal: 0, 0, 0 |
| ShowMe Math Lab | `showme.mathnexa.com` unchanged: ETag `"7e686cff57eb2b157144fa0128084aab"`, Last-Modified Sun, 25 Oct 2026 21:10:03 GMT. No new ShowMe deployment. |
| Deployments | The production project gained exactly one deployment (`dpl_7cW8…`). |

## Known limitations (not verified by this release)

- **WCAG 2.2.2.** With no Pause control, a looping animation longer than 5 s has no way to pause or stop it, other
  than reduced motion (static board), keyboard focus on an answer (hold) and answering (stop). This was raised in
  the staging report before the owner approved the release. A later option is stopping the loop after a set
  number of passes.
- **Firefox.** It cannot run on the review machine (Windows App Control); the owner checks it.
- **Signed-in production use.** Nothing here signs in to production. Signed-in behaviour was proven on the same
  commit locally (343/343 facts identical to v1.2.27). The owner's manual checks remain: their own sign-in and
  sign-out, an Authorize Code entry, a subscriber's product access (including Math Vocabulary Hunt from Math Games),
  and Super Admin with MFA.
- **Checkout.** Checked only as far as the signed-out entry routes; no Stripe Checkout session was opened.
- **Real tab switching.** Headless browsers keep pages visible, so hidden tabs were simulated with the
  `visibilitychange` event.
- **200% text at 960–1180 px.** Other homepage sections overflow sideways by up to 80 px, exactly as on v1.2.27.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-28
$env:RELEASE_CERTIFIED_RUNTIME = 'd6376c7'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS
```

Fallback: `npx vercel@59 promote dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS --scope bright-path-ed-tech`. A rollback brings
back the v1.2.27 homepage (the Vocabulary Hunt card and the Replay and Pause/Play buttons). It touches no data,
billing or access rule.
