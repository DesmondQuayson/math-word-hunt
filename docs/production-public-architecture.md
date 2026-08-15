# Public Production architecture

Status: approved public-only Production contract. This architecture is separate from the protected authenticated Preview and does not promote or reuse Preview provider configuration.

## Environment contract

`MVH_APP_ENVIRONMENT=production-public` selects the only supported public Production mode. The server accepts it only when:

- the application origin is exact HTTPS;
- no Supabase URL, key, secret, service role, or project reference is configured;
- no Stripe, Resend, or Vercel automation-bypass credential is configured;
- billing is exactly disabled;
- the pilot is exactly inactive;
- invitations are exactly disabled;
- email delivery is disabled;
- fixtures are forbidden; and
- deletion is disabled.

Malformed or mixed Preview/Production configuration fails closed. Public browser values have no authorization authority. The complete non-secret variable example is `.env.production-public.example`.

## Public surface

| Route | Production behavior |
|---|---|
| `/` | Public MathNexa homepage |
| `/play` | Gateway to the preserved canonical Math Vocabulary Hunt |
| `/about` | Public product information |
| `/help` | Public gameplay and privacy guidance |
| `/privacy` | Public no-account/no-student-data boundary |
| `/accessibility` | Public accessibility behavior and controls |
| `/robots.txt`, `/sitemap.xml` | Public discovery limited to approved routes |

The canonical game remains independently deployed from `docs/index.html` and `docs/vocab.js`. Production routes the gateway to `https://desmondquayson.github.io/math-word-hunt/`; it does not copy or rewrite gameplay.

## Restricted surface

Account, sign-in, sign-up, recovery, Auth callback, teacher workspace, pilot, pricing, Checkout, status, billing webhook, health, and other internal API route families are intercepted before Supabase session middleware. Browser routes render the deliberate “feature not launched” experience with no form. API routes return sanitized HTTP 404 JSON.

Supabase public, server, and service clients independently return no client in `production-public`. Auth and billing server actions also deny before reading submitted fields or initializing a provider. Production contains no invitations endpoint, student account model, roster, organization-label form, payment control, fixture loader, destructive deletion path, or administrative provider operation.

## Environment separation

- Local: local Supabase, captured email, disposable fixtures, test-only tooling.
- Preview: dedicated Preview Supabase project, protected Vercel Preview, teacher Auth verification, inactive pilot.
- Production: separate Vercel project, public static/informational surface, no Supabase/Auth or private provider credential.

Production authentication requires a future owner-approved architecture, separate Production Supabase project, migrations-from-empty, RLS verification, transactional email review, restricted onboarding model, and new release gate. Preview credentials must never be copied as a shortcut.

## Rollback

If public verification fails, detach `mathnexa.com` from the failing Production deployment or restore the last known safe Production deployment. Do not alter Preview protection, copy Preview credentials, activate the pilot, or enable billing. The canonical GitHub Pages game remains independently launchable throughout rollback.
