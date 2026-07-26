# Repository Structure

## Canonical layout after Phase 1A

| Path | Classification | Purpose |
| --- | --- | --- |
| README.md | Current | Repository entry point and safety rules |
| docs/index.html | Canonical deployment | Current v7 playable application |
| docs/vocab.js | Canonical deployment | Current vocabulary and curriculum |
| docs/404.html | Deployment helper | GitHub Pages fallback page |
| docs/.nojekyll | Deployment helper | Disables Jekyll processing |
| docs/robots.txt | Deployment helper | Search-engine guidance |
| docs/README.md | Deployment documentation | Existing GitHub Pages instructions |
| docs/index-v5-backup.html | Historical deployment | Preserved rollback reference |
| docs/index-v6-backup.html | Historical deployment | Preserved rollback reference |
| math-word-hunt-v1.html through v5.html | Historical source | Earlier playable releases |
| vocab.js | Historical compatibility copy | Vocabulary used by root historical builds |
| e2e/math-word-hunt-v5.spec.ts | Historical regression | Preserves v5 behavior |
| e2e/math-word-hunt-v7.spec.mjs | Current regression | Protects the canonical release |
| scripts/audit-content.mjs | Current tooling | Content and canonical-integrity audit |
| scripts/serve-static.mjs | Current tooling | Dependency-free local test server |
| playwright.config.mjs | Current tooling | Browser-test configuration |
| eslint.config.js | Current tooling | Lint rules for repository scripts |
| package.json and package-lock.json | Current tooling | Reproducible development dependencies |

## Before Phase 1A

The repository contained the working Math Vocabulary Hunt files alongside copied
documentation, tests, lint configuration, and generated build output belonging
to a different codebase. Those positively identified artifacts were removed
with owner approval. No Math Vocabulary Hunt historical build was deleted.

## Historical versions

Historical HTML files are retained because they provide:

- a known rollback reference;
- evidence of gameplay and accessibility evolution;
- comparison points for regression investigation; and
- recovery options if a deployment file is damaged.

They are not the current deployment. New work must target docs/index.html unless
the owner explicitly requests a historical-version test.

## Generated and ignored files

The following are intentionally ignored and may be deleted and regenerated:

- node_modules
- playwright-report
- test-results
- coverage
- qa-artifacts
- .vite
- dist and dist2
- TypeScript build-info files
- log files
- local environment files

Generated output must never be treated as the canonical source or deployed over
docs/index.html.

## Uncertain files

No uncertain tracked file was deleted during Phase 1A. Deployment helpers,
historical HTML, the historical vocabulary copy, existing Math Vocabulary Hunt
tests, and the original GitHub Pages instructions were retained.
