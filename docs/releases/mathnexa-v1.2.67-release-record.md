# MathNexa v1.2.67 — Homepage Grade 1 artwork, Grade 1–8 selector, no Stop control

Released 2026-11-24 (UTC) under explicit owner approval. Staging and production were built from the same commit.

The owner's decisions, given in this session on 2026-11-24:
- the brief: replace the homepage's Online Math Prep graph illustration with their finished Grade 1 image, and put
  working Grade 1–8 selection buttons directly under the existing headline, following the existing access rules;
- "remove that stop animation button do not replace it with anything";
- after the staging review: "Push and prepare release";
- after preflight: "Release v1.2.67".

What changed (homepage only):
- **`f49a4bd`:**
  - **Online Math Prep shelf card:** the navy-framed "Online Math Prep" graph drawing is replaced by the owner's
    finished Grade 1 artwork, `public/media/home/mathnexa-grade1-math-visual.webp` (2400×1440, byte-identical to the
    supplied file, sha256 `e17f15d1…`). `width`/`height` reserve its 5:3 box; `object-fit: contain`, a 5:3 box on
    phones and no hover zoom keep the whole composition visible. Alt text: "A child learning with a teacher beside
    Grade 1 activities about telling time and understanding money." The old `online-math-prep-preview.webp` is kept:
    `/online-math-prep` still uses it.
  - **Grade selector:** "Select your grade to start learning" and eight raised Grade 1–8 links (two columns, four
    rows, teal through blue to purple) directly under the unchanged headline, inside the hero text column. Each is a
    plain `<a href="/map-prep/pass?to=/grades/N">` built by `lib/showme-access/grades.ts`. The existing pass route
    decides on the server: a trial, a subscription (including grace and a scheduled cancellation) or a school code
    lands on that grade at `showme.mathnexa.com`; otherwise `/access`, `/confirmation-required` or `/subscription`,
    with the grade remembered for 30 minutes in that browser. Plain anchors so nothing prefetches the pass route; no
    staging host; no new analytics. White labels keep at least 4.5:1 at rest and on hover.
  - **Stop animation** button removed with its focus hand-over and `onActiveChange` plumbing. The worked problem
    still plays three times, stops on a "Your turn" answer and does not play with reduced motion.
  - Tests: homepage unit tests for the selector, hrefs and artwork; pass-route tests for all eight grade links in
    every access state; Stop tests removed or inverted; the phase 9 alt-text assertion and the phase 11 asset list
    follow the new file.
- **`8e72984`:** the five phase 9 homepage baselines were regenerated (`--update-snapshots=all`) and reviewed by eye.

Trade-offs disclosed to the owner in the staging report and the pull request before "Push and prepare release" and
"Release v1.2.67". No separate approval of each item was recorded, so they are disclosed, not accepted:
- With Stop removed, the ≈19 s three-play animation has no pause control again (WCAG 2.2.2). Removing Stop itself was
  the owner's explicit instruction ("remove that stop animation button do not replace it with anything"). On
  2026-11-24, after release, the owner asked for an accessible pause/resume control instead; see "Post-release
  verification" below.
- The grade links skip the `/map-prep` layout, so Super Admin's `map-prep-launch` count does not include them, and
  unpublishing Online Math Prep in Super Admin does not close them (as with any direct ShowMe link).
- The remembered grade lasts 30 minutes, in the same browser, and applies only while the Super Admin destination is
  exactly `https://showme.mathnexa.com/`.
- Photograph provenance: see "Artwork provenance" below.

Artwork provenance:
- The deployed `/media/home/mathnexa-grade1-math-visual.webp` (224,898 bytes, sha256 `e17f15d1d428cf19…`) is
  byte-identical to `owner-review/grade1-picture/mathnexa-grade1-math-visual.webp` in the owner-review folder.
- The image the owner attached in chat is the same composition at 2000×1200 (re-encoded by the chat): after scaling
  the deployed file to that size, the mean difference is 0.96 of 255 per channel.
- `owner-review/grade1-picture/PHOTO-SOURCE-AND-LICENSE.txt` (dated 2026-11-24, written when the composite was built)
  says the photograph is Pexels photo 8923039 by Mikhail Nilov, used under the Pexels License, which comes with no
  model release, and that the clock and pennies are crops of ShowMe screenshots. The composite's build files in that
  folder use `work/photo-source.jpg`. This release did not independently re-verify the photo's source or licence.

These areas are unchanged: navigation, pricing, sign-up, trial eligibility, Checkout, the webhook, entitlements,
the pass route and its rules, worksheets, games, Super Admin, metadata, migrations, environment variables and
dependencies.

