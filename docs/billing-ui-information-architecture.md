# Billing UI information architecture

Phase 2A adds copy contracts, not billing UI. The account page will eventually render one semantic status region under its existing single `h1`, with plain language and only server-allowed actions.

States: Free, Pro active, Pro trialing (only if approved), Payment issue, Canceling at period end, Canceled/expired, Setup unavailable, Suspended, Deletion requested, Temporarily unavailable, and Manual review. Copy exposes no raw status, object/event ID, database error, secret, or promise that payment instantly grants access.

A future pricing page contains one `h1`, Free/Monthly/Annual comparison, reviewed feature boundaries, unavailable rather than fabricated prices, interval/renewal/cancellation explanation, tax/refund/support disclosure, and sign-in-aware actions. Preserve keyboard use, visible focus, 44px targets, semantic status announcements, responsive reflow, Smart Board readability, non-color cues, reduced motion, and forced colors.

