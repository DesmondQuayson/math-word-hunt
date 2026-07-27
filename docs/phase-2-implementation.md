# Phase 2B–2F test-mode billing implementation

## Scope and authority

Phase 2 implements a local/test-only Stripe subscription boundary for teacher accounts. It does not approve production prices, enable production billing, create student billing identities, or change the canonical v7 game. Browser input can select only an internal paid plan key and an allowlisted return path. Supabase session identity, the internal customer mapping, authoritative Stripe objects, and the transactional entitlement projection must agree before access can be granted.

The authority path is:

`verified teacher session -> server action -> hosted Stripe surface -> signed webhook -> authoritative Stripe retrieval -> service-only database transaction -> entitlement adapter`

A Checkout redirect, session ID, invoice event, email address, metadata value, or browser field never grants access.

## Frozen sandbox catalog

- `free`: no Stripe Price or subscription.
- `teacher-pro-monthly`: USD 999 minor units, monthly, test mode only.
- `teacher-pro-annual`: USD 7999 minor units, yearly, test mode only.

There is no trial, coupon, promotion code, usage billing, seat quantity, tax automation, plan switching, pause, or automatic refund. These amounts are not production-approved.

## Server boundaries

- `apps/platform-web/lib/billing/config.ts` parses the complete environment atomically and fails closed.
- `provider.ts` exposes normalized provider-independent server types; `stripe-provider.ts` is the only Stripe implementation.
- `service.ts` resolves customers, validates Price objects, blocks existing subscriptions, and creates hosted Checkout/portal sessions.
- `app/api/billing/webhook/route.ts` is a Node Route Handler that reads the raw body once and requires a valid Stripe signature.
- `webhook.ts` validates mode/version/type, claims an idempotency receipt, corroborates ownership, retrieves authoritative objects, detects duplicate subscriptions, and invokes one transaction.
- `20260726220000_phase2_reconciliation.sql` provides leases, retry/replay bookkeeping, stale-event protection, and atomic subscription/entitlement projection.

Stripe types never enter `platform-core`. Stripe and Supabase server secrets never enter client components or `NEXT_PUBLIC_*` variables.

## Entitlement behavior

Pro is allowed only for an active platform account with exactly one valid test subscription in `active` state, one approved Price and Product, quantity one, a future period end, verified ownership, no manual-review condition, and the emergency-deny switch off. Cancel-at-period-end remains eligible only through its verified future period. Trialing, incomplete, past due, unpaid, paused, canceled, malformed, stale-expired, duplicate, suspended, deletion-requested, unknown, or mismatched states deny.

Stored valid access is never extended during an outage. Transactional reconciliation revokes prior subscription entitlements before conditionally recreating the three approved feature entitlements with subscription provenance.

## Teacher experience

`/pricing`, `/checkout/status`, and the Account billing section use plain language, one page heading, existing visible focus styles, 48px product controls, responsive grids, reduced-motion behavior, and forced-color-compatible components. Technical IDs and raw provider errors are not shown. Stripe Checkout and the Customer Portal remain the payment surfaces; this application does not collect card details.

## Account lifecycle

Suspension and deletion request both deny Pro, Checkout, and portal access while retaining billing records. Deletion-requested subscriptions require support-assisted cancellation; no permanent deletion is automatic. Reactivation does not restore access by itself—a fresh authoritative reconciliation must validate the subscription. Email is mutable contact data, never identity authority, and Phase 2 does not synchronize email changes to Stripe.

## Production boundary

Repository defaults keep `BILLING_ENABLED=false`, every operational script rejects a non-test secret key, fixtures run only in local/test, and preview rejects live mode. No hosted project, webhook, deployment, live resource, tax, real charge, or billing email is created by this phase.

