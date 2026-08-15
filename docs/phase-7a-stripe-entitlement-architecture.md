# Phase 7A Stripe trial, billing, and game entitlement architecture

Status: approved business model; provider implementation remains future work.

## Commercial contract

- Product: MathNexa game access.
- Price: exactly `$5.99 USD` every month.
- Trial: one full 24-hour trial per account.
- Payment method: collected by Stripe-hosted Checkout before trial access.
- Conversion: Stripe automatically attempts the first `$5.99 USD` payment at
  the verified trial end.
- Continued access: only while the subscription is validly `trialing` inside
  the trial window or `active` inside the paid billing period.
- No annual plan, free game-access tier, quantity, seat, role, classroom, or
  organization subscription.

## Authority chain

`Stripe signed event -> authoritative Stripe retrieval -> internal subscription
projection -> game entitlement -> account-status override -> server game-asset
authorization`.

Account creation, Checkout Session creation, redirect arrival, browser state,
query parameters, cookies alone, metadata alone, and payment-method UI never
grant access.

## Checkout

The server accepts no arbitrary Product, Price, amount, interval, trial, owner,
Customer, or return URL from the browser. It must:

1. require a confirmed, active general account;
2. confirm the account has never redeemed a trial;
3. confirm no current local or Stripe subscription exists;
4. resolve/create exactly one Customer tied to immutable account ID;
5. retrieve the configured Price and verify live/test mode, Product, active
   state, `usd`, `599` minor units, monthly interval, interval count one, and
   licensed quantity one;
6. create a hosted subscription Checkout Session;
7. require payment-method collection;
8. configure one 24-hour trial on the resulting subscription;
9. use exact server-owned HTTPS success/cancel URLs;
10. apply deterministic idempotency and duplicate-subscription prevention.

The trial starts only when Stripe creates the subscription and provides an
authoritative trial window after successful payment-method Checkout. The
account records trial redemption from verified reconciliation, not from a
button click or redirect.

Do not collect card number, bank details, billing method, CVC, or payment
credentials in MathNexa. Stripe owns those fields.

## Entitlement states

| Subscription/account state | Game access |
| --- | --- |
| no account or unconfirmed account | deny |
| confirmed account, no subscription | deny |
| Checkout incomplete/abandoned | deny |
| `trialing`, payment method verified, trial unused, now before exact `trial_end` | allow until `trial_end` |
| `trialing` with missing/expired/malformed trial end | deny/manual review |
| `active`, approved Price, now before `current_period_end` | allow until period end |
| `incomplete` or `incomplete_expired` | deny |
| `past_due` | deny immediately |
| `unpaid`, `paused`, or `canceled` | deny/revoke |
| suspended or deletion-requested account | deny regardless of payment |
| duplicate, wrong owner, wrong mode, wrong Price, stale/conflicting state | deny/manual review |

There is no failed-payment grace period in the approved journey. Access
returns only after authoritative Stripe state is `active` with a future period
end. Owned account/billing records are retained as required; no gameplay
progress exists to preserve.

## One-trial enforcement

The application must persist an immutable, server-written trial-redemption
marker and subscription history. A new Checkout cannot request another trial
for the same account even after cancellation or deletion request. Stripe
Customer/subscription history is checked as additional evidence.

Do not add invasive device fingerprinting or educational/profile data to
prevent trial abuse. Repeated-account or payment-method abuse uses approved
Stripe fraud controls and support review, subject to privacy policy.

## Customer Portal and cancellation

Portal creation uses only the server-owned Customer mapping and return URL.
Initial Portal capabilities:

- update payment method;
- view Stripe-hosted invoices/receipts;
- cancel at period end.

No annual conversion, plan switching, quantity, coupons, promotion codes, or
unsupported products.

If a trialing subscription is scheduled to cancel at trial end, access lasts
only while Stripe still reports a valid trial window and ends without charge.
If an active subscription is set to cancel at period end, access lasts only
while it remains active and before the verified period end. Immediate provider
cancellation revokes access on reconciliation.

## Webhook and reconciliation

The Node webhook endpoint must:

- enforce POST and a bounded raw-body size;
- verify the Stripe signature over the exact body;
- require pinned API version and exact test/live mode;
- register event ID plus environment and payload hash;
- detect conflicting duplicate payloads;
- claim a bounded processing lease;
- retrieve authoritative Checkout, Customer, Subscription, Price, Invoice, and
  payment-method readiness as needed;
- prove Customer/account/subscription ownership;
- verify the single `$5.99 USD` monthly Price;
- project `trial_start`, `trial_end`, status, current period, cancellation, and
  latest authoritative event time;
- write trial redemption and entitlement transactionally;
- reject stale events and duplicate current subscriptions;
- return retryable non-2xx for transient failures and safe manual-review states
  for permanent conflicts;
- never log raw bodies, emails, payment data, tokens, or full provider IDs.

Required event purposes include Checkout completion as a retrieval trigger,
subscription create/update/delete, invoice paid, and invoice payment failed.
No event grants access without authoritative retrieval and complete policy
validation.

## Test/live correction

Current code must replace unconditional `livemode` rejection with comparison
against configured mode, correct deleted-Customer normalization, replace
legacy Price/plan identifiers, allow verified trialing entitlement, and remove
sandbox-only capability assumptions. Test and live Products, Prices, Portal
configurations, Customers, Subscriptions, and endpoint secrets remain separate.

## Refunds

The final customer journey does not yet define refunds. Refund operations must
remain support-only and cannot extend or create entitlement. A live launch
still requires an owner-approved refund policy covering eligibility, full or
partial refund, access effect, evidence, and response ownership.

## Game delivery

All canonical game files and dependencies must be delivered through a
server-authorized route after account and entitlement validation. They must not
be available from a public static directory, public object URL, source map,
alternate host, historical route, or cache that bypasses entitlement.

The canonical source files remain byte-for-byte preserved. A build step may
package them as server-only assets and an authenticated route may stream them
with private/no-store caching and an appropriate CSP. Every asset request,
including `vocab.js`, requires the same server entitlement check.
