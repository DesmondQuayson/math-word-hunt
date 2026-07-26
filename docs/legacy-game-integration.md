# Legacy Game Integration

Status: Phase 1C gateway contract.

## Preservation method

The Next.js application does not embed, copy, import, frame, or rebuild the
game. `/play` renders a server-configured link to the canonical v7 deployment.
The repository fallback value is `/docs/index.html`, the canonical source path.
Local root development starts the static server separately and supplies
`http://127.0.0.1:4173/docs/index.html` through the server-only
`LEGACY_GAME_URL` setting.

A future preview deployment must configure `LEGACY_GAME_URL` to the approved
HTTPS URL of the current GitHub Pages product. The adapter accepts HTTPS,
repository-relative paths, and localhost HTTP for tests/development; unsafe
schemes and protocol-relative destinations fall back to `/docs/index.html`.

## Navigation and failure behavior

The primary game link opens in a new tab with `noopener noreferrer`. This keeps
the gateway available if the static host is slow, blocked, or unavailable. A
native disclosure on the gateway explains recovery and provides a direct
same-tab fallback link. The gateway does not claim to preserve game progress;
the current game remains session-local.

## Security boundary

The legacy destination selects navigation only. It cannot grant product or
feature access. Query strings, fragments, cookies, browser storage, and client
variables are not read by entitlement adapters. A public destination URL is
not a secret and must never carry tokens or personal data.

## Release and rollback

Canonical v7 browser tests remain independent of platform tests. A platform
shell regression cannot require changing v7. If the shell preview is disabled,
GitHub Pages continues to serve v7 unchanged. No public route or DNS cutover is
part of Phase 1C.
