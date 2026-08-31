# MathNexa API Abuse Cost Model

Every route judged by one question: **what does it cost us if someone calls it a
million times?** Authentication is covered elsewhere; this is about economics.

Rate limiting a cheap read is overhead with no benefit. Rate limiting something
that sends mail or streams a file from paid storage is the difference between a
nuisance and a bill.

## Routes that cost real money

| Route / action | Cost | Auth | Limit today | Recommended |
|---|---|---|---|---|
| `resendConfirmationAction` | **Sends email** | Session or a cookie-supplied address | **Fixed tonight** — was a caller-owned cookie only, now the sign-up budget | Adequate |
| `forgotPasswordAction` | **Sends email** | None | 6 / 15 min per address+account | Adequate |
| `signUpAction` | **Sends email** | None | 10 / 15 min | Adequate |
| `/media/[assetId]` | Storage egress, whole file proxied, `no-store` | **None** | None | **Deferred** — cache or signed redirect |
| `/resources/[id]/preview/[fileId]` | Storage egress + a signed-URL call per request | **None** | None | **Deferred** — same |
| `/resources/[id]/download` | Storage egress, whole PDF | Entitled | Per-download RPC record | Acceptable — entitlement gates it |
| `/games/[id]/runtime/assets/...` | Storage egress per asset | Signed 5-min ticket | Ticket binding | Acceptable |
| `startCheckoutAction` | Stripe API writes | Authenticated | Idempotency key | Acceptable |
| `openBillingPortalAction` | 3 Stripe calls, one a write | Authenticated | None | Low priority — authenticated, and Stripe rate-limits |
| `/admin/analytics/export`, `/admin/audit/export` | 16+ queries, unbounded selects | Admin + MFA | None | Low priority — the admin surface is tiny and audited |
| `/api/billing/webhook` | DB writes | Stripe signature | Bounded body, idempotency receipts | Adequate |

## Routes where a limit would be pure overhead

Static marketing pages, `/api/health`, `robots.txt`, `sitemap.xml`, and every
`_next/static` asset. These are cacheable, cheap, and read-only. Adding a limiter
would add a database round trip to a request that currently touches nothing.

## The two that matter

`/media/[assetId]` and `/resources/[id]/preview/[fileId]` are unauthenticated and
proxy entire Supabase Storage objects through the function on every request, with
`no-store`, so nothing is cached anywhere. A scripted client can turn those into
sustained paid egress at no cost to itself.

Neither is a data exposure — both serve only published content — which is why
this is an abuse-cost item rather than a vulnerability. The fix is a delivery
change (a signed redirect so bytes never traverse the function, or a cache
policy), and delivery changes deserve their own testing rather than being
appended to a security branch. Recorded as ON-10 in the debt register.

## Why the limits are where they are

The pattern is deliberate: **limit what sends mail or spends money; do not limit
what merely reads.** Every mail-sending path is now behind a server-side budget.
Every storage-egress path is either entitlement-gated or recorded for a later
delivery fix. Nothing cheap carries a limiter it does not need.

School networks constrain the design throughout: any per-address limit is shared
by a whole cohort, which is why the enforced budgets sit at the top of what the
database function permits and why spray detection observes rather than blocks.
