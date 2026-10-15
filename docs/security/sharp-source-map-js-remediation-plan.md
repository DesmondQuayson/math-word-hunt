# Remediation plan: sharp (librsvg) and source-map-js advisories

Assessed 2026-10-15 on `main` `0f8475b`. Production is v1.2.23 (`dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`, build `fe3e819`).
**Status: plan only.** Nothing has been changed, installed or deployed.

## Summary

`npm audit --omit=dev` reports two high-severity production advisories. They have been reported since v1.2.21 and
apply equally to the retained deployments v1.2.21, v1.2.22 and v1.2.23. **Neither is exploitable on MathNexa today,
so no containment action is needed.**

Both have a compatible patch release inside the ranges that Next.js 16.3.8 already declares. No Next.js upgrade and
no major-version change is needed. A scratch rehearsal (lockfile only) changed exactly 28 lockfile entries, all of
them `sharp` and its prebuilt binaries, or `source-map-js`. After it, `npm audit --omit=dev` reports 0.

| | sharp | source-map-js |
| --- | --- | --- |
| Advisory | [GHSA-wq5f-xc86-pv6w](https://github.com/advisories/GHSA-wq5f-xc86-pv6w): memory-safety flaw in the bundled librsvg; possible RCE on glibc Linux when decoding SVG (CVSS 4.0 8.9; published 2026-10-06; vulnerable < 0.35.5) | [GHSA-68fv-2mgg-jv7q](https://github.com/advisories/GHSA-68fv-2mgg-jv7q) / CVE-2026-93749: event-loop DoS from crafted indexed source-map section offsets (CVSS 3.1 7.5; EPSS 0.35 %; vulnerable 1.0.0 – < 1.2.2) |
| Installed | 0.35.4, with `@img/sharp-libvips-*` 1.3.3 | 1.2.1 |
| Patched | **0.35.5** (2026-09-27; libvips bundle 1.3.4 with librsvg 2.63.2) | **1.2.2** (2026-09-30) |
| Dependency path | `@math-vocabulary-hunt/platform-web` → `next@16.3.8`, which has an optional dependency `sharp@^0.35.4` | `@math-vocabulary-hunt/platform-web` → `next@16.3.8` → `postcss@8.5.23` (root override), which depends on `source-map-js@^1.2.1` |
| Runtime or build | **Production runtime**, in two server bundles: the admin media upload route and Next's own image optimizer | **Build only.** It is traced into 0 of 122 server function bundles. |
| Reachable from the internet | No (see below) | No |
| Patch fits the declared range | Yes: 0.35.5 satisfies Next's `^0.35.4` | Yes: 1.2.2 satisfies PostCSS's `^1.2.1` |
| Upgrade constraint | None from Next.js. The release pipeline asserts `sharp === "0.35.4"` and must change with it. | None |

## sharp: exposure and exploitability

The vulnerable code is librsvg, which libvips uses only to decode **SVG** input. The flaw is reachable only if
attacker-controlled SVG bytes reach `sharp()`.

**Where sharp runs.** A local production build was checked (`next build`, then the `.nft.json` output traces):

- `app/admin/media/upload/route.js` traces `sharp` and its platform binary. On Vercel, the binary is
  `@img/sharp-linux-x64` with libvips 1.3.3.
- `next-server.js` traces `sharp` for Next's self-hosted image optimizer.

**The image optimizer, `/_next/image`.** Production is served by Vercel's platform optimizer, not by the Next.js
function:

- `GET /_next/image?url=/icon.png` returns `Server: Vercel`, `X-Vercel-Cache`, `X-Matched-Path: /icon.png` and
  `Content-Disposition: attachment; filename="icon.webp"`, with no `X-Nextjs-Cache`.
- Re-checked live on 2026-10-15, and first established in `nextjs-16.3.4-security-hotfix.md`.
- An SVG source is refused: `GET /_next/image?url=/media/games/crosscalc.svg` returns **400** from Vercel.
- Remote sources are refused (400; checked by every release probe).
- So the function's sharp path does not run for `/_next/image`, and in any case it would not take SVG input.

**The admin media upload route** (`app/admin/media/upload/route.ts`). The only application call site, with five
gates in front of `sharp()`:

1. `inspectAdminAccess`: a Supabase session, an `admin_users` record, enrolled MFA at `aal2`, and a bound server
   session.
2. `validateAdminMutationCsrf`: an HMAC CSRF token.
3. `inspectImageUpload` (`packages/platform-core/src/admin-files/image-validation.ts`). It admits a file only when:
   - the magic bytes are PNG, JPEG or RIFF/WEBP;
   - the declared MIME type matches;
   - the size is 24 B to 8 MiB;
   - the dimensions are 1–8192 px.

   Everything else, SVG included, is quarantined and never reaches `sharp`.
4. `sharp(bytes, { failOn: "warning", limitInputPixels: 8192*8192 })`. libvips picks the loader by content sniffing,
   so a buffer that starts with a PNG, JPEG or WebP signature is decoded by that loader, never by `svgload`.
5. The output is re-encoded to WebP.

**Other sharp users.** These are developer scripts under `scripts/` (thumbnails, icons, 3D asset preparation). They
run locally on repository-controlled files and are not deployed.

**Assessment.** The vulnerable decoder is present in a production function bundle, but no input path can deliver
SVG to it. Reaching even the admin route needs a fully authenticated, MFA-verified admin with a valid CSRF token. This
is not credible as an actively exploitable production vulnerability. Upgrade anyway: the vulnerable library ships in
the bundle, and the fix is a compatible patch release.

**Optional defence in depth** (separate code change, not required). Call
`sharp.block({ operation: ["VipsForeignLoadSvg"] })` at module load in the upload route, as the advisory suggests.
This makes "no SVG decoding" a property of the process rather than of the upstream validator.

## source-map-js: exposure and exploitability

`source-map-js` parses source maps for PostCSS. MathNexa uses PostCSS only inside `next build`, on the repository's
own CSS.

- The production build's output traces include neither `source-map-js` nor `postcss` (0 of 122 `.nft.json` files).
  So it is not deployed in any server function.
- The DoS needs an attacker to supply an indexed source map to a running parser. No request reaches a parser in
  production, and the build consumes only committed files.

**Assessment.** It is not reachable in production. Upgrade it to clear the audit, and to protect build machines in
case untrusted CSS or source maps are ever processed.

## Proposed change (separate branch; not started)

1. **Branch** `security/sharp-0.35.5-source-map-js-1.2.2` from `main`. No game, billing, auth, Supabase, Super Admin
   or ShowMe change.
2. **Root `package.json` overrides.**
   - `sharp`: `0.35.3` → **`0.35.5`**. The `0.35.3` entry has been stale since v1.2.8: the lockfile resolves 0.35.4
     through Next's `^0.35.4`.
   - Add **`"source-map-js": "1.2.2"`**, following the existing override pattern (`postcss`, `nanoid`,
     `brace-expansion`, `minimatch`).
3. **Lockfile.** `npm update sharp source-map-js`. Use neither `npm audit fix --force` nor any other `--force`. The
   rehearsal in a scratch copy changed exactly:
   - `sharp` 0.35.4 → 0.35.5 and its 16 `@img/sharp-*` platform packages 0.35.4 → 0.35.5;
   - the 10 `@img/sharp-libvips-*` bundles 1.3.3 → 1.3.4;
   - `source-map-js` 1.2.1 → 1.2.2.

   That is 28 entries in total, and no other package moved. Then run `npm ci` from the new lockfile.
4. **Release tooling.** In `scripts/run-nextjs-hotfix-production.mjs`, change the preflight assertion
   `sharpVersion === "0.35.4"` to `"0.35.5"`. The staging runner asserts only the Next.js version.
5. **Docs.**
   - The override table in `dependency-security-review.md`.
   - This plan's status.
   - The release record.
6. **Gates.**
   - `npm audit --omit=dev` = 0.
   - typecheck, lint, all unit suites (including `image-validation.test.ts`), production build, `test:security`.
   - The output traces still show `sharp` only in the upload route and `next-server.js`.
   - An admin upload smoke on staging: PNG, JPEG and WebP convert to WebP, and SVG, AVIF and a renamed SVG are
     quarantined.
   - The release probes (optimizer local 200, remote 400, SVG 400).
   - The Tug of War hosted reviews as a regression smoke; its runtime is untouched.
7. **Release.** Deploy to staging first. Then go to production through the protected pipeline only with owner
   approval, keeping `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` (v1.2.23) as the rollback target. On Vercel, confirm from the
   build output that the function bundle carries `@img/sharp-linux-x64@0.35.5` and libvips 1.3.4.

**Priority.** A normal dependency hotfix (proposed v1.2.24), not an emergency: there is no reachable exploit path.

## Out of scope: dev-only advisories (recorded, not part of this change)

The full `npm audit`, including dev dependencies, also reports seven advisories that never ship to production:

- **`braces` chain (high).** `braces` → `micromatch` → `fast-glob` → `@next/eslint-plugin-next` →
  `eslint-config-next`, which is lint tooling. npm's suggested fix is a **semver-major downgrade** to
  `eslint-config-next` 14.2.35, which `npm audit fix --force` would apply. It must not be applied; wait for a patched
  `eslint-config-next` 16.x or override `braces`, in its own change.
- **`vitest` and `@vitest/mocker` (moderate).** A path traversal in the test runner's mock redirect, used only in
  local and CI tests. Handle it with a test-tooling update. Note that the root `devDependencies` pin `vitest` (and
  `typescript`, `@types/node`, `globals`, `@playwright/test`) to `latest`, which is itself worth pinning.
