# MathNexa SEO / AEO / GEO / backlinks handoff

Checkpoint: **2026-11-27 15:48 UTC**. Reporting zone: America/Chicago.
Owner intent: full original scope, with execution continuing when devices are off.
A local automation or a prompt does not satisfy that cloud requirement.
[Requirement-by-requirement coverage](COVERAGE.md) is authoritative for scope.

## Resume state and ownership

- Codex completed this checkpoint; no automatic Claude transfer has occurred.
  Verify the prior editor has stopped before another agent claims ownership.
- Public repo: https://github.com/DesmondQuayson/math-word-hunt.
- Refreshed main: **4d8ad62a706e225e364bb6c8958e4feb4d94da30**.
- Monitoring branch: **codex/seo-cloud-execution**, head
  **de766db6ba28cca5c9883d337be233c28119a1f8**, [PR #48](https://github.com/DesmondQuayson/math-word-hunt/pull/48).
- Full-scope branch: **codex/seo-full-scope**, implementation commit
  **7dab76d9c8d0a3483834add56fcb9b03e5e7231f**,
  [draft PR #49](https://github.com/DesmondQuayson/math-word-hunt/pull/49),
  stacked on PR #48. Later handoff-only commits do not change tested runtime;
  resolve the remote tip before editing.
- Working tree after delivery: task files committed; unrelated untracked
  owner-review/marketing/ is preserved. Ignored .seo-output and .seo-private
  are local scratch, not durable shared evidence.
- Private ShowMe source inspected read-only at commit
  262c502c6dde47256152c7d5d6e27f514fa6999f. Local ignored checkout:
  .seo-private/showme-source; its remote requires authorized private access.
  No private source, credentials, analytics or customer data were published.
- No SEO cloud runs queued/in progress at checkpoint. Local preview process
  was stopped. No persistent interactive-agent lease is claimed.

## What is verified

| Area | Result and evidence |
| --- | --- |
| Monitor correction | [PR #48 hosted run 45984321795](https://github.com/DesmondQuayson/math-word-hunt/actions/runs/45984321795) succeeded: 36 tests, prior state restored, 12 bounded requests, 0 implemented-check findings; report 194d05abe6fb549b578b2e8a671a085e4d1af9cf |
| Full-scope hosted verification | [Run 46026413021](https://github.com/DesmondQuayson/math-word-hunt/actions/runs/46026413021) succeeded on 7dab76d: 45/45 tests, restored prior state, 12 public requests and persisted report |
| Current public report | [latest.md](https://github.com/DesmondQuayson/math-word-hunt/blob/seo-reports/reports/latest.md) and [latest.json](https://github.com/DesmondQuayson/math-word-hunt/blob/seo-reports/reports/latest.json), commit **f4db972019bd405edfdd781b4420eecced1a4603**; observed 2026-11-27T15:36:51.553Z |
| Public marketing / paid boundary | Eight configured MathNexa HTML pages returned 200 and passed metadata checks. ShowMe root/sitemap expected 401 plus noindex verified; private source and docs/showme-access-gate.md confirm intentional gate. Main /online-math-prep is its crawlable marketing page; /privacy remains public |
| Actual website improvement | One homework page change: direct answer, original fraction example, misconception, practice/answer reasoning and stable anchor. Prepared on PR #49, **not deployed**. See AEO_CONTENT_REVIEW.md |
| Shared change limit | Report contains two closed access investigations plus one manual content proposal, **3/3 initial slots**. Manual/automatic registry tested together; later weekly cap is two. Investigations were not website improvements |
| Local application validation | Production build and workspace typecheck pass after npm ci --ignore-scripts restored the existing lockfile. Targeted ESLint passes. 50 existing public-page/metadata/catalog tests pass. No dependency/lockfile change |
| Math / toolkit | Four exact rational arithmetic checks pass. Reviewed upstream v2.6.3 immutable c067311b497eff49110b73d4be33bdd3d7e6b40d, MIT, full checkout retained. Native adapter: 40 skill files, 0 portability errors/warnings; citation-gap heuristic detected 0 claims, not proof of correctness |
| Google preparation | Direct read-only discovery and baseline helper, fixed endpoints, private output outside Git and public-CI refusal; five boundary tests. No live authorized Google report collected |
| GEO / backlinks | Twelve fixed prompts and tested evidence accounting; zero measured answers, rates unavailable. Three researched editorial prospects and tailored unsent drafts. No backlink total, earned placement or outreach claimed |
| Shared entrypoints | Thin .agents/skills/mathnexa-seo and .claude/skills/mathnexa-seo wrappers point to WORKFLOW; frontmatter validated, native commands tested. Fresh-session discovery/native Claude loading remain unverified |

The earlier hosted failures were not hidden: run 45936482035 failed on a repository
REST trailing slash (fixed); run 45980293569 attempts 1/2 persisted reports but
failed coverage on ShowMe's intended gate (now classified correctly). First app
build/typecheck failed because local packages were missing; locked dependency
restoration fixed them. The skill creator Python validator lacked PyYAML;
existing js-yaml validated wrapper metadata instead, with no global installation.

PageSpeed mobile API returned **429**; first local Lighthouse trace failed with
NO_NAVSTART, then one bounded retry succeeded. Current live page mobile lab:
**79 performance / 100 accessibility / 100 SEO**, LCP 1.20 s, TBT 879 ms, CLS 0.
Live 375px/1280px browser checks passed with no horizontal overflow. See
MOBILE_DIAGNOSTIC.md and its sanitized dated evidence; this is not real-user
performance or an outcome of the unreleased content. A local production preview
with backend credentials disabled returned **503**, as its guard requires; no
gate was bypassed. The proposed content still needs configured-preview/mobile
review. Broader broken-link/indexing coverage remains open. Passing tests or lab
scores do not prove indexing, rankings, full accessibility or sales.

## Single scheduler and merge boundary

There is **one SEO workflow definition**, ID **432326706**, name
MathNexa public SEO cloud checks, path .github/workflows/mathnexa-seo.yml.
Registered API state: active. **No recurring SEO schedule is activated on main.**
Hosted push/manual runs are verified; the schedule file is still review-branch only.
No additional Codex automation or AI scheduler was created. The unrelated local
MathNexa live operations watch remains unchanged and is not this SEO executor.

Definition: Monday **07:00 America/Chicago**; winter 13:00 UTC, summer 12:00 UTC.
Next nominal time if activated beforehand: November 30, 2026 at 07:00 CST
(13:00 UTC), **not a verified queued run**. GitHub may delay/drop scheduled events
or disable inactive public schedules. Concurrency group mathnexa-seo-cloud
serializes runs; report writes check the previous parent and never force.

The owner **approved merging PR #48 subject to existing checks** on November 27.
Do not request that merge approval again. Vercel's staging check still fails:
deployment dpl_8Bj19k9NK4UcZTjiXNLkpJYnUie4 is BLOCKED/STAGED and its explicit
readyStateReason says the project was paused. No compilation was attempted.
PR #49 also has a failed staging status. No provider pause/billing setting was
changed. Main lacks branch protection, but the owner's check condition still
applies: do not bypass the failed status or use an admin override.

Vercel production project mathnexa-platform-production was verified **not Git
connected**. PR #48 has no application changes; its merge activates cloud checks
and public report writes, not a production Git deployment. Staging Git integration
does react to commits. Actual content release remains under manual owner review.

The hosted executor runs deterministic Node scripts, **not Codex or Claude AI**.
It does not write content, observe signed-in AI answers, query private analytics
or perform outreach while devices are off. Those need an authorized interactive
review or an explicitly approved private/AI executor. No paid AI is enabled.
GitHub contents:write is job-scoped but repository-wide; code restricts writes to
seo-reports. No private provider credentials, dependency caches or artifact uploads.
See PR48_REVIEW.md for permission/deployment review and the pinned action SHAs.

## Exact next actions

1. **Staging/project owner:** resolve the paused staging project's failed check
   through the existing deployment process, without assuming account/policy changes
   are authorized. **Agent then:** recheck PR #48's exact head and all statuses,
   mark ready and merge normally using the approval already granted. Verify a
   default-branch dispatch, remote persistence and actual recurring activation.
2. **Owner:** authorize a Google identity with webmasters.readonly and
   analytics.readonly access, and select a private report folder outside Git.
   Do not paste tokens into chat. **Agent then:** use GOOGLE_ACCESS.md discovery,
   verify exact GSC/GA4 properties/streams, latest complete dates and source totals;
   collect the private baseline. Durable unattended analytics additionally needs
   approved private hosting/storage and renewable credentials. No Windsor purchase.
3. **Owner/authorized billing administrator:** designate a private aggregate
   payment source/storage. Then reconcile trials, access codes, real new payments,
   renewals/refunds/test accounts and currency. This SEO workflow has not tested
   billing access; do not assume the separate operations monitor grants it.
4. **Content/release reviewer:** review PR #49's homework diff, validate mobile
   rendering on an authorized preview, then approve the normal production release.
   After PR #48 merges, merge updated main into the full-scope branch (no force
   push) and retarget PR #49 to main; do not accidentally merge content into the
   monitoring branch before its approved scope is delivered.
5. **Authorized owner/agent:** capture actual monthly AI-answer observations using
   GEO_MEASUREMENT.md and private evidence. No paid provider fallback. Backlink
   drafts remain unsent; later sending requires exact recipient/text approval
   and a verified live resource plus truthful author bio.
6. **Next host:** verify fresh-session Codex skill discovery or native Claude loading,
   as applicable. The tested narrow adapter is usable; native plugin hooks and
   optional integrations remain disabled. Do not spend Claude credits or work
   around quota limits.

## Reproduction, private boundaries and rollback

From repo root, Node 22+; the public cloud needs no npm installation:

~~~text
node --test scripts/seo/*.test.mjs
node scripts/seo/run.mjs
node scripts/seo/geo-measure.mjs
node scripts/seo/upstream.mjs portability
node scripts/seo/upstream.mjs claims
npm run typecheck
npm run build
~~~

The upstream checkout must match UPSTREAM_REVIEW.md. Set SEO_PYTHON to a trusted
Python 3.10+ executable if needed (tested Python 3.12.14). GOOGLE_OAUTH_ACCESS_TOKEN
is only for the separate private reader; GH_TOKEN is supplied only by the cloud
restore/publish steps. Store no secret values here. Private output location is
**not yet selected**. Offline snapshot replay preserves original observation time;
it cannot fetch fresh data or keep a powered-off local machine working.

Claude resume: read this file, WORKFLOW and COVERAGE; reconcile remote heads and
jobs; confirm Codex has stopped; claim ownership and take the first actionable
unfinished item above. Reuse valid checks. A prompt does not start another model,
reset quotas, transfer credentials or grant deployment/outreach authorization.

Rollback only the reviewed integration/content commits; preserve report history.
To stop the executor disable only workflow 432326706. Do not delete global
Claude/Codex configuration, remove access gates, alter subscriptions or reset
unrelated branches. Application content can be reverted independently of monitoring.