| | |
| --- | --- |
| Version | `v1.2.67`. Production was built from `8e72984` (`8e729849e27c69d56e67a33cbec53de564fa600c`, tree `b3329f4c`). `/api/health` reports build `8e72984…`, payments `live`. |
| Tag | Annotated tag `v1.2.67` points at `8e72984`, the production build. Created and pushed after live verification. |
| Branch | `feature/homepage-grade1-visual-selector` from `main` `ea397df` (v1.2.66): `f49a4bd`, `8e72984`, then this record. Pull request DesmondQuayson/math-word-hunt#45. |
| Merge | `main` was still `ea397df`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `8e72984`, from the clean worktree `C:/GitHub/mathnexa-v1-2-67` (node_modules junction). |
| Staging | `https://mathnexa-platform-staging-9krso3wkf-bright-path-ed-tech.vercel.app` (`dpl_At31TuvDPtNTF7cM32HcYrNUAdew`), built from `8e72984`, analytics off, its own throwaway ShowMe pass secret. |
| Production candidate | `dpl_Dzvs59fWtgcWE8y4nxYHyFAyr65k` (`https://mathnexa-platform-production-g6ata12dx-bright-path-ed-tech.vercel.app`), built from `8e72984` with `--prod --skip-domain`. |
| Production runtime | `dpl_Dzvs59fWtgcWE8y4nxYHyFAyr65k`, promoted 2026-11-24 20:36:24–20:37:17 UTC. |
| Rollback runtime | `dpl_DdFiZBfNNWu3E2kJ9VSJT24UQZ24` (v1.2.66, build `a1f18a3`), retained and Ready: `npx vercel@59 promote dpl_DdFiZBfNNWu3E2kJ9VSJT24UQZ24 --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5). |
| ShowMe coupling | Grade 1 and Grade 2 links need ShowMe production v1.2.25 or later (its rollback target v1.2.25 also has them). On ShowMe v1.2.24 those two links would end on ShowMe's not-found page. |

## Release gates (on `8e72984`)

| Gate | Result |
| --- | --- |
| typecheck, lint | Pass (8 lint warnings, all in `public/game-suite/natural-voice.js`, pre-existing). |
| Unit (`npm run test:unit`) | 1,942 passed, 1 skipped; `lib/games/math-race-champions/traffic.test.ts` timed out at 5 s in the full run (known flake) and passes alone, 16/16. |
| Security (`npm run test:security`) | Baseline 404/404 (3 new), bundle audit and Number Cross audit pass; the WebKit case of `vercel-protection-bypass.test.mjs` cannot launch on the release PC (Smart App Control). |
| Phase 9 e2e | 35/35 with the regenerated baselines. |
| `test:phase11:security` | Fails at `requireProductAccess …` exactly as on `main` before this change (pre-existing). |
| Staging, hosted | 81/81 homepage checks (320/390/768/1024/1440 layout, order, sizes, keyboard, touch, signed-out redirects, eight direct grade URLs); `scripts/invoke-showme-pass-staging.ps1` PASS (Chromium, mobile Chrome), 0 synthetic accounts left. |
| Local account states | Subscriber, active trial, canceled-through-period-end: 307 to `https://showme.mathnexa.com/grades/1…8` with a pass. Expired trial, past due, no entitlement: 307 to `/subscription?next=/map-prep`, no pass. |
| WebKit | Not run: Smart App Control blocks Playwright WebKit on the release PC. |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` with `RELEASE_CERTIFIED_RUNTIME=8e72984`,
`RELEASE_ROLLBACK_DEPLOYMENT=dpl_DdFiZBfNNWu3E2kJ9VSJT24UQZ24`, `RELEASE_PURPOSE=v1.2.67-homepage-grade-selector`:
preflight PASS (apex served `dpl_DdFi…`); probe-live before PASS; deploy-preview PASS; probe-preview 7/7 (health,
webhook, canonical host, scheduler closed, no server errors, optimizer, remote optimizer refused); promote PASS;
probe-live after PASS.

## Live verification (anonymous, read-only)

- Homepage and grade links on `https://mathnexa.com`: 81/81, the same checks as staging.
- Before/after capture (`live-verify` harness, Chromium, 26 routes at 1440 and 390 px): 50/50 non-home page views
  identical. On the homepage, the visible text is identical apart from the new selector and the removed
  "Stop animation" label; the only new links are the eight grade links; the only removed control is Stop animation;
  the Authorize Code block differs only in its per-build action id and key; Free math games and hero actions are
  identical; 0 console errors.
- Runtime logs on `dpl_Dzvs…` since 20:36 UTC: 0 error, 0 fatal, 0 5xx (the 4xx filter returns the probes' expected
  answers).
- Subscriber records (`subscriber-readonly`, restricted key): 6 of 6 Stripe subscriptions match the database.

