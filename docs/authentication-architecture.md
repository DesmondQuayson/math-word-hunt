# Authentication architecture

Supabase Auth owns email/password credentials and verified identity. `@supabase/ssr` supplies separate browser, Server Component/Action, and Next.js 16 proxy clients. The proxy refreshes auth cookies using the supported cookie adapter; protected reads validate the user with `auth.getUser()`.

The authenticated teacher resolver converts the validated user and RLS-filtered profile into a provider-independent context. Missing, malformed, suspended, and deletion-requested profiles fail closed. Server actions derive ownership from this context and ignore browser owner IDs, roles, premium flags, and status fields. Raw sessions, tokens, provider errors, and administrative keys never become UI props.

`packages/platform-core` remains free of Supabase, React, Next.js, browser, and Node provider dependencies.
