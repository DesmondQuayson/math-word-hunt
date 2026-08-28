# MathNexa v1.2.1 — Release Record

Owner-approved production release, frozen 2026-08-28 after the owner personally verified the
real production audio on https://mathnexa.com/.

## Release identity

| Item | Value |
| --- | --- |
| Tag | `v1.2.1` (annotated, object `01ee446335515b3b4668204751d149a308eebdc7`) |
| Production commit | `e92be67d3e7c28a587df50c406c49823358d74e5` |
| Branch | `feature/math-vocabulary-hunt-natural-voice-v1.2.1` |
| Vercel deployment | `3oma7nduk` on `bright-path-ed-tech/mathnexa-platform-production` |
| Production | https://mathnexa.com/ |
| Previous release | `v1.2.0` → `787fc211…` (tag untouched) |

## Primary improvement

Math Vocabulary Hunt natural vocabulary pronunciation — Google Cloud TTS, **Chirp 3: HD,
`en-US-Chirp3-HD-Aoede`**, 513 pre-generated first-party clips (506 terms + 7 phrases).
Approved behavior: word-bank selection pronounces the exact term once; a successful grid find
plays one praise phrase; then stop. Clue mode never pronounces hidden answers. No looping,
no robotic browser speech, browser speechSynthesis and runtime Google TTS calls = 0.

## Major reliability fixes (the V1→V4 journey, for future maintainers)

1. **Root cause of three failed attempts:** `/game/runtime` served the game with
   `connect-src 'none'`, blocking the engine's same-origin
   `fetch('/game-suite/voice/manifest.json')` inside the real game document. Harnesses
   without that CSP kept passing. Fixed to `connect-src 'self'` (still no third-party
   origins). **Rule learned: any game-harness certification must replay the real route CSP.**
2. Direct source-level hook: `.word-card → selectTerm(key) →
   MathNexaVoice.playVocabularyTerm(entry.display)` (plus `playPraise` for find/completion
   and `preloadTerms` for the current puzzle) — no interception/inference layers.
   The canonical `docs/index.html` hash gates were updated intentionally (47 files) to
   `7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5`; `vocab.js` unchanged.
3. Web Audio playback: one shared AudioContext, created/resumed synchronously in the first
   capture-phase gesture and inside every play call; decoded-buffer cache; HTMLAudio
   single-element fallback where Web Audio is unavailable. Never certify audio with
   `--autoplay-policy` overrides.
4. Honest diagnostics: `data-voice-state` (requested/started/ended/blocked/error — `started`
   only when playback genuinely begins), `data-voice-source`, `data-last-spoken-term`,
   `window.__MATHNEXA_VOICE_DEBUG__`, and the `?audioDebug=1` on-screen panel. No secrets.
5. No-loop/duplicate safeguards: one pronunciation per selection, ≤1 praise per find,
   newest selection wins, no replay on tab return/unmute/rerender.

## Verification at freeze

Production re-verified serving `e92be67` (engine sha256 identical to the tagged file;
513-clip Aoede manifest; homepage healthy; deployment `3oma7nduk` newest ● Ready).
Gates: typecheck 0, lint clean, unit 274 pass (the single known Windows-CRLF checkout
artifact on `vocab.js` hashing — CI/Linux green), build green, security audits pass, no
credentials in any shipped artifact. Certification used the real game flow with the real
CSP replayed and no autoplay flags across Chromium, WebKit, and mobile WebKit.

## Rollback

Redeploy the previous production deployment (`q49zjkh09` / commit `b97783d`) or any earlier
Ready deployment via Vercel's instant rollback; tags are never moved. Note `b97783d` and
older still carry the CSP bug — rolling back past `e92be67` reintroduces silent word-bank
voice by design of that older code.
