# MathNexa v1.2.31 — accurate Terms and Privacy wording and an AI-training crawler opt-out

Released 2026-11-01 (UTC) under explicit owner approval ("Approve release", given after the staging review of
`b54a421`). It ships the staging candidate `b54a421` unchanged.

The release acts on two owner decisions from the review that followed v1.2.30. First, it corrects the outdated
sentences in Terms and Privacy. Both documents stay at version 2026-08-01, and no operator line is added. Second, it
opts AI model-training crawlers out in `robots.txt`, while search crawlers, AI-search crawlers and Google-Extended stay
allowed. It also records the support-address change made on 2026-11-01 without a code change (below).

These areas are unchanged:
- Sign In, Sign Out, Authorize Code and authentication.
- Pricing, Stripe, free trials and entitlements.
- Supabase, Super Admin, databases, API contracts and environment variables.
- Game mechanics, Online Math Prep, Homework and Quiz PDF generation, and the Worksheet Generator.
- The homepage, including the three-play worked example and its Stop control.
- The site footer and ShowMe Math Lab.

| | |
| --- | --- |
| Version | `v1.2.31`. Production was built from `b54a421` (`b54a421120d25319893312991be5ee4f89e33f0d`, tree `a28ce796603f4633b460260589f6063a468bc273`). `/api/health` reports build `b54a421…`. |
| Tag | Annotated tag `v1.2.31` ("MathNexa v1.2.31: accurate Terms and Privacy wording and an AI-training crawler opt-out") points at `b54a421`, the production build. Created and pushed after live verification. |
| Branch | `fix/legal-accuracy-ai-crawler-policy` from `main` `883dde0` (v1.2.30 runtime `7f9cffa` plus its record): `20a8748`, `10e1400` and `b54a421`. |
| Merge | `main` was still `883dde0`, so origin `main` was fast-forwarded through `b54a421` to this record, with no merge commit and no force. The runtime on `main` equals the production build. |
| Certified runtime | `b54a421`. The release ran from a clean detached worktree at that exact commit (`C:/GitHub/mathnexa-p1-staging`, tracked files only, `node_modules` junction). |
| Staging | `dpl_5rnfE9FUHEnJv7UCcgSnMLWbDRbp` (`https://mathnexa-platform-staging-59sbttek3-bright-path-ed-tech.vercel.app`), build `b54a421`. It was compared with the staging build that matched production (`dpl_82FHY1FWJDLjs4LfVgPowEScfqww`: v1.2.30 plus the new support address). Unchanged between the owner's approval and the release. |
| Production candidate | `dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE` (`https://mathnexa-platform-production-6lgt0t77z-bright-path-ed-tech.vercel.app`), built from `b54a421` with `--prod --skip-domain` |
| Production runtime | `dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE`, `production-platform`, payments `live`. Promoted 2026-11-01 04:04:20–04:04:44 UTC. |
| Rollback runtime | `dpl_AbFeGCcCCyygiTArHSpt85g27ioa` (v1.2.30 build `7f9cffa` with the new support address), retained and Ready. `dpl_7Jk4bT58rCjiJ2VLZyY6sqKszf5M` (v1.2.30 with the old address) is also Ready. |
| Migration / environment / dependencies | None / unchanged / unchanged. `MVH_TERMS_VERSION` and `MVH_PRIVACY_VERSION` stay `2026-08-01`, matching `COMMERCIAL_POLICY`, so the billing configuration is untouched. `package.json`, the lockfile and `next.config.mjs` are identical to v1.2.30. |

## What changed for visitors and crawlers

**Terms** (`/terms`, version 2026-08-01):
- **Support.** "Use the MathNexa Support page for help with your account, billing, cancellation, refunds, or account
  deletion." The sentence links to `/support`, so no address appears in the legal text. It replaces the pre-launch
  sentence saying commercial activation stayed blocked until the owner supplied a business identity and a monitored
  support contact.
- **Subscription.** "A MathNexa subscription costs $5.99 USD each month and includes every MathNexa resource." This
  replaces "MathNexa game access costs…".
- **Access** now names every way in:
  - a server-verified trial or active subscription;
  - a school access session opened with a school's code, which lasts up to 12 hours in that browser (the figure is
    taken from `SCHOOL_ACCESS_DURATION_SECONDS`);
  - Math Tug of War, which is free with any signed-in MathNexa account.
- **Deletion.** A deletion request blocks "access to MathNexa resources" (previously "game access").

**Privacy** (`/privacy`, version 2026-08-01):
- **Required information.** "When you start a trial or subscription, MathNexa also keeps your Stripe customer and
  subscription references and a server-side record of your trial or subscription status." This replaces the "later
  requires … entitlement evidence" sentence.
- **New section, "Math Tug of War online rooms".** An online match keeps:
  - the player names typed in (up to 20 characters);
  - the room code and the state of the match;
  - a one-way code for each player's account or school session, which also limits repeated failed join attempts.

  Rooms older than 24 hours are deleted automatically when new rooms are opened. The wording was checked against
  `supabase/migrations/20260927100000_math_tug_of_war.sql`.
