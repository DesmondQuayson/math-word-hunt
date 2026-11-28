---
name: mathnexa-seo
description: Continue MathNexa SEO, AEO, GEO and earned-backlink reviews using the shared evidence, cloud executor and owner approval boundaries.
---

Read [the current handoff](../../../docs/seo/CLAUDE_HANDOFF.md) and
[shared workflow](../../../docs/seo/WORKFLOW.md) from the repository root before
editing. Reconcile live branch/job state and confirm the prior executor has
stopped; a handoff file does not switch assistants or reset limits.

Use `node --test scripts/seo/*.test.mjs` and `node scripts/seo/run.mjs` for the
public audit. Optional reviewed tools use `node scripts/seo/upstream.mjs
portability` or `claims`; see UPSTREAM_REVIEW.md. Do not assume upstream Claude
commands, hooks or provider integrations are installed.

Keep Google/billing data out of this public repository and report branch.
Preserve the single GitHub scheduler, initial three/weekly two combined proposal
limit, paid access gates and manual production review. Follow the coverage table
to finish missing work without inventing metrics or sending outreach.
