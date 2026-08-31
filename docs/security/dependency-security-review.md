# MathNexa Dependency and Supply-Chain Review

Assessed on the overnight branch, which descends from `v1.2.4`.

## Result

| Check | Result |
|---|---|
| `npm audit` (all scopes) | **0 vulnerabilities** |
| `npm audit --omit=dev` (production) | **0 vulnerabilities** |
| Production components | **76** |
| Distinct registries | **1** — `https://registry.npmjs.org` |
| Git or HTTP dependencies | **None** |
| Packages with install lifecycle scripts | **1**, dev-only |
| SBOM | `sbom-production.cdx.json`, CycloneDX 1.5 |

## Production dependency surface

The application declares nine direct runtime dependencies:
`@supabase/ssr`, `@supabase/supabase-js`, `next`, `react`, `react-dom`, `stripe`,
`jose`, `fflate`, and the first-party `@math-vocabulary-hunt/platform-core`.

That is a deliberately small surface for a commercial product, and it resolves to
76 components in total. The monorepo root declares **no** runtime dependencies of
its own — everything there is tooling.

## Lifecycle scripts

Exactly one package in the entire tree runs an install script: `unrs-resolver`
(`postinstall`). It arrives via `eslint-config-next` →
`eslint-import-resolver-typescript`, and `npm ls unrs-resolver --omit=dev`
returns an empty tree — **it never ships to production**.

That is worth stating precisely rather than as reassurance: a postinstall script
runs on a developer machine and in CI, so it is a build-environment
consideration, not a production one.

## Version overrides

Five transitive packages are pinned above what their parents request:

| Package | Pinned | Why |
|---|---|---|
| `postcss` | 8.5.23 | Security upgrade; `next` pins 8.4.31 |
| `nanoid` | 3.3.18 | Security upgrade |
| `brace-expansion` | 5.0.9 | Security upgrade |
| `minimatch` | 10.2.5 | Security upgrade |
| `sharp` | 0.35.3 | Security upgrade |

`npm` reports these as `invalid` and `npm sbom` refuses to run because of them.
That is npm describing an override doing exactly what an override is for, not a
defect — but it is worth knowing, because it makes the built-in SBOM command
unusable here, which is why `scripts/generate-sbom.mjs` exists.

**Overrides are the right tool for this codebase.** They allow a patched
transitive dependency without waiting for the parent to release, and they are
visible in one place in the root `package.json`.

## Lockfile integrity

- Every resolved URL points at `registry.npmjs.org`.
- No `git+`, `github:`, or plain `http://` sources.
- No unpinned refs.
- The only non-URL entries are the two workspace links, which are first-party.

## Reproducibility gap

There is **no `engines` field, no `packageManager` field, and no committed
`.npmrc`**. Consequences:

- The Node and npm version used to install is whatever the machine has.
- Install-script execution policy (`ignore-scripts`) is not pinned, so whether
  that one postinstall runs depends on local configuration.

Neither is a vulnerability, and neither should be changed on a security branch
without checking it against the deployment pipeline — Vercel selects a Node
version from its own project setting. Recorded as a hardening item.

## Regenerating the SBOM

```bash
npm run security:sbom
```

Deterministic: no timestamp, sorted components, so regeneration produces no diff
unless the tree actually changed. Print the hash to compare across builds.

## What is not covered

- **No automated advisory monitoring.** `npm audit` runs when someone runs it.
  Enabling Dependabot or an equivalent on the repository is an owner action and
  the single highest-value supply-chain improvement available.
- **No dependency pinning by integrity beyond the lockfile.** The lockfile does
  carry integrity hashes, which is the meaningful control; nothing further is
  proposed.
