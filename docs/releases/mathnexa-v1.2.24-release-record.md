# MathNexa v1.2.24 — Next.js 16.4.2 security hotfix

Released 2026-10-18 (UTC) under explicit owner approval ("Authorized: release MathNexa ad48cb3 (Next 16.4.2) to
production as v1.2.24 with the established pipeline, accepting findings A and A2"). The release patches the
October 14, 2026 Next.js advisories:

- **GHSA-673q-mjm6-r5xr**: `use cache` remote code execution.
- **GHSA-2464-fhr4-w9xw / CVE-2026-96889**: Image Optimization SVG remote code execution, through sharp/librsvg.
- **GHSA-p3m5-59mp-jv5r**: Server Actions denial of service. This one applied to six production modules.

All three are fixed only in Next.js 16.4.1 and later. They are vercel/next.js *repository* advisories, so
`npm audit` does not report them.

The release ships the dependency change only. There is no database migration and no production environment change.
Mathematics, answer checking, scoring, narration, worksheets, answer keys, the games, accounts, authentication,
subscriptions, Stripe billing, entitlements and admin access are unchanged in code, as are ShowMe Math Lab and
navigation. Super Admin V2 stays paused.

The full review is in `docs/security/nextjs-16.4.2-security-hotfix.md`.

| | |
| --- | --- |
| Version / tag | `v1.2.24` (annotated, pushed; tag object `af2e49a3`) → `30de166` (`30de166fc1c71b8c3ca77c6967079e743e01fc5d`, tree `34cd65bf617cbd8ebbcf8c99569afa5472e8b6c3`) |
| Branch | `fix/security-nextjs-16-4-2` from `0f8475b` (v1.2.23 `main`) |
| Certified runtime | `ad48cb3`. The pipeline's runtime diff from `ad48cb3` to `30de166` over `apps`, `packages`, `supabase` and the dependency manifests is empty. Later commits change only docs and one test-only `e2e/` helper (`6d22188`). |
| Math Tug of War runtime hash | `79574206b9401535…`, identical to v1.2.23 (the game runtime is untouched) |
| Staging | `dpl_6L8TQb2ZW6VcvNWSVSxKe5KGmbqV`: staging gate certification PASS; hosted Tug of War classic 99/99 and 3D 57/57 |
| Production candidate | `dpl_FMypQGtyH77iytSB8mVukfeANhUX` (`https://mathnexa-platform-production-2qqw92zb3-bright-path-ed-tech.vercel.app`), built from `30de166` with `--prod --skip-domain` |
| Production runtime | `dpl_FMypQGtyH77iytSB8mVukfeANhUX`, `/api/health` build `30de166fc1c71b8c3ca77c6967079e743e01fc5d`, `production-platform`, payments `live`. Promoted 2026-10-18 07:20:18–07:20:46 UTC. |
| Rollback runtime | `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` (v1.2.23, build `fe3e819`), retained and Ready |
| Main | Fast-forwarded `0f8475b..30de166` with no force, after the owner authorized it. The production Vercel project has no Git link, so this did not deploy production. It started the staging project's rebuild from `main` (`mathnexa-platform-staging-fakdaqwr6`). |
| Migration | None. Nothing under `supabase/` changed. |
| Production environment | Unchanged. The pipeline deploys with the existing production variables and changes none. |

## Dependency change

| Package | v1.2.23 | v1.2.24 |
| --- | --- | --- |
| `next` | 16.3.8 | **16.4.2** (exact) |
| `eslint-config-next` (dev) | 16.3.8 | **16.4.2** (exact) |
| `sharp` (optional, via `next`) | 0.35.4 | **0.35.5**; libvips 8.18.7, librsvg 2.63.2 (`@img/sharp-libvips-*` 1.3.4) |
| `source-map-js` (build-time, via PostCSS) | 1.2.1 | **1.2.2** (GHSA-68fv-2mgg-jv7q), its own commit `c1b1511` |
| Vendored App Router React | 19.3.0-canary-cbb046ab-20260731 | 19.3.0-canary-278794d7-20261002 |
| `react`, `react-dom` | 19.2.8 | 19.2.8 (unchanged) |

The lockfile changes 39 package entries in `d2ebf23` and 1 in `c1b1511`. Nothing else moved: there was no
`npm audit fix` and no `--force`.

| `npm audit` | v1.2.23 (`0f8475b`) | v1.2.24 |
| --- | --- | --- |
| `--omit=dev` | 2 high (sharp, source-map-js) | **0** |
| all | 9 (7 high, 2 moderate) | 7 (5 high, 2 moderate). All are dev-only and unchanged: the `braces` lint chain under `eslint-config-next`, and `vitest`. |

| Commit | Change |
| --- | --- |
| `d2ebf23` | Next.js 16.3.8 → 16.4.2, `eslint-config-next` 16.4.2 and the sharp override 0.35.5; the pipeline asserts the new versions. |
| `c1b1511` | `source-map-js` 1.2.2 override (separable). |
| `ad48cb3` | The image optimizer harness probes SVG refusal (GHSA-2464). This is the certified runtime. |
| `d1b2f43`, `5246b5f`, `2210a47`, `1a88a5d` | Docs only: hotfix record, final security release review, Docker repair, batch 3 results. |
| `6d22188` | Test-only (`e2e/`): the Number Cross and Number Logic failed-request checks tolerate only Next 16.4's redirecting Server Action abort. |
| `30de166` | Docs only: narrowed-check results and finding A2. This is the production build. |

## Tests (pre-release)

These are summarised from the final security release review; each gate is compared with a base or reference run.

| Gate | Result |
| --- | --- |
| Uploads: unit, validator plus sharp pipeline probe, admin media and PDF e2e | 12/12, 14/14, 1/1, 1/1. SVG, AVIF, GIF, mislabelled and polyglot uploads are all quarantined; no SVG decoder runs. |
| Admin route surface (gate and CSRF on all 31 admin routes) | 136/136; `test:security` 315/315 |
| Auth unit; consumer identity, access-flow and admin auth e2e | 126/126 and 14/14; 10/10; 17/17; 5/5 |
| School access e2e; header sign-in → Sign out probe | 21/21; 10/10 |
| Games | Number Logic 26/26, 7/7; Number Cross 26/26, 5/5; CrossCalc V2 22/22, 2/2; game suite 6/6; Math Vocabulary Hunt 4/4, 8/8, 40/40, 3/3 |
| Math Tug of War local | classic 107 passed / 13 skipped; 3D Chromium 25/2; WebKit 3D: the known pre-existing flake (finding B), also seen on base |
| Multiplayer | local 13/1; hosted Online Match and 3D Chromium host + WebKit guest pass |
| Mobile, tablet, desktop, Smart Board | `test:e2e:mobile-gameplay` 151 passed (41 skipped by design); `audit:mobile-gameplay` 16/16 |
| Rope grip, the owner's criterion | All six characters visibly hold the rope with both hands on every device, at rest and after a pull. 192/192 hand measurements. |
| Hosted staging | Staging gate certification PASS; Tug of War classic 99/99, 3D 57/57 |
| Narrowed failed-request check (`6d22188`) | helper 3/3, 9/9 mutants caught; Number Cross: candidate 3/3, base 3/3; Number Logic: candidate 2/3 (A2), base 3/3 |

**Findings accepted by the owner:**

- **A**: with Next 16.4.2, the browser aborts the streaming body of Server Action responses that carry
  `x-action-redirect` (admin sign-in, MFA verify). This happens after the headers and cookies arrive, so it is a
  benign 16.4 behaviour change.
- **A2**: once, the candidate aborted the tail of the non-redirecting admin MFA enroll response (Number Logic
  e2e, 1 of 3). The flow still completed.

## Release pipeline (2026-10-18)

`scripts/run-nextjs-hotfix-production.mjs` ran with `RELEASE_CERTIFIED_RUNTIME=ad48cb3`,
`RELEASE_ROLLBACK_DEPLOYMENT=dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` and
`RELEASE_PURPOSE=nextjs-16.4.2-security-hotfix`. Logs are in `qa-artifacts/nextjs-16-4-2/release-*.log`; the
`EVIDENCE` JSONs are on the release machine under `%TEMP%`.

| Stage | UTC | Result | Evidence |
| --- | --- | --- | --- |
| preflight | 07:15:34 | PASS. The apex served `dpl_3dkm5…`; health, webhook and host behaviour recorded. | `mathnexa-nextjs-hotfix-production-preflight-1792307758582.json` |
| deploy-preview | 07:16:07 | PASS: `dpl_FMypQG…` Ready, no alias, host protected; candidate tree `34cd65bf…`, next 16.4.2, sharp 0.35.5 | `…-deploy-preview-1792307906415.json` |
| probe-preview | 07:18:35–07:19:58 | PASS, 6/6 | `…-probe-preview-1792307998199.json` |
| promote | 07:20:18–07:20:46 | PASS: alias `dpl_3dkm5…` → `dpl_FMypQG…` | `…-promote-1792308046090.json` |
| probe-live | 07:20:54–07:21:08 | PASS, 22/22: the alias serves `dpl_FMypQG…` | `…-probe-live-1792308068291.json` |

## Post-release checks

| Check | Result |
| --- | --- |
| `/api/health` | build `30de166…`, `production-platform`, payments `live`; apex `data-dpl-id` `dpl_FMypQGtyH77iytSB8mVukfeANhUX` (rechecked 12:21 and after the tag push) |
| Image optimizer harness | 14 probes, 0 failed (`release-post-optimizer.log`) |
| Runtime logs for the new deployment | `--status-code 5xx`, `--level error`, `--level fatal`: 0, 0, 0 |
| Math Tug of War classic, live apex | **99/99**: 4 synthetic users and 2 rooms removed (12:22–12:26) |
| Math Tug of War 3D, live apex | **57/57**: all 12 hands on the rope on every device; 2 synthetic users and 1 room removed (12:26–12:29) |
| Synthetic leftovers (read-only count afterwards) | 0 synthetic users, 0 rooms in the last 2 h; entitlements back to the 4 real rows |

**The first Tug of War review attempt (07:21) stopped before any check.** The fixture's synthetic subscriber write
reported `synthetic-entitlement-failed`. The diagnosis was read-only. **The database was not the cause: the release
machine's clock was.**

- Production `pg_stat_statements` showed the fixture's `trial_redeemed_at` UPDATE refused, while the entitlement
  INSERT succeeded.
- `consumer_accounts_check1` requires `trial_redeemed_at >= created_at`. The fixture took `trial_redeemed_at` from
  the local clock, while `created_at` is the database's `now()`.
- The machine woke from sleep at 03:42 UTC with its clock loaded from the hardware clock. It had no NTP source
  until 07:14 UTC.
- The staging refusals at 04:37 and 06:00 UTC fall in the same window.
- A local reproduction with the clock 1.1 s behind gives the same split: `23514 consumer_accounts_check1` on the
  update, the insert ok.
- Schema, grants, RLS, locks, the identity policy, PostgREST and Auth were all unchanged, and the database was not
  read-only.

The fixtures were then fixed: they take their times from the account's `created_at`, and a refused write now names
its PostgREST code. This is commit `82c7344` on the local branch `test/fixture-clock-skew`, test-only and not yet
merged. The passing reviews above ran from that commit against build `30de166`.

**Real subscription writes were not affected.** Real writes go through RPCs that use server or event time, and the
analytics RPC wrote on production at 02:30 UTC the same day. The last real billing writes were on 10-15 and 10-16.

## Open items

- **Owner's manual checks:** admin sign-in with MFA, one admin image upload, a subscriber sign-in, a game launch and
  sign-out.
- **A real production webhook is in `manual_review`** (`trial_shape_conflict`, received 2026-10-15 11:16:18 UTC),
  from before this release. Not touched.
- The fixture fix `82c7344` needs review and merging.
- The vault's `SUPABASE_ACCESS_TOKEN` is expired (the Management API returns 401), so Supabase logs cannot be read
  from the release machine.
- Superseded: the `sharp-source-map-js-remediation-plan.md` patch on `ce4d251`. This release carries sharp 0.35.5
  and source-map-js 1.2.2.
- Pre-existing, unchanged:
  - the WebKit 3D grip-angle flake (finding B);
  - the dev-only `braces` lint chain;
  - CrossCalc native provenance needs the standalone checkout (finding C).

## Rollback

```powershell
Set-Location C:\GitHub\mathnexa-nextjs-16-4
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv
```

Fallback: `npx vercel@59 promote dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv --scope bright-path-ed-tech`. Use the full
deployment id.
