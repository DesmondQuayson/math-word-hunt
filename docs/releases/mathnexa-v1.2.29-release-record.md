# MathNexa v1.2.29 — worked example plays three times, with Stop animation

Released 2026-10-31 (UTC) under explicit owner approval ("Approve release", given after the staging review of
`a762031`). It ships the staging candidate `a762031` unchanged.

`a762031` was first built as a staging demo of a Stop control (its commit title ends "(demo)" and its body says it is
not for release without owner approval). The owner then chose it as the v1.2.29 candidate ("Use Stop control") and
approved its release. The commit was not reworded, because that would have meant force-pushing the branch. It
supersedes `6192a82` (three plays without a control), which is part of this release as its parent.

Only the homepage worked example changed. There is no database migration, no environment change and no dependency
change. Featured games, Math Vocabulary Hunt, Sign In, Sign Out, Authorize Code, free-trial rules, pricing, Stripe,
entitlements, Supabase, Super Admin, protected pages, Online Math Prep, the other Math Games, Homework and Quiz PDFs,
the Worksheet Generator, API contracts and ShowMe Math Lab are unchanged. The Math Vocabulary Hunt promotional card
and the Replay and Pause/Play buttons removed in v1.2.28 stay removed.

| | |
| --- | --- |
| Version | `v1.2.29`. Production was built from `a762031` (`a7620318aa1e8344ab452d23fcd590b413080130`, tree `e374db32cb6996536ab4d406f5f1463792035479`). `/api/health` reports build `a762031…`. |
| Tag | Annotated tag `v1.2.29` ("MathNexa v1.2.29: worked example plays three times, with Stop animation") points at `a762031`, the production build. It was created and pushed after live verification. `v1.2.28` is unchanged. |
| Branch | `feature/homepage-stop-control` from `v1.2.28` `main` (`990cdff`), two commits: `6192a82` (three plays, then the solved problem stays) and `a762031` (Stop animation control). |
| Merge | `main` was still `990cdff`, so origin `main` was fast-forwarded `990cdff..a762031` with no merge commit and no force. This record is the next commit on `main`. The runtime on `main` equals the production build. |
| Certified runtime | `a762031`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-v1-2-29`, tracked files only). The deployed tree is `e374db3…`, the tree of `a762031`. |
| Staging | `dpl_CaaihVwCwHQJpLnxZg25oQX1ZddU` (`https://mathnexa-platform-staging-dnbja2ckg-bright-path-ed-tech.vercel.app`), build `a762031`. Unchanged between the owner's approval and the release. |
| Production candidate | `dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq` (`https://mathnexa-platform-production-7f6svgoig-bright-path-ed-tech.vercel.app`), built from `a762031` with `--prod --skip-domain` |
| Production runtime | `dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq`, `production-platform`, payments `live`. Promoted 2026-10-31 15:33:50–15:34:13 UTC. |
| Rollback runtime | `dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX` (v1.2.28, build `d6376c7`), retained and Ready. `dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS` (v1.2.27) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged (`package.json` and the lockfile are identical to v1.2.28) |

## What changed for visitors

- **Three plays, then still.** The worked example plays when it comes into view (about 4.3 s), rests 3 s on the
  solved problem, and plays again: three complete plays in all (about 19 s). After the third play the solved
  problem stays for the rest of the visit. There is no fourth play.
- **Stop animation.** While plays are still to come, a small "Stop animation" button shows below the caption. It
  shows the solved problem at once and stops for good, as an answer to "Your turn" does. It is gone after the third
  play, with reduced motion, and without JavaScript. It sits in the hero's bottom padding and out of the layout, so
  nothing moves when it appears or goes. If it has keyboard focus when it goes, focus moves to the board.
- **Unchanged behaviour.** The board holds its frame off screen and in a hidden tab, holds while keyboard focus is on
  a "Your turn" answer, and stops after an answer so the answer stays visible. A held or interrupted play does not
  count as one of the three. With reduced motion the solved problem shows and nothing plays.
