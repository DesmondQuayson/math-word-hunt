# Server adapter architecture

Supabase integration lives under `apps/platform-web/lib/supabase`, authenticated resolution under `lib/auth`, and provider implementations under `lib/repositories`. Repositories implement or adapt the provider-independent interfaces from `packages/platform-core` and normalize PostgreSQL timestamps/status values before domain parsing.

All teacher-data reads and writes are server-only. Class and activity ownership comes from the validated session. Provider errors map to safe `TeacherResult` categories; no SQL detail or foreign identifier is returned. The only browser client is the supported auth client, and current forms use server actions.

There is no fake production fallback. Without valid public configuration the app shows an explicit unavailable/signed-out state and all access remains denied. The opt-in demonstration fixture mode remains server-only, development/test-only, visibly labeled, and separate from real data.
