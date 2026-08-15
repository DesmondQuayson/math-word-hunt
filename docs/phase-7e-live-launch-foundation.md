# Phase 7E live launch foundation

Phase 7E prepares, but does not activate, MathNexa's commercial launch. The product is one adult-owned account, one exact 24-hour access trial, and one USD $5.99 monthly subscription. A payment method is required before the trial can be activated. There are no teacher, student, school, class, organization, assignment, or cloud gameplay-progress records.

## Activation boundary

Live billing is fail-closed. A Live deployment must use mutually consistent Live keys and provider resources, the consumer identity model, reviewed policy versions, verified transactional email, the canonical `https://mathnexa.com` application origin, and a separate stable `vercel.app` subscriber-management origin. It also requires both `MVH_COMMERCIAL_ACTIVATION=live` and `BILLING_LIVE_ACTIVATION=owner-approved`. Checkout has no implicit default and remains disabled unless `BILLING_CHECKOUT_ENABLED=true` is deliberately set.

Test and Live rows are separated by a server-owned environment column. Webhook `livemode` must exactly match server configuration. Provider customers, prices, subscriptions, and Portal configurations are retrieved and mode-checked before authorization-relevant use. Unknown, malformed, cross-account, unsigned, replayed, or mixed-mode data denies access.

## Consent and billing

Before Setup Checkout, the authenticated account must affirm seven independently recorded statements: subscription terms, automatic renewal, exact 24-hour trial, USD $5.99 monthly price, cancellation policy, refund policy, and the current Privacy Notice and Terms versions. The server records the policy versions and commercial constants, then binds a hash of the resulting Checkout session to that acceptance. Trial activation denies access without a current owner- and environment-matched binding.

Trial access ends exactly 24 hours after server activation. Billing begins after the trial. Stripe controls invoice creation and payment-attempt timing, so the application does not promise an exact card-charge minute.

## Cancellation, deletion, and rollback

The stable `/subscriber-management` route is intended to remain available on the Production platform's permanent `vercel.app` alias even if `mathnexa.com` is rolled back. It permits an authenticated active or deletion-pending owner to open the validated Stripe Customer Portal, cancel at period end, review invoices, and manage payment methods. A deletion request does not remove this route until cancellation is secured. Refund requests are review-only, limited to the configured first-charge window, and never issue an automatic refund.

## Owner activation checklist

Before setting the activation markers or enabling Checkout, the owner must approve the legal text and version date, business/legal identity, support address and process, cancellation and refund policy, retention/deletion procedure, stable Production alias, Production Supabase and email configuration, and the exact Live Stripe Product, Price, Portal configuration, webhook endpoint, account activation, tax, and payout readiness. Provider creation, deployment, DNS cutover, and live activation are outside this phase.

Run `npm run phase7e:verify` for the authoritative local gate.
