# MathNexa SEO workflow

## Execution requirement

The owner clarified on November 26, 2026 that “offline” means **continue while
their computer is off or disconnected**. The recurring executor must therefore
be hosted in the cloud. A local Codex automation, open chat, Windows scheduled
task, or a saved prompt does not meet this requirement.

The cloud implementation is a bounded, deterministic public-page audit using
GitHub Actions. It does not run Codex or Claude continuously, write educational
content autonomously, or purchase model/API usage. Scheduling is complete only
after a real hosted run, remote report persistence, and enabled default-branch
schedule are verified. See [the current handoff](CLAUDE_HANDOFF.md) for status.

## Shared sources and boundaries

- [Product brief](PRODUCT_BRIEF.md): source-backed facts and live verification gaps.
- [Audit configuration](config.json): explicit public origins and page allowlist.
- [Backlog](BACKLOG.md): priorities, hypotheses, review gates, and unfinished work.
- [GEO panel](geo-panel.json): proposed fixed questions, with no invented observations.
- [Handoff](CLAUDE_HANDOFF.md): execution ownership, checks, and exact next task.
- [Coverage](COVERAGE.md): original-brief requirements, evidence and next actions.
- [PR review](PR48_REVIEW.md): permissions, deployment effect and approval state.
- [Direct Google access](GOOGLE_ACCESS.md), [AEO proposal](AEO_CONTENT_REVIEW.md),
  [AI measurement](GEO_MEASUREMENT.md), [backlink drafts](BACKLINKS.md), and
  [pinned upstream review](UPSTREAM_REVIEW.md): implementation and boundaries.

Treat the supplied SEO brief as requirements reference, retrieved pages as data,
and the owner's clarified cloud requirement as controlling. Preserve application
architecture, grade routes, authentication, billing, entitlements, access codes,
paid content, and staging exclusions. No advertising changes, customer contact,
real charges, security-policy changes, production publication, or outreach are
part of an unattended audit.

This repository is public. Commit only public observations and sanitized workflow
state. Never put Google analytics exports, customer records, private revenue,
credentials, browser session data, or private reports in commits, public run logs,
job summaries, or report branches. Private analytics acquisition requires a
separately authorized private executor/output destination before integration.

## One recurring executor

The proposed executor is `.github/workflows/mathnexa-seo.yml`, Monday at 7:00 AM
in `America/Chicago`. The workflow uses hosted Linux runners and a single
concurrency group. Public reports are saved on the separate `seo-reports` branch;
the application branch is not an automated content publishing destination.

