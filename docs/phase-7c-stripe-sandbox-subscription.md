# Phase 7C Stripe Sandbox subscription

## Implemented product contract

MathNexa has one consumer subscription: $5.99 USD each month. There is no annual plan, permanent free gameplay tier, or “Pro” subscription. An eligible confirmed account receives one exact 24-hour introductory trial after a payment method is successfully collected. The subscription then renews automatically until canceled.

This implementation stores no teacher, student, school, class, organization, assignment, roster, or learning-progress data. The shared legacy Preview billing schema remains present for Preview compatibility, but the Production-platform path uses `owner_consumer_id` and the consumer identity model.

## Sandbox flow

1. A confirmed, active account starts Setup-mode Stripe Checkout.
2. Checkout collects a card payment method for the account’s verified Stripe Customer. Checkout does not create the subscription and cannot grant access.
3. The signed `checkout.session.completed` webhook retrieves the Setup Session from Stripe.
4. The server atomically claims the account’s one trial redemption using a SHA-256 reference to that Checkout Session.
5. The server creates the one monthly subscription with the saved payment method and an authoritative trial end exactly 86,400 seconds after the signed Checkout event time.
6. The webhook retrieves the authoritative Customer, Price, Subscription, and subscription list before projecting billing and game access.
7. The protected game gateway reevaluates the stored evidence against server time on every request. Cookies, query strings, local storage, client clocks, and redirect state have no authorization authority.

The local fixture implements the same provider contract for deterministic tests. It is accepted only for an explicit non-production loopback rehearsal. Hosted use requires Stripe test mode.

## Customer Portal

The server creates owner-bound Portal sessions. The approved Portal configuration must support payment-method updates, invoice history, cancellation at period end, and restoration where Stripe permits it. Portal return URLs are fixed to the configured MathNexa origin. Browser-supplied Customer IDs and return URLs are not accepted.

## Authoritative webhook states

The endpoint accepts a bounded raw request body and verifies the Stripe signature before any database receipt is created. Test-mode events handled are:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Customer deletion is also handled safely through the same receipt and entitlement-revocation path.

Receipts record only the event ID, allowlisted type, object reference, API version, event timestamp, and payload SHA-256. They provide duplicate detection, conflicting-replay rejection, processing leases, retry classification, and stale-event rejection. Raw payloads are not persisted.

## Entitlement policy

| Verified condition | Server-owned access result |
| --- | --- |
| Exact active 24-hour trial | Allowed until the exact trial end |
| Trial canceled at period end | Allowed only through the original trial end |
| Active paid subscription | Allowed through the authoritative paid period end |
| Canceled at period end after payment | Allowed through the paid period end |
| Initial post-trial payment failure | Locked; no renewal grace |
| Renewal failure after a prior paid invoice | Allowed through one non-extending 7-day grace boundary |
| Repeated retry failures | Do not extend that grace boundary |
| Payment recovery | Active; failure and grace evidence cleared |
| Canceled, unpaid, incomplete, incomplete-expired, expired, deleted, malformed, suspended, or deletion-pending | Locked |

Renewal grace, first-charge refund-review days, and all operational switches are server configuration. The current defaults are 7 days of renewal grace and manual owner review of first-charge refund requests received within 7 days. Automatic refunds are prohibited.

## Environment contract

The Production-platform billing path fails closed unless all values are complete and consistent:

- `MVH_APP_ENVIRONMENT=production-platform`
- isolated consumer Supabase configuration with `MVH_IDENTITY_MODEL=consumer-v1`
- `MVH_STRIPE_MODE=test`
- `BILLING_ENABLED=true`
- `BILLING_PROVIDER=stripe` for real Sandbox use (`fixture` is loopback rehearsal only)
- `STRIPE_MODE=test`
- the pinned Stripe API version
- Sandbox publishable key, server-only secret key, and webhook endpoint secret
- one Sandbox MathNexa Product, one $5.99 monthly Price, and one Portal configuration
- Checkout, Portal, and webhook switches
- fixed application origin
- renewal-grace, refund-review, no-automatic-refund, and emergency-default-deny policy values

Secret and webhook keys must be supplied through secure local or provider secret input. They must not be pasted into chat, committed, logged, exposed through `NEXT_PUBLIC_` variables, or included in browser bundles.

## Verification

`npm run phase7c:verify` includes all Phase 7B and public/canonical regression gates, focused unit tests, migration-from-empty, the full pgTAP suite, the Phase 7C browser rehearsal, production builds, security and bundle scans, dependency audit, protected-file diffs, and SHA-256 checks.

Actual Stripe-hosted Sandbox Checkout and Portal testing requires owner-supplied Sandbox credentials and provisioned test resource IDs. The deterministic fixture tests do not claim that external provider validation has occurred.

## Sandbox verification status

The real Sandbox rehearsal verified resource reuse, standard Setup-mode Checkout with Managed Payments disabled, payment-method collection, one server-created subscription, an exact 86,400-second trial, trial entitlement, webhook replay protection, Customer Portal ownership, trial cancellation, initial-payment failure denial, cross-account denial, and browser-forgery denial. The reusable Sandbox Product, monthly Price, and Portal configuration remain outside this repository.

The remaining Test Clock lifecycle also passed with process-only Sandbox credentials. The harness acknowledges `invoice.created` with a successful response, confirms the Customer and Subscription default payment method, waits for the clock to become ready, and advances a draft renewal invoice through Stripe's one-hour finalization interval plus a bounded five-minute margin before polling authoritative terminal state. It verified a paid $5.99 monthly renewal, one entitlement-period extension, renewal failure, one non-extending 604,800-second grace period, payment recovery, cancellation at period end, entitlement removal at the exact expiration timestamp, duplicate/replay handling, stale-event rejection, and cleanup-to-zero.

`npm run test:stripe:sandbox-lifecycle` is the credential-gated external rehearsal. The masked PowerShell launcher keeps Sandbox keys process-only; it does not print, log, hash, or persist them. The runner uses an isolated temporary local Supabase work directory, removes its synthetic Test Clock, Customer, Subscription, account, projection, and receipt data, retains the reusable Product, Price, and Portal configuration, and removes its temporary files. No live-mode, deployment, hosted-environment, or billing-activation validation is claimed.
