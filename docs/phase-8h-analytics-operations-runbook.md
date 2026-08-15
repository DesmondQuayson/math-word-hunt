# Phase 8H analytics and operations runbook

Phase 8H adds owner-only aggregate analytics, system health, immutable audit viewing, and server-owned operational switches. It does not add student profiles, personal learning histories, arbitrary database editors, or browser authority over flags. `MVH_ADMIN_ENABLED=false` remains the safe hosted default until the complete Phase 8 release is verified.

## Data boundaries

- `platform_analytics_events` accepts only an allowlisted metric key, result, quantity, source, and optional Grade 1–9/topic/lesson slugs. It has no user, email, IP, token, session, or student column.
- Account, subscription, webhook, game-launch, and resource-download totals are derived server-side. The admin application never selects the consumer identity columns from launch or download evidence.
- CSV analytics exports contain aggregate labels and counts only. Audit CSV excludes admin identity, metadata, IP, user agent, cookies, and tokens.
- Game-completion health remains an explicit no-signal state until a trusted runtime emits an aggregate completion event. It is never inferred from a launch.

## Server-owned flags

The allowlist is `maintenance-mode`, `announcement-published`, `checkout-emergency-disabled`, and `admin-emergency-disabled`. Browser roles cannot read or write the table or execute its mutation function. Every change requires an authorized AAL2 owner session, a reason, CSRF and same-origin validation, optimistic concurrency, immutable flag history, and an admin audit event. Checkout and admin emergency changes additionally require a session started within the last five minutes.

Maintenance mode displays reviewed public-safe copy and fails closed for new checkout attempts while leaving existing customer self-service and public learning content available. Announcement publication displays its reviewed message and links to the structured CMS for source content. Checkout emergency disable blocks new checkout only; it does not rewrite Stripe projections, prices, entitlements, or billing history. Admin emergency disable revokes every active admin session and causes genuine 404 concealment for `/admin` while public customer functionality remains unchanged.

To restore admin after emergency disable, keep `MVH_ADMIN_ENABLED=false`, investigate and preserve evidence, then use an authenticated database-owner maintenance session—not a browser or service-role table update—to set only `platform_feature_flags.admin-emergency-disabled` to false and insert matching feature-history and `admin_audit_log` evidence. Re-enable the environment flag only after MFA, RLS, audit, and public smoke checks pass. Never grant table mutation to make restoration easier.

## Retention

The owner-only retention workflow deletes only aggregate analytics events older than 400 days. It never deletes admin audit, feature history, subscription, webhook, download, launch, customer, or storage evidence. Each run records the cutoff, deleted count, owner session, reason, and immutable audit event. Run it only after a fresh MFA-bound admin session.

## Backup and restore

Before a Phase 8 deployment, record the exact application commit and Vercel deployment ID, take a provider-supported Supabase backup, export schema/migration status, and inventory private storage buckets by object count and bytes. Do not copy service keys, customer exports, object paths, or MFA material into evidence.

Restore into an isolated project first. Apply migrations from empty, restore the database, restore private storage under the original private bucket policies, and run complete pgTAP plus signed-download/package/CMS checks. Reconcile counts—not identities—for subscriptions, webhooks, storage, audit, and flags. A production restore requires owner approval and a maintenance window. Stripe remains authoritative; never roll its projection backward with a database snapshot.

## Incident response

1. Classify the incident and record a non-sensitive correlation reference.
2. For suspected admin compromise, set the environment admin flag false immediately, redeploy, revoke admin sessions, and preserve immutable evidence.
3. For checkout/provider risk, activate checkout emergency disable. Do not cancel subscriptions or mutate billing projections.
4. For database or storage risk, stop publication/download writes, retain public read paths where safe, and capture provider health without secrets.
5. Confirm signed-out, non-admin, and incomplete-MFA `/admin` requests still return a genuine 404.
6. Rotate affected credentials through the provider UI; never place old or new values in tickets, logs, screenshots, commits, or chat.
7. Restore service only after RLS, cross-account isolation, audit immutability, public smoke, and customer billing reconciliation pass.

## Rollback

Set `MVH_ADMIN_ENABLED=false`, deploy the previously recorded public deployment, revoke all admin sessions, and leave customer billing/resources intact. Roll back database changes only with a reviewed forward migration; do not delete Phase 8 audit evidence or published version history. Storage, CMS, game packages, and resources use their versioned rollback workflows. Confirm protected canonical hashes and run public account, subscription, billing portal, game, Homework, Quiz, and MAP Prep smoke checks before closing the incident.
