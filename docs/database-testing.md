# Database testing

Run `npm run db:reset` to recreate the local database from empty, apply both versioned migrations, and load the safe product seed. Run `npm run db:test` for the pgTAP suite.

The 65 assertions verify tables, columns, constraints, keys, indexes, catalog seed, idempotent profile provisioning, metadata privilege rejection, default-deny entitlement state, anonymous denial, owner access, two-teacher isolation, ownership reassignment denial, foreign-class rejection, forbidden catalog/entitlement/status/resolution writes, and suspended/deletion-request restrictions.

Personal fixture data is never part of `supabase/seed.sql`. Browser tests create isolated `example.test` teachers at runtime and remove them afterward. A clean reset is the supported repeatability test; migrations are not manually replayed over an unknown schema.