- **No other visible change.** The server HTML has no button; it appears after the page starts.

Files (5): `apps/platform-web/components/public/home/` `board-loop.ts`, `board-loop.test.tsx`,
`prep-board-replay.tsx`, `prep-board.tsx` (comment only) and `home.module.css`.

## WCAG 2.2.2 (Pause, Stop, Hide)

The three plays last about 19 s, longer than the 5 s allowance, so stopping after three plays alone does not meet
2.2.2. The Stop animation button is the stop mechanism. It was chosen by the owner over a single play under 5 s,
after a staging demo. This release does not claim a formal conformance audit.

## Release gates (on `a762031`, 2026-10-31 11:45–12:17 UTC, local Supabase)

| Check | Result |
| --- | --- |
| Change control vs `v1.2.28` | 5 files, all on the allowed homepage animation list. No dependency, env, migration or other app file. |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 935 passed, 1 skipped (10 more than v1.2.28: the three-play and Stop tests) |
| `test:security`, protection bypass | 321/321, 7/7 |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Functional facts (sign-in, sign-out, Authorize Code, trial and checkout entry, product reach, navigation) | 343/343 identical to v1.2.28 |
| Phase 9 | 17/17, homepage baselines unchanged |
| School access (Authorize Code) / Tug of War free access | 21/21 / 8/8 |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |

The harness reports "4 failed": the same four homepage-vs-old-baseline screen tests as the v1.2.26–v1.2.28
releases.

## Staging verification (the certified build's own bytes, read-only mirror)

| Check | Result |
| --- | --- |
| Three plays | 3 plays, no 4th, board still afterwards; scroll away/back, hidden tab and focus holds do not use up plays. Chromium and WebKit. |
| Stop animation, Chromium (1440, 1024, 768, 390, 320 px) | Absent from the server HTML; shown during the plays and gone after the third; pointer and keyboard Stop show the solved problem at once and nothing plays again; focus goes to the board when the button goes; no control with reduced motion; at 200% text still below the caption and inside the hero; the surrounding layout is identical with and without the button |
| Stop animation, WebKit (iPhone 13, iPad, 1440) | Same checks pass |
| axe (Chromium, WCAG 2.0–2.2 A and AA rules) | 0 violations with the button showing |
| Pages and links | 33 signed-out pages identical to v1.2.28 (three only as RSC row sets). Same 21 homepage links as production, all ending on the same page. |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-v1-2-29` with these values:

- `RELEASE_CERTIFIED_RUNTIME=a762031`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX`
- `RELEASE_PURPOSE=v1.2.29-homepage-three-plays-stop`

