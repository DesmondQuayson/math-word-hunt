# MathNexa SEO / AEO / GEO / backlinks handoff

Checkpoint: **2026-11-28** (America/Chicago reporting zone).
The owner wants the original full scope and cloud execution while their devices
are off. [Coverage](COVERAGE.md) records each original requirement. Read this
file and [WORKFLOW](WORKFLOW.md) before changing the executor. Reconcile live
state; this document does not transfer ownership to another assistant.

## Current branches and execution

| Item | Verified state |
| --- | --- |
| Public repository | `DesmondQuayson/math-word-hunt` |
| Monitoring [PR #48](https://github.com/DesmondQuayson/math-word-hunt/pull/48) | Merged 2026-11-28 07:37 UTC after its Vercel and public checks passed; main merge commit `4d8cbe1ec23ce55ccc561f012a8cf46bdb994ce0` |
| Full-scope [draft PR #49](https://github.com/DesmondQuayson/math-word-hunt/pull/49) | Branch `codex/seo-full-scope`, base `main`. Application implementation commit `7dab76d9c8d0a3483834add56fcb9b03e5e7231f`; later commits update docs only. Vercel and Preview Comments checks passed after the latest handoff push. Resolve the live head before new work. Application diff is limited to public `/homework-pdfs` copy; **not in production** |
| One recurring SEO workflow | GitHub workflow ID `432326706`, `.github/workflows/mathnexa-seo.yml`, API state `active`, now present on default `main`. Monday **07:00 America/Chicago** using timezone-aware cron (13:00 UTC winter, 12:00 UTC summer). No second SEO scheduler or paid AI execution |
| Hosted main run | [Manual run 46122127317](https://github.com/DesmondQuayson/math-word-hunt/actions/runs/46122127317), `workflow_dispatch`, main merge SHA above, successful tests, state restore, bounded public audit and remote publish |
| Remote persistence | `seo-reports` latest report commit `121dcdd400f5402a611c6669a2d0cd0830bba991`; [latest.json](https://github.com/DesmondQuayson/math-word-hunt/blob/seo-reports/reports/latest.json) records the main SHA, run URL and observation `2026-11-28T07:38:39.217Z`. Fresh `contents` API returned the remote file |
| First scheduled event | **Not yet observed.** Next nominal Monday is 2026-11-30 07:00 CST. A successful manual run establishes hosted execution and remote saving, not scheduled-event delivery |

The GitHub job runs deterministic Node checks while owner devices are off. It
does not run Codex or Claude, edit the site, collect private analytics, observe
AI consumer answers, or send outreach. Schedule events can be delayed or missed;
check the actual event and report after the first Monday. The job has scoped
`contents:write` permission and code restricts report writes to `seo-reports`;
the token itself remains repository-scoped. Report publication uses a previous-
parent check and no force push. No production Vercel project is Git connected;
PR #48's merge did not deploy the website.

## Vercel pause and staging validation

Vercel activity identified the staging project's earlier pause as
`BUDGET_REACHED` under a **previous** cycle's pause-enabled budget. Current
billing/usage was checked privately: the existing Pro subscription's included
usage credit has ample remaining balance and current on-demand spend was zero.
The active budget is notification-only. Staging project
`prj_O61Cyx9WMjc0jljpM9erCiSXsJA0` alone was unpaused; no plan, budget,
spending limit, production project or deployment protection was changed.
PR #48's blocked preview was redeployed and its required Vercel check passed
before the approved merge. Do not put private account balances in this public
repository or its reports.

PR #49 staging deployment `dpl_7wVQ7gEruzofNypfDqsnhNQkwbbi` is **Ready**
with a passing Vercel status. An authorized `vercel curl` GET of
`/homework-pdfs` returned HTTP 200 and rendered HTML containing the answer-first
homework section, fraction example, practice anchor, answer disclosure, canonical
marker and existing `/subscription` destination. A separate unauthenticated
request returned HTTP 302 to Vercel SSO and `X-Robots-Tag: noindex`; preview
protection remains active. The CLI request uses authorized deployment access,
so its 200 does **not** show public accessibility. In-app browser visual/mobile
inspection reached Vercel's authenticator-code prompt; that browser check is
pending owner sign-in. Existing live-page 375/1280 checks and Lighthouse lab
scores predate PR #49 and cannot validate this new rendering.

The source diff adds two semantic sections: a parent practice routine and
`3/4 − 1/8 = 5/8` with equal-part reasoning, a misconception, three checked
practice answers and a stable anchor. It leaves prices, catalog facts,
authentication, subscription, payment, access codes and paid-content gates
unchanged. Exact arithmetic was independently checked. Prior validation on the
application implementation commit: production build, typecheck, targeted ESLint,
50 public page/catalog tests; hosted full-scope run
[46026413021](https://github.com/DesmondQuayson/math-word-hunt/actions/runs/46026413021)
passed 45 SEO tests. PR #49's later commits were docs/handoff only. No new
search traffic, AI visibility, backlink, ranking or payment outcome is claimed.
See [content review](AEO_CONTENT_REVIEW.md) and [mobile diagnostic](MOBILE_DIAGNOSTIC.md).

## Remaining dependencies and owner action

1. **Preview visual check / release:** owner completes Vercel's existing 2FA
   sign-in for the protected preview. Then agent verifies the new page at mobile
   and desktop widths and unchanged gated destinations. Present the concrete
   diff/checks and request the existing manual production-release approval once
   that check is complete. PR #49 stays draft; do not deploy production now.
2. **Direct Google access:** the signed-in identity can open GSC's
   `sc-domain:mathnexa.com` property; its Links and beta generative AI reports
   were read-only inspected. The same identity reaches GA4 onboarding, so GA4
   access/property and stream remain unverified. The `showme-math-lab` Cloud
   project's Google Auth overview has no configured consent screen/OAuth client;
   its TTS service account is unrelated. Owner grants this identity GA4 read
   access and completes a dedicated OAuth consent/client grant for
   `webmasters.readonly` and `analytics.readonly`, then designates a private
   output folder outside Git. No token in chat, public repo, Actions log or
   report branch. A read-only GSC UI comparison of 2026-10-28–11-24 against
   2026-09-30–10-27 was captured in this private conversation; metrics and
   page rows are omitted from public files. Its latest date was chosen to avoid
   the newest processing days, but final-data status is not API-verified.
   [GOOGLE_ACCESS](GOOGLE_ACCESS.md) has direct API commands. No direct API or
   GA4 baseline or verified conversion event yet; no Windsor purchase.
   Durable private cloud analytics needs separately approved credential
   hosting/storage within the **one** scheduler.
3. **Payment baseline:** an authorized billing owner identifies a private
   aggregate source/storage for genuine new payments, renewals, refunds, access
   codes and test-account exclusions. No billing values or customer data may
   enter the public workflow.
4. **AI visibility:** GSC's beta generative AI report showed nonzero impressions
   for an authenticated 28-day UI range. Those are **not** AI answer mentions,
   citations or referrals. [GEO_MEASUREMENT](GEO_MEASUREMENT.md) and the fixed
   panel can account for real consumer-surface answers; zero such answers have
   been observed and mention/citation rates remain unavailable. No paid
   provider fallback is configured.
5. **Backlinks:** GSC Links UI gave a partial external-link snapshot; one public
   linking article was independently opened. No export or referral dataset has
   been saved, and feed/social entries need separate classification.
   [BACKLINKS](BACKLINKS.md) has three additional researched channels and unsent
   individualized drafts. Verify the live public asset and truthful affiliation
   before seeking recipient-specific approval for any outreach.
6. **Upstream and future host:** `AgriciDaniel/claude-seo` is pinned/reviewed at
   `c067311b497eff49110b73d4be33bdd3d7e6b40d`, with a narrow hash-checked
   native Codex adapter. Full Claude commands/hooks and fresh native Claude
   loading remain unverified. Do not claim an assistant handoff or spend credits.

Current working tree also contains unrelated concurrent authentication and
owner-review files. Do not stage, commit, discard or overwrite them as part of
SEO work. Recheck branch/run state before further edits. Public source and
report branches must remain free of analytics, customer, revenue and credential
material. Rollback only reviewed SEO/content changes; retain report history.
