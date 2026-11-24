# MathNexa v1.2.69 — Pause control and shelf introduction removed

Released 2026-11-24 (UTC) under explicit owner approval. Staging and production were built from the same commit.

The owner's decisions, given in this session on 2026-11-24:
- the brief: "Remove exactly the two items shown in my attached screenshots from the MathNexa homepage. Do not replace
  them with anything. This instruction supersedes the earlier request to restore the animation's pause control." The
  two items: the "Pause animation" button, and the shelf introduction ("HOW MATHNEXA FITS TOGETHER", "Prepare online,
  practice on paper, check what stuck", "One connected system: engage, learn, practice, assess."). No screenshots
  reached the session; the items were identified from the brief's own wording;
- after the preview: "Push and prepare v1.2.69";
- after preflight: "Release v1.2.69".

What changed (homepage only):
- **`62b031b`:**
  - The hero worked problem's "Pause animation" / "Play animation" button is removed with its icon, focus hand-over
    and the loop plumbing used only by it. `board-loop.ts`, `prep-board-replay.tsx`, `prep-board.tsx`,
    `board-loop.test.tsx` and the control's CSS are back to exactly their v1.2.67 content. The three-play animation,
    the "Your turn" stop and reduced motion are unchanged.
  - The product shelf's introduction is removed. The section's `aria-labelledby` pointed at the removed heading and
    is dropped. `InView` and `Marked` (`components/public/home/in-view.tsx`, `marked.tsx`) were used only there and
    are deleted with their CSS (`.inView`, `.marked`, `.sectionHead`, `.shelfLede`, `home-marker`). The four product
    cards, their links and images are unchanged; the section keeps its own padding above the cards.
  - Tests: the homepage unit tests now check the introduction and its heading id are gone and the heading order
    without it.
- **`70288f8`:** the five phase 9 homepage baselines were regenerated (`--update-snapshots=all`) and reviewed by eye.

With the control removed, the ≈19 s auto-playing animation again has no pause mechanism (WCAG 2.2.2). The removal is
the owner's explicit instruction; this was stated in the preview report before approval.

Unchanged: the Grade 1 artwork, the headline, the Grade 1–8 buttons, navigation, the Authorize Code form, sign-in,
trial eligibility, pricing, Checkout, the webhook, entitlements, the pass route, games, lessons, the footer, Super
Admin, metadata, analytics, security configuration, migrations, environment variables and dependencies.

| | |
| --- | --- |
| Version | `v1.2.69`. Production was built from `70288f8` (`70288f83f7a539fc5f474e57ffd6c80cff35412f`, tree `755db9af`). `/api/health` reports build `70288f8…`, payments `live`. |
| Tag | Annotated tag `v1.2.69` points at `70288f8`, the production build. Created and pushed after live verification. |
| Branch | `fix/homepage-remove-pause-shelf-intro` from `main` `cb384b0` (v1.2.68): `62b031b`, `70288f8`, then this record. Pull request DesmondQuayson/math-word-hunt#47. |
| Merge | `main` was still `cb384b0`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `70288f8`, from the clean worktree `C:/GitHub/mathnexa-v1-2-69` (node_modules junction). |
| Staging | `https://mathnexa-platform-staging-omumoxi34-bright-path-ed-tech.vercel.app` (`dpl_FBYbS4eQ5Amqyqon98Agm8XXbcSE`), built from `70288f8`, analytics off. |
| Production candidate | `dpl_B2GNxn1dqUyXEKs4KrhjMLDSzCQL` (`https://mathnexa-platform-production-5d9e756hi-bright-path-ed-tech.vercel.app`), built from `70288f8` with `--prod --skip-domain`. |
| Production runtime | `dpl_B2GNxn1dqUyXEKs4KrhjMLDSzCQL`, promoted 2026-11-24 23:16:10–23:16:31 UTC. |
| Rollback runtime | `dpl_2Ygo2bwCeR3zNT4EebVpYuJYky9x` (v1.2.68, build `cceaa2d`), retained and Ready. Roll back by promoting it with the Vercel CLI (`vercel promote` with that deployment id and scope `bright-path-ed-tech`), run on its own, never inside other text. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5). |

## Release gates (on `70288f8`)

| Gate | Result |
| --- | --- |
| typecheck, lint, build | Pass (8 lint warnings in `public/game-suite/natural-voice.js`, pre-existing). |
| Unit | 1,942 passed, 1 skipped; `lib/games/math-race-champions/traffic.test.ts` timed out at 5 s in the full run (known flake). Homepage and related suites 130/130. |
| Security | Baseline 404/404, bundle audit and Number Cross audit pass. |
| Phase 9 e2e | 35/35 with the regenerated baselines. |
| `test:phase11:security` | Fails at `requireProductAccess …` exactly as on `main` (pre-existing). |
| Staging | Removal checks 32/32 in Chromium and 32/32 in WebKit (official Playwright container `mcr.microsoft.com/playwright:v1.62.0-noble`); homepage 81/81 Chromium, 34/35 WebKit (Vercel preview protection refuses WebKit's prefetch of `/sign-in` and `/sign-up` on the protected staging host only). |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` with `RELEASE_CERTIFIED_RUNTIME=70288f8`,
`RELEASE_ROLLBACK_DEPLOYMENT=dpl_2Ygo2bwCeR3zNT4EebVpYuJYky9x`,
`RELEASE_PURPOSE=v1.2.69-homepage-remove-pause-shelf-intro`: preflight PASS (apex served `dpl_2Ygo…`); probe-live
before PASS; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after PASS. Pipeline stages ran as
separate commands; this record was written with a file-editing tool.

## Live verification (anonymous, read-only)

- Removal checks on `https://mathnexa.com`: 32/32 in Chromium and 32/32 in WebKit at 390, 768 and 1440 px — no pause,
  play or other animation control; the introduction text, its heading id and any `aria-labelledby` pointing at it are
  gone; the product cards open the section with only the section padding above them (48 px phone, 80 px desktop);
  no horizontal scroll; the animation runs, completes its three plays and stays solved; "Your turn" and reduced
  motion work; product and grade links unchanged; Grade 1 artwork in place.
- Signed-out access answers: `/map-prep`, `/games`, `/homework`, `/quizzes` → `/access?next=…`; grade links →
  `/access?next=/map-prep` — identical to v1.2.68.
- Homepage and grade links: 81/81 in Chromium, 35/35 in WebKit (Desktop Safari, iPad, iPhone 13, iPhone SE
  emulation; emulation, not a physical iPhone).
- Before/after capture (Chromium, 26 routes at 1440 and 390 px): every non-home page view identical except that the
  before capture of `/my-account` at 390 px logged the known, occasional Google Tag Manager diagnostics ping refused by
  the content security policy (absent after). On the homepage the visible text equals the before text minus exactly
  the two removed items, the links are identical, no animation control remains, 0 console errors.
- Runtime logs on `dpl_B2GN…` since 23:16 UTC: 0 error, 0 fatal, 0 5xx (the 4xx filter returns the probes' expected
  answers).
- Subscriber records (`subscriber-readonly`, restricted key): 6 of 6 Stripe subscriptions match the database.

## Still the owner's

- Signed in with an account that has access: open Grade 1, 2, 5 and 8 from the homepage; each should open
  `showme.mathnexa.com/grades/N` showing "Grade N math".
- A physical iPhone in Safari: tap grades, check the Grade 1 artwork is whole and the page does not scroll sideways.
