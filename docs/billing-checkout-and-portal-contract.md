# Checkout and portal contracts

The future Checkout action accepts only `{ planKey, returnDestination }`: a paid internal key and `/account` or `/pricing`. It requires an authenticated verified active teacher; resolves the immutable owner and one customer; maps to a server-held test Price ID; applies idempotency/duplicate prevention; and builds success/cancel URLs from the validated origin. Suspended/deletion-requested/missing profiles deny. Redirect arrival grants nothing.

Recommendation: when already subscribed, deny a second Checkout and show Manage subscription; a conflict may require review. Use hosted Checkout, never custom card entry.

The future portal action looks up customer server-side, accepts no customer/URL, uses an allowlisted return, and never persists the short-lived URL. Missing/conflicting mappings get safe support copy. Initial proposed capabilities: payment-method update, invoices, cancellation. Disable monthly/annual switching until proration/timing/prices are approved; disable unsupported products. Suspended accounts deny. Initially use support-assisted cancellation for deletion-requested accounts; a cancellation-only portal needs owner approval. All remains test-only until live authorization.