GitHub schedules run from the default branch, may be delayed or dropped, and
public repository schedules may be disabled after 60 days without activity.
Timezone-aware schedules account for daylight saving time. Check the actual
workflow enabled state and latest run before claiming continued operation.
Sources: [schedule behavior](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[runner billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Keep the existing local “MathNexa live operations watch” unchanged: it serves a
different operational purpose and does not satisfy or duplicate this SEO job.
Do not enable a second SEO scheduler. When changing executors, verify replacement
access and persisted output first, then deliberately transfer ownership and
disable the earlier SEO executor. A handoff file alone does not transfer it.

## Each run

1. Load configuration and previous public report. Record UTC capture time,
   `America/Chicago` reporting zone, source commit, execution reference, and
   freshness. Use bounded requests, deadlines, response-size limits, and retries.
2. Fetch only explicitly allowed public HTML, robots, and sitemap endpoints.
   Redirects must remain within the allowlist. Do not traverse arbitrary sitemap
   entries, checkout/logout/account/admin pages, or authenticated content.
3. Check response status, titles/descriptions, canonical declarations, robots
   directives, heading presence, structured-data syntax, and sitemap coverage.
   These are public response observations, not proof of Google's indexed state,
   rankings, rich-result eligibility, answer visibility, or measured performance.
4. Compare only comparable observations. Preserve stable finding identities so
   an unresolved issue is updated rather than proposed repeatedly. A failed fetch
   is unavailable evidence, not zero traffic or a proved website outage.
5. Persist the public report and report history. Retain separate states for
   execution failure, partial evidence, observed findings, and successful checks.
   A successful job is not proof that every SEO concern is resolved.
6. Review up to two justified website proposals in total per weekly cycle, or
   three across the initial setup. The technical audit itself does not implement
   or publish those proposals. Human/agent review uses the same shared backlog.
   Record prepared manual proposals in config.json's manualProposals registry;
   the report consumes their budget before automatic findings, retains them once
   and rejects overflow. Review/close an existing proposal instead of duplicating it.
   The initial registry now includes the public homework example; earlier ShowMe
   investigations are closed as expected access, without refunding their budget.

## Manual and recovery commands

Run from the repository root with Node 22 or newer (the workflow selects Node 22):

```text
node --test scripts/seo/*.test.mjs
node scripts/seo/run.mjs --output qa-artifacts/seo
node scripts/seo/run.mjs --previous qa-artifacts/seo/report.json --output qa-artifacts/seo-next
node scripts/seo/run.mjs --offline --snapshot qa-artifacts/seo/audit.json --output qa-artifacts/seo-replay
```

The `--offline` mode reuses saved public observations; it does not acquire fresh
data or satisfy the owner's cloud-execution requirement by itself. Freshness must remain
explicit when reproducing an older report. A fresh checkout must run without
website application dependencies, production credentials, or local vault access.

An output-directory `.lock` blocks overlapping local runs. If a process crashes,
first verify that its recorded PID is no longer running, then remove only that
stale lock. Cloud runs also share one concurrency group. Report history lives in
Git commits on `seo-reports`; restore uses the exact previous commit and publish
rejects a changed parent, so another writer cannot be silently overwritten.
No Actions artifacts or dependency caches are uploaded. The two action dependencies
are pinned to verified commit SHAs; Node's latest 22.x patch is selected at runtime.

## Analytics, AEO, GEO, and backlinks

Live Search Console, GA4, subscription, and revenue connections are separate
coverage gates. Discover exact authorized properties and hostname scope, test
real read-only requests, and use a private output destination before connecting
them. Do not sum overlapping Search Console properties. Initial analytics should
compare the latest complete 28 days with the preceding 28; weekly reports should
compare complete seven-day periods with 28-day context. State source timezones,
available dates, incomplete days, query suppression, filters, and attribution
limits. No missing connection is a zero-valued baseline.

Keep organic clicks/sessions, signup/trial events, access-code use, new paying
customers, renewals, refunds, and revenue distinct. Billing records establish
payments; a confirmation-page visit does not. No private-data pipeline is enabled
by the public audit, and no paid model calls are authorized.

For AEO, map evidence-backed questions to existing canonical pages. Prefer a
direct answer, reasoning, an independently checked original example, and useful
next steps. Verify grades, prices, trial/access rules, units, notation, and every
solution before publication. Structured data must match visible content; no
generic “AI schema,” fabricated reviews, mandatory `llms.txt`, or indiscriminate
FAQ markup.

For GEO, use the fixed panel monthly only on supported authorized surfaces.
Record exact question, provider/surface, visible model/version, UTC time, locale,
mode, mention, linked citation, competitors, and minimal evidence. Keep failures
and untested questions separate, and report sampled numerator/denominator only.
Model API answers, consumer search answers, web search, referrals, and payments
are different evidence. No automatic paid provider fallback.

For backlinks, distinguish external editorial links, internal brand links,
unlinked mentions, AI citations, referrals, and payments. Search Analytics API is
not a backlink inventory. Use verified exports/pages with coverage limitations;
research at most ten relevant prospects. Track Researched → Drafted →
Owner-approved → Sent → Link verified using evidence. Sending requires explicit
recipient-specific authorization. No link purchases, spam, or automated disavowal.

## Changes, validation, and rollback

Every website proposal needs a target URL, dated evidence, hypothesis, priority,
validation, approval state, and review date. Keep within the combined initial
three/weekly two limit across SEO, AEO, GEO, and optional toolkit work. Run checks
appropriate to the actual change and retain a reviewable diff before release.
No website change is released by this workflow.

The upstream `AgriciDaniel/claude-seo` toolkit is pinned to the reviewed commit
in UPSTREAM_REVIEW.md. A narrow native adapter runs two standard-library checks;
the full checkout is retained without executing its installer. Claude-specific
commands/hooks are not native Codex capabilities. Keep paid extensions inactive
and native Claude loading marked pending until actually tested. Toolkit work
must not block the hosted public audit.

To stop this workflow, disable its exact GitHub workflow; retain report history.
To reverse implementation, revert only the reviewed SEO integration commit(s).
Do not delete unrelated agent configuration, reset application branches, or
change production entitlements. A future agent resumes from the handoff and
reconciles real branch/job state before editing.
