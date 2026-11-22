# MathNexa v1.2.58 — a declined first charge after the trial gets no renewal grace

Released 2026-11-22 (UTC) under explicit owner approval. After the Stripe test-mode checks showed that a declined
first $5.99 charge after the 24-hour trial kept about a week of access, the owner asked why it should end, then
decided: "ok change it but make sure it does not destroy anything good we have built", and approved the release
("Yes, release"). Staging and production were built from the same commit.

**Why.** The database synchronizer treats `invoice.paid` as payment evidence and stamps the subscription's first
payment from it. The trial's $0 invoice arrives as `invoice.paid`, so it counted as the first payment; a declined
first real charge then looked like a renewal failure and received renewal grace (`BILLING_RENEWAL_GRACE_DAYS`) while
Stripe retried. The trial is the free period, so the first real charge should decide access.

These areas are unchanged:
- renewal grace for customers who have paid (seven days, non-extending, cleared on recovery), the trial, Checkout,
  consent, the webhook, entitlement rules, the database synchronizer and every migration;
- Google Ads conversions (they already require an amount above zero), Supabase data, environment variables;
- every page apart from the past-due notice wording, Authorize Code, Super Admin access, the ShowMe Math pass, robots,
  sitemap and the Google tag.

| | |
| --- | --- |
| Version | `v1.2.58`. Production was built from `b7f3478` (`b7f347841edb42b8fda08ceafb76693fec10581d`). `/api/health` reports build `b7f3478…`, payments `live`. |
| Tag | Annotated tag `v1.2.58` points at `b7f3478`, the production build. Created and pushed after live verification. |
| Branch | `feature/first-charge-grace` from `main` `7bd30bc` (v1.2.57): `b7f3478` (the change), then this record. |
| Merge | `main` was still `7bd30bc`, so origin `main` was fast-forwarded to this record, with no merge commit and no force. |
| Certified runtime | `b7f3478`, from the clean worktree `C:/GitHub/mathnexa-funnel-audit`. |
| Staging | Preview `https://mathnexa-platform-staging-jj7w6qfl5-bright-path-ed-tech.vercel.app`, built from `b7f3478`; public pages 16/16 OK. |
| Production candidate | `dpl_981iNSb7g11MFPQVzkcy1mZk8wNk` (`https://mathnexa-platform-production-qhmcbu2sj-bright-path-ed-tech.vercel.app`), built from `b7f3478` with `--prod --skip-domain`. |
| Production runtime | `dpl_981iNSb7g11MFPQVzkcy1mZk8wNk`, promoted 2026-11-22 02:15 UTC. |
| Rollback runtime | `dpl_2bxDPGjMA87xW1MnqGuFk4dHqh8H` (v1.2.57, build `a3def48`), retained and Ready: `npx vercel@59 promote dpl_2bxDPGjMA87xW1MnqGuFk4dHqh8H --scope bright-path-ed-tech`. |
| Migration / environment | None / unchanged. |
| Dependencies | Unchanged (Next.js 16.4.5, sharp 0.35.5). |

## What changed

- `lib/billing/consumer-synchronizer.ts`: a known $0 invoice of the same subscription is passed to the database
  synchronizer as `invoice.paid.zero_amount` (`ZERO_AMOUNT_INVOICE_EVENT_TYPE`), which it applies as an ordinary
  snapshot with no payment evidence. Only money actually collected stamps the first payment. An invoice of unknown
  amount is still treated as paid.
- `components/consumer/game-access-status.tsx`: the past-due notice now reads "Your card payment didn't go through, so
  access is paused. Update your payment method in Stripe, and access returns as soon as the payment succeeds."

Effects: a declined first charge gives `subscription-past-due` with no grace and no access; a successful retry gives
`subscription-active` and records the first payment. Super Admin's "Conversions" count (`first_paid_at`) now counts
real first payments instead of trial starts. Live subscriptions at release (5 active, all with real payments; none
trialing) are unaffected and needed no data change.

## Release gates (local, same worktree)

- Unit: platform-core 245/245, platform-web 1,857 + 1 skipped (new synchronizer mapping test); lint, typecheck and
  build clean. Security baseline 387/387; billing security and platform bundle audits pass.
- Database: pgTAP 1,833/1,833 on a fresh reset, including the paying-customer grace checks.
- Browser (local Supabase, fixture billing): phase 7c 16/16, including the new `e2e/phase7c/first-charge.spec.ts`
  (trial → the $0 invoice is not a payment → a declined first charge pauses access with no grace and shows the notice
  → a retry restores access and records the first payment); ads conversions 64/64 across four browsers.

## Production

- Pipeline `run-nextjs-hotfix-production.mjs` (RELEASE_CERTIFIED_RUNTIME=b7f3478,
  RELEASE_ROLLBACK_DEPLOYMENT=dpl_2bxDPGjMA87xW1MnqGuFk4dHqh8H, RELEASE_PURPOSE=v1.2.58-first-charge-grace): preflight
  PASS; probe-live before 22/22; deploy-preview PASS; probe-preview 7/7; promote PASS; probe-live after 22/22.
- Live page check (desktop and phone, signed out) 14/14; `/api/health` build `b7f3478`, payments live; 0 responses
  with 5xx and 0 error-level log entries after promotion; Google Ads conversion file 200 with the same 2 rows; live
  subscriptions unchanged (6: 5 active, 1 canceled); ShowMe still answers 401 to an anonymous visitor.
