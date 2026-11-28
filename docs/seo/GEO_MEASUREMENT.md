# Repeatable AI-visibility measurement

Status on 2026-11-27: **not measured**. Twelve fixed prompts exist in
geo-panel.json. No consumer AI answers have been captured with verified evidence;
there is no mention/citation percentage, referral baseline or ranking claim.
Ordinary web prospect searches and the assistant's own drafted text are not AI
visibility observations. No paid API key or background AI agent is configured.

## Monthly session within the existing workflow

Use the first weekly review of each Chicago calendar month, not a second scheduler.
Choose authorized consumer surfaces with browsing/search available to the owner
(for example ChatGPT Search, Gemini or Perplexity); record which are actually
available. Do not purchase access or bypass sign-in. Repeat the same 12 exact
questions once per surface/mode/month in separate fresh chats with no personalized
brand seeding. Keep the 9 unbranded and 3 branded questions separate. Locale,
geography, search mode and visible model/version must be recorded; use `unknown`
when a version is not shown. Changed panels receive a new version and baseline.

For each answer, record fields specified in geo-panel.json. `surface` is one of
`consumer-ai`, `model-api` or `web-search`; these never share a denominator.
`status` is `completed`, `unavailable` or `not-tested`. Record an actual UTC
timestamp, exact question, provider, model/version, locale and mode. For a
completed answer, manually code brand mention and a MathNexa linked citation
(HTTPS URL or null), cited competitors, minimal evidence reference and whether
opening the cited page verified relevance to the actual answer. A named brand
without a link is a mention; an irrelevant link is not a verified relevant citation.

Keep screenshots/transcripts and account/session references in approved private
storage, retaining only what is needed for reproducibility. Never record cookies,
tokens, unrelated conversation history or personal data. Public reports may
contain reviewed aggregate results and public URLs only. Do not publish raw input.

```text
node scripts/seo/geo-measure.mjs
node scripts/seo/geo-measure.mjs ABSOLUTE_PRIVATE_OBSERVATIONS_JSON
```

The default run uses the empty panel and correctly returns `not-measured`.
The script validates exact prompts, timestamp/context, evidence, duplicate monthly
samples, private citation parameters and separate surface/branded denominators.
It saves only an aggregate local summary; it neither collects answers nor submits
prompts to an AI provider. A successful validator does not independently prove
the evidence was captured; the reviewer must inspect the referenced evidence.

For each comparable group report completed/attempted/planned, mention count,
linked-citation count and verified-relevant-citation count, plus rates only among
completed observations. Missing answers stay outside the denominator. Do not
pool model versions or API/consumer answers, select only favorable reruns, or
describe sampled frequency as universal market share. Preserve failures as failures.
Record citations to other brands for qualitative comparison without claiming a
complete competitor ranking. Ask a second reviewer to resolve ambiguous coding
when available; until then state that coding has a single reviewer.

Use the source-backed page proposal in AEO_CONTENT_REVIEW.md as a content-quality
hypothesis. After release, compare the same panel/modes over time; separate
provider changes, normal answer variability, organic/referral sessions and verified
payments. Without causal evidence, do not attribute movement solely to our edit.

## Actual execution limits

Public metadata checks and report recovery run on hosted GitHub runners while
devices are off. This month's answer collection is a manual/authorized-agent
review task and remains pending surface access. The scheduled script cannot
operate the owner's signed-in AI accounts or continue this chat. Paid AI cloud
execution requires explicit approval and has not been added.
