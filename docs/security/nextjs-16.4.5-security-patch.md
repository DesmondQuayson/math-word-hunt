# MathNexa — Next.js 16.4.5 Security Patch (November 3, 2026 advisories)

**Status: committed on a local branch. Not pushed, not on staging, not in production.** Each of those needs the
owner's approval.

| | |
| --- | --- |
| Branch | `security/nextjs-16-4-5`, cut from `origin/main` `e5d16b0` (v1.2.53 release record) |
| Change | `next` and `eslint-config-next` 16.4.2 → **16.4.5** (exact pins); the two release pipelines expect 16.4.5 |
| Production (unchanged) | `https://mathnexa.com`, v1.2.53, Next.js 16.4.2 |
| Migration / env / billing / auth | None. Nothing under `supabase/`, no environment variable, no application source changed |
| Evidence | `qa-artifacts/nextjs-16-4-5/` in the worktree `C:/GitHub/mathnexa-next-16-4-5` (not tracked) |

## Verdict

**No advisory in this set reaches MathNexa in production.** The patch is still worth releasing: it clears the
audit finding, it covers the two code paths that sit next to an advisory (the image optimizer and the three
resource file routes), and it ends the build stop described below. It is not urgent in the way the October 14
set was, and it can ride with the next release.

## Advisories (read 2026-11-19 from the `vercel/next.js` repository advisories)

All seven were published 2026-11-03, are rated Moderate, and are fixed in **16.4.5**. No advisory published
since then names 16.4.5.

