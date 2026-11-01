# MathNexa v1.2.33 — link-preview card, Grade 6 quiz drawing, large-text footer and plainer access wording

Released 2026-11-01 (UTC) under explicit owner approval ("Approve release", given after the staging review of the P3
finishing fixes). It ships the reviewed runtime unchanged. `6dbec58` differs from the staged build `08a1e41` only in
three phase 9 baseline images.

The release carries six owner-approved fixes. Each is small: copy, metadata, styling or an image. These areas are
unchanged:
- Sign In, Sign Out, Authorize Code and authentication.
- Pricing, Stripe, free trials and entitlements.
- Supabase, Super Admin, databases, API contracts, environment variables and `proxy.ts`.
- `robots.txt` and the sitemap.
- Game mechanics, Online Math Prep, Homework and Quiz PDF generation, and the Worksheet Generator.
- The header menu, and the homepage's three-play worked example and Stop control.
- ShowMe Math Lab.

| | |
| --- | --- |
| Version | `v1.2.33`. Production was built from `6dbec58` (`6dbec58f43b7e79c574f2205029d943b6c35c2af`, tree `88d9b0c6aa6d69ca5a2ce243eeb259a3a504471a`). `/api/health` reports build `6dbec58…`. |
| Tag | Annotated tag `v1.2.33` ("MathNexa v1.2.33: link-preview card, Grade 6 quiz drawing, large-text footer and plainer access wording") points at `6dbec58`, the production build. Created and pushed after live verification. |
| Branch | `fix/p3-finishing` from `main` `ed1470d` (v1.2.32 runtime `c09c88c` plus its record): `48ca6fb`, `e8b43cb`, `9672dde`, `6837607`, `86d8c64`, `08a1e41` and `6dbec58` (phase 9 baselines only). |
| Merge | `main` was still `ed1470d`, so origin `main` was fast-forwarded through `6dbec58` to this record, with no merge commit and no force. The runtime on `main` equals the production build. |
| Certified runtime | `6dbec58`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-p3-staging`, tracked files only, `node_modules` junction). |
| Staging | `dpl_35G7dkuDy8pEoPWPQfvzn16thNiy` (`https://mathnexa-platform-staging-jcwbvtjgl-bright-path-ed-tech.vercel.app`), build `08a1e41`, compared with the v1.2.32 staging build (`dpl_A7ZUffcBXfiA4KQy65yvZ13ve8ir`). Unchanged between the owner's approval and the release. |
| Production candidate | `dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF` (`https://mathnexa-platform-production-g5hape300-bright-path-ed-tech.vercel.app`), built from `6dbec58` with `--prod --skip-domain` |
| Production runtime | `dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF`, `production-platform`, payments `live`. Promoted 2026-11-01 16:31:29–16:31:53 UTC. |
| Rollback runtime | `dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh` (v1.2.32, build `c09c88c`), retained and Ready. `dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE` (v1.2.31) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged. `package.json`, the lockfile and `next.config.mjs` are identical to v1.2.32. |

## What changed

1. **Link-preview card.**
   - **Before:** shared links showed the 512 px square app icon, which still says "MAP Prep", as a small "summary"
     card.
   - **Now:** every page shares `/media/social/mathnexa-share.png` (1200×630 PNG, 313 KB), and Twitter/X uses
     `summary_large_image`.
   - **The card:** the rabbit cropped from the approved app icon art, the MathNexa wordmark as the footer writes it, the
     homepage headline, the product names and mathnexa.com.
   - `scripts/build-share-image.mjs` rebuilds it. The structured-data logo stays the square icon.
2. **Homepage quiz drawing.** The illustration said "Grade 7 · Topic 2 · Proportional Relationships", but MathNexa
   publishes Grade 6 quizzes only.
   - It now shows the live Grade 6 topic "Ratios, Rates, and Unit Conversions", without a topic number.
   - Two Grade 6 ratio questions replace the `y = 4x` table prompt and the constant-of-proportionality graph.
   - The layout is the same. The WebP and AVIF are re-rendered from the source SVG at 1200×800 (42 KB and 23 KB), and
     the alt text says Grade 6.
3. **Footer with enlarged text.**
   - **Before:** with text-only zoom (for example Firefox "Zoom text only", or a root font-size override), the
     four-column footer kept its desktop layout. It pushed every page sideways by 101, 58 and 32 px at 900, 1024 and
     1100 px wide, and its links overlapped.
   - **Now:** the footer is a size container and repeats its two breakpoints as container queries in rem, so it stacks.
     The media queries stay for browsers without container queries. At normal text size nothing changes.
