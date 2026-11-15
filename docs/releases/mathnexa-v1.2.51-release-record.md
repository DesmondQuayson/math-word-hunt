# MathNexa v1.2.51 release record: the Google tag is no longer refused on ad landings

Released 2026-11-15 03:08:27Z (2026-11-14 evening, US Central). This closes the two findings recorded for a follow-up in the v1.2.50 release record. Owner approvals: "Yes, stage it" for the staging build, then "Approve release" after the staging results.

| | |
| --- | --- |
| Version | `v1.2.51` (annotated tag on the build commit) |
| Build | `60fe35f`. `/api/health` reports it. |
| Source branch | `fix/google-tag-csp-hosts`, on `e9c05e2` (v1.2.50 record): `f415e97`, `93bf706`, `60fe35f` |
| Staging deployment | `dpl_BAKdqdZDjvNpBdhuWtLyyJuhT3W6` (build `93bf706`; `60fe35f` adds only a fix to one browser test) |
| Production runtime | `dpl_G1VvgqVGyKzXRh47o59f9fVLSfdx`, promoted 2026-11-15 03:08:07–03:08:27Z |
| Rollback runtime | `dpl_EC4eQfcPYodg9qATVQvCVD83coiU` (v1.2.50, build `8907692`), retained |
| Database | No change |
| Environment | Unchanged. `MVH_ADS_FEED_PASSWORD` is still not set, so the conversion file still answers 404. |
| Release worktree | `C:/GitHub/mathnexa-v1-2-51` |

Evidence: `docs/releases/evidence/mathnexa-v1.2.51/`.

## Cause

The site's Content Security Policy listed the hosts the Google tag (`GTM-53VDQ6ZL`) used when it was measured for v1.2.48. That measurement loaded pages without an ad click identifier. On a landing URL that carries `gclid`, `gbraid` or `wbraid`, the tag asks for one more host, and the policy refused it.

Measured on the live site just before this release (108 page loads: 9 pages, 3 loads each, in Chromium, WebKit, a Pixel 7 profile and an iPhone 14 profile):

| Refused request | Count | Where |
| --- | --- | --- |
| `connect-src https://www.googleadservices.com/pagead/set_partitioned_cookie` | 72 | every ad landing, all four profiles |
| `img-src https://www.googleadservices.com/pagead/set_partitioned_cookie` | 72 | the tag's retry of the same request as an image |
| `img-src https://www.googletagmanager.com/a` | 5 | the tag's diagnostics ping, sent for a sample of loads |

An earlier measurement (72 loads) also saw `img-src https://www.googletagmanager.com/td`, the second diagnostics ping.

Effect before the fix: console messages, and Google's own partitioned click cookie was not set on an ad click. The conversions recorded on the server (v1.2.50) never depended on it.

## Fix

`GOOGLE_TAG_SOURCES` in `apps/platform-web/lib/security/headers.mjs` gains two hosts:

| Directive | Added | Why |
| --- | --- | --- |
| `connect-src` | `https://www.googleadservices.com` | the tag's `/pagead/set_partitioned_cookie` call on an ad landing |
| `img-src` | `https://www.googletagmanager.com` | the tag's diagnostics pings (`/td`, `/a`) |

- **No script host changes**, so no new code can run on the pages.
- **`img-src` does not gain `www.googleadservices.com`.** The image request was only the retry of the refused fetch. With the fetch allowed it is never made (0 in 108 loads on staging and 0 in 108 loads live).
- **No wildcard.** Each host is listed exactly.

Also in this branch, none of it shipped to visitors:

- `test/security/security-baseline.test.ts` pins the new lists.
- `scripts/probe-google-tag-csp.mjs` lists every request the policy refuses while the tag runs, ad landings included (`--live`, or the `csp` stage of `invoke-ads-conversions-staging.ps1`).
- The hosted staging review checks the policy on an ad landing, which is where the first measurement missed this.
- `e2e/ads-conversions/funnel.spec.ts` waits out the Checkout return page's own redirect before it navigates (a race in the test, seen once in WebKit).

## Gates

| Gate | Result |
| --- | --- |
| Typecheck, lint | Pass on `60fe35f` (8 warnings, all in an untouched file, as before) |
| Unit | 245 core and 1,786 web (1 skipped). The first full run failed one unrelated test at its 5-second limit (`lib/games/math-race-champions/traffic.test.ts`); the rerun was clean. |
| Security suite | 353 on `60fe35f`, plus the bundle and Number Cross audits |
| Production build | Pass |
| Homepage and public pages | 31/31 |
| School access | 21/21 |
| Funnel in browsers (`e2e/ads-conversions`) | 64 of 64 on `60fe35f`. The first run failed one WebKit navigation in the test itself; `60fe35f` fixes the test. |

## Staging

- Refusal probe on `dpl_BAKdqdZDjvNpBdhuWtLyyJuhT3W6`: 108 page loads, 0 refusals. `set_partitioned_cookie` completed 36 times (HTTP 200).
- Hosted review: 32 of 32 checks in each of the four profiles. Synthetic accounts were deleted afterwards.

