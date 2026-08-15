# Phase 7B public identity and game-entitlement foundation

Status: implemented locally for owner review. Nothing in this phase is
deployed or activated on Vercel, Supabase, Stripe, Resend, SMTP, DNS, or
`mathnexa.com`.

## Product contract

The Production-platform path uses general adult-owned accounts. The game
itself is the subscription product: one non-renewable 24-hour trial after
future Stripe-hosted payment-method collection, followed by `$5.99 USD` monthly
billing. Account creation alone grants nothing. Phase 7B implements no Checkout
or other billing provider action.

MathNexa does not collect teacher, student, school, class, roster,
organization, assignment, or cloud learning-progress data. No display name,
role, grade, lesson history, score, result, or game-progress field belongs to
the consumer account.

## Environment isolation

`production-platform` is separate from Protected Preview and
`production-public`. It fails closed unless:

- the Production project reference is explicit and distinct from Preview;
- browser and server Supabase configuration identify the same isolated
  Production origin;
- the identity model is `consumer-v1`;
- billing is disabled;
- pilot and invitations are inactive;
- fixtures are forbidden; and
- the application origin is approved HTTPS, except for an explicit local
  loopback rehearsal.

The migration defaults every database to `legacy-preview`. A service-only
operation must switch a new isolated Production project to `consumer-v1`.
Therefore applying the forward migration does not change existing Preview
account provisioning.

## Minimal account schema

`consumer_accounts` stores:

- `user_id` — immutable UUID linked to Supabase Auth;
- `account_status` — `active`, `suspended`, or `deletion_pending`;
- `email_confirmed_at`;
- immutable `trial_redeemed_at`;
- `deletion_requested_at` and `deletion_completed_at`;
- `created_at` and `updated_at`.

Email and credential security data remain in Supabase Auth and are not
duplicated. `consumer_account_deletion_requests` records the minimum request
lifecycle. All three consumer tables use forced RLS. Authenticated users may
read only their own safe rows; browser roles cannot insert or update account,
trial, or entitlement authority.

## Entitlement state machine

The provider-independent states are:

- no entitlement;
- trial pending, active, or expired;
- subscription active or past due;
- subscription canceled with access through the verified period end;
- subscription expired;
- account suspended; and
- account deletion pending.

The server evaluates strict evidence with server time. Unknown fields,
malformed timestamps, non-24-hour trial windows, browser state, cookies, query
parameters, and local storage deny access. A redeemed-trial timestamp cannot be
changed, and the database independently requires an exact 24-hour trial.
Stripe synchronization is deferred to Phase 7C.

## Route and capability behavior

| Route group | Production-platform behavior |
| --- | --- |
| `/`, `/pricing`, `/help`, `/privacy`, `/terms` | public consumer information |
| `/sign-up`, `/sign-in`, `/auth/callback`, `/forgot-password`, `/update-password` | public Auth and recovery boundary |
| `/account`, `/subscription`, `/game-access`, `/play` | authenticated; signed-out visitors redirect to sign-in |
| `/game/runtime/index.html`, `/game/runtime/vocab.js` | independently authorized for every request; private and no-store |
| teacher, class, assignment, pilot, invitation, organization, student, and admin prefixes | unavailable HTML response with genuine HTTP 404 status |
| Checkout, billing UI, and `/api/billing/*` | unavailable; API requests return 404 |

The consumer header and pages expose no teacher workspace or pilot
demonstration. Protected Preview and public-only Production retain their
existing behavior because the new branches are environment-specific.

## Canonical game preservation and future bypass removal

`docs/index.html` and `docs/vocab.js` remain the canonical source artifacts and
are unmodified. Next.js includes them only as server output-file-trace inputs.
The protected route accepts only `index.html` and `vocab.js`, reads their exact
bytes from server-side source, requires entitlement on every request, and
returns private/no-store responses. Historical and backup games are not served
through this gateway.

The current public GitHub Pages game is intentionally unchanged during Phase
7B. Before commercial activation, a separately approved cutover must remove
that public deployment as an entitlement bypass only after the authenticated
gateway passes gameplay parity. Rollback keeps source artifacts intact,
disables sign-up and Checkout, blocks protected assets, and restores the
provider-free public site. Preview is never used as Production rollback.

## Verification

`npm run phase7b:verify` preserves the complete pre-existing verification
chain and adds:

- environment, entitlement, canonical asset, and email-copy unit tests;
- migration-from-empty and the complete pgTAP suite;
- general signup and confirmation-required behavior;
- generic recovery behavior;
- route restriction and signed-out redirect tests;
- browser entitlement forgery and cross-boundary denial;
- exact 24-hour service-owned trial access;
- byte-identical protected canonical delivery;
- responsive, focus, forced-colors, and reduced-motion checks;
- bundle/source security audit, dependency audit, build, protected hash, and
  protected historical-file checks.

Provider provisioning, production activation, real email, Stripe objects,
payment methods, charges, deployment, and public-site cutover remain future
work.
