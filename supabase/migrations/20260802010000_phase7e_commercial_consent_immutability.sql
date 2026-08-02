-- Phase 7E hosted privilege hardening.
--
-- Supabase projects can retain default service_role table privileges. Granting
-- the narrower append-only privilege set does not revoke those pre-existing
-- rights, so explicitly remove every destructive operation before restoring
-- only the server operations required by the commercial-consent model.
revoke update, delete, truncate on table
  public.consumer_commercial_acceptances,
  public.consumer_checkout_acceptance_bindings
from service_role;

grant select, insert on table
  public.consumer_commercial_acceptances,
  public.consumer_checkout_acceptance_bindings
to service_role;

-- Restate the browser-role boundary without changing authenticated read access
-- governed by the existing owner-only RLS policies.
revoke insert, update, delete, truncate on table
  public.consumer_commercial_acceptances,
  public.consumer_checkout_acceptance_bindings
from public, anon, authenticated;