Logs are in `qa-artifacts/homepage-stop-control/release/release-*.log` (git-ignored). The evidence JSONs are under
`%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 15:26:10–15:26:18 | PASS. The apex served `dpl_7cW8oFWQeSbB…` (the rollback target) from `mathnexa-platform-production`. |
| probe-live (before) | 15:26:19–15:26:34 | PASS, 22/22 |
| deploy-preview | 15:30:05–15:32:03 | PASS. `dpl_DQD28S6CXeo3…` is Ready, protected and holds no domain. Next 16.4.2, sharp 0.35.5. |
| probe-preview | 15:32:09–15:33:21 | PASS, 7/7. Health reports build `a762031` and payments live. The webhook answers 400. The scheduler answers 401. Every other path 308s to the apex. No 5xx. |
| promote | 15:33:50–15:34:13 | PASS. The alias moved from `dpl_7cW8oFWQeSbB…` to `dpl_DQD28S6CXeo3…`. |
| probe-live | 15:34:13–15:34:27 | PASS, 22/22 |

## Live production verification (2026-10-31 from 15:34 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment. Evidence is in
`qa-artifacts/homepage-stop-control/release/` and `qa-artifacts/homepage-redesign/release/`
(`live-v1229-before/`, `live-v1229-after/`), all git-ignored.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `a7620318aa1e8344ab452d23fcd590b413080130`, `production-platform`, payments `live`. The apex `data-dpl-id` is `dpl_DQD28S6CXeo31fk1Y7GuiGUPhYqq`. |
| Pages (26 routes at 1440 and 390 px) vs a capture of v1.2.28 just before the release | 50/50 non-home pages identical in final URL, status, visible text, form controls, links, height and console. On the homepage the only text and control change is the added "Stop animation" button; links and page height (3115 / 4719 px) are identical; 0 console errors, 0 overflow. |
| Authorize Code card, hero buttons, Featured games | Hero buttons and Featured games identical (the image URLs differ only in the deployment id). The Authorize Code card is identical except the per-build server-action id. |
| Three plays on mathnexa.com, Chromium (1440, 768, 390, 320 px) | 3 plays, passes ≈ 4320 ms, rests ≈ 3010 ms, then still for 16–17 s with 0 px changed and no 4th play. At most 1 timer, 0 remounts, 0 overlaps. At 1440 and 390 px a hidden tab, scrolling away mid-play and back, and focus on a Your turn answer hold the play without using it up; an answer stops for good with its feedback shown. |
| Three plays on mathnexa.com, WebKit (iPhone 13, iPad, 1440) | 3 plays with every animation clock running its full 4320 ms at rate 1, then still for 16.7–17.9 s with 0 px changed. iPhone 13 interruptions, focus hold, answer and reduced motion (solved board, the same drawn state as the stopped board): pass. |
| Stop animation on mathnexa.com, Chromium (1440, 1024, 768, 390, 320 px) | Not in the server HTML. Shown 8 px below the caption while plays remain; pointer and keyboard (Enter in a rest, Space in a play) Stop show the solved problem at once and nothing plays again; when the button goes while it has keyboard focus, focus moves to the board with its focus ring; gone after the third play; none with reduced motion; at 200% text still inside the hero with no page overflow. axe: 0 violations at 1440, 390 and 320 px with the button showing. |
| Stop animation on mathnexa.com, WebKit (iPhone 13, iPad, 1440) | Same checks pass. |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4 subscriptions, all live mode (3 active, 1 canceled). Identical to the read before the release. |
| Runtime logs for `dpl_DQD28…` since promotion | 5xx, error, fatal: 0, 0, 0. The only 4xx responses are the probes' expected 400, 401 and 404 answers. |
| ShowMe Math Lab | `showme.mathnexa.com` unchanged: ETag `"7e686cff57eb2b157144fa0128084aab"`, the same before and after. No new ShowMe deployment (latest 6 days old). |
| Deployments | The production project gained exactly one deployment (`dpl_DQD28…`). |

## Known limitations (not verified by this release)

- **Stop below the fold on some laptops.** At page load the button is in view at 1920×1080, but 46 px below the fold
  at 1440×900, 91 px at 1536×864, 143 px at 1024×768 and 170 px at 1366×768. On phones it is below the board, which
  starts below the fold. The plays run only while the board is on screen, and the button is next to it then. This
  was reported before the owner chose the placement.
- **Firefox.** It cannot run on the review machine (Windows App Control); the owner checks it.
- **Signed-in production use.** Nothing here signs in to production. Signed-in behaviour was proven on the same
  commit locally (343/343 facts identical to v1.2.28). The owner's manual checks remain: their own sign-in and
  sign-out, an Authorize Code entry, a subscriber's product access and Super Admin with MFA.
- **Checkout.** Checked only as far as the signed-out entry routes; no Stripe Checkout session was opened.
- **Real tab switching.** Headless browsers keep pages visible, so hidden tabs were simulated with the
  `visibilitychange` event.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-29
$env:RELEASE_CERTIFIED_RUNTIME = 'a762031'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX
```

Fallback: `npx vercel@59 promote dpl_7cW8oFWQeSbBTHuXnTU7P1W95boX --scope bright-path-ed-tech`. A rollback brings
back the v1.2.28 homepage (the worked example replays while on screen, with no control). It touches no data, billing
or access rule.