## Incident after release: accidental rollback for about 1.5 minutes

After this record was pushed, a local shell command that only updated Claude's own working notes (not this record)
contained the rollback command inside backticks in a double-quoted string. Bash ran it as command substitution and
promoted `dpl_DdFiZBfNNWu3E2kJ9VSJT24UQZ24` (v1.2.66). `/api/health` still reported `8e72984` at about 20:45:00 UTC
and reported `a1f18a3` at 20:46:02 UTC; v1.2.67 (`dpl_Dzvs59fWtgcWE8y4nxYHyFAyr65k`) was promoted again, finishing
20:46:35 UTC. Production therefore served v1.2.66 for at most about 1.5 minutes.

- Impact: visitors in that window saw the previous homepage (no grade selector, the old picture, the Stop control).
  v1.2.66 is the retained, verified rollback build; no data, billing or access rule changed.
- Afterwards: `/api/health` build `8e72984`; `vercel inspect https://mathnexa.com` → `dpl_Dzvs…`; probe-live PASS;
  homepage and grade links 81/81; runtime logs on both deployments since 20:44 UTC: 0 error, 0 5xx.
- Cause and rule: shell text that quotes a command must never sit in backticks inside double quotes. Notes and
  records are written with file-editing tools, never through a shell string; deployment commands run only as their
  own, separate commands.

## Post-release verification (2026-11-24, after the restore)

Production stayed on `dpl_Dzvs…` (build `8e72984`) throughout; nothing below changed production, billing or
subscriber records.

| Check | Result |
| --- | --- |
| Deployed artwork | `https://mathnexa.com/media/home/mathnexa-grade1-math-visual.webp` 200 `image/webp`, 224,898 bytes, sha256 equal to the owner-review file (see "Artwork provenance"). |
| Homepage on production, Chromium | 81/81 again (layout at 320/390/768/1024/1440, Grade 1–8 order and hrefs, 2×4 grid, ≥ 52 px keys, artwork whole and sharp, keyboard, touch, signed-out redirects, eight direct grade URLs). |
| Homepage on production, WebKit | 35/35 in the official Playwright container (`mcr.microsoft.com/playwright:v1.62.0-noble`, WebKit 26.5): Desktop Safari 1440, iPad 768, iPhone 13 and iPhone SE 320 emulation — overflow, selector placement, order, grid, artwork, tap/click to `/access`, Back, keyboard order, no page errors. Emulation, not a physical iPhone. |
| ShowMe grade pages | `showme.mathnexa.com/grades/1`–`8`: without a pass each answers 302 to `https://mathnexa.com/map-prep/pass?to=%2Fgrades%2FN`; with the release review key each answers 200 titled "Grade N curriculum" with the heading "Grade N math". |
| Local journeys | 37/37 on a local production-platform server with synthetic accounts, a throwaway school code and every production host blocked at DNS: signed out → Grade 4 → `/access` → Sign in (keeps `next=/map-prep`) → remembered Grade 4 (used once); the last grade chosen wins; school code → remembered Grade 6, the code never in a URL; subscriber and code sessions reach every grade directly and on repeat; sign-out and Exit authorized access restore protection; expired trial and past due → `/subscription`, no pass; an unconfirmed account cannot sign in and gets `/access`. Locally no Online Math Prep destination is published, so the ShowMe bounce (`/map-prep/pass?to=/`) was requested directly. |

## Proposed correction: Pause / Play control (not released)

Branch `fix/homepage-animation-pause`, commit `cceaa2d`, from `main` `2b4de93`: one "Pause animation" / "Play
animation" toggle in the old Stop control's place (below the caption, shown only while plays remain). Preview
`https://mathnexa-platform-staging-fyqupn94u-bright-path-ed-tech.vercel.app` (`dpl_4kJ4gvhanhuE5v1dRnzZdn6YAx1e`).
Checks: unit 62/62 in the homepage suites (full run 1,950 + the known traffic-test timeout); typecheck, lint, build
pass; security baseline 404/404; phase 9 35/35 with unchanged baselines; Pause/Play on the preview 23/23 in Chromium
and 23/23 in WebKit (container); homepage on the preview 81/81 Chromium, 34/35 WebKit (Vercel preview protection
refuses WebKit's prefetch of `/sign-in` and `/sign-up` on the protected staging host; the same check on production
has no errors). At 1440×900 the control sits below the fold (about 1,128 px down), as the old Stop control did on
laptops. Production deployment waits for the owner.

## Not proven here

Real entry into ShowMe per grade with an account that has access: the pass cookie only reaches ShowMe from
`mathnexa.com`, and no synthetic account is created in production. The owner confirms by opening a few grades
signed in. A physical iPhone check is also the owner's.
