# Operations, monitoring, and incident response

The provider-neutral event contract covers authentication failure, authorization denial, capability denial, checkout creation, webhook verification/replay, reconciliation mismatch, manual review, database failure, deletion failure, invalid environment, preview health, and build identity. Events use category, severity, stable code, safe correlation ID, and low-cardinality detail. Passwords, tokens, cookies, email addresses, service keys, provider secrets, multiline input, and raw request bodies are rejected. Repeated identical security events are locally rate-limited. User-facing copy stays generic; diagnostic detail belongs only in protected operator logs.

`GET /api/health` exposes only `ready|configuration-required`, public environment identity, and sanitized build ID; it returns 503 for invalid configuration. `/status` adds the same non-sensitive boundary only for explicit preview. Neither endpoint proves database or payment-provider availability.

Severity: SEV-1 is active secret exposure, cross-account access, real-payment risk, or broad outage; SEV-2 is contained authorization/data-integrity failure or pilot-blocking outage; SEV-3 is degraded workflow with safe fallback; SEV-4 is low-impact defect/documentation issue.

Response: acknowledge → preserve evidence/correlation IDs → classify → activate kill switches (billing emergency deny, checkout/webhook off, preview access block) → contain/rotate → restore last verified build/database → validate cross-account and smoke gates → communicate through the approved channel → document root cause and prevention. The owner declares incidents and approves external communication; the technical responder contains, preserves evidence, verifies recovery, and never pastes secrets into tickets. No monitoring vendor is selected.

