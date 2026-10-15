# MathNexa v1.2.22 — Math Tug of War 3D: rope grip and team sneakers

**Release status: released 2026-10-14 05:21 UTC (00:21 US Central), superseded by v1.2.23 on 2026-10-15.**
v1.2.22 was released under explicit owner approval. The owner had inspected the v1.2.21 live game and asked for
hands that visibly hold the rope and for athletic sneakers.

It ships the Tug of War 3D hotfix only:

- an underhand bar grip with the rope running through the closed fists;
- team-coloured athletic sneakers on all six characters;
- a cheaper wrist solver;
- the fix for teeth that the garment-inflation step had pushed out 8 mm.

The SVG scene remains the accessible layer and the classic fallback.

The sneakers met their goal. The visible grip did not: from the normal gameplay camera, most hands were hidden behind
the pullers' own bodies (see Known limitations). v1.2.23 replaced the grip.

There is no database migration, no production environment change and no dependency change. Mathematics, answer
checking, scoring, win rules, matchmaking, room codes, synchronization, the server API, the other games, accounts,
subscriptions, billing, admin access, navigation and ShowMe Math Lab are unchanged. Super Admin V2 stays paused.

This record was drafted during the release session but not finished then. It was completed on 2026-10-15 from:

- the release session's saved gate and pipeline logs (`qa-artifacts/release22/`, git-ignored);
- the pipeline's evidence files;
- the Vercel API and the deployment itself;
- Git.

Where a value was not re-verified on 2026-10-15, the row says so.

| | |
| --- | --- |
| Version / tag | `v1.2.22` (annotated; tagged retroactively and pushed on 2026-10-15; tag object `58a4f0e6`) → `9c3917d` (`9c3917d0ddfaa6f65b9b69937addf8e2f862e7ce`, tree `b07b550a8f7b0479616bcbf24e2d94ad5dd9a5ec`) |
| Branch | `hotfix/math-tug-of-war-3d-grip-sneakers` from `8046e67` (v1.2.21 production) |
| Certified runtime | `8ed4abc` (`8ed4abcc18e243a40e04dd1b6e19fb02e46d1f97`). `9c3917d` differs only in docs, the review script and hosted screenshots. The pipeline's runtime diff of `apps`, `packages`, `supabase` and the dependency manifests is empty, and the game's runtime content hash is `4738d366b6beb1dc3bab5f699f02da6c40ee95789ce554b17fab32bd46d3705d` on both. |
| Release commits | `c5d0981` grip, sneakers, tests, tooling, pack; `af3524a` solver cost, model tune, teeth fix; `f130b45` docs; `8ed4abc` review close-up camera (review tooling behind the graphics override); `9c3917d` docs and review script |
| Staging | `dpl_4dQGvnGChMooB2W2ZywcR8Kp3SSv` (`https://mathnexa-platform-staging-pdl42gplj-bright-path-ed-tech.vercel.app`): hosted 3D review 39/39, hosted classic review 99/99 (run one at a time) |
| Main | Not moved at release time. The v1.2.22 commits reached `main` on 2026-10-15, with the v1.2.23 fast-forward `8046e67..d057949` (no force). |
| Migration | None. Nothing under `supabase/` changed. |
| Production environment | Unchanged (54 variables, last modified 2026-09-30), as checked by the release session; not re-checked on 2026-10-15 |
| Production runtime | `dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH` (`https://mathnexa-platform-production-7a8m8uvuq-bright-path-ed-tech.vercel.app`), built from `9c3917d`, promoted 2026-10-14 05:21:27.006–05:21:56.208 UTC |
| Rollback runtime at release | `dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i` (v1.2.21, build `8046e67`), retained |
| Rollback command at release | `RELEASE_CERTIFIED_RUNTIME=8ed4abc RELEASE_ROLLBACK_DEPLOYMENT=dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i node scripts/run-nextjs-hotfix-production.mjs --stage=rollback`, then `--stage=probe-live --expect-deployment=dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i` |
| Superseded | 2026-10-15 02:32:34–02:33:02 UTC by v1.2.23 (`dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`). `dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH` is now the v1.2.23 rollback target. |
| Dependencies | Unchanged (`package-lock.json` identical to v1.2.20 and v1.2.21). `npm audit --omit=dev` reported the same two high advisories as at v1.2.21 (see Security). |

## Verification on 2026-10-15

These checks are what the `v1.2.22` tag rests on.

- `vercel inspect dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH`: production target, Ready, created 2026-10-14 05:15 UTC.
- `/api/health` on that deployment, through `vercel curl --deployment`: build
  `9c3917d0ddfaa6f65b9b69937addf8e2f862e7ce`.
- **Uploaded source.** Its Vercel file uids (SHA-1 of the content) were compared with `9c3917d` over `apps`,
  `packages`, `supabase` and the root manifests:
  - 1,296 of 1,298 tracked files identical, 0 different;
  - the 2 files not uploaded are `.gitignore` files;
  - the Tug of War runtime: 60/60 identical.
