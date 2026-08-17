# Classroom network readiness

## Required destinations

| Purpose | Destination | Required during active play |
| --- | --- | --- |
| MathNexa application, game code, images, music, and icons | `https://mathnexa.com` | Yes |
| Authentication and server data | the configured MathNexa Supabase HTTPS project endpoint | Yes for sign-in, entitlement, and initial catalog/launch authorization |

The current Production Supabase project is in `us-east-2`; district allowlists should use the exact hostname supplied by the MathNexa owner rather than a wildcard. No secret, service-role value, database port, or database hostname belongs in a client allowlist.

## Runtime behavior

- All four current game implementations are delivered from MathNexa. There are no gameplay iframes and no remote game engine.
- Catalog thumbnails, JavaScript, CSS, icons, and **Cosmic Candy Catchers** music are same-origin assets.
- OpenGameArt and SoundImage are attribution/provenance sources only; normal runtime makes no request to either site.
- WebSockets are not required for active puzzle play.
- Stripe is not contacted by a game board. Billing/account flows are separate from game runtime.
- Core puzzle interactions continue when optional analytics or synthesized audio are unavailable. Authentication or entitlement failures still fail closed.
- The current games use HTTPS, first-party cookies for the signed-in session, and browser storage for local preferences/progress. Blocking all cookies or all site storage can prevent sign-in or persistence.
- No camera, microphone, location, USB, clipboard, or payment permission is required by a game.

## Browser baseline

- Current Safari on macOS
- Current Safari on iPadOS
- Current Chromium-based classroom browsers
- JavaScript, first-party cookies, HTML audio/Web Audio, Pointer Events, and local storage should be permitted
- Fullscreen is optional and feature-detected; gameplay never depends on it

## Services that may be blocked during gameplay

OpenGameArt, SoundImage, Google Fonts, third-party CDNs, external image hosts, URL shorteners, and remote audio hosts are not required. Blocking a district's optional analytics destinations should not freeze an already loaded puzzle.

## Troubleshooting for district IT

1. Confirm `https://mathnexa.com` loads without content rewriting and that JavaScript, CSS, WebP/AVIF images, and MP3 responses are permitted.
2. Confirm the exact MathNexa Supabase HTTPS endpoint is reachable for sign-in and entitlement checks.
3. Permit first-party cookies and site storage for MathNexa.
4. Check whether an audio policy blocks playback until the teacher touches/clicks/presses a key. MathNexa intentionally respects this browser policy.
5. If fullscreen is disabled by policy, use the game's responsive classroom layout; do not treat fullscreen as a launch requirement.
6. Report the game route, browser/version, response status, and time of failure. Do not send passwords, session cookies, API keys, or student data.

MathNexa does not use filtering evasion, domain fronting, disguised proxies, alternate bypass domains, or tunnels.
