# MathNexa v1.2.23 — Math Tug of War 3D: pullers visibly grip the rope

Released 2026-10-15 (UTC) under explicit owner approval, after the owner checked the live v1.2.22 game and found
that the six characters were still not visibly holding and pulling the rope with their hands. It ships the Tug of
War 3D grip repair only:

- skin-solved closed fists, with every finger and both thumbs closed around the rope;
- grips moved in front of the body, so the camera sees them;
- the rope threaded through both fists of every puller, through movement, strong pulls, fatigue and the wipe;
- a smooth release at victory;
- the rope tube's inside-out winding fixed.

The SVG scene remains the accessible layer and the classic fallback.

There is no database migration, no production environment change and no dependency change. Mathematics, answer
checking, scoring, win rules, matchmaking, room codes, synchronization, the server API, the other games, accounts,
authentication, subscriptions, Stripe billing, entitlements, admin access, navigation and ShowMe Math Lab are
unchanged. Super Admin V2 stays paused.

| | |
| --- | --- |
| Version / tag | `v1.2.23` (annotated, pushed; tag object `35d3965b`) → `fe3e819` (`fe3e81968f5d0452ab0607ef5aff4d4dcc973b9d`, tree `5b907ff3f08198964b4e2a9b87e1fc51841b696f`) |
| Branch | `hotfix/math-tug-of-war-3d-visible-rope-grip` from `9c3917d` (v1.2.22 production) |
| Certified runtime | `3d23c9c`. The pipeline's runtime diff from `3d23c9c` to `fe3e819` over `apps`, `packages`, `supabase` and the dependency manifests is empty. Later commits change only tests, review tooling, docs and evidence. |
| Runtime content hash | `79574206b94015354b2572f8f463b480fb0906213590c936d6a867f5f9f19c14`. v1.2.22 was `4738d366b6beb1dc3bab5f699f02da6c40ee95789ce554b17fab32bd46d3705d`. |
| Staging | `dpl_9oj299TLnvPsKQVmGX7GkG7Hf3tg` (`https://mathnexa-platform-staging-mqr9z5rts-bright-path-ed-tech.vercel.app`, commit `3d23c9c`). Hosted 3D review 41/41, and 57/57 re-certified with the phone, iPad and Smart Board grip checks; hosted classic review 99/99. |
| Production candidate | `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` (`https://mathnexa-platform-production-in25ou19j-bright-path-ed-tech.vercel.app`), built from `fe3e819` |
| Production runtime | `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`, `/api/health` build `fe3e81968f5d0452ab0607ef5aff4d4dcc973b9d`, promoted 2026-10-15 02:32:34–02:33:02 UTC |
| Rollback runtime | `dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH` (v1.2.22, build `9c3917d`), retained and Ready |
| Main | Fast-forwarded `8046e67..d057949` with no force, after the owner authorized the push (the session's permission policy had first refused it). This also brought the v1.2.22 commits (`c5d0981..9c3917d`), which had not reached `main`. This note follows as a docs commit, fast-forwarded the same way. |
| Migration | None. Nothing under `supabase/` changed. |
| Production environment | Unchanged. The pipeline deploys with the existing production variables and changes none. |
| Dependencies | Unchanged (`package-lock.json` identical to v1.2.20–v1.2.22). `npm audit --omit=dev`: the same two high advisories as at v1.2.21 and v1.2.22 (see Security). |

## Root cause

The owner's report was measured from the normal gameplay camera with a new player-camera probe
(`e2e/math-tug-of-war/player-camera-hands.ts`). The probe renders each puller in flat colours, with the triangles
grouped by hand-bone skin weight. For each of the 12 hands, it counts the pixels that are visible and the pixels
that touch the visible rope.

On the v1.2.22 build (`9c3917d`), the acceptance thresholds pass for only a few hands. A hand passes with at least
10 visible pixels and 8 on the rope on desktop and Smart Board, or 4 and 3 on a phone.

| v1.2.22 (`9c3917d`) | Hands passing | Hands with under 4 px on the rope |
| --- | --- | --- |
| Desktop, rest | 0 / 12 | 8 |
| Desktop, Turquoise mid-pull | 5 / 12 | 6 |
| Desktop, Pink mid-pull | 4 / 12 | 8 |
| Phone 390×844, rest | 1 / 12 | 11 |
| Pixel 7, rest | 3 / 12 | 10 |
| Smart Board 1920×1080, rest | 3 / 12 | 8 |

There were several causes:

- **The pullers hid their own hands.** The pullers stood between the camera and the rope, so the fists were behind
  the torso. The grips also hugged the hips.
- **The fist did not close around the rope.** It was a fixed curl, not shaped to the rope.
- **The rope was wound inside-out.** All 5,280 triangles of the tube faced inward, which caused light patches.
- **The old test could not fail.** Its "rope through the fist" check measured a rope that was built through the
  very point it checked. So the earlier test passed while the hands were not visible.

## What changed

Design notes: `docs/math-tug-of-war-3d-v1.md`, the **Grip** and **Rope** paragraphs and §5 "Visible rope grip
hotfix". Owner pack: `owner-review/math-tug-of-war-3d-v1/visible-grip/README.md`.

| Commit | Change |
| --- | --- |
| `9fc16d5` | Runtime fix, described below. |
| `0ada64c` | The grip is judged from the player's camera: the probe, the visual acceptance test and new unit tests. |
| `3d23c9c` | Owner review pack and design notes. This is the certified runtime. |
| `13596ac` | Docs only: hosted staging results (`docs/` and `owner-review/`). |
| `d322dff` | The acceptance test on phones, iPad (landscape and portrait), iPhone and Smart Board; grip checks on every device in the hosted review. |
| `478f274` | Docs only: v1.2.22 production review evidence (the before state). |
| `fe3e819` | Docs only: staging re-certification on every device. This is the production build. |
| `5d4a7bf` | Live v1.2.23 production evidence, and the opt-in `REVIEW_VIDEO=1` recording in the review script. |

**The `9fc16d5` runtime fix.**

- `scene3d/grip.js`: skin-solved fists. For each finger, the solver searches the knuckle and middle-joint angles,
  with the end joint coupled, under no-penetration tolerances. The thumb closes last, towards the rope.
- `scene3d/fist-data.js`: the solved fists are stored for all six characters, both hands. Rope coverage is
  0.71–0.83, and every digit is closed.
- Grips in front of the body: the characters stand behind the rope line (`BODY_SIDE`), and the rope side is flipped
  so that both hands are on the camera's side. The approved stance (feet, pelvis, head) is kept.
- Alignment: the rope channel is aligned with the rope, with the thumbs towards the centre.
- Arm solving: the wrist is limited to 1.15 rad, the forearm twist is continuous, and the near elbow is adaptive.
- Smooth transitions: attach and release blends, a body transition blend, and an eased brow wipe.
- The rope: a centripetal Catmull-Rom curve, sampled by arc length, as a 220×12 tube with outward winding. It is
  threaded through each fist, and vibration is excluded near the hands.

## Tests (pre-release, on the exact candidate)

All gates ran on `478f274`, whose runtime is identical to `3d23c9c` and `fe3e819`.

| Gate | Result |
| --- | --- |
| TypeScript | clean |
| Lint | 0 errors; 8 pre-existing warnings in an unrelated file |
| Unit tests | core 245/245; web 891 passed, 1 skipped. This includes Tug of War 98/98, with the new grip tests: stored fist data, enclosure, channel alignment, wrist limit, no snaps, the re-grip after the wipe, and the camera-side check. |
| Production build | built |
| Security | `test:security` 315/315, bundle and launch audits, 7/7 |
| Fist data | `solve-fists.mjs --check` up to date |
| Classic browser projects | 107 passed, 13 skipped |
| Chromium 3D (desktop, Pixel 7, Smart Board 1920×1080) | 25 passed, 2 skipped |
| WebKit 3D (iPad landscape, iPad portrait, iPhone 13) | each 1/1 |
| WebKit 3D, full project | 12 of 13 in full runs, one test per run losing its page or WebGL context. A different test was lost on each run, and the production build loses the page the same way. Controlled reruns: viewport sweep 3/3 on the candidate and 2/2 on production; teardown 2/2 on the candidate. This is the known Windows WebKit test-build page loss under load, not a regression. |
| Online Match | 13 passed, 1 skipped |

**Visual acceptance gate** (`scene-3d.spec.ts`, "visual acceptance"). The test checks all 12 hands of both teams
from the gameplay camera:

- at rest;
- mid-pull and after a pull, each way;
- three strong pulls in a row, each way;
- fatigue after 10 pulls (asserting fatigue above 0.3);
- the win and the release, with at most 2 hands still touching afterwards.

It **fails on `9c3917d` and passes on the fix** on desktop, Pixel 7, Smart Board, iPad landscape and portrait, and
iPhone.

**Performance.** Local GPU Chromium benchmark: v1.2.22 6.62–6.71 ms per frame, v1.2.23 7.40–7.45 ms. The interval
stays at 16.6 ms (60 fps), and there are no quality downgrades.

## Production rollout

The release used the protected pipeline `scripts/run-nextjs-hotfix-production.mjs` with
`RELEASE_CERTIFIED_RUNTIME=3d23c9c` and `RELEASE_ROLLBACK_DEPLOYMENT=dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH`.

1. **Preflight PASS.** Clean tree, Next.js 16.3.8, sharp 0.35.4, and an empty runtime and dependency diff from
   `3d23c9c`. The rollback target belongs to the production project, is Ready, and was the latest production
   deployment before the release.
2. **Candidate.** `dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv` was deployed with `--prod --skip-domain`, and probe-preview
   passed.
3. **Upload check.** Vercel file uids (SHA-1) were compared with `3d23c9c`:
   - 1,298 of 1,300 tracked files identical, 0 different;
   - the 2 files not uploaded are `.gitignore` files;
   - the Tug of War runtime: 62/62 identical.
4. **Promotion.** `PROMOTED dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv from dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH`, 2026-10-15
   02:32:34–02:33:02 UTC.
5. **probe-live PASS** on all 22 checks. `/api/health` reports build `fe3e81968f5d0452ab0607ef5aff4d4dcc973b9d`.

## Live production verification (mathnexa.com)

**Hosted 3D review: 57/57, run twice.** The review checked:

- the served runtime hash `79574206…`;
- byte-identical modules and models;
- CSP;
- 3D on hardware GL;
- the classic fallbacks;
- Online Match with 3D on both clients and the same confirmed winner;
- the grip on every device, at rest and after a pull.

It deleted its synthetic users (2) and removed its rooms (1). Results:
`owner-review/math-tug-of-war-3d-v1/production/production-3d-results.json`. Its device measurement labels begin with
"staging" because of the review script's fixed label prefix; the `origin` field is `https://mathnexa.com`.

| Live device (gameplay camera) | Hands on the rope | Fewest rope px, rest / after a pull | Frame (medium tier) |
| --- | --- | --- | --- |
| Desktop Chromium 1366×900 | 12 / 12 | 19 / 13 | 8.36 ms |
| Phone 390×844 | 12 / 12 | 9 / 9 | 7.39 ms |
| Phone 430×932 | 12 / 12 | 12 / 13 | 7.59 ms |
| Pixel 7 412×915 | 12 / 12 | 10 / 12 | 8.28 ms |
| Smart Board 1920×1080 | 12 / 12 | 34 / 30 | 8.19 ms |
| iPad portrait 820×1180, WebKit | 12 / 12 | 20 / 20 | 9.33 ms |
| iPad landscape 1180×820, WebKit | 12 / 12 | 13 / 13 | 11.03 ms |
| WebKit desktop 1366×768 | 12 / 12 | 21 / 17 | 8.94 ms |

There were no quality downgrades on any device.

Hosted frame times on the live v1.2.22 build were 8.6–11.6 ms. The WebKit warm-up worst frames (423–471 ms) match
v1.2.22, which had 471–533 ms.

**Hosted classic review: 99/99.** It deleted its synthetic users (4) and removed its rooms (2). The screenshots are
in `owner-review/math-tug-of-war-v1/production/`.

**Visual evidence.**

- Live screenshots: `owner-review/math-tug-of-war-3d-v1/production/` (desktop start, pull and victory; phones;
  Pixel 7; Smart Board; iPad both ways; WebKit desktop; Online Match host and guest).
- Live recording: `owner-review/math-tug-of-war-3d-v1/production/recordings/live-v1.2.23-desktop-match-pulls-win-celebration.webm`
  (31 s). It shows a match, pulls, the win and the celebration. It opens on the synthetic account's sign-in page
  with the password masked; that account has since been deleted.
- Comparison: `owner-review/math-tug-of-war-3d-v1/visible-grip/14-live-v1.2.22-vs-v1.2.23-vs-staging.png` shows live
  v1.2.22, live v1.2.23 and staging from the same camera.
- Before and after close-ups, all twelve fists from three angles, and the staging recordings:
  `owner-review/math-tug-of-war-3d-v1/visible-grip/`.

**Logs** (`dpl_3dkm5DMpCuUP2zHsqnZMJR2AnNZv`, 02:32 UTC to about 02:46 UTC).

- 5,674 request records: 2xx 4,389, 3xx 1,274, 4xx 11, **5xx 0**.
- 3,205 Tug of War requests, with no missing game assets.
- `level:error OR level:fatal`: 0 records.
- Function logs: only the 2 expected warnings from the pipeline's unsigned-webhook probe.

No rollback trigger fired, so no rollback was needed.

## Security

There are no changes to authentication, authorization, CSP, the server API, the database or the environment. The
game still sends only its answer actions to the server (verified by the Online Match tests). The debug hook is still
available only with the `?graphics=` override.

`npm audit --omit=dev` reports 2 high advisories, both pre-existing and with dependencies identical to production:

- **`sharp` < 0.35.5 (librsvg).** Unreachable: there is no `images` configuration, so Next.js refuses SVG.
- **`source-map-js`.** Build-time only.

## Rollback

**Application.** Promote the retained v1.2.22 deployment. The command was validated against the target before
the release: production project, Ready.

```powershell
$env:RELEASE_CERTIFIED_RUNTIME = '3d23c9c'
$env:RELEASE_ROLLBACK_DEPLOYMENT = 'dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH'
node scripts/run-nextjs-hotfix-production.mjs --stage=rollback
node scripts/run-nextjs-hotfix-production.mjs --stage=probe-live --expect-deployment=dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH
```

Or use `vercel promote dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH --scope bright-path-ed-tech`.

- v1.2.23 changed neither the database nor the environment, so v1.2.22 runs unchanged.
- Rolling back brings back the hands that are not visible from the gameplay camera.
- The v1.2.21 deployment (`dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i`, build `8046e67`) was the v1.2.22 rollback target; it
  was not re-inspected for this release.

**Database and environment.** Nothing to roll back.

## Known limitations

- **Front puller's near hand.** Mid-heave, its rope channel briefly tilts up to 44° from the rope. This is a natural
  wrist roll, and the fist stays closed on the rope (unit test bound: median ≤ 5°, 90th percentile ≤ 20°, never
  above 50°).
- **Frame cost.** About +0.8 ms per frame on the local GPU benchmark. 60 fps is unchanged and there are no
  downgrades.
- **Windows WebKit test build.** It can lose a page under multi-project load, as described in Tests. It behaves the
  same on the production build.

## Follow-ups (not started; owner-gated)

- **Tags `v1.2.21` and `v1.2.22`** do not exist. Their production builds are `8046e67` (`dpl_8FwRLvGcV5AFHSZLRh2Kc7Fa527i`)
  and `9c3917d` (`dpl_Ejn4Qooo96nAfvkdmsAabUtZ84QH`). They have not been created after the fact.
- **The v1.2.22 release record** was drafted but never finalized; its placeholders for the tree, main and production
  rows are still open. The production identifiers above are the confirmed values to fill them.
- **Dependency patches:** `sharp` 0.35.5 and the `source-map-js` advisory, each in its own reviewed change.
