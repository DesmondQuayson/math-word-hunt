# Phase 7A public accounts and game subscription roadmap

Status: approved business architecture for implementation planning. Phase 7A
does not create provider resources, deploy, or activate accounts or billing.

## Final customer journey

The approved commercial journey is exact:

1. Visit MathNexa.
2. Create a general public account and confirm the email address.
3. Add a payment method through Stripe-hosted Checkout.
4. Receive one full, non-renewable 24-hour trial of game access.
5. Stripe automatically bills `$5.99 USD` per month after the trial.
6. Continue playing only while the subscription is `trialing` within its
   verified trial window or `active` within its verified billing period.

The game is the subscription product. There is one monthly product offering.
There is no annual plan, free game-access tier, role-based product tier, or
teacher-oriented subscription.

## Data boundary

Production collects only the minimum data needed for authentication, security,
billing, game entitlement, support, and account deletion:

- Auth provider user ID, email, confirmation, credential, and session state;
- application account ID/status and lifecycle timestamps;
- Stripe Customer, Checkout, Price, and Subscription references;
- subscription status, trial end, billing-period end, cancellation state, and
  minimal webhook processing evidence;
- game-access entitlement start/end and provenance;
- deletion request state and required security/audit evidence.

MathNexa must not collect teacher, student, school, class, roster,
organization, assignment, or cloud learning-progress data. Stripe, not
MathNexa, stores payment-method details. No game result, score, selected lesson,
word, team, session, or progress record is persisted to the account.

## Release baseline and isolation

The reviewed release baseline is `hosted-preview` at
`f5a1e7027abbeceae09a1dbf08a401469c8d9ea4`.

- `https://mathnexa.com` currently runs provider-free `production-public`.
- Protected Preview remains unchanged, isolated, and non-commercial.
- `docs/index.html` and `docs/vocab.js` remain immutable canonical source
  artifacts.
- Historical and backup game files remain protected.

The current public GitHub Pages game is incompatible with subscription
enforcement because a public static URL bypasses account and entitlement
checks. Commercial launch therefore requires authenticated delivery of the
unchanged canonical assets and removal of the public bypass. The source files
stay preserved; their deployment access changes only in a separately approved
launch phase.

## Repository findings

### Reusable foundations

- Supabase SSR provides email/password sign-up, sign-in/out, confirmation-code
  exchange, recovery request, password update, cookie refresh, and
  server-validated users.
- Account status, products, entitlements, billing customers, subscriptions,
  webhook receipts, deletion requests, RLS, service-only billing writes,
  cross-account denial, and fail-closed authorization patterns exist.
- Stripe test adapters implement hosted Checkout and Portal, signature
  verification, event allowlisting, idempotent receipt registration,
  processing leases, stale-event rejection, authoritative retrieval,
  reconciliation, and subscription-derived entitlement projection.
- Production-public denies all Auth/billing/provider configuration.
- Preview protection, cleanup, and rollback procedures are independent.

### Required replacement or removal

- Current sign-up and schema are teacher-specific and collect display name;
  class/activity structures are outside the approved Production data boundary.
- Current game launch is public and requires no account.
- Existing catalog and capability code contains Free and legacy tier
  identifiers, monthly and annual options, class/activity limits, and
  unrelated feature entitlements.
- Current test price proposals are not the approved `$5.99 USD` monthly price.
- Trialing subscriptions are denied and trial timestamps are not projected.
- Checkout and Portal capabilities are sandbox-only.
- Live Checkout objects are rejected by hard-coded test-mode checks.
- No authenticated Production environment exists.
- Public teacher/pilot/invitation/session/report routes and copy are not part of
  the approved customer journey.
- Production email, deletion execution, support ownership, refund policy, and
  hosted evidence remain incomplete.

## Phase 7B - public identity and game entitlement

Branch: `feature/phase-7b-public-identity-and-entitlement`.

1. Add a fail-closed `production-platform` environment without changing
   `production-public` or Protected Preview.
2. Replace teacher identity contracts in the new Production path with a
   minimal general account: immutable user ID, account status, and timestamps.
   Do not collect display name or any prohibited educational data.
3. Add forward-only schema migration(s) that transform the fresh Production
   database to the minimal account/subscription model. Remove Production
   grants, triggers, tables, routes, and adapters that could collect class,
   activity, organization, or progress data.
4. Replace product/plan contracts with one internal monthly game subscription
   key and one `game.access` capability. Remove Free and legacy tier authority
   from the Production path.
