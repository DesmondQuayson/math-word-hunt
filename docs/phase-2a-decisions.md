# Phase 2A decision register

## Approved by existing architecture

Teacher is billing owner; no student billing identity; default deny; test before live; hosted Checkout/portal preferred; server-only authority; account restrictions override payment; static v7 unchanged.

## Defaults approved for Phase 2 test mode only

Free plus Teacher Pro monthly at USD 9.99 and annual at USD 79.99; no trial, tax, coupon, promotion, seat quantity, usage billing, automatic refund, plan switching, or failed-payment grace; one current subscription per teacher; cancel at period end; payment-method updates and invoices in the test portal; support-assisted cancellation during deletion. These are not production approvals.

## Remaining production blockers

1. Final production prices, currency/country, tax, refund, terms, and disclosures.
2. Production Stripe ownership, restricted keys, webhook operations, alerting, and incident responsibility.
3. Named support channel/SLA and legal retention/deletion procedure.
4. Approved production/preview origins, deployment, hosted Supabase boundary, and secret rotation.
5. External Stripe sandbox lifecycle evidence and owner acceptance.

Annual discount, coupons, switching, grace, school purchasing, long retention, and portal breadth can remain disabled for first test Checkout unless legal review requires them.
