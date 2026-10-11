# MathNexa v1.2.21 — Math Tug of War 3D characters and team celebration

Released 2026-10-11 under explicit owner approval (the owner personally tested the staging preview, including the
winning team's group hug and synchronized jumps, and authorised the production release). It ships the Math Tug of War
3D upgrade only: six original MakeHuman (CC0) characters with a Mixamo-named rig and ARKit face morphs, a vendored
three.js subset, procedural rope-pulling with fatigue, stumble, fall and recovery, and the winning team's shared
celebration (release, huddle hug with arms over shoulders, synchronized jumps, arm-in-arm team pose). The SVG scene
remains the accessible, always-available layer and the classic fallback.

There is no database migration, no production environment change and no dependency change. Mathematics questions,
answer checking, scoring, win rules, matchmaking, room codes, synchronization, the server API, other games, accounts,
subscriptions, billing, admin access, navigation and ShowMe Math Lab are unchanged. Super Admin V2 stays paused.

| | |
| --- | --- |
| Version / tag | `v1.2.21` (annotated) → `8046e67` (tree `b8e83718`) |
| Feature branch | `feature/math-tug-of-war-3d-characters-v1` (from `main` `cbc7121`, v1.2.20) |
| Staging-certified runtime | `fdd1fba` (preview `dpl_EKSG5TN6Mt8Hw2YHeTbNM5fgZV65`, `https://mathnexa-platform-staging-b8uvhvmh3-bright-path-ed-tech.vercel.app`: classic review 99/99, 3D review 37/39 with only a shader-compiler warning flagged) |
| Released commit | `8046e67`: differs from `fdd1fba` only in docs, scripts, the review pack and a two-line Vitest timeout in `animation.test.ts`. No runtime path (`apps/platform-web/public`, `features`, `lib` product code, `packages`, `supabase`) changed, and the game's runtime content hash is identical (`fad4f8af6488a7b2…`). |
| Release commits | 11 commits, `cbc7121..8046e67`; 140 files, +44,961 / −33, all under the Tug of War runtime, its tests, capture scripts, docs and review pack (plus `.claude/launch.json`) |
| Main | **Pending (owner step).** The session's permission policy refused both the tag creation and the fast-forward of `main`. Run, from a checkout at `8046e67`: `git tag -a v1.2.21 8046e67 -m "MathNexa v1.2.21 - Math Tug of War 3D characters and team celebration" && git push origin v1.2.21 && git push origin 8046e67:main` (a fast-forward from `cbc7121`, no force; the GitHub-linked staging project then rebuilds its own alias with the same runtime, which is harmless). This record follows as a docs commit. |
| Migration | None. Nothing under `supabase/` changed. |
| Production environment | Unchanged (54 variables, last modified 2026-09-30, before v1.2.20) |
| Candidate / production runtime | `dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i`, build `8046e67`, promoted 2026-10-11 02:49:56 UTC |
| Rollback runtime | `dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA` (v1.2.20, build `56667b0`), retained and Ready |
| Rollback command | `RELEASE_CERTIFIED_RUNTIME=8046e67 RELEASE_ROLLBACK_DEPLOYMENT=dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA node scripts/run-nextjs-hotfix-production.mjs --stage=rollback` (moves the alias back; deletes nothing), then `--stage=probe-live --expect-deployment=dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA` |
| Dependencies | Unchanged (`package-lock.json` identical to v1.2.20). `npm audit --omit=dev` now reports 2 high advisories that were published after v1.2.20 and already apply to the live site: sharp < 0.35.5 (librsvg CVE-2026-96889; the upload validator only passes PNG/JPEG/WebP to sharp and `/_next/image` is served by the platform optimizer) and source-map-js 1.0.0–1.2.1 (event-loop DoS; a build-time PostCSS dependency). Out of this release's scope; a dependency hotfix is the follow-up. |

## What changed

See `docs/math-tug-of-war-3d-v1.md` (design, verification, limitations, results) and
`docs/math-tug-of-war-3d-assets.md` (asset provenance). Owner review pack:
`owner-review/math-tug-of-war-3d-v1/`.

- `12c0752` 3D characters, procedural rope-pulling animation, composite scene, quality tiers, 3D toggle, e2e.
- `94beff1` adult heights, classic e2e projects pinned, capture timing.
- `1ca3f94`, `3a76d84`, `d267a38`, `badde6e` review packs and results.
- `45b35c9` polish (lighting, braced stance, stumble/fall/recovery, fatigue, jerseys), multiplayer 3D certification, staging tooling.
- `d073832` the 3D layer never delays or breaks the match while its models load (found by the hosted review).
- `fdd1fba` the winning team celebrates together: huddle hug with real shoulder contact, synchronized jumps, team pose.
- `8be30b8`, `8046e67` scripts and a test timeout.

## Tests (pre-release, on the released tree)

| Gate | Result |
| --- | --- |
| Unit | core 245/245; web 888 passed, 1 skipped (incl. 95 Tug of War tests: engine, generator, robot, online authority, API, runtime delivery, animation layer, team celebration) |
| Static | TypeScript clean; ESLint 0 errors (8 pre-existing warnings); production build |
| Security | `test:security:baseline` 315/315; platform bundle audit (37 client assets, 47 core files); Number Cross launch audit; protection-bypass helper tests |
| Tug of War local e2e (8 projects, classic + 3D, Chromium and WebKit, phones, iPad) | 138 passed, 15 skipped by design, 0 failed; `webkit-3d` alone 11/11; `chromium-3d` 11/11; phone project 9 passed |
| Tug of War online two-client (local Supabase) | classic `online.spec` + `free-access` 12 passed, 1 skipped; 3D on both clients (`online-3d.spec`, hug on the same clock) passed |
| Covered by the above | both teams win, hug and jump (Pink and Turquoise); delayed model loading never breaks a match; WebGL/classic fallback; reduced motion plays a whole match on the SVG scene; 12 viewport sizes with no overlap of the math; axe; soak (no GPU/heap growth); frame time |

## Staging

Three protected previews on `mathnexa-platform-staging` (GitHub-linked, SSO on previews): round 1 (`3a76d84`) found
the model-loading regression, round 2 (`d073832`) certified the fix, round 3 (`fdd1fba`) certified the team
celebration (classic 99/99, 3D 37/39). Owner tested round 3 and approved.

## Production rollout

| Step | Result |
| --- | --- |
| Pre-deployment check | Fetched origin. `mathnexa.com` served `dpl_D2Mc…` (v1.2.20, build `56667b0`), the expected rollback target, healthy. Production project has no Git link; production target `dpl_D2Mc…`; environment unchanged since 2026-09-30. Head `8046e67`, clean tree, Next 16.3.8, sharp 0.35.4, PH2-07 files absent. |
| Preflight (02:35 UTC) | Pass |
| Deploy (02:45–02:47 UTC) | `dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i` built from the clean tree `b8e83718` with the production environment and no domain (`--prod --skip-domain`, `MVH_SOURCE_REVISION=8046e67`). Host protected. Apex unchanged during the deploy. |
| Pre-promotion probes (02:47 UTC) | 6/6: health (build `8046e67`, payments live), webhook, canonical host, no server errors, optimizer, remote optimizer refused |
| Promote | 02:49:30–02:49:56 UTC. The apex moved to `dpl_8FwR…`. `dpl_D2Mc…` not deleted, still Ready. |
| Live probes (02:50 UTC) | 22/22: webhooks, canonical hosts, public pages, product gating, private no-store, admin fails closed, scheduler, fixture absent, game runtime, Tug gating (sign-in required, never pricing), Tug API refuses anonymous, forged access, security headers, images |
| Hosted classic review on the apex | **99/99** (02:50–02:58 UTC): free-account path, six skills, keypad, Two Teams, Smart Board 1920×1080, phones 320–430, iPad WebKit, reduced motion, Online Match host/guest across Chromium and WebKit with disconnect, reconnect, win, rematch, leave, two non-subscribers. Synthetic accounts (4) and rooms (2) deleted. |
| Hosted 3D review on the apex | **39/39**: deployment serves commit `8046e67`; the game document versions its runtime with the tested content hash `fad4f8af6488a7b2`; models, vendored three.js and the 3D modules byte-identical to the released source; route CSP unchanged; 3D on hardware GL, classic on reduced motion and on software GL; pulls mirrored, no celebration before the win, winners celebrate and losers fall only after the confirmed win; toggle to classic and back; phone 390/430, Smart Board, iPad WebKit and WebKit desktop renders with no overflow and the math never covered; Online Match with the 3D scene on both clients (Chromium host, WebKit guest): both celebrate the same confirmed winner, database agrees, rematch, leave; no page errors. Synthetic accounts (2) and room (1) deleted. |
| Runtime logs | `dpl_8FwR…`, 02:49–02:58 UTC: 0 5xx, 0 error, 0 fatal (`vercel logs --status-code 5xx`, `--level error`, `--level fatal`, two windows); the `--status-code 4xx` control returned the probes' expected refusals (9 rows), so the filters cover the period. |

## Known limitations

- Procedural animation, not motion capture; MakeHuman-grade characters. The group hug is a shoulder huddle with
  real palm-on-shoulder contact, not chest-to-chest. Expressions are natural and moderate.
- Real Safari and a physical iPad or Smart Board were not used; WebKit evidence is Playwright's engine, locally and
  against the hosted builds. Smart Board and phone layouts were verified at their viewport sizes in headless
  browsers and on the hosted builds.
- Playwright's Windows WebKit build occasionally loses a page under long multi-browser GPU load; 0 of 42 targeted
  runs reproduced it and one of the losses hit a page without WebGL (`docs/math-tug-of-war-3d-v1.md` §5).
- Pre-existing on v1.2.20: at 390 px with a keyboard badge showing (desktop keyboard mode on a tiny viewport) the
  Pink panel's team name wraps letter by letter; real phones (touch) hide the badge.

## Final verification and integrity

- Super Admin V2: untouched (no commit on this branch touches `apps/platform-web/app/admin` or admin code; the
  branch `super-admin-v2` work stays paused).
- ShowMe Math Lab: untouched (no path under ShowMe / MAP Prep changed; `showme-map-prep-*` projects not deployed).
- Stripe, billing, subscriptions, Supabase schema, production environment: untouched.
- No third-party requests: the game runs under `connect-src 'self'` and `script-src 'self'`; `runtime.test.ts` proves every module, the vendored three.js and the models reference no external host and the 3D modules never fetch or open sockets.
- Repository: branch `feature/math-tug-of-war-3d-characters-v1` at `8046e67` plus this record; `origin/main` still `cbc7121` until the owner step above.
