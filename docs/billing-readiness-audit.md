# Phase 2A billing-readiness audit

Phase 1D already resolves a verified Supabase user to an immutable teacher profile, enforces active/suspended/deletion-requested lifecycle rules, keeps authorization in server repositories, stores provider-independent products and feature entitlements, denies unknown access, and tests two-account RLS isolation. Static v7 remains a separate deployment artifact.

Phase 2A closes the missing local contracts for billing owner mapping, subscription projection, webhook receipts, plan intervals, status normalization, environment validation, and subscription-derived entitlement provenance. It deliberately adds no Stripe SDK, Checkout/portal action, webhook endpoint, provider object, payment, live key, hosted link, or automatic grant.

Internal authority remains authenticated teacher ID, account status, product/plan keys, feature mapping, entitlement meaning, and the final access decision. Future Stripe authority is limited to provider customer/subscription/price objects, invoice/payment state, and billing-period times. Provider IDs stay in server configuration/projections, not portable entitlement types or browser authority. Mutable email is never ownership identity. Prototype fixtures are never billing inputs.

