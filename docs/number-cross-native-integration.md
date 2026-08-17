# Number Cross native integration

Number Cross is a trusted, source-controlled MathNexa game. Its catalog
identity is `number-cross`, its launch type is `internal`, and its native player
route is `/games/number-cross/play`. The owner-published catalog record remains
the single authoritative Number Cross identity.

## Preservation boundary

The standalone repository at `C:\Users\quays\OneDrive\Documents\Number cross`
and verified commit `4737f5437ec3f04485abf312361d986d1b5e1a94` remain the
source of truth for the game engine. Native engine, preference, storage, and
style files were copied into
`apps/platform-web/public/internal-games/number-cross`. The generator, solver,
Reasoning Index, difficulty definitions, engagement rules, and audio lifecycle
were initially copied byte-for-byte. The approved platform adaptation adds one
accessible, 44-pixel `Back to MathNexa Games` link and replaces the prior music
asset and credit metadata with the shared, same-origin Cosmic Candy Catchers track. Its
runtime MP3 SHA-256 is
`6BA9A6B324807202BB148F77F2030086E7AA0B5FC0F81E1D3DDEA072B47C7369`.
The generator, solver, preference module, storage keys, base styles, puzzle
geometry, and music asset remain byte-preserved. The post-release hotfix changes
only the integrated application lifecycle and `integration.css` presentation
described below.

The original protected deployment at `https://number-cross.vercel.app` remains
online as a backup and still denies direct access with HTTP 401. Its shared
launch-secret infrastructure remains configured until the owner approves a
later cleanup phase.

## Trusted registry

`apps/platform-web/lib/games/internal-registry.ts` is the only application
registry. It maps a stable catalog key to a fixed native route, asset base, and
server-owned document renderer. Browser values and Super Admin forms cannot
provide module paths, JavaScript paths, routes, or arbitrary components.
Future internal games require both a source-controlled registry entry and an
additive catalog migration before they can be published.

## Authorization and lifecycle

- Normal Play first requires the existing `MATHNEXA_ALL_ACCESS` server
  decision, a Published catalog row, a non-maintenance/non-archived state, and
  a matching trusted registry entry.
- Draft and Archived direct Play fail closed. Maintenance uses the existing
  MathNexa maintenance experience.
- Admin Preview uses the existing authenticated owner, role, MFA, bounded Admin
  session, and concealment checks, then returns the native document directly.
  `preview=true` and other browser-controlled values grant no authority.
- Native gameplay is a top-level, same-origin document. It uses no external
  redirect, iframe, signed launch JWT, cross-site session exchange, or uploaded
  code.
- Leaving the document pauses its one audio element before a back/forward-cache
  transition, or disposes its element, fade timer, source URL, and AudioContext
  when the document is discarded. No player history is sent to Supabase.
- Local storage remains under the existing `mathnexa:number-cross:*` namespace,
  with explicit legacy-key migration inputs only.

The native response is private and non-cacheable and sets a restrictive CSP,
same-origin resource policy, no-referrer policy, frame denial, and a bounded
Permissions Policy. Fullscreen remains available to the top-level game.

## Post-release tutorial and audio hotfix

The Number Cross tutorial now uses the real 3×3 target-and-tile grammar rather
than abstract placeholder blocks. It labels column targets above and row
targets beside a mathematically consistent board, works the first line by
crossing out `1` from `2, 5, 1`, and finishes the same board so every row and
column target visibly checks. Addition and multiplication use separately valid
target sets. The visual is exposed as a concise labelled image, while the only
focusable tutorial controls are Skip and Next/Start solving.

Music now defaults on only when no explicit preference exists. The Start
gesture may begin the same-origin track while the tutorial is open, and every
pointer or keyboard gesture safely retries a browser-blocked attempt without
creating another element or source. `play()` is called directly inside the
activation task, before any asynchronous fetch/decode boundary. OFF pauses
immediately, ON restarts, the preference survives reload, and a frozen
`__MATHNEXA_GAME_MUSIC__` diagnostic reports real media state for regression
tests. `NotAllowedError` remains recoverable and never blocks gameplay.

## Catalog migration and publication

Migration `20260808100000_number_cross_internal_game.sql` adds the generic
`internal` launch type without removing canonical, hosted-package, or approved
HTTPS support. It reuses the existing Number Cross row, clears external launch
fields, preserves history and rollback metadata, appends an Internal Draft
snapshot, and leaves the old allowed-host infrastructure intact.

Publication remains one database transaction: the status/lock update, version
snapshot, and Admin audit event either all succeed or all roll back. External
games still require verified destination health; internal games instead require
complete registry metadata, and the server route also verifies the source
registry before calling the transition RPC. Targeted Games and detail/play
paths are revalidated after successful owner updates.

## Verification

- `npm run test:number-cross:native` checks source hashes, local-storage
  namespacing, optimized audio, representative deterministic seeds, unique
  solutions, and standalone/native Reasoning Index parity.
- `npm run test:number-cross` covers the internal registry, Draft/Published/
  Maintenance/Archived route policy, Admin Preview authorization, spoofed
  preview denial, and the retained external backup launch contract.
- `npm run test:e2e:number-cross` exercises real local MFA-backed Draft Preview,
  pointer and keyboard input, four representative mode/difficulty combinations,
  one completed round, blocked-audio retry, real advancing media time, ON/OFF
  persistence, single-source and pagehide cleanup, the three tutorial steps,
  reduced motion, mobile/tablet/desktop/smart-board viewports, Draft
  concealment, a local-only Publish transition, entitled catalog visibility,
  and native same-origin Play. It resets local Supabase after the run.
- pgTAP verifies one catalog identity, exact metadata, append-only history,
  browser denial, transactional publication, maintenance, and audit evidence.

Number Cross is now an owner-published catalog product. A hotfix may change its
trusted runtime only through the normal reviewed branch, verification, and
Production deployment flow; it must not create another catalog identity.