4. **Footer "Cancellation and refunds".** "Cancellation" and "Refunds" opened signed-in account flows, so signed-out
   visitors were sent to sign-in.
   - One link, "Cancellation and refunds", now opens that section of the Terms (`/terms#terms-cancellation`).
   - Subscribers reach both flows from Subscription and Support. The pages are unchanged.
5. **`/status` out of search.** The service status page is `noindex, follow`. It stays reachable, and `robots.txt` keeps
   allowing it so crawlers can see the noindex.
6. **"Access" instead of "game access".**
   - **Where:** the access page (title and heading "Your access", plain description), its status messages, the My
     Account row and button ("Access", "Check your access"), the Help button, and the checkout status message.
   - **Scope:** labels and messages only. The `/game-access` route, its noindex and every access decision are unchanged.
   - **Left as they are, deliberately:** the footer's "Game access" link (it launches Math Vocabulary Hunt), the sign-in
     page's signed-out notice, and the checkout consent wording (versioned billing consent).

Files (28, including tests and assets):
- `app/{status,game-access,help}/page.tsx`, `app/checkout/status/page.tsx`
- `app/layout.tsx` and `app/page.tsx` (Twitter card type only)
- `components/site-footer.tsx`, `components/public/teacher-first-home.tsx` (quiz alt text)
- `components/consumer/{game-access-status,consumer-account-page}.tsx`
- `lib/seo/public-pages.ts`, `styles/premium.css`
- `public/media/home/quiz-preview{-source.svg,.webp,.avif}`, `public/media/social/mathnexa-share.png`,
  `scripts/build-share-image.mjs`
- unit tests, `e2e/phase9/large-text-reflow.spec.ts`, the quiz alt-text pin, and three phase 9 homepage baselines

## Release gates (on `08a1e41`, 2026-11-01 15:32–16:05 UTC, local Supabase; phase 9 rerun on `6dbec58`)

