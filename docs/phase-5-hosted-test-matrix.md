# Phase 5 hosted test and evidence matrix

No hosted result exists yet. `pending` is not a pass. Evidence must identify UTC time, build commit, non-secret resource labels, test command, result, and sanitized artifact location.

| Area | Required hosted evidence | Current status |
|---|---|---|
| Access restriction | Anonymous `/status` denied; approved bypass succeeds; no public exception | Pending approval and preview |
| Deployment | Preview banner, noindex, robots, build identity, no production domain or variables | Pending |
| Health/status | Sanitized ready/configuration state; no provider IDs, keys, or internals | Pending |
| Empty migration | Empty hosted database migrated; lint; all pgTAP; extensions reviewed | Pending |
| RLS/grants | Cross-account read/write denial, constrained insert denial, private schema/function review | Pending disposable fixtures |
| Auth | Adult teacher signup, confirmation, signin, recovery; exact callback; anonymous/social/manual linking off | Pending captured email and fixtures |
| Header security | Open redirect, forged Host/Origin/environment/role/plan denial; security headers | Pending |
| Bundle security | Build/bundle scan for service-role, Stripe secret/webhook secret, bypass secret | Pending |
| Stripe | Monthly, annual, signed webhook authority, redirect denial, duplicate prevention, portal, cancellation/end downgrade, failure/recovery, idempotency/stale/order/replay/reconciliation/emergency deny/live confusion | Pending Stripe Sandbox approval |
| Email capture | Six required templates in HTML/plain text; accessible structure; preview-origin validation; no technical IDs or delivery | Local deterministic coverage passes through Phase 4; hosted capture pending |
| Monitoring | Ten required safe event types, rate limiting, build identity, no secrets/PII | Local deterministic coverage passes through Phase 4; hosted captured logs pending |
| Devices/accessibility | Nine viewports, keyboard/focus/landmarks/h1/44px, zoom/reflow, spacing, forced colors, reduced motion, landscape, Smart Board, canonical pointer, overflow | Local Phase 4/canonical coverage passed; hosted pending |
| Reset | Rebuild isolated preview from empty, reload only approved fixtures, rerun pgTAP/cross-account | Pending owner-approved drill |
| Rollback/shutdown | Access block, kill switches, secret revocation, webhook/redirect removal, verified recovery | Tabletop documented; external drill pending |

Hosted-only work must stop on a repeated canonical Pointer Events failure until the test’s trace, screenshot, console/page errors, rendered coordinates, and pointer state are diagnosed. Tests must not be weakened, skipped, force-clicked, retry-hidden, or given a larger timeout.
