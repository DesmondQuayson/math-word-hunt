# Number Cross native integration

Number Cross is a trusted, source-controlled MathNexa game. Its catalog
identity is `number-cross`, its launch type is `internal`, and its native player
route is `/games/number-cross/play`. The catalog record remains Draft until the
owner separately approves Publish.

## Preservation boundary

The standalone repository at `C:\Users\quays\OneDrive\Documents\Number cross`
and verified commit `4737f5437ec3f04485abf312361d986d1b5e1a94` remain the
source of truth for the game engine. Native engine, preference, storage, and
style files were copied into
`apps/platform-web/public/internal-games/number-cross`. The generator, solver,
Reasoning Index, difficulty definitions, engagement rules, and audio lifecycle
were not rewritten. The approved platform adaptation adds one accessible,
44-pixel `Back to MathNexa Games` link and replaces the prior music asset and
credit metadata with the shared, same-origin Cosmic Candy Catchers track. Its
runtime MP3 SHA-256 is
`6BA9A6B324807202BB148F77F2030086E7AA0B5FC0F81E1D3DDEA072B47C7369`.
`integration.css` styles the platform link without changing puzzle geometry.

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
- Leaving the document tears down its one audio element, timers, and listeners
  through normal browser document lifecycle. No player history is sent to
  Supabase.
- Local storage remains under the existing `mathnexa:number-cross:*` namespace,
  with explicit legacy-key migration inputs only.

The native response is private and non-cacheable and sets a restrictive CSP,
same-origin resource policy, no-referrer policy, frame denial, and a bounded
Permissions Policy. Fullscreen remains available to the top-level game.

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
  one completed round, blocked audio, reduced motion, mobile/tablet/desktop/
  smart-board viewports, Draft concealment, a local-only Publish transition,
  entitled catalog visibility, and native same-origin Play. It resets local
  Supabase after the run.
- pgTAP verifies one catalog identity, exact metadata, append-only history,
  browser denial, transactional publication, maintenance, and audit evidence.

Production must remain Draft after deployment. Once the real owner session
successfully previews the native game, the handoff state is `READY FOR OWNER
PUBLISH TEST`; automation must not click Publish.