- **Promotion evidence.** The pipeline recorded
  `PROMOTED {"promoted":"dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH","previous":"dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i"}`. Its
  evidence file records the alias moving from `dpl_8FwR…` to `dpl_Ejn4…` and the rollback target retained.

## What changed

See `docs/math-tug-of-war-3d-v1.md` §2 (Grip, Footwear) and §5 (hotfix gates). The owner review pack is
`owner-review/math-tug-of-war-3d-v1/`; files 26–36 are the hand and sneaker close-ups and two recordings, superseded for
the hands by the `visible-grip/` pack of v1.2.23.

**Grip.**

- Each hand holds the rope like a bar at hip height: palm up and slightly inward, knuckles across the rope so the wrist
  stays straight, fingers curled over the rope, thumb closed on top.
- The closed fist's hole was measured on the rig. At curl 0.6 it is 66 mm along the knuckles and 44 mm out of the
  palm, a 31 mm radius for the 22 mm rope.
- The solver moves the wrist until the real hole, measured from the posed bones, is on the rope within a millimetre,
  including mid-heave when fatigued.
- The rope is built through the fists. Hands release only on the win or the fall.

**Sneakers.**

- All six characters wear the CC0 MakeHuman `shoes05` athletic sneaker, with generated team textures:
  - white upper;
  - team-colour heel and tongue;
  - charcoal trims and outsole, with team-colour tread.
- The source photo's third-party stripe design and maker's mark are painted out.
- Shoe vertices take their skin weights from the nearest body foot vertices, so the sneakers follow the foot and
  toes through steps, stumbles and jumps.

**Found on the way.**

- **"Torn" hands and shoes.** The first close-up captures showed them, but the cause was the review camera's 0.5 m
  near plane slicing geometry 0.4 m away, not the models. The debug close-up now moves the near plane to 3 cm.
- **Teeth.** The garment inflation of `af3524a`'s predecessor matched "teeth" through "tee" and pushed the teeth out
  8 mm in v1.2.21. This is fixed.

## Tests (release gates on `9c3917d`, one job at a time)

| Gate | Result |
| --- | --- |
| TypeScript / ESLint / production build | clean / 0 errors (8 pre-existing warnings) / built ("Compiled successfully") |
| Unit | core 245/245. Web: 888 passed, 1 skipped, 1 failed in the full run. The failure was the CrossCalc 2,500-puzzle validation, which is CPU-bound with a 5-minute limit and unrelated to this branch. Rerun alone: **5/5 in 240.9 s**. |
| Security | `test:security:baseline` 315/315 (26 files); platform bundle audit (37 client assets, 47 core files); Number Cross launch audit; protection-bypass helper tests |
| Tug of War local e2e, classic projects (Chromium/WebKit desktop, Pixel 7, iPhone 13, iPad) | 107 passed, 13 skipped by design |
| Tug of War 3D e2e, Chromium | `chromium-3d` 12/12; `chromium-3d-mobile` 10 passed, 2 skipped |
| Tug of War 3D e2e, WebKit | `webkit-3d`: 11 passed, 1 lost its page. The lost test was "hands really hold the rope while pulling, and the rope drops to the grass once the match is decided": "Target page, context or browser has been closed" while clicking a keypad key, the known Windows WebKit test-build fault. Rerun alone: **1/1 passed** (1.4 min). |
| Tug of War Online Match (two real clients, local Supabase), classic and 3D on both clients | 12 passed, 1 failed in the full run. The failure was "WebKit interoperability: a Chromium host and a WebKit guest share one match": the guest's `.team-panel.team-pink` was not visible within 20 s. Rerun alone: **passed** (41.6 s; 1 skipped by design). |
| Staging hosted reviews (above) | 3D 39/39, classic 99/99 |
| Performance (same machine, back to back, 1366×768 medium tier) | v1.2.21 8.5–8.6 ms per frame, v1.2.22 8.9–9.0 ms (+0.4 ms). Render triangles 292 k → 364 k because the hands keep full detail. Posing cost for six pullers in Node: 0.31 → 0.53 ms. |

The unit, typecheck and performance figures come from the release session's own outputs; their logs were not kept in
`qa-artifacts/release22/`. Every other row is backed by a saved log there.

## Security

`npm audit --omit=dev` reported the same two high advisories as at the v1.2.21 release. Both already applied to the
live site, and both are outside this hotfix's scope, since no dependency is changed here.

- **sharp < 0.35.5** (librsvg, GHSA-wq5f-xc86-pv6w).
  - In production, sharp runs only in the admin media upload route, and only after `inspectImageUpload` admits PNG,
    JPEG or WebP by magic bytes. SVG never reaches librsvg.
  - `/_next/image` on Vercel is served by the platform optimizer.
  - The route requires an authenticated admin with MFA.
- **source-map-js 1.0.0–1.2.1** (event-loop DoS through indexed source-map sections, GHSA-68fv-2mgg-jv7q). It is a
  build-time PostCSS dependency.
- The full investigation and remediation plan is in
  `docs/security/sharp-source-map-js-remediation-plan.md` (2026-10-15).

