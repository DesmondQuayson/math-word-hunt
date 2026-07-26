# Official sources consulted for Phase 2A

Only first-party documentation was used:

- [Stripe webhooks](https://docs.stripe.com/webhooks?lang=node): raw signature, endpoint secrets, retries, duplicates, unordered delivery, prompt response, tolerance.
- [Subscription webhooks](https://docs.stripe.com/billing/subscriptions/webhooks) and [lifecycle](https://docs.stripe.com/billing/subscriptions/overview): asynchronous lifecycle and reconciliation.
- [Checkout fulfillment](https://docs.stripe.com/checkout/fulfillment): webhooks required; success page is not authority.
- [Customer portal](https://docs.stripe.com/customer-management) and [configuration](https://docs.stripe.com/customer-management/configure-portal): hosted short-lived sessions and controlled capabilities.
- [API keys](https://docs.stripe.com/keys) and [key practices](https://docs.stripe.com/keys-best-practices): test/live separation and server secrets.
- [Test clocks](https://docs.stripe.com/billing/testing/test-clocks): future lifecycle simulation without charges.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security) and [API security](https://supabase.com/docs/guides/api/securing-your-api): default-deny RLS and server keys.
- [Next.js data security](https://nextjs.org/docs/app/guides/data-security): server-only modules, environment exposure, untrusted action inputs.

Phase 2B must recheck current SDK/API versions before implementation.

