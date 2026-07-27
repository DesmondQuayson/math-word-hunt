# Phase 3 owner-decision register

## Already approved and implemented

- Canonical v7 remains Free and public.
- Authorization is server-side; browser values have no access authority.
- Suspension and deletion request override billing.
- One current paid subscription per teacher; no student billing or fake premium features.
- Downgrade preserves teacher data and does not auto-delete or auto-archive.
- Hosted Checkout and portal remain local/test-only.
- Free and Pro describe only capabilities that genuinely exist.

## Reversible defaults for review

- Free: 2 active classes and 3 active activity drafts.
- Pro: 25 active classes and 100 active activity drafts.
- Archived records do not count.
- Safe edits and archive remain allowed above limit.
- Duplication/new creation remains denied at or above limit.
- The test catalog has no trial, coupon, promotion, seat, usage, tax, or automatic-refund behavior; cancellation is at period end and plan switching is disabled.

## Approval required before production

Final prices and limits; currency/country; taxes; refund policy; failed-payment grace; support owner/SLA; retention; legal terms; privacy policy; annual discount language; school purchasing; promotion codes; any trial; production email; production Stripe resources; hosted Supabase and deployment; monitoring; and the permanent account-deletion procedure.

None of those decisions blocks continued local product-quality work. They block production payment acceptance and launch approval.