- **Retention and controls.** These say "access to MathNexa resources" and "review your access status" instead of
  "game access".

**robots.txt:**
- The `User-Agent: *` group (Allow `/` and the 15 private-route Disallows) and the `Sitemap` line are byte-identical.
- One new group names eight AI model-training crawlers with `Disallow: /`: GPTBot, ClaudeBot, CCBot,
  Applebot-Extended, meta-externalagent, MistralAI-Training, Amazonbot and Bytespider.
- Search and AI-search crawlers stay under `*`: Googlebot, Bingbot, Applebot, OAI-SearchBot, ChatGPT-User,
  Claude-SearchBot, Claude-User, PerplexityBot and the rest.
- Google-Extended also stays under `*`, by owner decision, so Gemini can keep using MathNexa pages.
- Preview and unknown environments still disallow everything.

Files (5): `apps/platform-web/app/terms/page.tsx`, `app/privacy/page.tsx`, `lib/environment/crawl-policy.ts`
(+test), and `app/robots.ts` (comment only).

## Support address (2026-11-01, settings only, no code change)

Before this release, the owner chose their Yahoo address (the one already shown in the site footer) as the public
support address. `support@mathnexa.com` cannot receive mail: `mathnexa.com` has no MX record.

What was done:
- `MVH_SUPPORT_EMAIL` was set to the Yahoo address on staging (Production and Preview targets) and on production.
- v1.2.30's build `7f9cffa` was redeployed through the release pipeline with `RELEASE_PURPOSE=v1.2.30-support-contact-yahoo`.
- The result is production `dpl_AbFeGCcCCyygiTArHSpt85g27ioa`, promoted 2026-11-01 01:25:17–01:25:44 UTC. Its rollback
  is `dpl_7Jk4…`.

Only the `/support` mailto and the homepage JSON-LD contact point changed, because the footer already showed the Yahoo
address. Checks after promotion:
- probe-live 22/22;
- a 27-route diff showing only those two changes;
- subscribers identical;
- runtime logs 0/0/0;
- ShowMe unchanged;
- Stop and three-play checks passing in Chromium and WebKit.

A side effect on staging only: the gated staging alias now serves `dpl_D6Jfr9VYqd4TwhV7jgZg2Nmv7zHL`. It has the same
runtime as the `main` auto-build it replaced, plus the new address.

## Release gates (on `b54a421`, 2026-11-01 02:07–02:40 UTC, local Supabase)

| Check | Result |
| --- | --- |
| Change control vs `main` `883dde0` | 5 files, all on the allowed list. Nothing changed in auth, billing, Stripe, entitlements, Supabase, admin, games, Online Math Prep, PDFs, worksheets, API, proxy, env, dependencies, the footer or the homepage. |
| Typecheck / lint / build | Clean / 0 errors (8 pre-existing warnings) / pass |
| Unit core / web | 245/245; 948 passed, 1 skipped (one more test than v1.2.30, for the crawler groups) |
| `test:security`, protection bypass | 321/321, 7/7; platform bundle and Number Cross audits pass |
| Phase 11 and Quiz PDF audits; Quiz PDF unit tests | Pass, pass; 21/21 |
| Phase 9 | 17/17 |
| School access (Authorize Code) / Tug of War free access | 21/21 / 8/8 |
| Quiz PDFs (includes axe and keyboard) / Number Cross | 20/20 / 1/1 |

The functional harness fails the same 5 "screens" tests as on v1.2.30, because their baselines are older than
v1.2.30's footer change. Compared with the v1.2.30 run's screenshots, 74 of 84 are pixel-identical. The other 10 are:
- Terms and Privacy (intended);
- a masked trial-end date of a different width;
- a shorter Super Admin recent-actions list in the local test data;
- 13 px of anti-aliasing noise.

## Staging verification (`b54a421`, read-only mirrors of both staging builds)

| Check | Result |
| --- | --- |
| 27 signed-out routes vs the production-equivalent staging build | Only `/terms`, `/privacy` and `/robots.txt` differ. The other 24 are identical, including `/`, `/support` and `/sitemap.xml`. |
| `robots.txt` | The unchanged `*` group, then the training group, then the unchanged `Sitemap` line |

## Release pipeline

`scripts/run-nextjs-hotfix-production.mjs` ran from `C:/GitHub/mathnexa-p1-staging` with these values:

- `RELEASE_CERTIFIED_RUNTIME=b54a421`
- `RELEASE_ROLLBACK_DEPLOYMENT=dpl_AbFeGCcCCyygiTArHSpt85g27ioa`
- `RELEASE_PURPOSE=v1.2.31-legal-accuracy-ai-crawler-policy`

Logs are in `qa-artifacts/seo-audit/p1-legal-robots/release/` (git-ignored). The evidence JSONs are under `%TEMP%`.

