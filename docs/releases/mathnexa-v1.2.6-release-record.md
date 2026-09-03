# MathNexa v1.2.6 — Math Vocabulary Hunt Fresh Runtime + Version-Atomic Audio

| | |
|---|---|
| Tag | `v1.2.6` (annotated, bare platform namespace) |
| Frozen application source | `04dda341ba1bd57310fd5cb6c72523ba216e479a` |
| Production deployment | `dpl_8LhZm4s8jJDvKnLgpxJPPqYVNopQ` — `https://mathnexa.com` |
| Immediate rollback | `dpl_sFfLGqNUwtbCZ1gFoAhPvTjaZbuu` (51f6b57) |
| Older rollbacks retained | `dpl_D5TSPtdpKi7xueda2qsomWJiLccC` (ae71504), `dpl_ArsfEAn7rRH76uvur9UHrBZAF8kG` (074751b), `dpl_3FAmKZfSSG2L3QqPg3jFVLEUN5qi` (v1.2.5) |
| Prior frozen release | `v1.2.5` → `ecb1f0f3984e2ff673303005153a4ba6817ba282` (unchanged) |
| Scope | Math Vocabulary Hunt audio delivery only. No change to authentication, authorization, rate limiting, security events, CSP, CSRF, entitlement, billing, webhooks, the staging gate, other games, or ShowMe / MAP Prep. |

This record is documentation only and lives outside the tag. The application
runtime on `main` after consolidation is identical to `04dda34`.

## The audio contract

| State | Music | Pronunciation |
|---|---|---|
| Idle | 0.50 | — |
| Word speaking | 0.15 | 1.00 |
| Word finished | 0.50 | — |
| Music off | 0 | 1.00 |

Ducking is driven by the voice engine's real playback lifecycle, never by a
timer. Rapid word replacement holds the music at 0.15 continuously and
restores exactly once when the final pronunciation ends. The music button
moves only music; the sound button's Muted position remains the whole-game
mute. Both levels are absolute values; nothing multiplies one by the other.

## What was wrong, in three layers

1. **A silent one-shot coupling.** The music module subscribed once at load with
   `window.MathNexaVoice?.onSpeechActivity?.(...)`. Against a voice engine
   without that method the optional chaining no-opped: nothing threw, nothing
   logged, pronunciation kept working, and ducking was gone for the session.
   Fixed in `ae71504` by broadcasting a `mathnexa:voice-activity` window event
   and observing the `data-voice-state` attribute every engine build writes.

2. **Version skew between two unhashed files.** `natural-voice.js` and
   `math-vocabulary-music.js` shipped under stable names and revalidated
   independently, so a browser or school proxy could execute a mismatched
   pair while every server byte was correct. A 25-combination matrix of the
   shipped builds confirmed the class. Fixed in `51f6b57` by emitting ONE
   content-hashed runtime, `game-suite/mvh-audio-runtime.<sha256:12>.js`,
   assembled from the two (still separate, still maintainable) source
   modules by `scripts/build-mvh-audio-runtime.mjs`, injected by the enhancer
   and served `public, max-age=31536000, immutable`. A cached older runtime
   can never satisfy a newer document, because a new build is a new URL.

3. **Stale in-memory game documents.** A hashed asset only helps once a new
   document asks for it; it cannot replace JavaScript that is already
   executing. Math Vocabulary Hunt is a top-level document
   (`/games → /play → /game/runtime/index.html`, no iframe), and a document
   revived from the back/forward cache or left open across deployments kept
   its old generation alive. Fixed in `04dda34` with two enhancer/launch-level
   mechanisms:
   - **Revival refusal** — a one-line guard reloads the document once on a
     `pageshow` with `persisted=true`; a fresh load fires `persisted=false`,
     so there is no loop and an active game is never interrupted.
   - **Generation-stamped launches** — `/play` redirects to
     `/game/runtime/index.html?launch=<generation>`, where the generation is
     the deployment's own `VERCEL_GIT_COMMIT_SHA` (fallback: the audio
     runtime's content hash). The value is automatic and non-secret; the
     runtime route resolves assets from path segments only, so the query is
     identity, never authorization.

The permanent architecture is therefore: **a fresh, generation-stamped game
document on every launch, loading one content-hashed, version-atomic audio
runtime.** No learner ever needs to clear a cache, hard-refresh, use a private
window, or restart a browser.

## Verification

- Owner verification on staging in a normal, long-lived browser session with
  no cache clearing: sign in → launch → duck → Back to Games → relaunch in the
  same tab → duck. **PASS.**
- Owner verification on production, same flow, same conditions, including
  rapid selection and music-off behaviour. **PASS.**
- Standing gates, all green at `04dda34` on Chromium, WebKit and mobile
  WebKit (Firefox cannot launch in the local environment):
  `test:e2e:mvh-session` (same-tab relaunch across a deployment, parked old
  tab, revival reproduction and fix, distinguishable launch URLs),
  `test:e2e:mvh-real-runtime` (real enhanced document, real route CSP, the
  actual playing element's volume), `test:mvh-audio-version-atomic`
  (drift gate, content-hash honesty, returning-browser and hostile-cache
  simulation), `test:e2e:mvh-audio`, the game-access unit suites, and the
  245-test security gate with the platform bundle and Number Cross audits.
- Mutation coverage: content hash removed, stale runtime referenced, legacy
  voice or music module re-injected, build token frozen, launch generation
  removed or frozen, persisted-page guard removed, and premature duck restore
  are each caught by the standing tests.

## Operational notes

- The canonical game document `docs/index.html` is unchanged; its sha256 pin
  stands. Every mechanism above lives in the enhancer, the launch redirect and
  generated assets.
- Regenerate the audio runtime after editing either source module with
  `npm run build:mvh-audio-runtime`; the drift gate fails otherwise.
- The music control still shows Low / Medium / Off; both audible states
  resolve to 0.50. Simplifying it to On / Off is a separate, owner-gated
  canonical-document change.
- Production was not redeployed for the tag or the mainline consolidation.
