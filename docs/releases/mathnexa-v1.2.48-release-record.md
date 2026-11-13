# MathNexa v1.2.48 release record: Google tag GTM-53VDQ6ZL

Released 2026-11-13 06:04:52Z (2026-11-12 evening, US Central). Owner instruction (2026-11-12): Google Ads' "Test installation" reported "Your Google tag wasn't detected on mathnexa.com." Install container `GTM-53VDQ6ZL` with Google's supplied code across the site, change the CSP only as far as needed, keep authentication, subscriptions, payments, games and existing events working, release through the normal pipeline, and verify the live site in a browser.

| | |
| --- | --- |
| Version | `v1.2.48` (annotated tag on the build commit) |
| Build | `af26e11`. `/api/health` reports it. |
| Source branch | `feature/google-tag-gtm`, on `b9e176f` (v1.2.47 record) |
| Staging deployment | `dpl_DkWicty1Yo4d34iEPXk9VJgtPgiX` (build `af26e11`), certify PASS |
| Production runtime | `dpl_DVTiEDA6FhpgEN67g5q9m9XqZBm3`, promoted 2026-11-13 06:04:52Z |
| Rollback runtime | `dpl_DiosYG4hwQRKatbtfS5SoEbyiEwu` (v1.2.47, build `e5decd7`), retained |
| Database | No migration |
| Release worktree | `C:/GitHub/mathnexa-v1-2-48` |

Evidence: `docs/releases/evidence/mathnexa-v1.2.48/`.

## Cause

The container had never been installed. No layout, component or config referenced Google Tag Manager, gtag or a `GTM-`/`AW-` ID, and nothing loaded it dynamically. The site has no consent manager. The platform CSP (`script-src 'self' 'unsafe-inline'`, `connect-src 'self' <supabase>`, `img-src 'self' data: blob:`) would have blocked `www.googletagmanager.com` even if the tag had been added.

The container is live at Google. Its only destination is Google Ads `AW-18462869878` (Google tag with automatic events). It has **no conversion actions or labels**.

## Fix

| | |
| --- | --- |
| Where | `app/layout.tsx` renders `<GoogleTag />` in `<head>`. It is server-rendered, so the tag is in each page's HTML. |
| What | Google's code, verbatim: `<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-53VDQ6ZL">` plus the `window.dataLayer = window.dataLayer \|\| []; function gtag(){…} gtag('js', new Date());` initialisation. Any existing `dataLayer` is kept. |
| Once per document | The root layout is not re-rendered by client-side navigation, and React dedupes `<script async src>` by URL. |
| When | MathNexa builds on Vercel only (`VERCEL_ENV` production or preview). Local development and local e2e never contact Google. |
| Not on student play screens | `/join`, `/games/<id>/play`, Polygon Showdown, Math Race Champions and Math Bingo Live are route-handler documents with their own strict CSP. They never render the root layout and do not load the tag. |
| No raw HTML | The init script is a constant text child (React escapes only `</script`), so the "no `dangerouslySetInnerHTML`" security rule still holds. |
| CSP | Exactly the hosts the live container used when measured in Chrome (zero violations with only these): `script-src` + `https://www.googletagmanager.com https://googleads.g.doubleclick.net`; `img-src` + `https://www.google.com`; `connect-src` + `https://www.google.com https://ad.doubleclick.net`. No wildcard. `form-action`, `frame-src` and the other directives are unchanged. The security baseline pins these lists. |

Files: `apps/platform-web/app/layout.tsx`, `components/analytics/google-tag.tsx` (+ test), `lib/analytics/google-tag.ts`, `lib/security/headers.mjs` (+ `.d.mts`), `test/security/security-baseline.test.ts`, `test/security/internal-game-header-parity.test.ts` (dev-CSP assertion now allows hosts after `'unsafe-eval'`).

## Gates

| Gate | Result |
| --- | --- |
| Typecheck, lint | Pass (8 warnings, all in an untouched file, as before) |
| Unit | 1,740 web (1 skipped) and 245 core; 5 new Google tag tests |
| Security baseline | 327 (1 new: exact Google hosts per directive) |
| Production build, bundle audit, Number Cross audit, Phase 6 audit, protection-bypass tests (47) | Pass |
| Container probe | Google's snippet under the proposed CSP, enforced, installed Chrome: 0 violations, 0 failed requests |

## Staging

`invoke-nextjs-hotfix-staging.ps1 -Stage all`: deploy and certify PASS. On every probed page: 0 console errors, 0 broken images, and the only failed requests were Google `ccm/collect` / `rmkt/collect` beacons aborted when the probe moved to the next page (not blocked).

## Production

preflight → non-aliased candidate → candidate probe → promote → live probe → live HTML and browser checks → logs.

| Check | Result |
| --- | --- |
| Preflight | The apex was serving `dpl_DiosYG4hwQRKatbtfS5SoEbyiEwu` (v1.2.47), as expected |
| Candidate probe | PASS |
| Live probe | PASS; `/api/health` ready, build `af26e11`, payments live |
| Live HTML | `/`, `/sign-in`, `/math-games`, `/privacy` contain `<script async="" src="https://www.googletagmanager.com/gtm.js?id=GTM-53VDQ6ZL">` and one `gtag('js', new Date());`. The second occurrence of the URL is the React Server Components payload, not a second tag. `/join` contains none. The CSP header carries exactly the hosts above. |
| Browser, first load | One gtm.js request, one script element, one init, `google_tag_manager['GTM-53VDQ6ZL']` present. Requests: gtm.js, Ads `viewthroughconversion`, `www.google.com/rmkt/collect`, `/ccm/collect`, `/pagead/1p-user-list`, `ad.doubleclick.net/ccm/s/collect`. No console messages, no CSP violations. |
| Browser, client navigation | Eight navigations in one document (`/` ↔ `/access`, `/sign-in`): still one gtm.js request, one script element, one `gtag('js')`, one container |
| Logs | From promotion onwards: 0 5xx, 0 error, 0 fatal, 0 warning |

The existing `ERR_ABORTED` on Next's `?_rsc` prefetches is unchanged (Chromium aborts a prefetch when navigation overtakes it).

## Not proven by this release

- **Base tag only.** This shows Google's tag loads and fires the Ads page-view and remarketing hits. It does not show that a paid subscription is counted as a conversion. The container has no conversion action. That needs a conversion action in the Google Ads account and a deliberate event on the confirmed-payment path, tested on its own.
- **Consent.** The site has no consent banner, and none was added. The tag runs without consent mode. Visitors in the EEA, UK or Switzerland, and the Privacy Notice (which names Supabase, Stripe, Resend and Vercel but not Google), are owner and legal decisions.
- **Pages the tag runs on.** It runs on every root-layout page, including sign-in, account, subscription and the concealed `/admin`. Anyone who can publish the GTM container can run script on those pages.
- **GTM Preview / Tag Assistant.** Debug mode loads `tagassistant.google.com` and Google fonts, which the CSP does not allow. Normal loading and Google's installation test do not need them.

## Rollback

Not needed. If it is, from `C:/GitHub/mathnexa-v1-2-48`:

```bash
RELEASE_CERTIFIED_RUNTIME=af26e11 RELEASE_ROLLBACK_DEPLOYMENT=dpl_DiosYG4hwQRKatbtfS5SoEbyiEwu HOTFIX_VERCEL_CLI='npx --yes vercel@59' node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

There is no database change to undo.