| Stage | UTC | Result |
| --- | --- | --- |
| preflight (first try) | 03:58:56–03:59:04 | FAIL before any change. The worktree had no `node_modules`, so the local Next.js version check could not run. The same `node_modules` junction the v1.2.30 worktree uses was added; the worktree stayed clean. |
| probe-live (before) | 03:59:04–03:59:16 | PASS, 22/22, expecting `dpl_AbFeGCcCCyygiT…` |
| preflight | 03:59:49–03:59:57 | PASS. The apex served `dpl_AbFeGCcCCyygiT…` (the rollback target), retained. |
| deploy-preview | 04:00:11–04:02:05 | PASS. `dpl_J964YU7xQVDG…` is Ready and protected. Next 16.4.2, sharp 0.35.5. |
| probe-preview | 04:02:19–04:03:28 | PASS, 7/7. Health reports build `b54a421` and payments live. The webhook answers 400 and the scheduler stays closed. The image optimizer works and refuses remote sources. Every other path 308s to the apex. No 5xx. The apex still reported `7f9cffa` at 04:03. |
| promote | 04:04:20–04:04:44 | PASS. The alias moved from `dpl_AbFeGCcCCyygiT…` to `dpl_J964YU7xQVDG…`. |
| probe-live | 04:04:44–04:04:58 | PASS, 22/22 |

## Live production verification (2026-11-01 from 04:05 UTC; read-only and anonymous)

No sign-in, no form submission, no checkout session and no payment.

| Check | Result |
| --- | --- |
| Live build | `/api/health`: `ready`, build `b54a421120d25319893312991be5ee4f89e33f0d`, `production-platform`, payments `live`. The apex serves `dpl_J964YU7xQVDGoWot6Lbhw6UhR2ZE`. |
| Pages (27 routes) vs a capture just before the release | Only `/terms`, `/privacy` and `/robots.txt` differ. The other 24 routes are identical. |
| Terms and Privacy wording | Each new sentence and the new section appear once. "Commercial activation remains blocked", "monitored support contact" and "later requires" are gone. Both pages keep `index, follow` and version 2026-08-01. |
| `robots.txt` / `sitemap.xml` | `robots.txt` grew from 401 to 610 bytes: the old file's `*` group is an unchanged prefix, followed by the training group and the same `Sitemap` line. `sitemap.xml` is byte-identical. |
| Three plays on mathnexa.com, Chromium (1440, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | 3 plays (passes ≈ 4320 ms, rests ≈ 3010 ms), then still for 16.3–17.8 s with 0 px changed and no 4th play. Interruptions, focus hold, answer and reduced motion pass. All checks pass. |
| Stop animation on mathnexa.com, Chromium (1440, 1024, 768, 390, 320 px) and WebKit (iPhone 13, iPad, 1440) | Not in the server HTML and shown while plays remain. Pointer and keyboard Stop work, with focus moved to the board. The button is gone after the third play, absent with reduced motion, and inside the hero at 200% text. axe: 0 violations at 1440, 390 and 320 px with the button showing. All checks pass (04:05–04:24 UTC). |
| Paid subscribers (Stripe vs DB, restricted read-only key) | 4 subscriptions, all live mode (3 active, 1 canceled), Stripe and the database matching. Identical to the read before the release. |
| Runtime logs for `dpl_J964…` since promotion | 5xx, error, fatal: 0, 0, 0. The 7 4xx responses are the live probe's expected answers: webhook 400 (two), scheduler 401, Tug of War online 401, game runtime 401, admin 404 and billing fixture 404. |
| ShowMe Math Lab | `showme.mathnexa.com` unchanged: ETag `"7e686cff57eb2b157144fa0128084aab"`, the same before and after |
| Deployments | The production project gained exactly one deployment (`dpl_J964…`). |

## Known limitations (not verified by this release)

- **Legal review.** The new wording was checked against the code and the database, not by a lawyer. Both documents
  keep version 2026-08-01 by owner decision (editorial corrections), so nobody is asked to accept them again.
- **robots.txt is advisory.** Crawlers that ignore it are not blocked; there is no edge or firewall rule. Crawlers
  re-read `robots.txt` on their own schedule (Google caches it for up to a day).
- **Footer tagline.** The shared footer still says "…required to provide protected game access". The footer was out of
  scope.
- **Signed-in production use.** Nothing here signs in to production. Signed-in behaviour was proven on the same commit
  locally. The owner's manual checks remain.
- **Firefox.** It cannot run on the review machine (Windows App Control), so the owner checks it.
- **Owner-side, still open:**
  - the support email shown in Stripe and the Supabase email sender;
  - optional forwarding for `support@mathnexa.com`, which needs an MX record;
  - public product landing pages.

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-p1-staging
$env:RELEASE_CERTIFIED_RUNTIME = 'b54a421'; $env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_AbFeGCcCCyygiTArHSpt85g27ioa'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_AbFeGCcCCyygiTArHSpt85g27ioa
```

Fallback: `npx vercel@59 promote dpl_AbFeGCcCCyygiTArHSpt85g27ioa --scope bright-path-ed-tech`.

A rollback restores v1.2.30's Terms and Privacy wording and the single-group `robots.txt`. It keeps the new support
address and touches no data, billing or access rule. Rolling back one step further, to `dpl_7Jk4…`, would also restore
`support@mathnexa.com`, which cannot receive mail.
