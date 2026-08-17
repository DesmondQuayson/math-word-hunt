# Number Logic native integration

Number Logic is one trusted internal MathNexa game at `/games/number-logic/play`. Its six puzzle modes remain state inside the single approved `0.1.0` runtime. The generic internal registry, player authorization, Admin Draft Preview, publication transition, maintenance behavior, and public catalog projection are the same mechanisms used by Number Cross.

## Provenance

- Approved standalone source commit: `025fe1e33bbbb36a41d1d3bd34a54d31d0bb08cf`
- Standalone `main` merge commit: `ad8872d28da5ae7b83a60f636e2a4d868c2f2edf`
- Mathematical source aggregate: `0f125d147d628173dd883235b230186ba5617be49c00f3c8c2212977dc28c2a5`
- Result/progress source aggregate: `36f2f20505c80774c1815d6291b37e9d494c8d23da363025ec15ed42a86615a5`
- Host/storage source aggregate: `85979ddd233322299622a4f62fb49c86a76b2ee55cf9d1c965ff04bc2512c2ea`
- Audio source aggregate: `e92c78621f54e7e7b584a3036a3278cf10f427acfd635fb4c97de56f6f149895`
- Cosmic Candy Catchers runtime MP3 SHA-256: `6BA9A6B324807202BB148F77F2030086E7AA0B5FC0F81E1D3DDEA072B47C7369`

The checked-in JS and CSS are a production build from the approved source. The JS then receives two deterministic platform-owned adaptations: the reviewed Cosmic Candy Catchers credit and `scripts/apply-number-logic-hotfix.mjs`. The hotfix replaces only the Lines of 3 tutorial presentation and the browser-audio activation lifecycle; it rejects unknown input, is idempotent, and does not touch the generator, solver, scoring, persistence, identity, or audio asset. Tutorial presentation styles live in the integration stylesheet so the opaque source bundle does not acquire an unreviewed CSS rebuild. Vite's generated CSS-module identifiers make the build hashes workspace-path-dependent, so the native verifier records the checked-in hashes and reproduces both adaptations before accepting the standalone build.

## Post-release tutorial and audio hotfix

- Tutorial `lines-of-3/tutorial-v2` uses the authoritative seven-position/five-route board. Its worked fixture is `4 / 7-2-3 / 1-6-5`; left, center, right, middle, and bottom routes all total 12. The three-dot step indicator is an explicitly named progressbar with current, minimum, maximum, and human-readable step values; the visible tutorial is covered by a WCAG 2 A/AA Axe scan with no rule exceptions.
- The first valid pointer or keyboard gesture creates and resumes the one Web Audio context. Mount no longer creates a suspended pre-gesture context.
- A resolved `AudioContext.resume()` promise counts as unlocked only when the context is actually `running`. Music remains idle and retryable when the browser leaves it suspended.
- Music OFF stops the current source, Music ON creates one replacement source, the preference survives reload, and unmount closes the one context.

### Conditional HTMLMedia fallback

The native Web Audio path remains the primary path and is not wrapped or replaced when either constructor exists. A parser-blocking same-origin capability loader runs before the module bundle. A standards-named `AudioContext` is used unchanged; in a Safari environment exposing only native `webkitAudioContext`, the loader aliases that same native constructor to the standards name consumed by the approved bundle. Only when both constructors are absent does it load `media-fallback.js`, which supplies the narrow context surface the existing audio manager needs while playing the unchanged, self-hosted Cosmic Candy Catchers MP3 through one looping `HTMLAudioElement`.

- The existing `mathnexa:number-logic-audio:1` contract remains authoritative. Missing or malformed settings default music to ON; an explicit stored OFF stays OFF. Music OFF/ON, master mute, and volume changes continue to be written by the existing manager and are synchronized by the fallback.
- The one media element starts with `preload="none"` and no `src`, so the fallback makes no eager audio request. The first eligible pointer, Enter, or Space gesture inside the Number Logic root assigns the same-origin source and starts it synchronously. Later bundle source starts reuse it, so there is exactly one element and no overlapping music source.
- Hidden state and BFCache pagehide pause the media element. A non-BFCache pagehide or runtime disposal also removes the source and fallback listeners, calls media `load()` to release it, and closes the shim context. Media decode/load errors pause playback and are exposed through the diagnostic.
- The frozen `window.__MATHNEXA_NUMBER_LOGIC_MEDIA_FALLBACK__` diagnostic exposes only safe playback state and the same-origin asset pathname. It is absent whenever native Web Audio is available.
- The fallback makes no generator, solver, scoring, persistence, identity, catalog, or music-asset change.

## Boundaries

The document renderer adds only the same-origin asset base and a 44px `Back to Games` link. Number Logic owns Settings, Classroom Mode, fullscreen, audio, local progress, Reasoning Index, Mastery, achievements, and mode navigation. The browser receives no Supabase progress adapter and the runtime CSP denies network connections. Catalog migration `20260809100000_number_logic_internal_game.sql` adds exactly one `internal` row and intentionally leaves it `draft`.

The public homepage and Games catalog import only the server-side renderer registration. They do not reference the 453,196-byte Number Logic JS, 46,848-byte CSS, 813-byte capability loader, 9,593-byte conditional fallback, or 1,024,417-byte MP3; those assets load only after the authorized native play or Admin Preview response. The fallback file itself loads only in a browser without Web Audio.
