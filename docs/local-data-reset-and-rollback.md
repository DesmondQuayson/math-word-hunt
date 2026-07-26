# Local reset and rollback

Before a reset, confirm the target is the repository-local Supabase project and that no needed local fixtures remain. Then run `npm run db:reset` and `npm run db:test`. The operation deletes only the disposable local database and recreates it from migrations plus the safe catalog seed.

To stop services, run `npm run supabase:stop`. To abandon Phase 1D application work, stop the stack and restore Phase 1D files from version control only with explicit owner direction. Do not edit or replace the static rollback pair: `docs/index.html` and `docs/vocab.js`. GitHub Pages continues to serve `/docs`, so local platform failure cannot alter the current production game.

There is no remote rollback procedure because no hosted project is linked and no migration is deployed. Production rollout/rollback needs a separate reviewed runbook.
