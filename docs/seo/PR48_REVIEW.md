# PR #48 review — final state 2026-11-28

[PR #48](https://github.com/DesmondQuayson/math-word-hunt/pull/48)
contained public-page monitoring, report persistence, and workflow docs. It
did not change application content. The owner approved merging it subject to
existing checks; those checks passed and it merged normally on 2026-11-28.
Main merge commit: `4d8cbe1ec23ce55ccc561f012a8cf46bdb994ce0`.
No production website deployment followed from this Git merge because the
production Vercel project is not Git connected. Manual production review remains.

## Access and public coverage

Anonymous ShowMe root and sitemap return 401 with HTTP `noindex,nofollow`.
The separate private source, `docs/showme-access-gate.md`, and the release
record establish that this is intentional. No key, pass, bypass header or paid
content was used. MathNexa's `/online-math-prep`, `/homework-pdfs`,
`/quiz-pdfs`, `/math-games` and other configured marketing pages are public;
ShowMe lessons, practice and worksheets stay protected. ShowMe `/privacy` is
public. The monitor classifies protected responses separately and flags an
unexpected 200/exposure, missing noindex or transient failure. Earlier 401
findings were closed with evidence, without refunding their proposal slots.

## Checks, schedule and permissions

- One GitHub workflow, ID `432326706`, hosted Ubuntu/Node 22, 12-minute limit,
  serialized by one concurrency group. Monday 07:00 `America/Chicago` is
  13:00 UTC in winter and 12:00 UTC in summer.
- The workflow is active on default `main`. The successful
  [manual main run 46122127317](https://github.com/DesmondQuayson/math-word-hunt/actions/runs/46122127317)
  restored prior state, performed bounded requests and saved a remote report
  to `seo-reports`. The **first scheduled run is not yet verified**; GitHub
  schedules can be delayed, dropped or disabled after inactivity.
- Checkout/setup-node actions are pinned. No npm install, artifact upload,
  dependency cache, Google credential, billing credential or model key is used.
  The job token has `contents:write` at job scope, but that GitHub permission
  is repository-wide. Code constrains writes to `seo-reports` with an expected-
  parent check and no force update. Review workflow changes accordingly.
- Only sanitized public observations are saved. No customer, revenue, private
  analytics or credentials belong in this public repository or reports.

## Staging pause and merge decision

The original PR preview was blocked before build because the staging project
was paused. Vercel activity gave `BUDGET_REACHED` as the prior-cycle reason.
Current billing/usage was inspected privately: the existing Pro plan's included
usage credit covered this work, and on-demand spend was zero. Only staging was
unpaused. No plan, budget, spending limit, production project or protection
policy was changed. A fresh preview became Ready; Vercel and Preview Comments
checks passed. No failed check or merge protection was bypassed.

The approved merge activates deterministic cloud checks and public report
writes while owner devices are off. It does not run an AI agent, publish content,
query Google privately, send outreach, charge for paid AI, or prove indexing,
ranking, traffic or sales outcomes. See [handoff](CLAUDE_HANDOFF.md) for live
refs and [coverage](COVERAGE.md) for the broader original scope.

Sources: [GitHub schedule semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#schedule),
[GitHub token permissions](https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication).
