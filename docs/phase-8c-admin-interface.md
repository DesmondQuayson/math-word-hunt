# Phase 8C Super Admin interface

The `/admin` command center is a responsive owner-only operations workspace. The Phase 8A server authorization check runs before the interface is rendered: disabled and non-admin requests receive a genuine 404, password-authenticated owners must complete TOTP-backed AAL2, and an active short server-owned admin session is required.

The navigation exposes Dashboard, Games, MAP Prep, Homework, Quizzes, Users, Subscriptions, Analytics, Media Library, CMS, Settings, and Audit Log. Phase 8C establishes navigation and truthful module empty states; it does not silently introduce later-phase write workflows.

Dashboard content is read only through a server-only Supabase service client. It reports published game resources, drafts, homework and quiz resources, subscription projections, trials, payment-attention projections, webhook state, and recent immutable audit actions. Download and email metrics display explicit unavailable states because those events are not yet collected.

Keyboard users can move through native links and controls and focus module search with Ctrl/Command+K. Focus remains visible. The layout reflows from a desktop rail to a horizontally scrollable mobile module strip, retains 44-pixel targets, uses the global reduced-motion contract, and provides forced-colors overrides. Browser online/offline changes produce a live fail-closed state.

No admin role, publication authority, service credential, billing secret, or provider secret is included in browser code. MAP Prep is labeled only as MAP Prep and remains an external-destination concept.
