# Billing environments and secrets

| Boundary | Local | Automated test | Preview | Production |
| --- | --- | --- | --- | --- |
| Supabase | local CLI | disposable local reset | separate future project | separate future project |
| Stripe mode | test only | test/fakes | test only default | live only after activation |
| Credentials | local test keys + CLI endpoint secret | isolated values | separate test keys/secret | separate live keys/secret |
| Product/prices | future test objects | fixtures/test | dedicated test catalog | approved live catalog |
| Origin | localhost HTTP | localhost HTTP | exact HTTPS preview | exact HTTPS production |
| Email/identity | local capture/synthetic | no real mail | controlled test identity | verified teacher email |
| Retention | disposable | per run | separate/minimized | approved policy required |

Preview never shares production billing data. Hosted projects remain unlinked.

`lib/billing/config.ts` is server-only and fail-closed: explicit enabled flag, known environment, matching key prefixes, unique plan mappings, provider-ID shapes, endpoint-secret shape, and safe origin. Local/test/preview reject live; production rejects test and requires a deliberate owner marker. Errors expose only codes. Product/Price IDs do not encode mode, so Phase 2B must retrieve them and confirm `livemode` before use.

Only a publishable key could ever be public. Stripe secret/webhook keys, Supabase service key, mappings, and plan mappings stay server-only. No billing secret uses `NEXT_PUBLIC_`; `.env.example` contains placeholders only.

