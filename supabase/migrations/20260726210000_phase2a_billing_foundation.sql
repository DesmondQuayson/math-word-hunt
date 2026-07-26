-- Phase 2A stores a local projection only. It creates no Stripe resources and
-- exposes no billing authority to browser roles.
create table public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.teacher_profiles(user_id) on delete restrict,
  stripe_environment text not null check (stripe_environment in ('test', 'live')),
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9]+$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (updated_at >= created_at),
  unique (owner_teacher_id, stripe_environment),
  unique (stripe_environment, stripe_customer_id),
  unique (id, owner_teacher_id, stripe_environment)
);

create table public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  owner_teacher_id uuid not null references public.teacher_profiles(user_id) on delete restrict,
  billing_customer_id uuid not null,
  stripe_environment text not null check (stripe_environment in ('test', 'live')),
  stripe_subscription_id text not null check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]+$'),
  product_key text not null references public.products(product_key) on update cascade on delete restrict
    check (product_key = 'math-vocabulary-hunt'),
  plan_key text not null check (plan_key in ('teacher-pro-monthly', 'teacher-pro-annual')),
  stripe_price_id text not null check (stripe_price_id ~ '^price_[A-Za-z0-9]+$'),
  subscription_status text not null check (subscription_status in (
    'active', 'trialing', 'incomplete', 'incomplete_expired', 'past_due', 'unpaid', 'paused', 'canceled'
  )),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  canceled_at timestamptz,
  trial_end timestamptz,
  latest_authoritative_event_created_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (billing_customer_id, owner_teacher_id, stripe_environment)
    references public.billing_customers(id, owner_teacher_id, stripe_environment) on delete restrict,
  check (
    (current_period_start is null and current_period_end is null) or
    (current_period_start is not null and current_period_end is not null and current_period_end > current_period_start)
  ),
  check (subscription_status not in ('active', 'trialing') or current_period_end is not null),
  check (trial_end is null or subscription_status = 'trialing'),
  check (canceled_at is null or canceled_at >= created_at),
  check (updated_at >= created_at),
  unique (stripe_environment, stripe_subscription_id)
);

create unique index billing_subscriptions_one_current_per_owner
  on public.billing_subscriptions (owner_teacher_id, stripe_environment)
  where subscription_status not in ('canceled', 'incomplete_expired');
create index billing_subscriptions_owner_status_idx
  on public.billing_subscriptions (owner_teacher_id, stripe_environment, subscription_status);
create index billing_subscriptions_customer_idx
  on public.billing_subscriptions (billing_customer_id);

create table public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  stripe_event_id text not null check (stripe_event_id ~ '^evt_[A-Za-z0-9]+$'),
  event_type text not null check (event_type in (
    'checkout.session.completed',
    'customer.subscription.created',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.paid',
    'invoice.payment_failed'
  )),
  stripe_environment text not null check (stripe_environment in ('test', 'live')),
  stripe_object_id text check (
    stripe_object_id is null or stripe_object_id ~ '^(cs|sub|in)_[A-Za-z0-9]+$'
  ),
  event_created_at timestamptz not null,
  received_at timestamptz not null default now(),
  processing_state text not null default 'received' check (processing_state in (
    'received', 'processing', 'processed', 'failed', 'manual_review', 'ignored'
  )),
  processed_at timestamptz,
  failure_class text check (failure_class in (
    'configuration', 'environment_mismatch', 'invalid_owner', 'unknown_plan',
    'provider_unavailable', 'projection_conflict', 'unsupported_payload'
  )),
  attempt_count integer not null default 1 check (attempt_count between 1 and 1000),
  payload_sha256 text not null check (payload_sha256 ~ '^[a-f0-9]{64}$'),
  api_version text check (api_version is null or char_length(api_version) between 1 and 40),
  unique (stripe_environment, stripe_event_id),
  check ((processing_state = 'processed' and processed_at is not null) or processing_state <> 'processed'),
  check ((processing_state in ('failed', 'manual_review') and failure_class is not null) or
         processing_state not in ('failed', 'manual_review'))
);

alter table public.product_entitlements
  add column billing_subscription_id uuid references public.billing_subscriptions(id) on delete restrict;
alter table public.product_entitlements
  add constraint product_entitlements_subscription_source_integrity check (
    (source = 'subscription' and billing_subscription_id is not null) or
    (source <> 'subscription' and billing_subscription_id is null)
  );
create index product_entitlements_billing_subscription_idx
  on public.product_entitlements (billing_subscription_id)
  where billing_subscription_id is not null;

create trigger billing_customers_set_updated_at before update on public.billing_customers
for each row execute function private.set_updated_at();
create trigger billing_subscriptions_set_updated_at before update on public.billing_subscriptions
for each row execute function private.set_updated_at();

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_webhook_events enable row level security;
alter table public.billing_customers force row level security;
alter table public.billing_subscriptions force row level security;
alter table public.billing_webhook_events force row level security;

revoke all on table public.billing_customers from public, anon, authenticated;
revoke all on table public.billing_subscriptions from public, anon, authenticated;
revoke all on table public.billing_webhook_events from public, anon, authenticated;

-- Future reconciliation code must use a narrowly held server credential. No
-- policy or grant permits browser roles to read or mutate these projections.
grant select, insert, update on table public.billing_customers,
  public.billing_subscriptions, public.billing_webhook_events to service_role;