5. Implement one-trial-per-account state and exact server-derived entitlement
   states: no access, trial access, active access, denied/manual review.
6. Make `/play` and every canonical game asset server-authorized. Package the
   canonical HTML and vocabulary assets byte-for-byte outside public static
   delivery and stream them only after validated account and entitlement
   checks. Never use a browser boolean as authority.
7. Harden sign-up, confirmation, sign-in/out, recovery, session refresh,
   account suspension, deletion request, and cross-account denial.
8. Add migration-from-empty, pgTAP, unit, integration, route, asset-bypass,
   bundle-secret, accessibility, and canonical-hash tests.

Exit: local verification passes; canonical source hashes and Preview are
unchanged; no Production provider exists; no public/static path can bypass the
planned entitlement gateway in Production mode.

## Phase 7C - Stripe test-mode 24-hour trial

1. Define one Stripe Product and one monthly recurring Price of exactly
   `$5.99 USD`.
2. Create Checkout in subscription mode, require payment-method collection, and
   request one 24-hour trial once per account.
3. Make Stripe's verified `trial_start`/`trial_end` and subscription state the
   authority. Account creation or Checkout redirect alone grants nothing.
4. Allow game access for a valid `trialing` subscription only until the exact
   verified trial end, then for `active` only until the verified period end.
5. Deny `incomplete`, `incomplete_expired`, `past_due`, `unpaid`, `paused`,
   `canceled`, expired, malformed, duplicate, wrong-owner, and wrong-mode
   states.
6. Correct live/test mode comparison, Checkout status, Customer normalization,
   webhook body limits, idempotency, reconciliation, and safe errors.
7. Configure Portal architecture for payment-method management, invoices, and
   approved cancellation behavior; no plan switching, quantity, annual plan,
   coupon, or promotion-code controls.
8. Test automatic post-trial billing behavior in Stripe test mode with test
   clocks or supported provider simulation, never with live resources.

Exit: deterministic local tests and later separately approved Stripe test-mode
evidence prove exactly one 24-hour trial, `$5.99 USD` monthly conversion,
entitlement activation/removal, and cleanup.

## Phase 7D - isolated hosted Production rehearsal

After explicit provider approval:

1. Provision a separate Production-platform Vercel project, Production
   Supabase project, Production sender, and Stripe test resources.
2. Keep the current public-only project as rollback and keep Preview unchanged.
3. Apply migrations from empty and prove RLS/service-grant isolation.
4. Verify public account creation, confirmation, recovery, session security,
   Checkout payment-method collection, one 24-hour trial, automatic test
   billing, Portal, cancellation, payment failure, and entitlement expiry.
5. Verify no prohibited educational or progress data can be submitted, stored,
   logged, or inferred.
6. Verify canonical gameplay from the authenticated asset gateway and prove
   direct asset URLs deny without entitlement.
7. Clean all synthetic users, subscriptions, entitlements, and evidence to the
   approved zero/retained state.

The public domain remains on public-only Production throughout rehearsal.

## Phase 7E - controlled commercial activation

1. Create the approved live Product, one `$5.99 USD` monthly Price, Portal
   configuration, and live webhook endpoint.
2. Read back and verify currency, amount, interval, mode, Product, Price,
   payment-method requirement, trial duration, and endpoint API version.
3. Enable webhook processing before Checkout and keep game entitlement
   default-deny.
4. Verify empty live reconciliation, monitoring, support, deletion, refund,
   and rollback readiness.
5. Enable account creation, then Checkout, only in the approved launch window.
6. Move `mathnexa.com` to the verified Production-platform project.
7. Disable the direct public GitHub Pages game deployment or otherwise remove
   every public canonical-game bypass while preserving source and rollback
   artifacts.
8. Supervise the first real 24-hour trial and first automatic monthly billing
   event using sanitized evidence.

Rollback disables sign-up/Checkout, restores the provider-free public site,
blocks authenticated game assets, and preserves billing records for customer
resolution. It never points Production at Preview.

## Expected implementation files

Phase 7B will likely modify environment, identity, Auth, account, capability,
entitlement, route-guard, game-gateway, repository, migration, pgTAP, unit,
browser, security-audit, and verification files. Phase 7C will modify billing
catalog, Stripe provider, Checkout, Portal, webhook, reconciliation, account
subscription UI, operations, and tests.

Canonical and historical game source files must not be edited. Provider IDs
and secrets belong only in later server/provider configuration.

Implementation now stops at the Phase 7B branch boundary.
