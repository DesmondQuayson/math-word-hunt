# Local Supabase setup

Phase 1D uses Supabase only on the developer machine. Docker Desktop must be running. Install exact locked dependencies with `npm ci`, then run:

```text
npm run supabase:start
npm run db:reset
npm run db:test
npm run test:e2e:phase1d
```

Local endpoints use `127.0.0.1`: API `54321`, database `54322`, Studio `54323`, and Mailpit `54324`. Run `npm run supabase:status` for authoritative current values. Never copy printed keys into tracked files or browser code. `.env.example` documents names only; `.env*` remains ignored.

The local stack enables database, Auth, API, Studio, and Mailpit. Storage, Realtime, Edge Functions, Analytics, Vector, and the pooler are disabled because Phase 1D does not use them. Start the application with runtime values supplied from local status; `npm run test:e2e:phase1d` does this automatically without writing an environment file.

Preview and production remain unconnected. Missing configuration is an explicit signed-out/default-deny state. No hosted project is linked.
