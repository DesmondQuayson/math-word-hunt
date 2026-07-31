# Phase 7A owner decisions

Status: core business model confirmed. Remaining operational/legal decisions
must be resolved before live activation.

## Confirmed final decisions

| Decision | Approved value |
| --- | --- |
| Customer identity | general public account |
| Account creation | open public email/password registration with confirmation |
| Subscription product | MathNexa game access |
| Subscription name | plain MathNexa game subscription with no role or tier label |
| Price | `$5.99 USD` per month |
| Billing interval | monthly only |
| Annual plan | none |
| Payment method | collected through Stripe-hosted Checkout before trial |
| Trial | one full 24-hour trial per account |
| Trial start | after successful payment-method Checkout and verified Stripe subscription creation |
| Conversion | automatic Stripe billing at trial end |
| Continued access | only during valid trialing window or active paid subscription period |
| Failed payment | no game access while subscription is not active |
| Game entitlement | the game itself is the subscribed capability |
| Free game tier | none in the commercial platform |
| Educational data | prohibited |
| Progress persistence | none |
| Account data | minimum Auth, security, billing, entitlement, support, and deletion data only |
| Protected Preview | unchanged and isolated |

## Architecture consequences

- Replace teacher-specific Production identity, routes, schema, and copy.
- Remove class/activity/organization/progress collection from Production.
- Replace Free and legacy tier catalogs with one monthly game-access product.
- Permit a verified `trialing` subscription for exactly its 24-hour window.
- Require authenticated server authorization for every canonical game asset.
- End the direct public GitHub Pages bypass before commercial activation while
  preserving canonical source and historical artifacts.
- Never store payment-method details or gameplay progress.

## Remaining launch decisions

| Decision | Why required | Recommended default |
| --- | --- | --- |
| Cancellation disclosure and timing | must match Portal and trial billing terms | self-service period-end cancellation; trial cancellation ends no later than trial end |
| Refund policy | journey does not define refunds | written support-only policy before live billing |
| Tax handling | affects exact customer charge/compliance | owner/accounting review and Stripe configuration decision |
| Trial reminder email | may be legally/customer-useful before charge | decide based on jurisdiction and provider capability |
| Payment-failure communication | customer needs recovery path | transactional notice with no sensitive payment data |
| Account deletion retention | billing evidence may outlive account | written retention/pseudonymization schedule |
| Terms and privacy | public accounts and recurring billing require final language | legal/privacy review before sign-up activation |
| Support contact and response target | billing, cancellation, refund, deletion | named primary/backup operators |
| Incident ownership | Auth, Stripe, email, hosting, domain | named primary/backup operators |
| CAPTCHA/fraud controls | open accounts and one-time trial create abuse risk | privacy-minimized Supabase/Stripe controls; no device fingerprinting by MathNexa |
| Session at entitlement expiry | defines in-game interruption | deny next protected navigation/resource and show safe subscription message |
| Public informational status | avoid leaking provider state | minimal health only or unavailable |
| Monitoring provider/retention | billing incidents require evidence | structured, redacted, short-retention monitoring |

## Explicitly unavailable

- teacher or student roles;
- school, class, roster, or organization features;
- assignments;
- cloud game progress, results, or reporting;
- annual subscription;
- plan switching, quantities, seats, coupons, or promotion codes;
- pilot/invitation routes in Production;
- browser admin console without a separate security architecture.

## Provider decisions still separately gated

Architecture approval does not authorize creation or mutation of:

- Production Vercel project or domain;
- Production Supabase project/Auth configuration;
- MathNexa SMTP/sender/DNS configuration;
- Stripe test or live Product, Price, Portal, Customer, Subscription, or
  webhook;
- monitoring resources;
- public GitHub Pages shutdown;
- real customer account, charge, email, or invitation.

Provider costs, terms, rate limits, and current supported configuration must be
rechecked from official sources at the later provisioning gate.

The next approved repository branch is
`feature/phase-7b-public-identity-and-entitlement`. Phase 7B implements local
identity, minimal schema, entitlement contracts, and authenticated game
delivery only; it does not create provider resources or deploy.
