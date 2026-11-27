# PR #48 review — 2026-11-27

Base main: `4d8ad62a706e225e364bb6c8958e4feb4d94da30`.
PR: https://github.com/DesmondQuayson/math-word-hunt/pull/48.
This PR implements monitoring, persistence and workflow documentation; it does
not improve application content or prove rankings, indexing or conversions.

## Protected ShowMe is expected

The anonymous ShowMe root and sitemap return HTTP 401 with `noindex,nofollow`.
This is the intended policy documented in `docs/showme-access-gate.md` and the
v1.2.52 release record. Authorized read-only source inspection of the separate
private ShowMe repository confirmed its hosted access middleware. No keys were
retrieved, passes minted, review-header bypasses used, or gated content copied.

MathNexa's `/online-math-prep`, `/homework-pdfs`, `/quiz-pdfs`, `/math-games`
and other explicitly configured marketing pages are the public crawlable surface.
ShowMe lessons, practice and worksheet routes stay protected. `/privacy` is
public. Its robots endpoint currently allows crawling, which does not grant
access through middleware. Do not add paid URLs to a public sitemap or remove
the pass gate to resolve an SEO warning.

The monitor now checks the two protected URLs separately: 401 plus HTTP noindex
is expected; unexpected 200/exposure, missing noindex, or transient failure
fails coverage. Prior 401 findings remain in history with an evidence-backed
closure rather than being deleted. Their proposal budget is not refunded.

## Execution and privilege review

- One workflow, ID `432326706`, hosted Ubuntu 24.04 / Node 22, 12-minute limit.
- Monday 07:00 `America/Chicago`: winter 13:00 UTC, summer 12:00 UTC. Current
  GitHub supports the timezone field. Default-branch scheduling may be delayed
  or dropped; public schedules may disable after 60 inactive days.
- Review-branch push/manual execution is real cloud execution; default-branch
  recurring activation remains pending merge. API state `active` is not proof
  the schedule is activated while its file is absent from main.
- Official checkout/setup-node actions are pinned to full commits; checkout
  does not persist credentials. No dependencies, artifact uploads or caches.
- Public crawler has no Google, billing, Supabase or model credentials. GitHub
  token is exposed only to state restore/publish steps. Its `contents:write`
  permission is repository-wide; the code constrains writes to `seo-reports`,
  with expected-parent checks and no force update. Branch restriction is a code
  boundary, not a GitHub token scope. Protect/review workflow changes accordingly.
- Only sanitized public observations are saved. Private data never belongs in
  this public repo, reports, summaries or logs. Private analytics is separate.
- 36 local boundary/recovery tests pass after the gate correction. Hosted runs
  and exact report commits are recorded in CLAUDE_HANDOFF.md.

## Deployment and review

`vercel project inspect mathnexa-platform-production` reports **Git Repository:
Not connected** (project root apps/platform-web). A merge does not automatically
deploy that production project through Git. Preserve its manual owner-reviewed
production release process. The repository's staging Git integration does react
to commits: the previous PR head's staging deployment is BLOCKED/STAGED,
  `dpl_2XSwaERdoCbSWpwNUkhe1JAq8thD`. Follow-up inspection of the corrected head's
  deployment `dpl_8Bj19k9NK4UcZTjiXNLkpJYnUie4` returned `readyStateReason`:
  the project was paused. No build was attempted. This is not a proved build defect.
Do not change billing, protection or provider policy to make a check green.

Concrete approval impact: merge the monitoring-only PR to activate its existing
weekly cloud schedule and permit public report writes to `seo-reports`; no paid
AI, website content publication, Google data upload or entitlement change. The
  staging check must be resolved through the existing review process. The owner
  approved merge subject to existing checks on 2026-11-27. That approval is
  recorded; merge is held because Vercel remains failed. Main has no branch
  protection according to GitHub, but the approval condition still applies.
  No pause setting was changed and no failed status was bypassed. Once the
  staging owner restores its normal check, verify the same PR head and merge
  under this existing approval without asking for merge approval again.

Sources: [schedule semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[job token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication).
