# Public Production testing strategy

`npm run production-public:verify` is the complete release gate. It retains the full Phase 6B suite and adds provider-free Production coverage.

The public Production matrix verifies:

- a clean production build without Supabase, Stripe, Resend, Preview, or automation-bypass values;
- public homepage, game gateway, About, Help, Privacy, and Accessibility routes;
- deliberate unavailability of account, teacher, Auth, recovery, pilot, billing, Checkout, status, and internal API routes;
- no functional email, student, organization, invitation, billing, account, or deletion form;
- provider clients and server actions fail closed;
- the canonical game gateway and protected hashes;
- representative game loading plus the inherited canonical complete-round suites;
- keyboard focus, 320px reflow, reduced motion, forced colors, and responsive public navigation;
- public robots and sitemap boundaries; and
- HTML and browser bundles contain no provider secret, Preview project reference, or credential marker.

The protected Preview hosted suite remains separate and must continue to pass without changing Standard Protection. Public Production tests create no Auth user, application row, email, invitation, payment, or fixture.

The following owner-accepted recovery checks remain unverified, not passed:

- previous-password rejection after recovery;
- new-password authentication after recovery; and
- unknown-account recovery privacy equivalence.

They do not apply to public Production because Production has no Auth or recovery capability. They remain required evidence for any future authenticated Production architecture.