| Check | Result |
| --- | --- |
| Change control vs `main` `ed1470d` | 28 files, all on the owner-approved list. Protected areas are touched only by the approved copy, metadata and image changes. |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 1014 passed, 1 skipped (21 more than v1.2.32) |
| `test:security`, protection bypass | 321/321, 7/7; platform bundle and Number Cross audits pass |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Phase 9 | 30/30 on `6dbec58`. On `08a1e41`, one homepage visual baseline failed because the quiz drawing and the footer changed. The 320, 390 and 768 px baselines were then regenerated; every changed pixel is in the quiz thumbnail or the footer (v1.2.32's sentence, which had stayed within the 1% tolerance, and one link row fewer). The new large-text check fails on v1.2.32 and passes here. |
| School access (Authorize Code) / Tug of War free access | 21/21 / 8/8 |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |

The functional harness fails the same four "screens" tests as v1.2.30–v1.2.32, because their baselines are older than
v1.2.30's footer. Compared with the v1.2.32 run, 73 of 82 screenshots differ only inside the footer. The other nine are
the intended changes:
- the Help button;
- the homepage quiz drawing (4 views);
- the My Account wording (3);
- the Subscription page's access message.

## Staging verification (read-only mirrors of both staging builds)

| Check | Result |
| --- | --- |
| 32 signed-out routes vs v1.2.32 staging | 30 identical apart from the footer link. `/status` changed from `index, follow` to `noindex, follow`. `/help` changed only its button text. |
| Share card | Every page has `og:image` with the 1200×630 card and `twitter:card` `summary_large_image`. The PNG is served (`image/png`). |
| Text-only 200% zoom (home, About, Support, Online Math Prep, Terms, Help at 900, 1024 and 1100 px) | v1.2.32: 101, 58 and 32 px of sideways scroll on every page. P3: 0 everywhere. |
| Accessibility and reflow | axe 0 violations on 13 public pages at 1440 and 390 px. Overflow at 320 and 390 px with 100% and 200% text: 0 of 52. WebKit (iPhone 13): 0 |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-p3-staging` with these values:

- `RELEASE_CERTIFIED_RUNTIME=6dbec58`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh`
- `RELEASE_PURPOSE=v1.2.33-finishing-fixes`

Logs are in `qa-artifacts/seo-audit/p3-finishing/release/` (git-ignored). The evidence JSONs are under `%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 16:27:29–16:27:37 | PASS. The apex served `dpl_7sprSZ1P5fQe…` (the rollback target), retained. |
| probe-live (before) | 16:27:37–16:27:51 | PASS, 22/22 |
| deploy-preview | 16:27:58–16:30:02 | PASS. `dpl_GT3UTDWqhEvB…` is Ready and protected. Next 16.4.2, sharp 0.35.5, tree `88d9b0c`. |
| probe-preview | 16:30:09–16:31:20 | PASS, 7/7. Health reports build `6dbec58` and payments live. The apex still reported `c09c88c` afterwards. |
| promote | 16:31:29–16:31:53 | PASS. The alias moved from `dpl_7sprSZ1P5fQe…` to `dpl_GT3UTDWqhEvB…`. |
| probe-live | 16:31:53–16:32:08 | PASS, 22/22 |

## Live production verification (2026-11-01 from 16:32 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `6dbec58f43b7e79c574f2205029d943b6c35c2af`, `production-platform`, payments `live`. The apex serves `dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF`. |
| Pages (32 routes) vs a capture just before the release | 31 unchanged apart from the footer link (and, on `/help`, the button text). `/status` changed from `index, follow` to `noindex, follow`. `robots.txt` and `sitemap.xml` are byte-identical. |
| Share card | `og:image` changed from `icon1.png` to `https://mathnexa.com/media/social/mathnexa-share.png` (1200×630), and `twitter:card` from `summary` to `summary_large_image`, on every page checked. The PNG is served (200, `image/png`, 313 KB). |
| Homepage quiz drawing | Alt text: "MathNexa Grade 6 topic quiz PDF with a ratio table and two graphs" |
| Text-only 200% zoom on mathnexa.com | Home, About, Support, Online Math Prep, Terms and Help at 900, 1024 and 1100 px: 0 px of sideways scroll everywhere (v1.2.32: 101, 58 and 32 px). |
| Accessibility and reflow on mathnexa.com | axe (WCAG 2.0–2.2 A/AA) at 1440 and 390 px found 0 violations on 12 public pages. On the homepage (unchanged), axe run at the instant of load flags the hero text while it fades in. Three seconds later it reports 0, in 3 of 3 runs. Reflow at 320 and 390 px with 100% and 200% text: 0 of 52. WebKit (iPhone 13): no overflow. |
| Three plays on mathnexa.com, Chromium (1440, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | 3 plays (passes ≈ 4320 ms, rests ≈ 3010 ms), then still for 16.3–17.8 s with 0 px changed and no 4th play. Interruptions, focus hold, answer and reduced motion pass. All checks pass. |
| Stop animation on mathnexa.com, Chromium (1440, 1024, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | Not in the server HTML and shown while plays remain. Pointer and keyboard Stop work. The button is gone after the third play and absent with reduced motion. axe: 0 violations at 1440, 390 and 320 px with the button showing. All checks pass (16:32–16:51 UTC). |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4 subscriptions, all live mode, Stripe and the database matching. Identical to the read before the release. |
| Runtime logs for `dpl_GT3UTDWq…` since promotion | 5xx, error, fatal: 0, 0, 0. The 4xx responses are the live probe's expected answers: webhook 400, scheduler 401, Tug of War online 401, game runtime 401, admin 404 and billing fixture 404. |
| ShowMe Math Lab | `showme.mathnexa.com` unchanged: ETag `"7e686cff57eb2b157144fa0128084aab"`, the same before and after |
| Deployments | The production project gained exactly one deployment (`dpl_GT3UTDWq…`). |

## Known limitations and owner follow-ups

- **Link previews are cached by each service.** Facebook's Sharing Debugger and LinkedIn's Post Inspector refresh the card
  for links shared before the release.
- **Text-only zoom** was reproduced in Chromium by enlarging the root font size, as Firefox "Zoom text only" does. The
  owner checks Firefox itself.
- **Signed-in pages** (access page, My Account, checkout status) were not exercised in production. Their wording is
  covered by the unit tests and the local functional harness on the same commit.
- **Still say "game access", deliberately:** the footer's "Game access" link, the sign-in page's signed-out notice and the
  checkout consent wording.
- **Carried over from v1.2.32:** the Math Vocabulary Hunt grade range and the lowercase "grade 6" title in the catalog
  (Super Admin), and Search Console sitemap resubmission.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-p3-staging
$env:RELEASE_CERTIFIED_RUNTIME = '6dbec58'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh
```

Fallback: `npx vercel@59 promote dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh --scope bright-path-ed-tech`.

A rollback returns v1.2.32:
- the square icon as the share image, and the Grade 7 quiz drawing;
- the footer that overflows with text-only zoom, and the Cancellation and Refunds links;
- `/status` indexable, and the "game access" wording.

It touches no data, billing or access rule.
