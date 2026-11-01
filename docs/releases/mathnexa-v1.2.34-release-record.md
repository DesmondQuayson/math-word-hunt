# MathNexa v1.2.34 — the accessibility statement is crawlable again

Released 2026-11-01 (UTC) under explicit owner approval ("Approve release", given after the staging review of the P4
robots fix; the owner chose "Robots fix only" from the post-v1.2.33 review). It ships the staged runtime unchanged:
staging and production were both built from `8de8407`.

**Why.** `robots.txt` rules are prefix matches. `Disallow: /access` (the Authorize Code page) also matched
`/accessibility`, the accessibility statement, which the sitemap lists. Every search engine and link-preview crawler
was told not to fetch it. The overlap dates from v1.1.0 (`0919985`, 2026-08-04), long before the 2026-11-01 SEO
releases, and the existing test only checked the five product pages.

These areas are unchanged:
- every `Disallow` line, the AI-training crawler group and the `Sitemap` line;
- every page, the sitemap, metadata and structured data;
- Sign In, Sign Out, Authorize Code and authentication;
- Pricing, Stripe, free trials and entitlements;
- Supabase, Super Admin, databases, API contracts, environment variables and `proxy.ts`;
- game mechanics, Online Math Prep, Homework and Quiz PDF generation, and the Worksheet Generator;
- the header menu, and the homepage's three-play worked example and Stop control;
- ShowMe Math Lab.

| | |
| --- | --- |
| Version | `v1.2.34`. Production was built from `8de8407` (`8de840705355f6e0346d328aa9b045234f9fc576`, tree `38fafe6735733aa7602ce8527729966cf82eef86`). `/api/health` reports build `8de8407…`. |
| Tag | Annotated tag `v1.2.34` ("MathNexa v1.2.34: the accessibility statement is crawlable again") points at `8de8407`, the production build. Created and pushed after live verification. |
| Branch | `fix/p4-accessibility-crawlable` from `main` `1c45798` (v1.2.33 runtime `6dbec58` plus its record): `8de8407`. |
| Merge | `main` was still `1c45798`, so origin `main` was fast-forwarded through `8de8407` to this record, with no merge commit and no force. The runtime on `main` equals the production build. |
| Certified runtime | `8de8407`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-p4-staging`, tracked files only, `node_modules` junction). |
| Staging | `dpl_5TTxBCo8FTMYzrSuCd9o15qVfAJD` (`https://mathnexa-platform-staging-nsljjkl9e-bright-path-ed-tech.vercel.app`), build `8de8407`, compared with the v1.2.33 staging build (`dpl_35G7dkuDy8pEoPWPQfvzn16thNiy`). Unchanged between the owner's approval and the release. |
| Production candidate | `dpl_Br4muBiiqyYKayibX3TnYPhjKmpW` (`https://mathnexa-platform-production-f2p6kmhqc-bright-path-ed-tech.vercel.app`), built from `8de8407` with `--prod --skip-domain` |
| Production runtime | `dpl_Br4muBiiqyYKayibX3TnYPhjKmpW`, `production-platform`, payments `live`. Promoted 2026-11-01 19:26:06–19:26:30 UTC. |
| Rollback runtime | `dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF` (v1.2.33, build `6dbec58`), retained and Ready. `dpl_7sprSZ1P5fQe47EvHjLrTqP6kVbh` (v1.2.32) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged. `package.json`, the lockfile and `next.config.mjs` are identical to v1.2.33. |

## What changed

The `*` group of `robots.txt` gains one line, `Allow: /accessibility`, after `Allow: /`. Google, Bing and other
RFC 9309 crawlers apply the longest matching rule, so `Allow: /accessibility` (14 characters) wins over
`Disallow: /access` (7) for that page only. `/access` itself, including `/access?next=…`, stays disallowed, and no
private route starts with `/accessibility`.

```diff
 User-Agent: *
 Allow: /
+Allow: /accessibility
 Disallow: /access
```

Files (4):
- `apps/platform-web/lib/environment/crawl-policy.ts`: `PLATFORM_CRAWL_ALLOW = ["/", "/accessibility"]`, used by the
  platform rule; `CrawlRule.allow` accepts a list.
- `apps/platform-web/lib/environment/crawl-policy.test.ts`: the pinned rules, plus two tests with an RFC 9309 matcher
  (longest match wins, Allow wins a tie). Every sitemap URL must be crawlable by Googlebot, Bingbot, Applebot,
  DuckDuckBot, OAI-SearchBot and PerplexityBot in both production modes, and 16 private routes must stay blocked. On the
  v1.2.33 policy the first test fails with "production-platform: Googlebot /accessibility: expected false to be true".
- `apps/platform-web/lib/branding/app-icons.test.ts`: `allow` is now a list that contains `/`.
- `apps/platform-web/app/robots.ts`: comment only.

## Release gates (on `8de8407`, 2026-11-01 18:38–19:11 UTC, local Supabase)

| Check | Result |
| --- | --- |
| Change control vs `main` `1c45798` | 4 files, all on the owner-approved list |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 1016 passed, 1 skipped (2 more than v1.2.33) |
| `test:security` | 321/321; platform bundle and Number Cross audits pass |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Phase 9 | 30/30 |
| School access (Authorize Code) / Tug of War free access | 21/21 / 8/8 |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |

