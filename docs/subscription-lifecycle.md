# Subscription lifecycle contract

This is the canonical statement of how a MathNexa consumer subscription moves
through Stripe, how the platform records it, and who is allowed in. It
supersedes the entitlement tables in `phase-7c-stripe-sandbox-subscription.md`
and `billing-entitlement-reconciliation.md` where they differ.

## The invariant

A successful renewal is never followed by "Subscription ended".

Access is decided from the server-owned entitlement projection
(`consumer_game_entitlements`), and that projection is kept equal to Stripe by
two paths that share one writer:

1. **Webhook path.** A signed Stripe event triggers a re-fetch of the
   authoritative subscription and a call to
   `synchronize_consumer_billing_subscription(source = 'webhook', …)`.
2. **Reconciliation path.** When the access gate is about to deny a customer
   because a stored boundary passed, when the Account or Subscription page is
   opened in that state, when the owner presses "Sync with Stripe", or when the
   daily sweep runs, the platform re-reads the customer's subscriptions from
   Stripe and calls the same function with `source = 'reconciliation'` or
   `'admin'`.

Both paths carry an authority timestamp (`event.created` for webhooks, the fetch
time for reconciliation). A snapshot older than the newest one already applied
for the same subscription is ignored, so a late or replayed event cannot roll a
period backwards, and a reconciliation is never overridden by an event it
already reflects.

## Lifecycle

| Stage | Stripe | Local subscription row | Entitlement | Access | Customer copy |
| --- | --- | --- | --- | --- | --- |
| Trial | `trialing`, `trial_end = trial_start + 24h` | status `trialing`, `trial_end` | `trial-active` (exact 24 h) | yes, until `trial_end` | Trial active · Trial ends *date* |
| Trial ends, first invoice paid | `active`, period advances | status `active`, period start/end | `subscription-active`, boundary = period end | yes, until period end | Active · Renews *date* |
| Renewal 2, 3, … 50 | `active`, period advances | period start/end advance **every cycle** | boundary advances every cycle | yes | Active · Renews *date* |
| Cancel at period end | `active`, `cancel_at_period_end = true` | `cancel_at_period_end = true` | `subscription-canceled-through-period-end` | yes, until period end | Active until period end · Cancels *date* |
| Period passes after cancel | `canceled`, `ended_at` | status `canceled`, `ended_at` | `subscription-expired`, `endedAt` | no | Ended · Ended *date* |
| Renewal payment fails, prior payment exists | `past_due` | `last_payment_failed_at`, `renewal_grace_ends_at = failure + 7 d` | `subscription-grace-period` | yes, until grace end (non-extending) | Payment requires attention |
| Renewal payment fails, no prior payment | `past_due` | no grace | `subscription-past-due` | no | Payment requires attention |
| Payment recovered | `active` | failure and grace cleared | `subscription-active` | yes | Active · Renews *date* |
| `unpaid`, `incomplete`, `paused` | as reported | as reported | `subscription-past-due` | no (recoverable) | Payment requires attention |
| `canceled`, `incomplete_expired` | as reported | as reported, `ended_at` | `subscription-expired` | no | Ended |
| Unknown Stripe status | anything new | **not written** | **unchanged** | unchanged | Status under review |
| Customer deleted at Stripe | `customer.deleted` | all rows `canceled` | `subscription-expired` | no | Ended |

Time comparisons against a boundary belong to the access gate, evaluated with
server time on every request. The projection records Stripe's boundary
faithfully; it never decides that a boundary has passed.

## Access gate and self-healing

`getGameAccessView()` reads the entitlement row and evaluates it with server
time. Before a **denial** is shown, it classifies why:

- **clock-expired** — the stored evidence granted access and only the server
  clock passing the stored boundary made it a denial (`subscription-active`,
  `subscription-canceled-through-period-end`, `subscription-grace-period`,
  `trial-active` with a passed boundary). This is exactly what a lost renewal
  event looks like locally, so Stripe is consulted before anything is shown.
- **denied-recoverable** — the stored evidence already denies (`past-due`,
  `expired`, `trial-expired`, `no-entitlement`) but Stripe may have moved on.

Reconciliation is bounded: one provider round trip per customer per
`RECONCILIATION_MINIMUM_INTERVAL_SECONDS` (300 s), claimed atomically in the
database so concurrent requests are serialized, and time-boxed to 6 s. An
allowed decision never calls Stripe.

If the record is still clock-expired after asking Stripe (or Stripe could not be
reached), the customer sees **"We couldn't verify your subscription right
now"**, not "Subscription ended". "Subscription ended" is reserved for a
Stripe-confirmed end (`canceled` / `incomplete_expired`).

Stored paid-through state is honoured while Stripe is unavailable: a customer
whose stored boundary is in the future is never denied because of a provider
outage; a customer whose stored boundary has passed is denied, honestly, until
verification succeeds.

