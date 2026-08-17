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

The checked-in JS and CSS are a production build from the approved source, with the reviewed music-credit strings mechanically adapted to Cosmic Candy Catchers. Vite's generated CSS-module identifiers make those two build hashes workspace-path-dependent, so they differ from the historical Phase 10 manifest while source aggregates, the explicitly allowed credit adaptation, behavior, and the approved audio byte hash remain fixed. The native verifier records the checked-in build hashes and rejects drift.

## Boundaries

The document renderer adds only the same-origin asset base and a 44px `Back to Games` link. Number Logic owns Settings, Classroom Mode, fullscreen, audio, local progress, Reasoning Index, Mastery, achievements, and mode navigation. The browser receives no Supabase progress adapter and the runtime CSP denies network connections. Catalog migration `20260809100000_number_logic_internal_game.sql` adds exactly one `internal` row and intentionally leaves it `draft`.

The public homepage and Games catalog import only the server-side renderer registration. They do not reference the 450,942-byte Number Logic JS, 46,848-byte CSS, or 1,024,417-byte MP3; those assets load only after the authorized native play or Admin Preview response.
