# Phase 2 official sources

Consulted on 2026-07-26:

- [Stripe API versioning](https://docs.stripe.com/api/versioning): deliberate SDK/request/endpoint version alignment. Stripe 22.4.0's generated types pin `2026-07-29.dahlia`; the repository pins the same version rather than inheriting an account default.
- [Stripe webhook signatures](https://docs.stripe.com/webhooks/signature): raw UTF-8 body, `Stripe-Signature`, endpoint secret, and official `constructEvent` verification.
- [Stripe subscription integration](https://docs.stripe.com/billing/subscriptions/build-subscriptions?payment-ui=checkout&ui=stripe-hosted): hosted subscription Checkout.
- [Stripe customer portal](https://docs.stripe.com/customer-management/integrate-customer-portal): authenticated server-created short-lived sessions and webhook-driven subscription changes.
- [Stripe subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks): asynchronous lifecycle, retries, and access reconciliation.
- [Stripe test clocks](https://docs.stripe.com/billing/testing/test-clocks): sandbox lifecycle advancement and compatibility boundaries.
- [Next.js Route Handlers](https://nextjs.org/docs/app/getting-started/route-handlers): App Router request handling and raw request access.
- [Next.js authentication guide](https://nextjs.org/docs/app/guides/authentication): server-side authorization checks close to data/actions.
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security): browser data isolation and policy behavior.
- [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys): secret/service credentials remain server-only and bypass RLS only in trusted code.

Only first-party documentation and repository decision records informed implementation.