**The game route.**

- The game runs under `default-src 'none'; script-src 'self'; connect-src 'self'`.
- `runtime.test.ts` proves that every module, the vendored three.js and the models reference no external host, and
  that the 3D modules never fetch or open sockets.
- The hosted 3D review verified that the served models, sneaker textures and modules are byte-identical to the
  source, and that the route CSP is unchanged.

## Production rollout

All times are UTC on 2026-10-14, from the pipeline's step lines and its evidence files
(`%TEMP%\mathnexa-nextjs-hotfix-production-<stage>-<epoch>.json`). The pre-deployment check is the release session's
own summary.

| Step | Result |
| --- | --- |
| Pre-deployment check | Fetched origin. `mathnexa.com` served `dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i` (v1.2.21, build `8046e67`), Ready and healthy. The production project has no Git link, its production target was `dpl_8FwR…`, and there was no newer production deployment. Environment unchanged since 2026-09-30. Head `9c3917d`, clean tree, Next 16.3.8, sharp 0.35.4. |
| Preflight (03:26:54) | PASS: certified runtime `8ed4abc`, no runtime diff, PH2-07 files absent, health 200 (build `8046e67` before the release), webhook endpoints refuse unsigned posts |
| Deploy (05:15:09) | PASS. `dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH`, Ready, non-aliased and production-configured. Candidate commit `9c3917d`, tree `b07b550a`, certified `8ed4abc`, Next 16.3.8, sharp 0.35.4. |
| Pre-promotion probes (05:17:50) | PASS through the CLI protection bypass. Health 200; unsigned webhook 400; home, account, pricing, admin, scheduler, fixture, game runtime and forged-access URLs all 308 to the canonical apex; optimizer: local icon 200, remote 400. |
| Promote (05:21:27–05:21:56) | PASS. `PROMOTED dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH` from `dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i`; the rollback target was retained. |
| Live probes (05:22:14) | PASS, 22/22. The apex HTML is served by `dpl_Ejn4…`; webhooks on the configured, apex and www hosts; health; browser host and www redirects; public pages; product surfaces redirect; private pages no-store; admin, scheduler and fixture fail closed; game runtime denied; Tug of War requires sign-in and its API refuses anonymous calls; other games still protected; forged access denied; security headers; images; optimizer refusals; no server errors. |
| Hosted classic review on the apex | **99/99**; synthetic users deleted: 4; rooms removed: 2. The WebKit "access control checks" page errors on `_rsc` prefetches are known noise and are filtered. |
| Hosted 3D review on the apex | **39/39**; synthetic users deleted: 2; rooms removed: 1. The evidence is in `owner-review/math-tug-of-war-3d-v1/production/` as of commit `478f274`. |
| Runtime logs (05:04–05:34) | **5xx: 0.** `level:error`: 0. `level:fatal`: 0. 4xx: 25 records, all explained (below). |

**The 25 4xx records.**

- 11 are the probes' deliberate requests for missing pages.
- 12 are the probes' expected refusals:
  - unsigned webhook 400 ×3;
  - remote `/_next/image` 400 ×3;
  - `/admin` 404;
  - billing fixture 404;
  - scheduler 401;
  - game runtime 401;
  - anonymous Tug of War API 401 ×2.
- 2 are 499 client aborts from the review browser closing during a load.

## Known limitations

- **The grip was not visible from the gameplay camera.** This is why v1.2.22 was superseded.
  - After release, the owner found that the pullers did not visibly hold the rope.
  - Measured on `9c3917d` with the player-camera probe that v1.2.23 introduced: on desktop at rest, 0 of 12 hands
    pass the visible-grip threshold, and 8 have under 4 px on the visible rope.
  - The pullers stood between the camera and the rope, and the release gates checked the grip geometrically, against
    a rope built through the fists. So they could not catch it.
  - Root cause and fix: `docs/releases/mathnexa-v1.2.23-release-record.md`.
- **Animation and models.** The animation is procedural, not motion capture, and the characters are MakeHuman-grade.
  The grip was a measured fist around the rope, with no per-finger contact solving against the rope's surface.
- **No real devices.** Real Safari, a physical iPad and a physical Smart Board were not used. WebKit evidence is
  Playwright's engine, locally and against the hosted builds. Phone, tablet and Smart Board layouts were verified at
  their sizes.
- **Windows WebKit test build.** Playwright's Windows WebKit build occasionally loses a page under GPU load. Every
  such loss in this release reran green alone.

## Final verification and integrity

- Super Admin V2, ShowMe Math Lab, other games, Stripe and billing, subscriptions, authentication, the Supabase schema
  and the production environment were untouched. Every changed path is under the Tug of War runtime, its tests, its
  capture scripts, docs and the review pack.
- Production served `dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH` (build `9c3917d`) from 2026-10-14 05:21 UTC until v1.2.23
  was promoted on 2026-10-15 02:32 UTC. It stays Ready and retained as the v1.2.23 rollback target.
- The release session did not finish this record, the `main` fast-forward or the tag. Those were completed on
  2026-10-15, as described above.
