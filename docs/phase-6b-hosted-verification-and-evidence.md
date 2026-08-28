# Phase 6B hosted verification and evidence

## Human Preview access requirements

Standard Protection remains enabled. Participant access must be an approved human method that does not expose or reuse the automation bypass. No public exception, custom domain, paid seat, add-on, hidden trial, or automatic charge is allowed without separate owner approval.

Anonymous access must be challenged. Each approved adult teacher uses an individual identity. The existing automation bypass remains test-only and is never included in an invitation, screenshot, log, browser diagnostic, or participant record.

## Hosted verification matrix

| Area | Required evidence | Stop condition |
| --- | --- | --- |
| Deployment | Preview target, Ready status, exact commit, stable alias, rollback deployment | Production or wrong commit |
| Protection | Standard Protection, anonymous challenge, human access, one test-only bypass | Public access or bypass exposure |
| Auth email | sender, SPF, DKIM, DMARC review, tracking off, confirmation and recovery | delivery or redirect failure |
| Sessions | confirmed login, refresh, restoration, logout, signed-out denial | session or account-status bypass |
| Authorization | own access, reciprocal denial, direct route, RPC, restricted account | cross-account exposure |
| Data minimization | organization write denial, no student persistence, generic responses | prohibited data persists |
| Gameplay | gateway, v7, vocabulary, pointer, keyboard, new puzzle | canonical regression |
| Accessibility | focus, landmarks, headings, 44px, reduced motion, forced colors, spacing, zoom and reflow | unresolved critical failure |
| Network | no console/page errors, mixed content, CSP failure, secret response, unexpected request | security-bearing failure |
| Cleanup | two synthetic Auth users and every application fixture count at zero | any failed deletion |

Viewports cover phone portrait and landscape, tablet, desktop, and Smart Board dimensions.

## Evidence matrix

Evidence is sanitized and records:

- timestamp and operating timezone
- deployed commit and build identifier
- deployment and rollback references held in the private operator record
- pass, fail, not-run, or blocked status
- test command or visible provider check
- sanitized observation
- cleanup count
- operator role, never personal identity

Repository evidence must not contain participant identities, private contacts, raw provider IDs, DNS secret values, SMTP credentials, confirmation or recovery links, cookies, tokens, sessions, or automation bypass values.

## Local verification

Run npm run phase6b:verify. It inherits the complete Phase 6 gate and adds Phase 6B core and web tests, migration reset, pgTAP, controlled browser rehearsal, cleanup-to-zero verification, Phase 6B security scans, production-default and bundle audits, dependency audit, final production build, protected hashes, and git diff checking.

Local Auth email remains local-capture. Passing local verification never claims external delivery or hosted readiness.

## Synthetic cleanup checklist

- delete both synthetic Auth users
- confirm profiles equal zero
- confirm classes equal zero
- confirm activities equal zero
- confirm entitlements equal zero
- confirm deletion requests equal zero
- confirm billing customers, subscriptions, and webhook records equal zero
- remove synthetic messages where provider controls allow it
- confirm no real participant account exists
- retain only sanitized evidence

Do not proceed when any count is nonzero or provider cleanup is uncertain.

## 2026-07-30 protected Preview release record

The owner approved a protected Vercel Preview release while explicitly keeping the pilot inactive. This approval is not pilot activation authority and does not authorize participants, invitations, billing, Production, public access, or student data.

Verified release gates:

- `npm run phase6b:verify` passed in full, including the inherited Phase 6 through Phase 1D gates, unit and integration tests, production builds, canonical and historical gameplay checks, database reset, 182 pgTAP tests, RLS and authorization tests, accessibility and responsive-browser coverage, security audits, dependency audit, protected hashes, and repository integrity checks
- `npm run phase6b:hosted:check` passed all five account-free protected Preview tests; anonymous access returned an HTTP 302 protection challenge
- the final read-only hosted inventory verified Auth users and all eight application collections at zero
- Standard Protection remained enabled, the existing automation bypass remained test-only, and the pilot remained inactive
- canonical SHA-256 values remained `7f00ed6789a2faf23b90e96c3dfdee0167aced87beb08dabf10b89c3e72c9fc5` for `docs/index.html` and `caeb8fbb590fffd8cbc169f88f174a38c26de2d16a7e1b0c1cf5e83ac9f01c46` for `docs/vocab.js`; historical and backup files remained unchanged

Manual operator verification actually completed:

- transactional confirmation email delivery and confirmation link
- confirmed-account sign-in
- authenticated session persistence
- expected teacher workspace access
- organization-label denial and inactive-pilot safeguards
- transactional recovery email delivery and password update
- targeted Auth Admin cleanup followed by server-side cleanup-to-zero across all nine collections

The following are **OWNER-ACCEPTED DEFERRED RISKS** and are not recorded as passed:

- previous-password rejection after recovery
- new-password authentication after recovery
- unknown-account recovery privacy equivalence for synthetic alias B

The owner accepts that ordinary functional bugs may be discovered and corrected during controlled use. These deferrals do not waive any security, RLS, privacy, data-integrity, protection, or cleanup stop condition. The protected Preview release may proceed, but the pilot remains inactive and no participant may be invited until separately authorized.

Noncritical launch follow-up:

- complete the three deferred manual checks during the next owner-controlled verification window
- update the installed Supabase CLI after compatibility review; the verified repository version remains pinned for reproducibility
- replace deprecated Node child-process `shell: true` argument handling in a future verification-infrastructure maintenance change without weakening the gates
- on Windows systems where the default Supabase `5432x` ports fall inside a dynamic exclusion range, use a temporary local-only port remap and restore `supabase/config.toml` before commit

## Public Production separation

The later public MathNexa release does not activate or expose Phase 6B. It uses
a separate Vercel project and the provider-free `production-public` contract.
Production has no Supabase/Auth, teacher accounts, recovery, pilot
participation, invitations, billing, transactional email, fixtures, deletion,
student data, or organization labels. The protected Preview and its inactive
pilot remain unchanged.

Previous-password rejection, new-password authentication, and unknown-account
recovery privacy equivalence remain owner-accepted deferred risks and are not
recorded as passed. They are irrelevant to the public-only runtime because Auth
is disabled, but remain required evidence before any future authenticated
Production architecture.
