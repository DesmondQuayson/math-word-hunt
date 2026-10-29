# MathNexa v1.2.27 — homepage worked example replays itself while on screen

Released 2026-10-29 (UTC) under explicit owner approval ("I approve the MathNexa v1.2.27 automatic homepage animation
replay for production, provided every mandatory release gate passes."). It ships the staging candidate `398149f`
unchanged.

Only the homepage's worked-example board changed. There is no database migration, no environment change and no
dependency change. Sign In, Sign Out, Authorize Code, free-trial rules, pricing, Stripe, entitlements, Supabase,
Super Admin, Online Math Prep, Math Games, Homework and Quiz PDFs, the Worksheet Generator, API contracts and ShowMe
Math Lab are unchanged. Featured Games and the approved homepage design are unchanged.

| | |
| --- | --- |
| Version | `v1.2.27`. Production was built from `398149f` (`398149f6186092222764a3690584595f4a4db580`, tree `f0dd84d36f382ac2e39fee095c8fc8a0cf01955e`). `/api/health` reports build `398149f…`. |
| Tag | Annotated tag `v1.2.27` (tag object `6072d585ca8750e7cb4894efbf1d5e9c63769f02`, message "MathNexa v1.2.27: homepage worked example replays itself while on screen") points at `398149f`, the production build. Created and pushed 2026-10-29 01:50:32 UTC, after live verification. `v1.2.26` is unchanged. |
| Branch / PR | `feature/homepage-animation-autoreplay` from `v1.2.26` (`1f24bba`), one commit. PR #3 was opened for the record and is MERGED. |
| Merge | `main` had moved on by two docs-only commits (`bec755f` and `aaacfa0`, the v1.2.26 record). Because of them, the candidate was merged with a two-parent merge commit, `fec7762` (parents `aaacfa0` and `398149f`, tree `e04e0a0`). The two sides touch different files, so no resolution was needed. Origin `main` was fast-forwarded `aaacfa0..fec7762` (2026-10-29 01:21 UTC) with no force. `aaacfa0..fec7762` adds exactly the 5 homepage files. `398149f..fec7762` changes docs only, so the runtime on `main` equals the production build. |
| Certified runtime | `398149f`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-v1-2-27`, tracked files only). The pipeline's runtime diff from the certified commit is empty. |
| Staging | `dpl_2A5B6yQ3HXefw4GXMgcmgsSzQQi7` (`https://mathnexa-platform-staging-49wjr5az1-bright-path-ed-tech.vercel.app`), build `398149f`. It was unchanged between the owner's approval and the release. |
| Production candidate | `dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS` (`https://mathnexa-platform-production-7bmwefgvr-bright-path-ed-tech.vercel.app`), built from `398149f` with `--prod --skip-domain` |
| Production runtime | `dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS`, `production-platform`, payments `live`. Promoted 2026-10-29 01:26:36–01:27:01 UTC. |
| Rollback runtime | `dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7` (v1.2.26, build `1f24bba`), retained and Ready. `dpl_8yXvDHZc8vCgmCqLmbkTwSzsa76y` (v1.2.25) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged (`package.json` and the lockfile are identical to v1.2.26) |

## What changed for visitors

The worked ratio problem in the hero ("3 cups of oats make 12 granola bars…") used to play once and stop. Now:

- **Autoplay.** It starts by itself when it comes into view. One pass is about 4.3 s, with the same steps, timing
  and drawings as v1.2.26; nothing was sped up.
- **Loop.** It rests 3 s on the finished board, then replays the same pass. It keeps going while it stays on screen.
- **Off screen or hidden tab.** It holds its current frame when scrolled away or when the browser tab is hidden. No
  timer runs in the background. It resumes when visible again; during the rest, a full 3 s rest follows its return.
- **Pause/Play (new button, WCAG 2.2.2).** Pause freezes the pass. While paused it never restarts on its own. Play
  continues the pass, or starts a new one if the pass had finished.
- **Replay (kept).** It restarts at once, cancels any pending rest, resets the board and resumes the loop. Ten rapid
  clicks still leave one pass and at most one timer.
- **Your turn.** Choosing an answer stops the loop so the answer stays on screen. Replay starts it again.
- **Keyboard focus.** While focus is inside the board, it does not restart under the reader.
- **Reduced motion.** With `prefers-reduced-motion`, it shows the solved board at once, with no loop and no controls.
- **Mechanics.** A loop pass rewinds the same CSS animations, so nothing remounts and nothing overlaps. There is at
  most one rest timer. There is no audio. Observers, listeners and timers are removed on unmount.

Both controls sit on one row at every width, from 320 px to 1440 px. Under 21rem the Pause button is 36 px. Page
height is identical to v1.2.26 at 1440 and 390 px.

Files: `apps/platform-web/components/public/home/` — `board-loop.ts` (new controller), `board-loop.test.tsx` (18
tests), `prep-board-replay.tsx`, `prep-board.tsx` (comment) and `home.module.css`.

## Release gates (re-run on `398149f`, 2026-10-28 10:38–11:11 UTC, local Supabase)

| Check | Result |
| --- | --- |
| Change control vs `v1.2.26` | 5 files, all in `components/public/home/`. No dependency, env, migration or other app file. |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 926 passed, 1 skipped (includes the 18 loop lifecycle tests) |
| `test:security`, bundle audit, Number Cross launch audit, protection bypass | 321/321, pass, pass, 7/7 |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Functional facts (sign-in, sign-out, Authorize Code, trial and checkout entry, product reach, navigation) | 343/343 identical to v1.2.26 |
| Protected-page screenshots vs the harness baseline | 80 non-homepage captures pixel-identical. The 8 homepage captures are pixel-identical to the reviewed candidate run of the same commit. 2 trial-subscription captures differ by one character inside the harness's own date mask (below). |
| phase 9 | 17/17 (baselines unchanged) |
| School access (Authorize Code) | 21/21 |
| Tug of War free access | 8/8 on two clean reruns (one timing failure in the loaded first run, below) |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |

The harness reports "4 failed". These are the same four screen tests that failed in the v1.2.26 release run: their
homepage captures are compared with a baseline made before the homepage redesign. Against v1.2.26 itself, the only
difference in those captures is the controls row.

The two trial-subscription captures differ by 168 px: a magenta date mask one character narrower. The masked
trial-end time had a one-digit hour this run (about 5 AM) versus a two-digit hour in the baseline (10:18 PM). The
subscription page is not part of this change.

In the first run, one Tug of War test failed waiting 15 s for the sign-in page under heavy machine load. It clicks
"Sign in" right after "Play for Free Now" without waiting for the navigation. Its two clean reruns passed 8/8.

## Staging verification (the certified build's own bytes)

The staging preview sits behind Vercel SSO. A small read-only local mirror served the deployment's exact responses,
fetched through the owner's Vercel CLI session (`vercel curl --deployment`; no bypass secret). The fetched content
was the HTML, scripts, styles, fonts, images and RSC payloads. Chromium and WebKit then ran the loop checks against
it.

Vercel's preview-only feedback toolbar (`vercel.live`) was answered with an empty script. Production never carries
it.

| Check | Result |
| --- | --- |
| Chromium loops: 10 at 1440 px; 5 each at 768, 390 and 320 px | Pass ≈ 4316 ms, rest ≈ 3017 ms, period ≈ 7333 ms. At most 1 rest timer, 0 remounts, no loop layout shift. |
| Controls (Chromium, WebKit) | Replay mid-pass and during the rest, 10 rapid clicks, Pause/Play (no restart while paused), a Your turn answer and the keyboard focus hold: pass |
| Scroll away / back, hidden tab, reduced motion | Pass (the hidden tab is simulated, because headless pages stay visible) |
| WebKit clocks (iPhone 13, iPad, 1440) | Every pass runs its full 4320 ms at `playbackRate` 1, with 0 overlaps. Rests are 3.0–3.4 s with a 10 ms timer sampler (3.03–3.04 s with the frame sampler). |
| axe | 0 violations at 1440 and 390 px, with motion and with reduced motion |
| Layout | Controls on one row at 9 widths from 320 to 1440 px in both engines. Page height equals live v1.2.26. |
| Audio | None: no audio or video elements, and no audio API in the homepage code |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-v1-2-27` with these values:

- `RELEASE_CERTIFIED_RUNTIME=398149f`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7`
- `RELEASE_PURPOSE=v1.2.27-homepage-auto-replay`

Logs are in `qa-artifacts/homepage-autoreplay/release/release-*.log` (git-ignored). The evidence JSONs are under
`%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 01:21:36–01:22:11 | PASS. The apex served `dpl_4RKPWVDWd6…`, which is the rollback target, from project `mathnexa-platform-production`. Next 16.4.2, sharp 0.35.5. |
| probe-live (before) | 01:22:20–01:22:36 | PASS, 22/22 |
| deploy-preview | 01:22:53–01:24:52 | PASS. `dpl_8c5F18Rk2bmE…` is Ready and holds no domain. |
| probe-preview | 01:25:00–01:26:17 | PASS, 7/7. Health reports build `398149f` and payments live. The webhook answers 400. The scheduler answers 401. Every other path 308s to the apex. No 5xx. |
| promote | 01:26:36–01:27:01 | PASS. The alias moved from `dpl_4RKPWVDWd6…` to `dpl_8c5F18Rk2bmE…`. |
| probe-live | 01:27:09–01:27:26 | PASS, 22/22 |

## Live production verification (2026-10-29 01:27–01:52 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment. The board's own buttons were the only controls
used. Evidence is in `qa-artifacts/homepage-autoreplay/release/` and `qa-artifacts/homepage-redesign/release/`
(`live-v1227-before/`, `live-v1227-after/`), all git-ignored.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `398149f6186092222764a3690584595f4a4db580`, `production-platform`, payments `live`. The apex `data-dpl-id` is `dpl_8c5F18Rk2bmEsrUyYFknpfYiHVmS`. |
| Loop on mathnexa.com, Chromium | 10 passes at 1440 px and 5 each at 768, 390 and 320 px. Pass ≈ 4316 ms, rest ≈ 3017 ms, period ≈ 7333 ms. At most 1 timer, 0 remounts, 0 console errors. Pause/Play, Replay, scroll away/back, hidden tab and reduced motion: pass. |
| Loop on mathnexa.com, WebKit | iPad and 1440 px loops and controls pass. Clock probe on all 3 devices: full 4320 ms passes at `playbackRate` 1, 0 overlaps. iPhone 13 hidden tab: the frame is held (0 running) for 4 s and resumes on return. iPhone 13 reduced motion: 0 animations, 0 timers. |
| Production recording | `qa-artifacts/homepage-autoreplay/demo/live-398149f/` holds 11 consecutive passes, each followed by a rest, plus contact sheets at 1440, 390 and iPhone 13 (WebKit). The final frame reads 12 bars ÷ 3 cups = 4 bars per cup; 20 bars ÷ 4 = 5 cups; "Check: 5 cups × 4 = 20 bars". |
| Pages (26 routes at 1440 and 390 px) vs a capture of v1.2.26 just before the release | 50/50 non-home pages identical in final URL, status, visible text, form controls, links, height and console. The homepage's visible text, links and height are identical; its controls add the Pause button. |
| Authorize Code card, hero buttons, Featured games | Featured games and hero buttons are identical. The Authorize Code card is identical except the per-build server-action id. |
| Homepage links | All 20 web links answer 200. Product links reach `/access?next=…` when signed out, as before. |
| Sign In, subscription and checkout entry | `/sign-in` and `/sign-up` forms are identical (not submitted). `/subscription` and `/pricing` reach `/access?next=/subscription`. The trial link goes to `/sign-up?next=/subscription`. |
| Super Admin | `/admin` fails closed when signed out (probe-live) and is identical to v1.2.26 |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4/4 matched. Entitlements: 3 active, 1 expired. Identical to the read before the release. |
| Runtime logs for `dpl_8c5F…` since promotion | 5xx, error, fatal: 0, 0, 0 |
| ShowMe Math Lab | `showme.mathnexa.com` still serves `dpl_6FowgYkkos68t6b5Q3pBqK8yLpL3` (v1.2.18): ETag `"7e686cff57eb2b157144fa0128084aab"`, Last-Modified Sun, 25 Oct 2026 21:10:03 GMT. No new ShowMe deployment. |
| Deployments | The production project gained exactly one deployment (`dpl_8c5F…`). |

## Known limitations (not verified by this release)

- **Firefox.** It cannot run on the review machine (Windows App Control); the owner checks it.
- **Signed-in production use.** Nothing here signs in to production. Signed-in behaviour was proven on the same
  commit locally (343/343 facts identical to v1.2.26). The owner's manual checks remain: their own sign-in and
  sign-out, an Authorize Code entry, a subscriber's product access, and Super Admin with MFA.
- **Checkout.** Checked only as far as the signed-out entry routes; no Stripe Checkout session was opened.
- **Real tab switching.** Headless browsers keep pages visible, so hidden tabs were simulated with the
  `visibilitychange` event the browser sends.
- **WebKit timing.** WebKit headless on Windows samples frames coarsely. The frame-sampler readings of pass length
  (4.0–4.6 s) are measurement lag. The animations' own clocks show full-length passes at normal speed.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-v1-2-27
$env:RELEASE_CERTIFIED_RUNTIME = '398149f'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7
```

Fallback: `npx vercel@59 promote dpl_4RKPWVDWd6TuJRb9cwfZKpyVkWQ7 --scope bright-path-ed-tech`. A rollback brings
back the v1.2.26 homepage (one pass, then a still board with Replay). It touches no data, billing or access rule.
