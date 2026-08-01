-- Stripe Checkout Session ids include an environment marker in both test and
-- live mode. Preserve the narrow provider-id allowlist while accepting those
-- authoritative shapes in the webhook receipt ledger.
alter table public.billing_webhook_events
  drop constraint billing_webhook_events_stripe_object_id_check;
alter table public.billing_webhook_events
  add constraint billing_webhook_events_stripe_object_id_check check (
    stripe_object_id is null or
    stripe_object_id ~ '^(cs_((test|live)_)?|sub_|in_|cus_)[A-Za-z0-9]+$'
  );
