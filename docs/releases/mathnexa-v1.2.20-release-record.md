# MathNexa v1.2.20 — Main gate repairs and package-game asset fix

Released 2026-10-01 under explicit owner approval, as the clean baseline before the Super Admin redesign
(Phase 3). It ships:

- the Next.js 16.3.8 security patch;
- the fix for hosted ZIP package games in Chrome and Edge (PKG-01);
- repairs that make every pre-existing failing gate on `main` pass, without weakening any test.

There is no database migration and no production environment change. Stripe billing, subscriptions, trials,
entitlements, consumer authentication and the v1.2.19 2-hour Super Admin session are unchanged.

| | |
| --- | --- |
| Version / tag | `v1.2.20` (annotated) → `56667b0` (tree `786dc5bc`) |
| Release commits | 18 commits, `9f317bc..56667b0` (listed below); 67 files, +2,432 / −461 |
| Main | Fast-forwarded `9f317bc..56667b0` with no force. This record follows as a docs commit. |
| Migration | None. Nothing under `supabase/` changed. Production history stays 37 (latest `20260930100000`). |
| Production environment | Unchanged |
| Production runtime | `dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA`, build `56667b0`, promoted 2026-10-01 16:41:35 UTC |
| Rollback runtime | `dpl_26KQ7nG4MgyFEdHWRQ3jYS9MpWtZ` (v1.2.19, build `2a0b578`), retained |
| Dependencies | `next` and `eslint-config-next` 16.3.4 → 16.3.8; dev-only `brace-expansion` 5.0.12 and `js-yaml` 4.3.2. Production `npm audit`: 0 (was 1 critical). |

## Package-game asset fix (PKG-01)

**Root cause.**