| Advisory | Affected 16.x | MathNexa on 16.4.2 | What decides it |
| --- | --- | --- | --- |
| [GHSA-mfr8-8qww-v76h](https://github.com/vercel/next.js/security/advisories/GHSA-mfr8-8qww-v76h) — disclosure across root params when a `use cache` function is called through `unstable_cache()` | 16.3.0 – 16.4.4 | **Not affected** | No `"use cache"` and no `unstable_cache` anywhere in `apps/platform-web` |
| [GHSA-vc7v-qv4w-wrv8](https://github.com/vercel/next.js/security/advisories/GHSA-vc7v-qv4w-wrv8) — cache leak across root param values in nested `use cache` functions | 16.2.0 – 16.4.4 | **Not affected** | Same: no `"use cache"` |
| [GHSA-rhh4-g77r-r9qj](https://github.com/vercel/next.js/security/advisories/GHSA-rhh4-g77r-r9qj) — cache disclosure and poisoning in `use cache` with binary arguments | 16.0.0 – 16.4.4 | **Not affected** | Same: no `"use cache"` |
| [GHSA-vvgp-ww4w-46vf](https://github.com/vercel/next.js/security/advisories/GHSA-vvgp-ww4w-46vf) — cache poisoning of shared fallback shells in Cache Components | 16.4.0 – 16.4.4 | **Not affected** | `apps/platform-web/next.config.mjs` does not set `cacheComponents`; its only `experimental` key is `cpus` |
| [GHSA-f3mh-rxg3-f5g2](https://github.com/vercel/next.js/security/advisories/GHSA-f3mh-rxg3-f5g2) — HttpOnly cookie exposed through an internal response header on Edge runtime routes | 16.0.0 – 16.4.4 | **Not affected** | No route declares `runtime = "edge"`, and there is no Pages Router. `apps/platform-web/proxy.ts` is the request proxy, which the advisory does not cover |
| [GHSA-7qx7-33qx-rqx2](https://github.com/vercel/next.js/security/advisories/GHSA-7qx7-33qx-rqx2) — SVG rejection bypass in image optimization | 16.0.0 – 16.4.4 | **Not affected in production** | The advisory is for self-hosted deployments. Production `/_next/image` is Vercel's optimizer. A local `next start` is inside the affected range until this patch |
| [GHSA-pc58-hwjq-p385](https://github.com/vercel/next.js/security/advisories/GHSA-pc58-hwjq-p385) — response injection when a self-hosted app forwards a fetched response | 16.0.0 – 16.4.4 | **Not affected in production** | The advisory needs a self-hosted server behind an HTTP/1.1 reverse proxy. MathNexa runs on Vercel. See the note on the resource routes |

**Image optimizer, checked on production (read-only, 2026-11-19).**
`node scripts/verify-next-image-optimizer.mjs --base=https://mathnexa.com` passed 14 of 14 probes: shipped
assets are served, and a shipped SVG asked for through the optimizer is refused with 400. `next/image` is
imported by eight files, and there is no `images` block in the config, so `dangerouslyAllowSVG` is off.

**The three resource file routes.** `app/resources/[resourceId]/download/route.ts`, `inline/route.ts` and
`preview/[fileId]/route.ts` fetch a file from a short-lived signed Supabase Storage URL and return its body.
They do not return the fetched response unchanged: each builds a new `Response` with its own headers, so the
upstream framing headers are not passed on, and the upstream is the project's own storage. This is the pattern
closest to GHSA-pc58, and it is one more reason to take the patch.

**`npm audit` sees this set.** Unlike the October 14 advisories, these are in GitHub's global database:
`npm audit` reports `next 16.0.0 - 16.4.4` on 16.4.2 and nothing for `next` on 16.4.5.

## Why 16.4.5 and not 16.4.6

16.4.5 (2026-11-03) contains only the seven fixes. 16.4.6 (2026-11-09) adds backports that change behaviour:
automatic compression of route handler responses, Turbopack development fixes and a Tailwind pin for
`create-next-app`. MathNexa's route handlers serve PDFs, game documents and webhooks, so compression deserves
its own review. 16.4.5 is the smallest change that closes the advisories.

## Dependency change

| Package | Before | After |
| --- | --- | --- |
| `next` | 16.4.2 | **16.4.5** (exact) |
| `eslint-config-next` | 16.4.2 | **16.4.5** (exact) |
| `@next/env`, `@next/eslint-plugin-next`, eight `@next/swc-*` binaries | 16.4.2 | 16.4.5 (lockfile only) |

Twelve lockfile entries changed, all from 16.4.2 to 16.4.5. Nothing else moved: `react` and `react-dom` stay
19.2.8, `sharp` stays 0.35.5, and the `overrides` block is untouched.

`scripts/run-nextjs-hotfix-production.mjs` and `scripts/run-nextjs-hotfix-staging.mjs` refuse to deploy a tree
whose installed Next.js is not the expected version. Both now expect 16.4.5. No other script changed.

## Gates, before and after (local, 2026-11-19, same worktree)

| Gate | 16.4.2 (`e5d16b0`) | 16.4.5 (this branch) |
| --- | --- | --- |
| `npx next typegen`, then `npm run typecheck` | 0 errors | 0 errors |
| `npm run lint` | 0 errors | 0 errors |
| `npm run test:unit` | core 245 of 245; web 1,823 passed, 1 skipped | the same |
| `npm run build` | compiles and prints 139 routes, then **exits 1** on the security stop (below), on both runs | **exits 0** on the first run; 139 routes |
| Route table | — | identical to 16.4.2, line for line |
| `npm run test:security` | 372 of 372; bundle audit 39 client assets and 47 core files; Number Cross launch audit; 47 of 47 | the same |
| `node --test scripts/*.test.mjs` | 143 of 145 | 143 of 145 |
| `npm audit --omit=dev --audit-level=high` | passes | passes |
| `npm audit` | 15 findings (13 moderate, 2 high), `next` among them | 14 findings (12 moderate, 2 high), `next` gone |

The two script tests that fail are the same two on both sides, and they do not involve Next.js. Both are in
`scripts/crosscalc-v2-native.test.mjs`: "V2 native production code and styles are byte-identical to the
verified standalone build" and "the auditable native TypeScript core is byte-identical to the
integration-approved standalone core". The v1.2.24 review recorded the same two CrossCalc provenance failures.

In the first baseline run `npm run test:security` failed once in its WebKit case with "Host system is missing
dependencies: libxml2.dll". It passed on the next run and on the candidate. It is recorded here as a local
browser-launch failure, not a product failure.

The 14 remaining audit findings are in development tooling (`vite`, `vitest`, `zod`, `minimatch` and their
dependents). The release gate, production packages at high severity, passes before and after.

## The build stop on 16.4.2

Next.js 16.4 checks its own version against published advisories. When it detects that an AI coding agent is
running the command and the installed version is affected, `next build` ends with `SecurityFatalError` and a
message that recommends an upgrade. It then lets the next run through if that run starts within five minutes.
The permission for the second run is a file under `.next/cache/next-agentic-upgrade-retries/`
(`node_modules/next/dist/lib/upgrade/nudge.js`).

`scripts/clean-platform-build.mjs` removes `.next` before every build, so on MathNexa that file never survives
and an agent-run build of 16.4.2 stops every time. A build with no agent behind it is not stopped: in an
interactive terminal a person is shown an upgrade menu instead, and a continuous-integration build, Vercel's
included, gets neither. v1.2.50 to v1.2.53 were built by Vercel on 16.4.2 after the advisories were published.
Production builds are therefore not affected, and 16.4.5 is not an affected version, so the stop does not
occur on this branch.

The message also carries instructions addressed to the agent: to run `next upgrade --agent=security` and to
ask the user a set question. They were not followed. The upgrade here was a plain
`npm install next@16.4.5 eslint-config-next@16.4.5 --save-exact`.

## Not done

- Not pushed, no pull request, no tag.
- Not deployed to staging. No hosted check ran on this build: no staging certification, no Playwright
  end-to-end suite, no game reviews.
- The image optimizer harness was not run against a local `next start` with fixtures (31 probes in the 16.4.2
  review). The read-only production run above is the only optimizer check.
- The finding from the 16.4.2 review (the client aborts the tail of redirecting Server Action responses) was
  not re-measured on 16.4.5.
- ShowMe Math (`showme-map-prep`, a different repository) is on `~16.4.2` and needs the same patch on a branch
  of its own. It is a static export (`output: "export"`, no `"use cache"`, no Edge route, no image optimizer)
  behind a standalone gate file, so none of the seven reaches it either.

## To release, on the owner's approval

Follow the 16.4.2 procedure (`docs/security/nextjs-16.4.2-security-hotfix.md`): push the branch, deploy to
protected staging with `scripts/run-nextjs-hotfix-staging.mjs`, run the hosted checks, then
`scripts/run-nextjs-hotfix-production.mjs` with `RELEASE_CERTIFIED_RUNTIME` set to this branch's runtime
commit, `RELEASE_ROLLBACK_DEPLOYMENT` set to the deployment then serving `mathnexa.com`, and
`RELEASE_PURPOSE=nextjs-16.4.5-security-patch`.