## Multiple subscriptions

One customer has at most one **current** (non-terminal) subscription row,
enforced by a partial unique index. Synchronization writes historical
subscriptions first so a missed final event on an old subscription releases the
slot before the live one is written. A terminal snapshot for a historical
subscription never overrides the entitlement derived from the current one
(`superseded_ignored`). Two live subscriptions at Stripe are refused
(`conflicting_current_subscription` / `duplicate_subscription`) and surfaced
for review — never guessed. Wherever a single row must be displayed, the live
subscription wins, then the furthest-reaching paid period; never "the most
recently updated row".

## Webhook contract

Accepted events: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`,
`invoice.paid`, `invoice.payment_succeeded` (alias of `invoice.paid`),
`invoice.payment_failed`, `customer.deleted`. Every other type is acknowledged
and ignored.

- Signature verification over the exact raw body, before any database write.
- Mode mismatch (test event in live, live in test) is rejected with 400.
- Event ids are persisted; a duplicate is acknowledged without re-processing;
  the same id with a different body is refused (409, manual review).
- An event rendered with a different API version than the pinned SDK version is
  **processed** and reported as `webhook-api-version-drift`. Rejecting it used
  to convert a dashboard setting into a permanent, silent renewal outage.
- Every subscription of the customer is re-fetched and synchronized; the
  event's own subscription carries the receipt bookkeeping.
- Failures produce structured events (`webhook-processing-failed`,
  `webhook-manual-review`) with the event type, a redacted object suffix, the
  failure class, and retryability. Transient failures return 503 so Stripe
  retries; permanent conflicts are recorded for review and acknowledged.

Machine endpoints (`/api/billing/webhook`, `/api/health`) are exempt from the
canonical-host redirect. Stripe does not follow redirects; a 308 on the webhook
path was a failed delivery on every renewal for any endpoint configured with the
`www.` or `*.vercel.app` host.

## Entitlement authority

- Server-side only. Cookies, query strings, local storage, browser clocks and
  redirect state carry no authority; the client renders a typed decision.
- Mapping is by immutable identifiers (`user_id` ↔ `stripe_customer_id` ↔
  `stripe_subscription_id`). Email is never used to grant access.
- Authorized school (AESM) access is a separate cookie-bound session with its
  own expiry. It never touches Stripe state and Stripe state never touches it.
- Complimentary owner grants are a separate table and independent of Stripe.
- Only the pinned price and explicitly allowlisted legacy prices
  (`STRIPE_LEGACY_PRICE_IDS_MATHNEXA_MONTHLY`) are entitled. An archived price
  with live subscribers stays entitled once allowlisted.

## Payment failure policy

Stripe's retry (dunning) schedule is left alone. A renewal failure after a
prior successful payment grants one non-extending grace period of
`BILLING_RENEWAL_GRACE_DAYS` (7) from the first failure. A failure discovered by
reconciliation without its `invoice.payment_failed` event starts grace at the
first observation. Recovery (`active`) clears the evidence. `unpaid`,
`incomplete` and `paused` are locked but recoverable and are shown as "Payment
requires attention", never "Ended".

## Refunds and disputes

Refunds are owner-reviewed and never automatic; a refund does not change the
subscription projection unless Stripe changes the subscription. Disputes and
chargebacks do not influence entitlement in this build. No automatic punitive
access logic exists.

## Observability

Structured, PII-free events on the console adapter: `subscription-synchronized`,
`subscription-renewal-synchronized`, `subscription-reconciled`,
`subscription-reconciliation-unavailable`, `entitlement-mismatch-repaired`,
`entitlement-mismatch-unresolved`, `subscription-status-unknown`,
`webhook-api-version-drift`, `webhook-manual-review`,
`webhook-processing-failed`, `reconciliation-sweep-completed`. Details carry
event type, redacted references, states, boundaries and outcomes only.

## Operations

- Owner admin: each account shows paid-through, last Stripe sync and a billing
  consistency check; **Sync with Stripe** is an audited, CSRF-protected,
  idempotent operation that re-reads Stripe (read-only there) and re-applies
  the projection.
- Daily sweep: `GET /api/internal/billing/reconcile` with the scheduler's
  `CRON_SECRET` bearer token (fails closed without it) re-checks live
  subscriptions whose boundary is within 36 h or already passed, or that have
  not been confirmed for 48 h. Aggregates only.
- Drift audit: `npm run billing:consumer:reconcile` (dry run) compares every
  local subscription with Stripe and prints a redacted report. `--apply`
  repairs mismatches through the same synchronizer; live requires
  `--environment=live` and `--owner-approved`.
- Rollback: `supabase/rollback/subscription_lifecycle_reconciliation.sql`.
