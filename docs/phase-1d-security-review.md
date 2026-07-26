# Phase 1D security review

Implemented controls include default-deny RLS on all application tables, column-level grants, two-account negative tests, fixed-search-path security-definer helpers, server-derived ownership, safe redirect allowlisting, generic auth errors, ignored privilege metadata, no automatic entitlement, no permanent delete, and client-bundle secret scanning.

Application code uses publishable configuration plus the authenticated user session. Administrative local keys are read dynamically only by the isolated Playwright test process; they are not written, logged, sent to the browser, or imported by the app. Prototype data cannot be activated by browser state and production mode rejects its server flag.

Known local limitations: default local database credentials and broad Docker bindings are development-only; local email is captured by Mailpit; formal abuse controls, MFA, production rate limits, hosted secret management, monitoring, backups, incident response, and legal retention workflows are deferred. This review is not a formal security certification.