- Hosted ZIP package games run in `<iframe sandbox="allow-scripts">`, which has an opaque origin.
- Chromium sends no SameSite=Lax cookie on that frame's sub-resource requests; WebKit does.
- Since `bd85de2` (2026-08-23), every package asset required the cookie session (as the ticket's principal) in
  addition to the ticket.
- So in Chrome and Edge, the entry HTML loaded but the package's CSS and JS returned 404, and the games did not work.
- It failed closed: nothing was exposed.

**Fix** (`56667b0`, `lib/games/ticket.ts`).

- **The ticket.** Sub-asset requests are again authorized by the signed v1 asset ticket. It lasts 300 seconds and is
  bound to audience, package and principal.
- **Signing keys.**
  - Consumer and admin tickets keep the delivery secret, byte-identical to before.
  - School-access tickets use a key derived from the delivery secret and the school session secret, so a school
    ticket proves its kind and stops working when that secret rotates.
- **MAC.** The MAC must be canonical base64url. It is compared in constant time with the HMAC of the encoded
  payload, which must carry exactly the six v1 fields.
- **Requests that carry a session.** The session must be the ticket's principal, matching both kind and id, and must
  still have games access. A mismatch is final.
- **Cookie-less requests.**
  - A consumer is re-checked on every request with the service role: account, entitlement and games access.
  - A school ticket requires the school-access configuration, and is never issued to outlive its school session.
- **Launch.** The package runtime route (`/games/<slug>/runtime`) also checks the principal kind.
- **Unchanged.** The sandbox stays `allow-scripts` only (no `allow-same-origin`), the ticket lifetime stays 300 s,
  every failure is a 404, and tickets carry no provider id, cookie, secret or raw entitlement data.
- **Design and register.**
  - Design: `docs/security/package-game-asset-tickets.md`.
  - Register: PKG-01 closed; PKG-02 (gated staging, below) and PKG-03 (a ticketed asset URL is a 300-second bearer
    credential) accepted.

## Other changes

**Security.**

- `3268048`: Next.js 16.3.4 → 16.3.8 (exact, with `eslint-config-next`).
  - Fixes critical GHSA-vcvr-r3jv-pc5j (`next/og` remote code execution).
  - Also fixes seven later advisories, including High GHSA-cjq9-62q9-8jv4 (Image Optimization SSRF).
  - MathNexa was not exposed to any of them (no `next/og`, no `images.remotePatterns`, no `'use cache'`).
  - `sharp` stays 0.35.4.
- `64b2e2e`: the fixture billing provider is refused unless both base URLs are http loopback and neither `VERCEL` nor
  `VERCEL_ENV` is set. According to the `64b2e2e` investigation, neither hosted project sets the rehearsal flag.
- `7bb44e9`: the **Quiz PDFs** staging review now confines the Vercel protection-bypass secret to the review origin
  through `scripts/vercel-protection-bypass.mjs`.
  - It is sent once, in a header, to a redirect-free request.
  - It becomes a host-only cookie.
  - It is never in a URL, and all output is redacted.
  - Other staging scripts are unchanged (see Follow-ups).
- `4baffdc`: the fifteen release, migration and staging runners now pass `SUPABASE_TELEMETRY_DISABLED=1`. They passed
  `"true"`, which CLI 2.109 ignores.
- `94527fa`: dev-only patches for brace-expansion (three denial-of-service advisories) and js-yaml (one).

**Gate repairs.** These change no product behaviour.

- `c2027e6`: root ESLint (unused import in the Tug production runner).
- `1da42e8`: the admin accounts view no longer selects `stripe_subscription_id`; the Phase 8G audit forbids it.
- `f2b65b1`: the Phase 8A concealment test compares denied admin routes with the site's own 404 page.
- `74a8d72`: the Phase 7C, 8E and 11 security audits verify where each control lives now, on comment-stripped
  source. Mutation-tested.
- `96b06f5`: the Quiz PDF review now actually detects the site's 404 page. Before this, the check could never fail.
- `e0ee093`: records why `prepare_admin_account_operation` is kept (the v1.2.17 rollback runtime still uses it).
- `0e339be`: `next dev` now serves route-owned security headers the way Vercel does.
  - This applies only under `PHASE_DEVELOPMENT_SERVER`.
  - Production builds ship byte-identical header rules.
- End-to-end suites:
  - `15e2f6a`, `2567b33`, `6bf9c91` and `cc9f935` follow the Home landing, repositioned copy, same-tab MAP Prep and
    the Featured games baselines.
  - `5327228` retires the obsolete CrossCalc V1 e2e suite, porting its one security assertion into the V2 spec.

## Tests (pre-release)

The certification ran on `56667b0` after a clean `npm ci` and a local database reset. **All 80 gate runs passed.**

| Gate | Result |
| --- | --- |
| pgTAP (37 files) | 914/914 |
| Unit | core 245/245; web 871 passed, 1 skipped |
| Security unit suites | `test:security` 315/315; fast and deep 241/241 |
| Static | TypeScript clean; ESLint root and platform-web clean; production build; image optimizer 25/25 |
| Security audits | All 25 security audit scripts pass, including 7C, 8E, 8G and 11 |
| Audit mutation harness | 97/97 as expected: all 94 mutations caught (7C 22, 8E 59, Phase 11 13), and the 3 untouched-tree controls pass |
| Phase 8E package delivery (Playwright) | 16 public (8 Chromium + 8 WebKit) + 1 admin (Chromium) |
| Other Playwright suites | 7C, production-public, 7E, 8A, 8C, 8D, 8F, 8G, 8H, 11, school access, Quiz PDFs, Number Cross, Number Logic, CrossCalc V2, game suite, MVH session/audio/real runtime, mobile gameplay, Tug local and online: all pass |
| CrossCalc provenance | Standalone source verified at `8bc4704` |
| `npm audit --omit=dev` | 0 |

Package-fix evidence:

- **Negative control.** The pre-fix code fails the Chromium entitled-subscriber test (and passes in WebKit), which
  proves the suite detects the defect.
- **Unit tests.** `ticket.test.ts` (22) and `package-runtime-route.test.ts` (3).
- **Independent adversarial review.**
  - Its complimentary-grant finding was refuted: `record_game_package_launch` already refuses complimentary-only
    users at launch.
  - Two of the three confirmed low findings were fixed: the key and clock pins, and the coverage guard. The test
    precision notes were also addressed.
  - The third confirmed low finding, the staging gate's UUID-only exemption, was accepted as PKG-02.

`npm audit` still reports 2 moderate **dev-only** findings (`vitest`, `@vitest/mocker`). They are deferred to a
separate Vitest/Vite/Rolldown maintenance release.

## Staging

- **The `main` push.** It auto-deployed the staging project (`dpl_7iVL5RYtV6x74H1FT8ggawbnWjyf`, Ready). It sits
  behind the app's staging gate, which was not changed.
- **Ungated CLI preview** `dpl_GbFA7EXr8wsZuPqvUqjm7SCoQw7W`:
  - read-only probe 16/16: health and build, public pages, product gating, forged and garbage tickets refused,
    admin concealed, webhook, image optimizer, security headers;
  - Chromium + WebKit check 14/14.
- **Admin-enabled preview** `dpl_6vqRfz4nrnr5R1WgV1hJUESU2XTX`:
  - deployment-scoped admin enablement, a throwaway CSRF secret, 120 minutes;
  - unauthenticated admin probe 13/13.
- **Duplicate preview.** `dpl_EiqReHLNd8NBVD51wxwsLDwgUpDd` came from an upload retry.
- **PKG-02** (pre-existing, accepted, unchanged by owner decision):
  - On the *gated* staging alias, Chromium package sub-assets are refused. The 7D gate exempts only
    `/games/<UUID>/runtime/assets/…`, but the launch uses the slug.
  - Production has no staging gate, so this is not a production regression.
  - Package games are reviewed on ungated previews.
- **Signed-in hosted test.** Not automated: credentials are never entered on hosted environments by automation.

## Production rollout

| Step | Result |
| --- | --- |
| Pre-deployment check | Fetched origin. Production was healthy, with the apex served by `dpl_26KQ…` (v1.2.19, build `2a0b578`), the expected rollback target. The head was exactly `56667b0` with a clean tree. Next 16.3.8, production audit 0, no migration, no environment change. |
| Preflight (13:57 UTC) | Pass: certified runtime `56667b0`, Next 16.3.8, sharp 0.35.4, no runtime diff, PH2-07 files absent |
| Main | Fast-forward `9f317bc..56667b0`, with no force. `origin/main` = the certified runtime. |
| Deploy (16:35–16:37 UTC) | `dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA` built from the clean tree `786dc5bc` with the production environment and no domain (`--prod --skip-domain`, `MVH_SOURCE_REVISION=56667b0`). The host is protected. |
| Pre-promotion probes | 6/6: health (build `56667b0`, payments live), webhook, canonical host, no server errors, optimizer, remote optimizer refused |
| Promote | 16:41:35 UTC. The apex moved to `dpl_D2Mc…`, and `www` 308-redirects to the apex. `dpl_26KQ…` not deleted. |
| Live probes | 22/22 (16:42 UTC and again at 20:58 UTC): webhooks, canonical hosts, public pages, product gating, private no-store, admin fails closed, scheduler, fixture absent, game runtime, Tug gating, forged access, security headers, images |
| Admin security probe on the apex | 13/13, twice |
| Package-game smoke on the apex (unauthenticated, Chromium + WebKit) | 14/14, twice. A package page requires access, and no frame renders without it. Forged-ticket JS and CSS and a session-less launch are refused with 404. No app errors. |
| Image optimizer harness on the apex | 12/12 |
| Runtime logs, `dpl_D2Mc…`, 16:40–21:40 UTC | 0 5xx, 0 error, 0 fatal. Queried with `vercel logs --status-code 5xx`, `--level error` and `--level fatal` in three windows (16:40–18:00, 18:00–20:00, 20:00–21:40). A `--status-code 4xx` control returned rows in both busy windows, including the 16:42 probe 404s, so the filters work and cover the whole period. |
| Secret scan | Bypass secret: 0 occurrences in release outputs |

## Owner production check

The owner's written report (**PASS** for A–D) arrived at 20:55:27 UTC. Each item was then checked against server
evidence, which neither the logs nor the database tie to a named person:

| Check | Evidence |
| --- | --- |
| A. Super Admin | The only admin sign-in since the deploy came **after** the report: `admin.login.success` 20:59:20, `admin.mfa.success` (totp) 20:59:41, `admin.session.started` 20:59:41. Session `7e1d86a3` has a **120-minute** lifetime (expires 22:59:41) and a 60-minute idle timeout. This proves the 2-hour session on v1.2.20. **Not evidenced:** opening Users and Subscriptions (`/admin?section=…`). After the 20:59:42 landing and its prefetches, no admin request reached `dpl_D2Mc…`, and `last_activity_at` still equalled `started_at` at 21:36. Any first-party admin request 60 s or more later would have moved it. |
| B. Online Math Prep | Not provable from the server. A 200 on `/map-prep` is also returned to anonymous prefetches, and an entitled visit is a 307 launch redirect (seen at 20:52:51). Requests that need games access succeeded at 17:04–17:06 and 20:52 (`/game/runtime/index.html` 200; anonymous gets 401), so an entitled subscriber was signed in. The owner's report is the evidence that Online Math Prep opened. |
| C. Package game | **Not applicable in production.** See the notes below this table. |
| D. General | Requests to `/games` and to the play routes for Number Cross, Tug of War, Number Logic and CrossCalc returned 200, partly as a prefetch burst at 17:06:00–17:06:02. Only Vocabulary Hunt's runtime is seen loading (17:04–17:06 and 20:52). The logs cannot show which games were played. No 5xx, error or fatal entries. |

Notes on check C:

- Production has **no ZIP/package games**: `game_packages` has 0 rows and `game_launch_events` has 0 rows.
- The game the owner opened in Chrome/Edge was therefore an internal game, which loads through a different path.
- The only package-asset requests on production were the automated forged-ticket probes, all refused with 404.
- **Owner decision.** Recorded in the release session at 2026-10-01 21:20 UTC, after being told that production has
  no package games: "Tag now, record C as N/A". The fix rests on:
  - the local Chromium + WebKit e2e with real ZIP packages;
  - the negative control;
  - the unit tests.
- When the first package game is published, run a signed-in Chrome/Edge check as an entitled subscriber.

No billing, subscription or entitlement change. Read-only production database checks at 21:16 and 21:36 UTC:

- No `billing_customers`, `billing_subscriptions`, `consumer_accounts` or `consumer_game_entitlements` row was
  created or updated since 16:41 UTC.
- No `billing_webhook_events` row was created, received or processed since then.
- No admin account operation was created or completed; the total is still 4.
- Migration history is still 37 (latest `20260930100000`).

## Final verification and integrity

Read-only, 2026-10-01 20:56–21:40 UTC, before tagging:

- `vercel inspect` (21:34 UTC):
  - `mathnexa.com` → `dpl_D2Mc2wEg3HiueKzqbwKcv2baESAA` (Ready, production);
  - `www.mathnexa.com` 308-redirects to the apex;
  - `dpl_26KQ7nG4MgyFEdHWRQ3jYS9MpWtZ` is Ready (target production) and retained for rollback.
- `/api/health`: ready, `production-platform`, build `56667b0`, payments live. This is supplementary only: the
  deployment ID is the authority (MN-07).
- Live probes 22/22, admin probe 13/13, package smoke 14/14, image harness 12/12.

The integrity chain:

1. Tag `v1.2.20` peels to `56667b0`.
2. Its tree is `786dc5bc`, which is the clean tree the deploy stage recorded for `dpl_D2Mc…`.
3. `origin/main` contains `56667b0`.
4. The apex serves `dpl_D2Mc…`.

## Rollback

**1. Application (fast; complete on its own).** Promote the retained v1.2.19 deployment:

```powershell
$env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_26KQ7nG4MgyFEdHWRQ3jYS9MpWtZ'
$env:HOTFIX_VERCEL_CLI = "node $(Join-Path $env:LOCALAPPDATA 'npm-cache\_npx\67eb4586ca667318\node_modules\vercel\dist\vc.js')"
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
```

Or use `vercel promote dpl_26KQ7nG4MgyFEdHWRQ3jYS9MpWtZ --scope bright-path-ed-tech`.

- v1.2.20 changed neither the database nor the environment, so v1.2.19 runs unchanged.
- Rolling back brings back the Chromium package-asset defect (PKG-01) and Next.js 16.3.4. MathNexa is not exposed to
  16.3.4's advisories, but its production audit is no longer 0.
- School package tickets issued by v1.2.20 (at most 300 s old) need a relaunch. Consumer tickets keep the same key.
- The older v1.2.17 rollback (`dpl_14A8uM4MBvkPZhvXQLSdHADxzdBD`) remains as described in the v1.2.19 record.

**2. Database and environment.** Nothing to roll back.

## Follow-ups (not started; owner-gated)

- First production package game: the signed-in Chrome/Edge check (owner check C).
- Open Super Admin Users and Subscriptions on v1.2.20 (owner check A). `1da42e8` changed that view's query. It is
  covered by the Phase 8G unit, audit and e2e gates, but no production view has been evidenced.
- Confine the protection-bypass secret in the other staging scripts too:
  - `scripts/review-math-tug-of-war-staging.mjs` still sends it in `extraHTTPHeaders` and in a URL;
  - `scripts/probe-admin-session.mjs` sends it as a header on every request to the preview.
- PKG-02: widen the staging gate's package exemption, or redirect by resource UUID.
- Vitest/Vite/Rolldown maintenance release (2 moderate dev-only findings).
- Revoke `prepare_admin_account_operation` once v1.2.17 is no longer a rollback target.
- Phase 3 Super Admin redesign.
- CrossCalc provenance: the standalone CrossCalc source repository has no hosted remote.
- Clean-up awaiting owner confirmation:
  - the staging previews `dpl_GbFA7…`, `dpl_6vqRf…` (admin-enabled, throwaway CSRF secret) and `dpl_EiqRe…`;
  - the remote branch `fix/v1.2.20-main-gate-repairs` (identical to `56667b0`);
  - the superseded local branch `fix/main-gate-repairs` (`70cea40`, not on origin) and its worktree.