## Production

Preflight → non-aliased candidate → candidate probe → promote → live probe → live checks. No database step.

| Check | Result |
| --- | --- |
| Preflight | The apex was serving `dpl_EC4eQfcPYodg9qATVQvCVD83coiU` (v1.2.50), as expected |
| Live probe before | PASS, 22/22 |
| Candidate probe | PASS, 7/7. The candidate's policy header carried exactly the two new hosts. |
| Live probe after | PASS, 22/22; `/api/health` ready, build `60fe35f`, payments live |
| Policy header, before vs after | `img-src` and `connect-src` gained one host each. Every other directive, and every other security header, is unchanged. |
| Refusal probe, live (108 loads) | Before: 149 refusals. After: 0. `set_partitioned_cookie` completed 36 times (HTTP 200); the diagnostics ping completed. |
| Live browsers (Chromium, WebKit, Pixel 7 and iPhone 14 profiles; anonymous) | 14 of 14 checks in each (13 of 14 after v1.2.50; the failing check was this one). Consent defaults, Global Privacy Control and the Privacy page switch behave as in v1.2.50. |
| Pages (32 routes) vs a capture just before | 32 identical. `robots.txt` and `sitemap.xml` are byte-identical. |
| `/api/ad-click` | Cross-site: 403. Same-origin with a click identifier: 204 and the HttpOnly cookie, as before. |
| Conversion file | 404: still closed until the password is set |
| Homepage three plays and Stop (Chromium and WebKit) | Both checks pass in full: plays, rests, Stop by pointer and keyboard, interruptions, reduced motion. The console message flagged after v1.2.50 is gone. |
| Paid subscribers (Stripe vs database, read-only) | 6 subscriptions, all live mode and matching; identical before and after |
| Logs from promotion onwards | 0 5xx, 0 error, 0 fatal. The 4xx responses are the live probe's expected answers and this record's own checks. |
| ShowMe Math Lab | ETag unchanged |
| Deployments | The production project gained exactly one deployment |

## Not proven by this release

Unchanged from v1.2.50:

- **Google Ads receiving a conversion.** It needs the owner's conversion actions and Data manager connection, and a real ad click.
- **Physical Safari and phones.** WebKit and phone profiles were used.
- **The Google Ads account itself** was not inspected.

New here:

- **What the partitioned cookie changes in Google Ads reporting.** The request now completes. Whether it changes any number in the account can only be seen there.

## Owner steps (unchanged from v1.2.50)

1. Set `MVH_ADS_FEED_PASSWORD` (24 characters or more) in the production Vercel project and redeploy.
2. In Google Ads, create the conversion actions `account_created`, `trial_started` (both secondary) and `subscription_started` (primary, value per conversion), then connect the file in Data manager with the user name `mathnexa-ads-feed` and that password, daily.
3. Turn off automatic user-provided data detection on the Google tag.
4. Keep the paused ad group paused until the first import has run.

## Rollback

Not needed. If it is, from `C:/GitHub/mathnexa-v1-2-51`:

```bash
RELEASE_CERTIFIED_RUNTIME=60fe35f RELEASE_ROLLBACK_DEPLOYMENT=dpl_EC4eQfcPYodg9qATVQvCVD83coiU HOTFIX_VERCEL_CLI='npx --yes vercel@59' node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

A rollback only brings the console messages back. Nothing else depends on this release.

## Addendum: redeploy for the feed password (2026-11-15 04:57Z)

The owner approved a production redeploy of the same commit so that `MVH_ADS_FEED_PASSWORD`, added to the production
Vercel project the same day, takes effect. No code changed, and there is no new version or tag.

| | |
| --- | --- |
| Production runtime | `dpl_EGGuePFbKkpQzj4BrjA15TGCmrqh`, build `60fe35f` (the same tree, `74b98dc`), promoted 04:57:04–04:57:24Z |
| Previous runtime | `dpl_G1VvgqVGyKzXRh47o59f9fVLSfdx` (the same build without the variable), retained |
| Pipeline | Preflight PASS; live probe 22/22 before and after; candidate probe 7/7 |
| Conversion file | Before: 404. After: 401 without a credential or with a wrong one; 200 with the stored credential, `text/csv`, `no-store`, the header row and 0 data rows |
| Pages (32 routes) | 32 identical; `robots.txt`, `sitemap.xml` and the CSP header byte-identical |
| Paid subscribers | 6, identical before and after |
| Logs since promotion | 0 5xx, 0 error, 0 fatal |
| ShowMe Math Lab | ETag unchanged |

To close the file again, remove the variable and redeploy, or move the alias back to
`dpl_G1VvgqVGyKzXRh47o59f9fVLSfdx` with the rollback stage (`RELEASE_ROLLBACK_DEPLOYMENT` set to that id).