The functional harness fails the same four "screens" tests as v1.2.30–v1.2.33, because their baselines are older than
v1.2.30's footer, and this time also "super admin". Compared with the v1.2.33 run, 76 of 84 screenshots are
identical. None of the eight differences comes from this change:
- the homepage at desktop width (4 views): the v1.2.33 run still showed the old Grade 7 quiz drawing from a cached
  image; this run shows the Grade 6 drawing that is live;
- the Subscription page (2): a masked time value is slightly wider;
- the Super Admin dashboard (2): an email and webhook status badge reads "Healthy" instead of "No events", from the
  event count in the local test database.

## Staging verification (read-only mirrors of both staging builds)

| Check | Result |
| --- | --- |
| 32 signed-out routes vs v1.2.33 staging | 31 identical: status, redirects, robots meta, canonical, title, visible text and JSON-LD. `robots.txt` gains only `Allow: /accessibility`. |
| `robots.txt` text | Byte-identical to Next.js's rendering of the new rules |
| robots.txt vs sitemap (RFC 9309) | All 12 sitemap URLs are crawlable by search and link-preview crawlers and closed to the eight AI-training crawlers. All 16 private routes are blocked. The same check fails on v1.2.33 for `/accessibility`. |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-p4-staging` with these values:

- `RELEASE_CERTIFIED_RUNTIME=8de8407`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF`
- `RELEASE_PURPOSE=v1.2.34-accessibility-crawlable`

Logs are in `qa-artifacts/seo-audit/p4-accessibility-robots/release/` (git-ignored). The evidence JSONs are under
`%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight | 19:22:03–19:22:13 | PASS. The apex served `dpl_GT3UTDWqhEvB…` (the rollback target), retained. |
| probe-live (before) | 19:22:13–19:22:25 | PASS, 22/22 |
| deploy-preview | 19:22:35–19:24:36 | PASS. `dpl_Br4muBiiqyYK…` is Ready and protected. Next 16.4.2, sharp 0.35.5, tree `38fafe6`. |
| probe-preview | 19:24:46–19:25:56 | PASS, 7/7. The apex still reported `6dbec58` afterwards. |
| promote | 19:26:06–19:26:30 | PASS. The alias moved from `dpl_GT3UTDWqhEvB…` to `dpl_Br4muBiiqyYK…`. |
| probe-live | 19:26:31–19:26:45 | PASS, 22/22 |

## Live production verification (2026-11-01 from 19:26 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `8de840705355f6e0346d328aa9b045234f9fc576`, `production-platform`, search indexing `enabled`, payments `live`. The apex serves `dpl_Br4muBiiqyYKayibX3TnYPhjKmpW`. |
| `robots.txt` | Grew from 610 to 632 bytes by exactly `Allow: /accessibility`. Byte-identical to staging. |
| robots.txt vs sitemap (RFC 9309) | All 12 sitemap URLs are crawlable by search and link-preview crawlers (`/accessibility` through `Allow: /accessibility`) and closed to the AI-training crawlers. All 16 private routes are blocked. |
| Pages (32 routes) vs a capture just before the release | 31 identical. Only `robots.txt` differs. `sitemap.xml` is byte-identical. `/accessibility` returns 200 with `index, follow` and no `X-Robots-Tag`. |
| Three plays on mathnexa.com, Chromium (1440, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | 3 plays (passes ≈ 4320 ms, rests ≈ 3010 ms), then still for 16.3–17.8 s with 0 px changed and no 4th play. Interruptions, focus hold, answer and reduced motion pass. All checks pass (19:35–19:46 UTC). |
| Stop animation on mathnexa.com, Chromium (1440, 1024, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | Not in the server HTML and shown while plays remain. Pointer and keyboard Stop work. The button is gone after the third play and absent with reduced motion. With 200% text the page does not overflow. axe: 0 violations at 1440, 390 and 320 px with the button showing. All checks pass (19:27–19:36 UTC). |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4 subscriptions, all live mode, Stripe and the database matching. Identical to the read before the release. |
| Runtime logs for `dpl_Br4mu…` since promotion | 5xx, error, fatal: 0, 0, 0. The 4xx responses are the live probe's expected answers: webhook 400, admin 404, scheduler 401, billing fixture 404, game runtime 401 and Tug of War online 401. |
| ShowMe Math Lab | `showme.mathnexa.com` unchanged: ETag `"7e686cff57eb2b157144fa0128084aab"`, the same before and after |
| Deployments | The production project gained exactly one deployment (`dpl_Br4mu…`). |

## Known limitations and owner follow-ups

- **Search engines re-read `robots.txt` on their own schedule** (Google caches it for up to a day). In Search Console,
  inspect `/accessibility` and request indexing, and resubmit the sitemap.
- **`robots.txt` is advisory.** It does not keep anything private; the sign-in wall does.
- **Carried over from v1.2.33:**
  - In Super Admin, set Math Vocabulary Hunt's grade minimum to 6. The game's vocabulary data covers Grades 6–8.
  - The lowercase "grade 6" PDF grade title.
  - The Firefox "Zoom text only" check.
  - Refreshing link previews in Facebook's Sharing Debugger and LinkedIn's Post Inspector.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-p4-staging
$env:RELEASE_CERTIFIED_RUNTIME = '8de8407'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF
```

Fallback: `npx vercel@59 promote dpl_GT3UTDWqhEvBq1EABG9d1qtnMrqF --scope bright-path-ed-tech`.

A rollback returns v1.2.33's `robots.txt` without the `Allow: /accessibility` line, so `/accessibility` is blocked for
crawlers again. It touches no data, billing or access rule.
