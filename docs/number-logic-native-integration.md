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
- Number Logic runtime JS SHA-256: `1801220e5b7688626aaf926c7f023f3bc2d108d9f91bdb5426f142e9726fabda`

The checked-in JS and CSS are a production build from the approved source. The JS then receives two deterministic platform-owned adaptations: the reviewed Cosmic Candy Catchers credit and `scripts/apply-number-logic-hotfix.mjs`. The hotfix replaces only the Lines of 3 tutorial presentation and the browser-audio activation lifecycle; it rejects unknown input, is idempotent, and does not touch the generator, solver, scoring, persistence, identity, or audio asset. Tutorial presentation styles live in the integration stylesheet so the opaque source bundle does not acquire an unreviewed CSS rebuild. Vite's generated CSS-module identifiers make the build hashes workspace-path-dependent, so the native verifier records the checked-in hashes and reproduces both adaptations before accepting the standalone build.

## Post-release tutorial and audio hotfix

- Tutorial `lines-of-3/tutorial-v2` uses the authoritative seven-position/five-route board. Its worked fixture is `4 / 7-2-3 / 1-6-5`; left, center, right, middle, and bottom routes all total 12. The three-dot step indicator is an explicitly named progressbar with current, minimum, maximum, and human-readable step values; the visible tutorial is covered by a WCAG 2 A/AA Axe scan with no rule exceptions.
- The first valid pointer, Enter, or Space gameplay gesture synchronously primes the one looping `HTMLAudioElement`. The source is not assigned on mount, so route entry makes no eager MP3 request.
- Background music now uses the same direct HTMLMedia lifecycle proven by Math Vocabulary Hunt, Number Cross, and CrossCalc. Web Audio remains isolated to short sound effects. This removes the fetch/decode delay and the Safari race caused by reading `AudioContext.state` in the same callback that fulfilled `resume()`.
- A fulfilled `AudioContext.resume()` follows the platform promise contract for sound effects. A rejected `NotAllowedError` stays retryable on the next eligible gesture; it does not stop already-playing HTMLMedia music. Safari's prefixed `webkitAudioContext` remains supported for effects, while browsers with no Web Audio still play music and degrade effects safely.
- Music OFF pauses the current element, Music ON reuses it without overlap, the existing preference survives reload, rapid gestures share one pending play attempt, and unmount or a non-BFCache `pagehide` removes the source and calls `load()`. A persisted BFCache `pagehide` pauses without discarding its source, and the paired persisted `pageshow` reconciles from `document.hidden` so a restored visible page resumes.
- Recoverable autoplay denial remains `LOCKED` and waits for a later gesture. Codec, network, and media-element errors pause the track and emit an honest `UNAVAILABLE` state; the existing Retry Music action resets that fatal state without a retry loop.
- The document requests the unchanged runtime as `index-DXexJzA-.js?v=1801220e5b7688626aaf926c7f023f3bc2d108d9f91bdb5426f142e9726fabda`. The full checked-in SHA-256 is the cache-version token, so an already-open browser cannot reuse an older response under the same generated filename after this hotfix. Future bundle changes must update the checked-in hash, this token, and their verifier assertions together.

### Unified music lifecycle

The music lifecycle is part of the existing Number Logic audio backend rather than a loader, shim, or second controller. It operates independently of Web Audio availability, so Safari/WebKit follows the same HTMLMedia path as Chromium and Firefox. The existing manager remains authoritative for settings and UI state.

- `mathnexa:number-logic-audio:1` remains the only settings contract. Missing or malformed settings default music to ON; an explicit stored OFF stays OFF. Master mute and volume remain manager-owned. Volume `0` remains a valid, explicit user setting: the media clock can advance while intentionally silent, so Production QA records both stored/UI volume and current-time advancement before classifying a playback failure.
- The frozen `window.__MATHNEXA_NUMBER_LOGIC_MUSIC__` diagnostic exposes the same-origin source and live, non-authoritative media state for verification: current time, active source count, volume/mute, pending play, attempts, recoverable block versus fatal error, and disposal.
- No generator, solver, scoring, Reasoning Index, results, progress, identity, catalog, or music-asset behavior is changed.

## Boundaries

The document renderer adds only the same-origin asset base and a 44px `Back to Games` link. Number Logic owns Settings, Classroom Mode, fullscreen, audio, local progress, Reasoning Index, Mastery, achievements, and mode navigation. The browser receives no Supabase progress adapter and the runtime CSP denies network connections. Catalog migration `20260809100000_number_logic_internal_game.sql` adds exactly one `internal` row and intentionally leaves it `draft`.

The public homepage and Games catalog import only the server-side renderer registration. They do not reference the 456,909-byte Number Logic JS, 46,848-byte CSS, or 1,024,417-byte MP3; those assets load only after the authorized native play or Admin Preview response.
