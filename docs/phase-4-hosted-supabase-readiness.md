# Hosted Supabase readiness

## Owner-run setup sequence

1. Create a dedicated preview organization/project; do not link production.
2. Record the project reference in owner-controlled environment configuration and verify it differs from every production identifier.
3. Require TLS database connections. Restrict direct database/network access to named operators where the plan supports it.
4. Apply migrations in timestamp order from an empty database; run `supabase db reset --local` and `supabase test db` first. Never run `seed.sql` in production. Preview fixtures may be loaded only after confirming the project identity and must use `.invalid` addresses and disposable data.
5. Configure Site URL to the exact preview HTTPS origin. Allow only exact `/auth/callback` confirmation and `/auth/callback?next=/update-password` recovery flows for that origin. Do not use wildcards.
6. Keep email confirmation required, anonymous sign-in off, manual linking off, and teacher-only email/password registration. Review hosted auth rate limits for signup, token refresh, verification, and recovery before inviting pilots.
7. Keep Storage unused with no buckets or policies. Keep Realtime disabled unless separately reviewed.
8. Use publishable keys in browsers. Keep the secret/service-role key in server and operator jobs only; never in build args, client environment, logs, tickets, or screenshots.
9. Apply preview access protection, then run the smoke and cross-account suites.

## Security review

RLS is enabled on every public teacher/billing table. Authenticated grants are column- and operation-scoped. Cross-account predicates bind to `auth.uid()`. Direct constrained inserts are denied in favor of transactional functions. `SECURITY DEFINER` functions have fixed empty `search_path`, schema-qualified objects, revoked public/anon/authenticated execution unless explicitly required, and local pgTAP coverage. Extensions are limited to the existing cryptographic/test dependencies; review `pg_extension` after hosted migration. The `private` schema remains unavailable to browsers. Audit-log access is service-role/operator only and should be exported only as minimized incident evidence.

Backups are a provider feature, not a deletion rollback guarantee. Before a pilot, the owner must choose backup retention, document a restore drill, and verify recovery into a separate disposable project. Preview branches must never inherit production data. Rotate publishable and server secrets by creating replacements, updating owner-controlled configuration, restarting the preview, verifying health, then revoking old values. Rotate immediately after suspected exposure.

