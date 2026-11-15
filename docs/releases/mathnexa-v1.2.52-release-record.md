# MathNexa v1.2.52 release record: the pass that opens ShowMe Math

Released 2026-11-15 20:12Z (14:12 US Central). This is MathNexa's half of closing ShowMe Math to visitors without access. The other half is a ShowMe release (`mathnexa-map-prep-v1.2.23`). Owner instruction: "make sure you correct it one should sign up or subscribe where neccessary unless he has access to code", then "Approve release" after the staging report.

| | |
| --- | --- |
| Version | `v1.2.52` (annotated tag on the build commit) |
| Build | `df7f4da`. `/api/health` reports it. |
| Source branch | `feature/showme-access-pass`, on `415eea2` (v1.2.51 record): `1806042`, `3c70f32`, `df7f4da` |
| Staging deployment | `dpl_7V8R2q4c9oS13fgBpZCBjS7nbnay` (build `df7f4da`) |
| Production runtime | `dpl_GrToXUMK37z4dSN4QCxGmcWTQTFZ`, promoted 2026-11-15 20:11:58Z |
| Rollback runtime | `dpl_9AVnNMSBY65vpFiRth7iLR7CVAfP` (v1.2.51, build `60fe35f`), retained |
| Database | No change |
| Environment | One new production variable, `MVH_SHOWME_ACCESS_SECRET` (Sensitive), added before the deployment. Its value was never displayed; the owner's copy is in the protected store. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-52` |

Evidence: `docs/releases/evidence/mathnexa-v1.2.52/`. Design: `docs/showme-access-gate.md`.

## What was wrong

ShowMe Math (Online Math Prep and the Worksheet Generator, at `showme.mathnexa.com`) is a static site with no accounts. Only MathNexa's own entries, `/map-prep` and `/worksheets`, checked access before redirecting there. The address itself served every page to anyone who had it, search engines could index it, and four advertisement sitelinks linked straight into it. The product was reachable with no account, trial, subscription or access code.

## What this release does

`GET /map-prep/pass` is where the ShowMe host will send a visitor who has no access pass.

- **Same check.** It makes the decision `/map-prep` and `/worksheets` already make: an account with a trial or a subscription, or a school access code.
- **With access:** the browser gets the cookie `mathnexa-showme-pass` and a redirect to the ShowMe page it asked for.
- **Without access:** the ordinary flow, `/access`, `/confirmation-required` or `/subscription` with `next=/map-prep`. The page asked for is remembered for 30 minutes, so a student's assignment link still opens after the access code is entered.
- **The pass:** a version and two times, twelve hours apart, signed with HMAC-SHA256 under a secret shared with ShowMe. It holds nothing about a person. The cookie is `HttpOnly`, `Secure`, `SameSite=Lax`, and on the live site is set for `mathnexa.com` and its subdomains so that ShowMe receives it.
- **Where it can send anyone:** one of two ShowMe origins named in the code. Nothing in a request can name another.
- **Taking it away:** signing out and "Exit authorized access" clear it.
- **Closed by default:** without `MVH_SHOWME_ACCESS_SECRET` the route answers 404 and no pass is issued.

Also in this branch:

- `lib/access/server.ts` gains `productAccessDenialHref`, the decision `requireProductAccess` makes, so the route can send its own redirect. `requireProductAccess` behaves as before.
- The Privacy page has a section, "Online Math Prep access", describing the cookie.
- `e2e/phase9/navigation-performance.spec.ts` uses ShowMe's Privacy page as its fixture destination, because the live ShowMe site will no longer open without a pass.
- `scripts/review-showme-pass-staging.mjs` and `scripts/invoke-showme-pass-staging.ps1`: the hosted staging review.

On its own this release changes nothing a visitor can see except the Privacy page: ShowMe stays open until its own release.

## One fault found on staging and fixed

The first staging review failed one check in both browsers: the redirect for a visitor without access carried the platform's default `Cache-Control: public, max-age=0, must-revalidate`, because the route let `requireProductAccess` throw its redirect. `df7f4da` makes the route send that redirect itself, marked `no-store` like its other answers. The review then passed.

## Gates (on `df7f4da`)

| Gate | Result |
| --- | --- |
| Typecheck, lint | Pass (8 warnings, all in an untouched file, as before) |
| Unit | 245 core and 1,820 web (1 skipped). The full run failed one unrelated test at its 5-second limit (`lib/games/math-race-champions/traffic.test.ts`); alone it passed 16 of 16. |
| Security | 372, including 19 new tests for the pass route |
| Build | Pass; `/map-prep/pass` is a dynamic route |
| School access e2e | 24 of 24, including the new case: no pass without access, a pass for a code holder, the remembered page, the pass cleared on exit |
| Phase 9 e2e | 31 of 31 |
| Ads conversions e2e | 64 of 64 |
| Hosted staging review | 64 of 64 (16 checks in Chromium, WebKit, a Pixel 7 profile and an iPhone 14 profile); 0 synthetic accounts left |
| Database tests | Not run: no database change |

## Release

| Step | Result |
| --- | --- |
| Variable added | `MVH_SHOWME_ACCESS_SECRET`, production, Sensitive, from the protected store on standard input |
| Preflight | Pass: the apex served `dpl_9AVnNMSBY65vpFiRth7iLR7CVAfP` |
| Candidate | `dpl_GrToXUMK37z4dSN4QCxGmcWTQTFZ`, built from `df7f4da` (tree `0a52237`) with `--prod --skip-domain`; the alias did not move |
| Candidate probe | Pass |
| Promote | 2026-11-15 20:11:58Z |
| Live probe | Pass |

## After the release (read-only)

- `/api/health`: build `df7f4da`.
- `/map-prep/pass` with no session: 307 to `/access?next=/map-prep`, `no-store`, `noindex`, no pass; the page asked for is remembered. The same address answered 404 before.
- A hostile `to` and `site` cannot change where the visitor is sent.
- 32 public routes compared before and after: 31 identical; `/privacy` gained its section.
- `robots.txt`, `sitemap.xml` and the Content-Security-Policy header: byte-identical.
- Subscribers: read-only check passed, unchanged.
- Logs: no 5xx response and no error line in the 30 minutes after promotion.

## Not proven here

A real account receiving a pass on the live site and entering ShowMe with it. Staging cannot show it end to end (MathNexa's staging host is not on the `mathnexa.com` domain, so the cookie cannot reach a ShowMe host), and no synthetic account is created in production. Each half is proven separately and they share a fixed test vector. The owner confirms real entry after the ShowMe release; if it fails, ShowMe is rolled back.

## Rollback

```bash
RELEASE_CERTIFIED_RUNTIME=df7f4da RELEASE_ROLLBACK_DEPLOYMENT=dpl_9AVnNMSBY65vpFiRth7iLR7CVAfP HOTFIX_VERCEL_CLI='npx --yes vercel@59' node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

Run from `C:/GitHub/mathnexa-v1-2-52`. Roll ShowMe back first if its gate is live: with this release gone, the pass route answers 404 and a gated ShowMe would turn every visitor away.
