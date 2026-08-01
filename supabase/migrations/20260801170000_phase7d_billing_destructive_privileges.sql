-- Hosted Supabase may provision broader default privileges for service_role than
-- the local stack. Keep reconciliation append/update-only in both environments.
-- REVOKE is idempotent and does not disturb the required SELECT, INSERT, or
-- UPDATE grants established by the billing foundation migration.
revoke delete, truncate on table
  public.billing_webhook_events,
  public.billing_subscriptions
from service_role;
