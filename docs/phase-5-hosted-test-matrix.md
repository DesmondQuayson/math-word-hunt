# Phase 5 hosted test and evidence matrix

Phase 5 is owner-accepted as complete. The concise authoritative record is
[`phase-5-completion.md`](phase-5-completion.md). This matrix distinguishes
verified scope from deliberately deferred work; deferred work is not a pass.

| Area | Required hosted evidence | Current status |
|---|---|---|
| Access restriction | Anonymous `/status` denied; approved bypass succeeds; no public exception | Passed with Standard Protection and the existing approved bypass |
| Deployment | Preview banner, noindex, robots, build identity, no production domain or variables | Protected Preview passed; Production deliberately deferred |
| Health/status | Sanitized ready/configuration state; no provider IDs, keys, or internals | Passed |
| Empty migration | Empty hosted database migrated; lint; all pgTAP; extensions reviewed | Accepted; final synthetic-data counts are zero |
| RLS/grants | Cross-account read/write denial, constrained insert denial, private schema/function review | Passed reciprocal protected-record read and update denial |
| Auth | Adult teacher signup, confirmation, signin, recovery; exact callback; anonymous/social/manual linking off | Sign-in, persistence, restoration, logout, and signed-out denial passed; recovery delivery deferred |
| Header security | Open redirect, forged Host/Origin/environment/role/plan denial; security headers | Passed |
| Bundle security | Build/bundle scan for service-role, Stripe secret/webhook secret, bypass secret | Passed; no secret exposed |
| Stripe | Monthly, annual, signed webhook authority, redirect denial, duplicate prevention, portal, cancellation/end downgrade, failure/recovery, idempotency/stale/order/replay/reconciliation/emergency deny/live confusion | Pending Stripe Sandbox approval |
| Email capture | Six required templates in HTML/plain text; accessible structure; preview-origin validation; no technical IDs or delivery | Deterministic coverage passed; real and recovery delivery prohibited and deferred |
| Monitoring | Ten required safe event types, rate limiting, build identity, no secrets/PII | Hosted browser console and network checks passed; external production monitoring remains deliberately deferred |
| Devices/accessibility | Nine viewports, keyboard/focus/landmarks/h1/44px, zoom/reflow, spacing, forced colors, reduced motion, landscape, Smart Board, canonical pointer, overflow | Accepted responsive, accessibility, keyboard, and Pointer Events evidence passed |
| Reset | Rebuild isolated preview from empty, reload only approved fixtures, rerun pgTAP/cross-account | Disposable fixtures and both synthetic Auth users removed; final counts zero |
| Rollback/shutdown | Access block, kill switches, secret revocation, webhook/redirect removal, verified recovery | Tabletop remains documented; Production and external shutdown drill deferred |

Hosted-only work must stop on a repeated canonical Pointer Events failure until the test’s trace, screenshot, console/page errors, rendered coordinates, and pointer state are diagnosed. Tests must not be weakened, skipped, force-clicked, retry-hidden, or given a larger timeout.
