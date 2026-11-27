# Reviewed Claude SEO adaptation

Reviewed 2026-11-27. Source: [AgriciDaniel/claude-seo](https://github.com/AgriciDaniel/claude-seo/tree/c067311b497eff49110b73d4be33bdd3d7e6b40d).
Release v2.6.3; immutable commit `c067311b497eff49110b73d4be33bdd3d7e6b40d`.
MIT license, copyright 2026 agricidaniel. The complete checkout, including its
license, skills, scripts, data, schema, assets, extensions, tests and runtime
files, is retained locally under ignored `.seo-output/upstream/claude-seo`.
It is reproducible from the remote immutable commit, not copied as a lone skill.

## Reviewed surface and decision

Read the manifest, hooks, Windows installer, shell installer entry/setup flow,
runtime provisioning code, requirements, profile paths, portability checker and
claim-gap checker. This is a scoped source review, not a security certification
of every optional script. No installer was executed.

- Installers write into global ~/.claude skills/agents, copy optional extensions,
  rewrite command paths, and invoke runtime setup. We do not use these installers.
- Runtime setup provisions a Python venv, installs requirements through pip and
  downloads Chromium. Requirements have ranges; the repository's uv lock is not
  automatically used by that pip setup. No dependencies or browsers installed.
- PostToolUse hooks invoke a Node Python launcher and schema validation. Hooks
  and Claude plugin registrations remain disabled and unmodified.
- Extensions include provider/advertising integrations. No provider configuration,
  API key, purchase, paid extension or model call is enabled.
- The upstream command/tool names assume Claude execution. Its portability lint
  is static source analysis, not proof of Codex discovery or actual Claude loading.

## Native Codex use

`scripts/seo/upstream.mjs` supports only two reviewed standard-library scripts:
`portability_check.py` and `content_verify.py`. It verifies the entire checkout's
HEAD and clean state, then the selected script's LF-normalized SHA-256. It runs
Python with `-I`, a stripped environment, no shell and a 30-second deadline.
Claims input is fixed to the public AEO review document. No arbitrary scripts,
private analytics files, global hooks, automatic dependency setup or model keys.

Recreate the complete local checkout if missing (do not overwrite a dirty one):

```text
git clone --no-checkout https://github.com/AgriciDaniel/claude-seo.git .seo-output/upstream/claude-seo
git -C .seo-output/upstream/claude-seo checkout --detach c067311b497eff49110b73d4be33bdd3d7e6b40d
node scripts/seo/upstream.mjs portability
node scripts/seo/upstream.mjs claims
```

Set `SEO_PYTHON` to a trusted Python 3.10+ interpreter when `python` is not usable.
Verified local runtime: bundled Python 3.12.14. This adapter does not invoke
`scripts/claude-seo`, `setup`, any upstream installer, pip, or a paid provider.
Claim-gap lint flags some English statistical/causal wording; it cannot prove
math accuracy, citation truth or content quality. See the handoff for real results.

Actual runs: portability checked 40 upstream skill files with 0 errors/warnings;
claim-gap lint detected 0 heuristic claims in the public draft (not an accuracy
certification). Both host wrappers have valid YAML name/description and shared
references, checked with the repository's existing js-yaml parser. The skill
creator's Python quick validator was attempted but lacked PyYAML; no system Python
package was installed to force it. Native adapter execution and the independent
math check succeeded using the isolated standard-library interpreter.

## Host entrypoints and remaining compatibility

Repo Codex entrypoint: `.agents/skills/mathnexa-seo/SKILL.md`.
Repo Claude entrypoint: `.claude/skills/mathnexa-seo/SKILL.md`.
Both point to shared docs and native commands; they do not mirror a second
workflow. Explicit file reading plus executable adapter is tested here. Automatic
skill discovery on a fresh Codex session and native Claude skill loading remain
unverified until those hosts actually report the skill and execute a read-only run.

Claude resume: read its thin wrapper, WORKFLOW and CLAUDE_HANDOFF; confirm Codex
is no longer editing; claim the handoff; run native Node tests/public audit first.
Only if the owner later requests full upstream Claude integration should that
host install/register the reviewed commit and test its commands in isolation.
Do not turn a prepared wrapper into a claim of installed/working Claude hooks.
