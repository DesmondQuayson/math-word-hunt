# Phase 7D isolated hosted subscription staging

Status: implementation and owner-authorized hosted rehearsal in progress. This phase starts from `hosted-preview` commit `5b558ece7ca6ee902e2f1c6d257e3591a26ef8fa` without reopening Phase 7C.

## Isolation contract

- The current public rollback site at `https://mathnexa.com` remains on the separate `mathnexa-production` Vercel project.
- Protected Preview remains on `math-word-hunt-preview` with its existing Supabase project and protection controls.
- Subscription staging uses a new `mathnexa-platform-staging` Vercel project and a new `mathnexa-platform-staging` Supabase project.
- Vercel staging is a Preview deployment under Standard Protection. It is not a Production deployment and receives no custom domain.
- Stripe remains Sandbox/Test mode and reuses Product `prod_UzJVhdFFd8lNed`, monthly Price `price_1TzKso4YQNsZa1pjh5UZvcV7`, and Portal configuration `bpc_1TzLQf4YQNsZa1pjhn4FayQy`.
- MathNexa Auth email uses the separately verified `auth.mathnexa.com` sender identity through Supabase custom SMTP. No DNS record is changed by the Phase 7D runner.

## Credential handling

One foreground Windows PowerShell 5.1 prompt reads the Supabase access token, Resend API key, and Stripe Sandbox publishable and secret keys with `Read-Host -AsSecureString`. `Export-Clixml` stores those `SecureString` values under Windows DPAPI protection at `%USERPROFILE%\.mathnexa-secrets\phase7d-credentials.clixml`; `Import-Clixml` immediately verifies that the current Windows user can reopen every value, and the file ACL allows only that user. The runner converts values to plaintext only in process memory, adds provider-generated webhook and automation-bypass secrets back through the same native CLIXML path, and clears every temporary environment value and unmanaged buffer. Source, logs, command arguments, test artifacts, and Git never receive plaintext credentials.

## Hosted verification

The hosted runner provisions or reconciles resources idempotently, migrates Supabase from empty, runs remote database lint and pgTAP, configures email/password Auth with required confirmation, and deploys the exact clean feature-branch commit. It then verifies signup, confirmation, sign-in/out, recovery with old-password rejection, Setup Checkout, exactly one 86,400-second trial, USD 599 monthly billing, entitlement-protected canonical assets, Portal ownership, cancellation, renewal failure, one non-extending seven-day grace period, recovery, period-end expiry, webhook signature/replay/stale-event controls, prohibited-data absence, and cleanup-to-zero.

Synthetic Auth users, application rows, Stripe Customers, active subscriptions, and Test Clocks are removed. The reusable staging projects, sender identity, Sandbox Product/Price/Portal, and staging webhook remain. Resend retains transactional delivery records under its provider retention controls; repository evidence stores no email address, message body, link, token, or delivery identifier.

## Rollback and shutdown

The public rollback site needs no action because its domain never moves. To pause staging, disable Checkout and webhook environment flags on `mathnexa-platform-staging`, revoke its automation bypass, disable the Stripe Sandbox webhook endpoint, and pause the Vercel and Supabase staging projects. Full teardown deletes only those Phase 7D projects and the staging webhook after confirming all synthetic records are zero. Never point `mathnexa.com` at this project without a separately approved commercial-launch phase.
