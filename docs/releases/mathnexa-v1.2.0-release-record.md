# MathNexa V1.2.0 — Release Operations Record

Owner-approved production release, frozen 2026-08-26. Closeout audit verified every item below
read-only against the live hosts and both repositories on the freeze date.

## 1. Release identity

| Item | Value |
| --- | --- |
| Release tag | `v1.2.0` (annotated) |
| Tag object | `b0bce1f184ccbf629338c443fc665c342879465b` |
| Production commit | `787fc211c6cf1fac720b3ba199186f4efa64941a` |
| Branch | `feature/mathnexa-premium-web-experience-v1.2` |
| Vercel project | `bright-path-ed-tech/mathnexa-platform-production` |
| Vercel deployment | `4umwppfks` (● Ready, Production) |
| Production domain | https://mathnexa.com/ |
| Previous restore point | `v1.1.1` → `699bbedd7713eb67eda012632600a4a614d7708d` |

## 2. Companion MAP Prep release (separate repository)

| Item | Value |
| --- | --- |
| Release tag | `mathnexa-map-prep-v1.1.0` (repo `missouri-map-math-interactive-platform`) |
| Production commit | `94fe48520cbe0cfbb7c1edc07aee5cf0d1c47213` |
| Vercel project / deployment | `showme-map-prep-production` / `pku72j3o1` |
| Production domain | https://showme.mathnexa.com/ (manual alias — a deploy does NOT move it; see rollback) |
| Previous restore point | `mathnexa-map-prep-v1.0.0` → `b224ae94eac2b1a3ae3bb33fe80fb58ce7553592` |
| Standalone ShowMe | `v1.1.0` → `9d1c7ea16e072a74fb7299f1e6057169eb9912bd` (GitHub Pages, untouched) |

## 3. Legacy host recovery

| Item | Value |
| --- | --- |
| Hostname | `mathnexa-production.vercel.app` |
| Project | `bright-path-ed-tech/mathnexa-production` (`prj_a0TfwIbvPEce311pOhrIJyENJiIB`) |
| Old failure | 503 — a stale deployment of the platform app in `production-public` mode hit its own "Public Production configuration unavailable." guard |
| Fix | Redirect-only deployment `2uidcr3fv`: a `vercel.json` catch-all `308 → https://mathnexa.com/$1` (path + query preserved, single hop, no loop) plus an inert fallback page. No app code, no dependencies, no secrets. |
| Status | Verified: `/games?x=1` → `308 https://mathnexa.com/games?x=1`; Chromium/WebKit/mobile-WebKit with a Google referrer all land on healthy mathnexa.com. |

## 4. What V1.2.0 contains

- **Safari / reliability:** `metadataBase` + per-route canonical (`https://mathnexa.com`); proxy host
  normalization in production-platform mode (`www.mathnexa.com` and `*.vercel.app` → apex 308,
  gated on `MVH_APPLICATION_ORIGIN` so staging never redirects); sitemap lists final URLs only;
  branded `error.tsx` / `not-found.tsx`; `app/icon.svg` favicon; `React.cache()` request-dedupe of
  `getGameAccessView` / notices / catalog; 3–4 s fail-open time-boxes on the two non-auth public
  reads. Root causes of the "Google result doesn't open in Safari" report: stale/duplicate hosts
  (fixed by canonical + normalization + the legacy redirect) and the un-timed homepage reads.
- **Homepage (owner decisions):** concise page — navigation → Learning Constellation hero → footer.
  The "MathNexa in Action …Designed around teaching" span is REMOVED by owner instruction; do not
  restore it. Hero wide node uses the approved first-party art
  `public/media/games/math-vocabulary-hunt.webp` (neon FRACTION/INTEGER/RATIO/AREA/EQUATION board)
  at native 16:9, uncropped.
- **Authorized code:** entry is visible with ZERO clicks for signed-out visitors on the homepage
  (and on `/access` and `/sign-in`). Behavior unchanged: server-side AESM validation, 12-hour
  session, HttpOnly/Secure/SameSite, rate limiting, subscriber-entitlement precedence, no PII.
  The AESM value itself lives only in server environment configuration and is never documented here.
- **Author / contact:** footer carries `Author: Desmond Quayson` and clickable
  `mailto:quaysondesmond@yahoo.com`. The `.cm` misspelling is eradicated (repo + served HTML = 0).
- **Design system:** deep-navy ink (#071525) with restrained turquoise (#20CFE3) / pink (#FF4F9A)
  accents; premium footer; active navigation state; simplified product surfaces; compact game
  chrome; Math Vocabulary Hunt Back-to-Games link. Motion is one-shot or user-triggered only —
  the sole infinite animation is the pre-existing button spinner.
- **Accessibility:** live axe WCAG 2.2 AA = 0 on the certified pages; polite live notices.

## 5. Known non-blocking issues

- WebKit logs RSC **prefetch** console warnings on some link hovers/navigations; every real
  navigation succeeds. Cosmetic console noise.
- `lib/game-access/canonical-assets.test.ts` (and the content sha audit) fail on **Windows
  checkouts only** — CRLF normalization changes canonical asset bytes. Present at the frozen
  baseline; CI (LF) is green. Do not "fix" by editing canonical assets.
- Legacy project `mathnexa-production` is retained as a redirect shell; deleting it is a separate
  owner decision (deleting would eventually break the old hostname redirect).
- Vercel CLI `env pull` returns `[SENSITIVE]` placeholders; local production-platform rendering
  uses the sanctioned `MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL=true` recipe (see
  `docs/mathnexa-premium-experience-audit.md` and `packages/platform-core` registry tests).

## 6. Rollback procedure (document only — not performed)

**MathNexa platform → v1.1.1**
1. `git checkout v1.1.1` (= `699bbedd…`) in a clean worktree of this repo.
2. `vercel link --project mathnexa-platform-production --scope bright-path-ed-tech` in that worktree.
3. `vercel deploy --prod --archive=tgz` — the project's `mathnexa.com` domain follows the newest
   Production deployment automatically; verify the homepage markers flip back (the "MathNexa in
   Action" section is PRESENT in v1.1.1).
4. Alternative without a build: Vercel dashboard → project → Deployments → previous Ready
   production deployment → "Promote to Production" / instant rollback.
5. Do not move or delete the `v1.2.0` tag; rollback is a deploy operation, not a git operation.

**MAP Prep → mathnexa-map-prep-v1.0.0**
1. In the ShowMe repo, build the integration artifact at the target tag
   (`npm run build:integration`, origin root).
2. `vercel deploy --prod --archive=tgz` on `showme-map-prep-production` from `out-mathnexa/`.
3. **Then move the manual alias** — a deploy alone does NOT switch the domain:
   `vercel alias set <new-deployment-url> showme.mathnexa.com --scope bright-path-ed-tech`.
4. Verify the marker: `narration/g3-nbt-round-ten-hundred/manifest.json` frames = 13 (v1.0-era)
   vs 20 (v1.1.0).

## 7. Temporary owner-review infrastructure — KEEP FOR NOW

- `mathnexa-platform-staging` Vercel project + its review deployments (`ha5mtf3h9` et al.)
- `showme-map-prep-staging` Vercel project
- GitHub repo `DesmondQuayson/showme-g3g5-staging` (public Pages staging for the MAP Prep review)

None of these may be archived or deleted without a separate owner instruction.
