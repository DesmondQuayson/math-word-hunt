-- Stripe timestamps are authoritative but have whole-second precision. A
-- cancellation requested in the same second as the local projection can be
-- earlier than the row's millisecond-precision created_at. Compare provider
-- timestamps to the provider-owned period boundary instead.
alter table public.billing_subscriptions
  drop constraint billing_subscriptions_check3;
alter table public.billing_subscriptions
  add constraint billing_subscriptions_canceled_at_period_check check (
    canceled_at is null or current_period_start is null or
    canceled_at >= current_period_start
  );
