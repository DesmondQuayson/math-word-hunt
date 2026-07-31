# Phase 7A Production security and rollback plan

Status: approved architecture; no external mutation occurs in Phase 7A.

## Security model

- Supabase Auth proves a general public identity.
- The application account stores only status, trial-redemption evidence, and
  lifecycle timestamps.
- RLS and server ownership protect account, entitlement, subscription summary,
  and deletion state.
- Stripe stores payment-method details.
- Signed Stripe events plus authoritative retrieval determine trial and active
  subscription state.
- The server authorizes every game HTML/asset request.
- Browser values never grant account, trial, subscription, or game access.
- Preview and Production credentials/resources never mix.

## Data minimization

Production must not accept or persist teacher, student, school, class, roster,
organization, assignment, score, result, lesson history, or cloud
learning-progress data. Support forms must instruct users not to submit those
categories. Logs use safe codes and correlations, not email, game state,
payment data, raw webhook bodies, tokens, or full provider identifiers.

## Principal risks

| Risk | Required control |
| --- | --- |
| Public GitHub Pages bypasses subscription | disable public deployment at launch; serve preserved assets only through server entitlement |
| Legacy teacher/class schema collects prohibited data | forward migration and route/form/API removal before Production provisioning |
| Browser forges trial/subscription | server reconciliation and per-asset authorization |
| Multiple free trials | immutable account trial marker, subscription history, Stripe fraud controls without invasive tracking |
| Wrong `$5.99` amount or interval | authoritative Price retrieval and exact USD 599/month validation |
| Trial shorter/longer than 24 hours | verified provider timestamps and boundary tests |
| Charge without payment method/consent | Stripe-hosted Checkout and clear trial/renewal terms |
| Test/live cross-use | separate resources and exact mode comparison |
| Webhook replay/out-of-order event | signature, ID+mode uniqueness, hash conflicts, leases, stale rejection |
| Account deletion leaves active billing | support workflow resolves subscription before final deletion |
| Shared cache leaks game | private/no-store delivery and cross-user cache tests |
| Unsupported data enters support/logs | field allowlists, redaction, retention, and negative tests |

## Kill switches

Independent server-owned controls:

1. disable new sign-up;
2. disable Checkout;
3. disable Portal;
4. default-deny new game entitlement;
5. block protected game asset delivery;
6. pause webhook intake only with a safe receipt/replay plan;
7. suspend an account;
8. move the domain back to provider-free public-only Production.

Kill switches preserve evidence and do not delete subscriptions or accounts.

## Incident handling

### Billing or entitlement incident

- disable Checkout;
- keep safe webhook reconciliation running when possible;
- deny game access if entitlement integrity cannot be proven;
- reconcile affected Stripe subscriptions and internal projections;
- preserve sanitized evidence;
- contact affected customers under the approved support/refund policy.

### Auth or secret incident

- disable sign-up and protected game delivery;
- revoke affected sessions/accounts;
- rotate Supabase, Stripe, webhook, SMTP, and operator secrets as applicable;
- verify bundles/responses/logs;
- never substitute Preview credentials.

### Public game bypass

- block the bypass host/path immediately;
- confirm canonical source remains preserved;
- test every alternate asset route and cache;
- deny commercial activation until independent bypass verification passes.

## Rollback

The Production subscription platform is built in a separate Vercel project.
The existing provider-free project remains the rollback target.

1. Disable sign-up and Checkout.
2. Block game assets on the failing platform.
3. Move `mathnexa.com` back to public-only Production.
4. Protect/block the failed platform hostname.
5. Continue necessary Stripe webhook, cancellation, refund, and deletion
   operations in a restricted operator context.
6. Verify public informational routes and no accidental game bypass.
7. Never point Production to Protected Preview.

Rollback to the public-only site does not grant game access. The previous public
GitHub Pages game cannot remain reachable after the subscription launch; if
rollback temporarily restores public game access, that is a separate explicit
owner decision and commercial incident.

## Deletion and shutdown

Deletion request immediately denies game and new Checkout. Final execution:

1. identify the authenticated account without collecting profile data;
2. cancel/resolve Stripe subscription and refund obligations;
3. retain only legally required billing evidence;
4. remove/pseudonymize provider linkage as approved;
5. delete application account and Auth user;
6. record sanitized completion evidence.

Full shutdown disables sign-up/Checkout, resolves every subscription, exports
only required minimized evidence, revokes credentials, removes domain links,
and deletes provider resources only under separate owner approval.
