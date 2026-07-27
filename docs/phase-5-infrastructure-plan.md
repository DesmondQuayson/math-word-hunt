# Phase 5 hosted-preview infrastructure plan

Status: **proposal only**. No approval to create, link, deploy, or mutate an external resource has been received. Each resource below requires its own owner approval.

## Proposed topology and inventory

| Resource | Proposed identity and boundary | Data or secrets | Creation status |
|---|---|---|---|
| Vercel project | `math-vocabulary-hunt-preview`; preview deployments only; no production domain | Preview-only environment variables; owner-held automation bypass | Not created or linked |
| Vercel access control | Vercel Authentication with Standard Protection; no public exception | Vercel membership and separate automation bypass secret | Not configured |
| Supabase project | `mvh-preview`; owner-selected region; isolated organization/project; never branched from production | Disposable adult-teacher fixtures only; no student data | Not created or linked |
| Supabase Auth | Email/password, confirmation required, recovery enabled, anonymous and manual linking disabled | Exact Site URL and exact redirect allowlist | Not configured |
| Stripe sandbox | Prefer an isolated Stripe Sandbox; otherwise test mode only | One test Product, monthly/annual test Prices, test Portal configuration, test webhook | Not created |
| Email | Supabase/provider sandbox capture only | Adult test addresses at approved domains; no delivery to customers | Provider not selected |
| Monitoring | Existing structured captured logs unless an owner approves a vendor | Sanitized events and build identity only | Captured-log mode proposed |
| Pilot support | Owner-controlled form/channel | Minimized adult feedback; no student data, secrets, or payment details | Owner decision pending |
| DNS | None for Phase 5; use provider preview hostname | No production domain | Explicitly excluded |

The proposed preview origin is recorded only after Vercel creates a protected deployment. Until then it is `<PREVIEW_ORIGIN>`. Supabase Site URL must be exactly `<PREVIEW_ORIGIN>`. Allowed redirects must be exactly `<PREVIEW_ORIGIN>/auth/callback` and `<PREVIEW_ORIGIN>/auth/callback?next=/update-password`; wildcard preview redirects are prohibited for this controlled pilot.

## Environment boundaries

- Local remains loopback, local Supabase, captured email, console monitoring, test/disabled billing, and dry-run deletion.
- Preview is a unique HTTPS origin, unique data project, Stripe sandbox/test mode, captured email, structured captured monitoring, disposable fixtures, persistent preview banner, noindex/robots blocking, and dry-run deletion.
- Production remains unsupported and unprovisioned. No Phase 5 setting may select production, live Stripe, real email, permanent deletion, a public domain, or student data.
- Browser-visible variables supply connectivity only. Role, plan, ownership, entitlement, environment identity, billing state, and deletion authority remain server/database controlled.

## Ownership and lifecycle

The owner controls provider organizations, billing plans, MFA, credentials, access membership, approval records, cost limits, pilot participant approval, and final shutdown. The technical operator may run only the separately approved step, records resource labels without secrets, and stops at the next approval boundary.

Preview data resets rebuild an empty isolated database from repository migrations, run pgTAP, load only approved `.invalid` disposable fixtures, run cross-account tests, and then reopen access. No production export or real user data may seed preview. Proposed reset cadence is before pilot entry, after any security test that mutates fixtures, and at pilot exit; owner approval is pending.

Rollback blocks Vercel access, disables checkout/portal/webhooks, activates billing emergency deny, revokes the automation bypass, removes Supabase redirects and Stripe webhook delivery, restores the last verified preview build if needed, and validates before reopening. Shutdown additionally revokes/rotates secrets, deletes disposable test resources after owner approval, exports only minimized evidence, and records disposal. Provider deletion is never automatic.

## Pilot policy

The proposed pilot is 3–10 specifically approved adult teachers for 2–4 weeks. No student accounts, names, email, roster, work, or sensitive school data are permitted. Billing is simulated only. Invitation requires approved privacy/no-student-data language, support and incident owners, feedback channel, test-mode disclosure, tested reset/rollback, and approved exit criteria.

## Current official platform constraints

Vercel separates Development, Preview, and Production variables and its Standard Protection can protect preview deployments with Vercel Authentication. Automation may use an owner-held protection-bypass header; it must never be committed. Supabase auth requires exact configured redirect URLs, and its production checklist emphasizes RLS, email confirmations, operator MFA, SSL, and controlled SMTP. Stripe recommends isolated Sandboxes and confirms test environments move no real money. See `docs/phase-5-cost-estimate.md` for dated pricing assumptions and source links.
