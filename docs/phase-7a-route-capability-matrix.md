# Phase 7A public account route and capability matrix

Status: approved target behavior. Current public-only Production remains
unchanged until the later commercial cutover.

## Route matrix

| Route | Anonymous | Confirmed account without subscription | Valid 24-hour trial | Active monthly subscription | Owner/operator |
| --- | --- | --- | --- | --- | --- |
| `/`, `/about`, `/help`, `/privacy`, `/accessibility` | allow | allow | allow | allow | allow |
| `/pricing` | show one `$5.99 USD/month` offer and 24-hour trial terms | allow | show current status | show current status/Portal | no special browser authority |
| `/sign-up` | allow general public registration | redirect to account | redirect | redirect | same public identity unless separate operations identity is approved |
| `/sign-in`, `/forgot-password` | allow | redirect if signed in | redirect | redirect | same |
| `/auth/callback` | code exchange only | safe internal redirect | same | same | n/a |
| `/update-password` | valid recovery session only | same | same | same | n/a |
| `/account` | sign-in redirect | account, deletion, subscribe action | trial end and Portal | renewal/cancellation and Portal | no cross-account access |
| `/subscribe` or Checkout action | sign-in/confirmation required | allow only if trial unused and no current subscription | deny duplicate | deny duplicate; use Portal | no browser override |
| `/checkout/status` | sign-in redirect | own Session status; grants nothing by redirect | own state | own state | no special access |
| `/play` | sign-in redirect | subscribe/trial-required response | allow | allow | no bypass |
| `/game/**` canonical HTML, vocabulary, and assets | deny | deny | allow after server check | allow after server check | no bypass |
| Customer Portal action | deny | only if owned Customer exists | allow owned Customer | allow owned Customer | no arbitrary Customer input |
| `POST /api/billing/webhook` | signed Stripe request only | same | same | same | same |
| `/status` | sanitized public health or unavailable | same | same | same | detailed operations outside browser |
| `/teacher/**`, `/pilot/**`, invitation routes | unavailable | unavailable | unavailable | unavailable | unavailable |
| class, roster, organization, assignment, report, progress, student routes | unavailable | unavailable | unavailable | unavailable | unavailable |
| admin routes | unavailable | unavailable | unavailable | unavailable | operator CLI/provider console until separately designed |

## Capability matrix

| Capability | Anonymous | Confirmed/no subscription | Trialing within 24 hours | Active monthly |
| --- | --- | --- | --- | --- |
| create/manage own account | create only | allow | allow | allow |
| start Checkout | deny | allow once | deny | deny |
| open Customer Portal | deny | only with owned Customer | allow | allow |
| launch game | deny | deny | allow | allow |
| load canonical game assets | deny | deny | allow | allow |
| persist gameplay/progress | unavailable | unavailable | unavailable | unavailable |
| educational/classroom data | prohibited | prohibited | prohibited | prohibited |

There is one paid capability: `game.access`. It is not a role, tier, or browser
flag. It is derived from verified account and subscription state on the server.

## Direct-access rules

- A public static game URL is an entitlement bypass and must not exist at
  commercial launch.
- Every HTML, script, vocabulary, style, image, audio, and dependent asset URL
  used by the game must share the entitlement boundary.
- Middleware alone is not sufficient if another public host serves the same
  files.
- Redirects and hidden navigation are not authorization.
- Shared caches must not serve one subscriber's game response to another user.
- Historical and backup builds remain repository artifacts, not public
  subscriber routes.

## Denial behavior

Unknown, malformed, unconfirmed, suspended, deletion-requested, expired trial,
past-due, unpaid, paused, canceled, duplicate, wrong-owner, wrong-mode, or
wrong-Price state denies game access. Responses reveal no secret, Customer ID,
payment method, other account, or provider diagnostic.

Account deletion immediately denies the game and new Checkout. Account and
Portal copy must explain the support/deletion process without collecting
prohibited data.
