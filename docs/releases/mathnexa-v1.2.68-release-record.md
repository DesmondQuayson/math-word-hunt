# MathNexa v1.2.68 — Pause / Play control for the homepage worked problem

Released 2026-11-24 (UTC) under explicit owner approval. Staging and production were built from the same commit.

The owner's decisions, given in this session on 2026-11-24:
- the post-release brief for v1.2.67: "If it continues automatically and requires a control, prepare a minimal fix
  restoring an accessible pause/resume mechanism. Preserve the new image and grade-selector layout. Provide a preview
  for any correction before production deployment.";
- after the preview: "Push and prepare v1.2.68";
- after preflight: "Release v1.2.68".

Why: v1.2.67 removed the hero's Stop animation control (that removal was the owner's instruction at the time). The
worked problem still auto-plays three times, about 19 seconds, so without a control it fails WCAG 2.2.2
(Pause, Stop, Hide).

What changed (homepage only):
- **`cceaa2d`:** one toggle in the old Stop control's place: below the caption, out of the layout, shown only while
  plays are still to come. "Pause animation" holds the board on its current frame and clears the rest timer; "Play
  animation" resumes it. A paused pass never uses up a play; scrolling away, a hidden tab or focus changes keep it
  paused; an answer to "Your turn" still shows the solved problem and removes the control; reduced motion shows no
  control; when the control goes while it has focus, focus moves to the board. Files: `board-loop.ts`,
  `prep-board-replay.tsx`, `prep-board.tsx` (comment), `home.module.css`, `board-loop.test.tsx`.
- **`f70f306`:** corrections to the v1.2.67 record (artwork provenance, trade-offs described as disclosed, precise
  incident window, post-release verification). Documentation only.

Unchanged: the v1.2.67 Grade 1 artwork and grade selector, navigation, pricing, sign-up, trial eligibility,
Checkout, the webhook, entitlements, the pass route, Super Admin, metadata, migrations, environment variables and
dependencies.

| | |
| --- | --- |
| Version | `v1.2.68`. Production was built from `cceaa2d` (`cceaa2d892dbc18d708a25dce19bc4b15ca64ac1`, tree `78660b93`). `/api/health` reports build `cceaa2d…`, payments `live`. |
| Tag | Annotated tag `v1.2.68` points at `cceaa2d`, the production build. Created and pushed after live verification. |
| Branch | `fix/homepage-animation-pause` from `main` `2b4de93` (v1.2.67): `cceaa2d`, `f70f306`, then this record. Pull request DesmondQuayson/math-word-hunt#46. |
| Merge | `main` was still `2b4de93`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `cceaa2d`, from the clean worktree `C:/GitHub/mathnexa-v1-2-68` (node_modules junction). |
| Staging | `https://mathnexa-platform-staging-fyqupn94u-bright-path-ed-tech.vercel.app` (`dpl_4kJ4gvhanhuE5v1dRnzZdn6YAx1e`), built from `cceaa2d`, analytics off. |
| Production candidate | `dpl_2Ygo2bwCeR3zNT4EebVpYuJYky9x` (`https://mathnexa-platform-production-illz012wd-bright-path-ed-tech.vercel.app`), built from `cceaa2d` with `--prod --skip-domain`. |
| Production runtime | `dpl_2Ygo2bwCeR3zNT4EebVpYuJYky9x`, promoted 2026-11-24 21:56:14–21:56:45 UTC. |
| Rollback runtime | `dpl_Dzvs59fWtgcWE8y4nxYHyFAyr65k` (v1.2.67, build `8e72984`), retained and Ready. Roll back by promoting it with the Vercel CLI (`vercel promote` with that deployment id and scope `bright-path-ed-tech`), run on its own, never inside other text. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5). |

## Release gates (on `cceaa2d`)

| Gate | Result |
| --- | --- |
| typecheck, lint, build | Pass (8 lint warnings in `public/game-suite/natural-voice.js`, pre-existing). |
| Unit | 1,950 passed, 1 skipped; `lib/games/math-race-champions/traffic.test.ts` timed out at 5 s in the full run (known flake; passes alone). Homepage suites 62/62. |
| Security | Baseline 404/404, bundle audit and Number Cross audit pass. |
| Phase 9 e2e | 35/35; the homepage visual baselines are unchanged (they are taken with animations disabled, so the control is not shown). |
| `test:phase11:security` | Fails at `requireProductAccess …` exactly as on `main` (pre-existing). |
| Staging | Pause/Play 23/23 in Chromium and 23/23 in WebKit (official Playwright container `mcr.microsoft.com/playwright:v1.62.0-noble`, WebKit 26.5); homepage 81/81 Chromium, 34/35 WebKit (Vercel preview protection refuses WebKit's prefetch of `/sign-in` and `/sign-up` on the protected staging host only). |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` with `RELEASE_CERTIFIED_RUNTIME=cceaa2d`,
`RELEASE_ROLLBACK_DEPLOYMENT=dpl_Dzvs59fWtgcWE8y4nxYHyFAyr65k`, `RELEASE_PURPOSE=v1.2.68-homepage-animation-pause`:
preflight PASS (apex served `dpl_Dzvs…`); probe-live before PASS; deploy-preview PASS; probe-preview 7/7; promote
PASS; probe-live after PASS. Every pipeline stage and every note were run separately: notes were written with
file-editing tools only.

## Live verification (anonymous, read-only)

- Pause/Play on `https://mathnexa.com`: 23/23 in Chromium and 23/23 in WebKit (container) — the control appears while
  the board plays, sits below the board and above the next section with no layout shift or overflow, Pause holds
  every animation (nothing moves for 3 s), the name changes to Play animation and back, Space and Enter toggle it,
  it is gone after the third play, reduced motion shows no control, no page errors.
- Homepage and grade links: 81/81 in Chromium, 35/35 in WebKit (Desktop Safari, iPad, iPhone 13 and iPhone SE
  emulation; emulation, not a physical iPhone).
- Before/after capture (Chromium, 26 routes at 1440 and 390 px): 50/50 non-home page views identical; on the
  homepage the text is identical apart from the new "Pause animation" label, the only new control is that button,
  the links are identical, 0 console errors.
- Runtime logs on `dpl_2Ygo…` since 21:56 UTC: 0 error, 0 fatal, 0 5xx (the 4xx filter returns the probes' expected
  answers).
- Subscriber records (`subscriber-readonly`, restricted key): 6 of 6 Stripe subscriptions match the database.

## Known

At 1440×900 the control sits below the fold (about 1,128 px down), as the old Stop control did on laptops; it is
reachable by scrolling and by keyboard.

## Still the owner's

- Signed in with an account that has access: open Grade 1, 2, 5 and 8 from the homepage; each should open
  `showme.mathnexa.com/grades/N` showing "Grade N math".
- A physical iPhone in Safari: tap grades, check the Grade 1 artwork is whole, no sideways scrolling, and try Pause /
  Play while the board writes.
