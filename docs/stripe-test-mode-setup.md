# Stripe test-mode setup

## Prerequisites

Use a Stripe sandbox/test secret in an untracked environment only. Never paste a secret into source, shell history intended for sharing, issue text, or test output. The server pins `stripe` 22.4.0 and API version `2026-07-29.dahlia`; configure a test webhook endpoint or Stripe CLI forwarding with that exact API version.

## Provisioning

Preview the idempotent operation:

```powershell
$env:STRIPE_SECRET_KEY = '<test secret from Stripe>'
npm run billing:provision:test -- --dry-run
```

Create or reuse the test Product, monthly/annual Prices, and restricted portal configuration:

```powershell
npm run billing:provision:test -- --write-env
```

The script rejects live keys, validates mode/product/currency/amount/interval/quantity model/activity, reuses stable metadata and lookup keys, and refuses to overwrite `.env.billing.local`. Its output contains only safe resource IDs. The ignored file contains IDs only; add secrets separately to an ignored local environment.

The portal configuration enables payment-method updates, invoice history, and cancellation at period end. Plan switching, quantity changes, promotions, pause, and tax-ID collection remain disabled.

## Local webhook forwarding

Start local Supabase and the platform with the test-only environment configured. Then use Stripe CLI test-mode forwarding to `/api/billing/webhook`, subscribe only to the six documented event types, and use the CLI-provided endpoint secret for that forwarding session. A Dashboard endpoint secret is not interchangeable with a CLI forwarding secret.

Do not configure a production endpoint. Automatic Stripe retry remains the primary recovery mechanism for HTTP 5xx responses. Manual replay is an operator-only fallback described in the billing runbook.

## Lifecycle verification

Use Stripe test payment methods only. Confirm redirect-before-webhook remains processing with no entitlement; then confirm the signed event creates a subscription projection and feature provenance. Exercise cancellation at period end, payment failure, replay, old-after-new ordering, and annual Checkout. If Checkout-created subscriptions cannot be attached to a Test Clock, use a separate clock-owned deterministic sandbox customer and document that it is a lifecycle fixture rather than the Checkout-created customer.

Reusable Stripe Sandbox resources have been provisioned, but the complete post-compatibility renewal lifecycle remains pending. Valid test credentials must be supplied through secure process-only input before the external lifecycle can be claimed complete.
