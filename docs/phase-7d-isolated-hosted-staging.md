# Phase 7D isolated hosted subscription staging

Status: implementation and owner-authorized hosted rehearsal in progress. This phase starts from `hosted-preview` commit `5b558ece7ca6ee902e2f1c6d257e3591a26ef8fa` without reopening Phase 7C.

## Isolation contract

- The current public rollback site at `https://mathnexa.com` remains on the separate `mathnexa-production` Vercel project.
- Protected Preview remains on `math-word-hunt-preview` with its existing Supabase project and protection controls.
- Subscription staging uses a new `mathnexa-platform-staging` Vercel project and a new `mathnexa-platform-staging` Supabase project.
- The isolated Vercel project uses its own Production target strictly as an operational staging environment. It is not the public MathNexa Production project, receives no custom domain, and cannot receive `mathnexa.com` or `www.mathnexa.com`.
- Vercel Standard Protection and its encrypted automation bypass remain in place. The automatic project alias is additionally fail-closed at the application layer; this avoids relying on provider target classification or a paid protection upgrade.
- Stripe remains Sandbox/Test mode and reuses Product `prod_UzJVhdFFd8lNed`, monthly Price `price_1TzKso4YQNsZa1pjh5UZvcV7`, and Portal configuration `bpc_1TzLQf4YQNsZa1pjhn4FayQy`.
- MathNexa Auth email uses the separately verified `auth.mathnexa.com` sender identity through Supabase custom SMTP. No DNS record is changed by the Phase 7D runner.

## Credential handling

One foreground Windows PowerShell 5.1 prompt reads provider credentials with `Read-Host -AsSecureString`. `Export-Clixml` stores those `SecureString` values under Windows DPAPI protection at `%USERPROFILE%\.mathnexa-secrets\phase7d-credentials.clixml`; `Import-Clixml` immediately verifies that the current Windows user can reopen every value, and the file ACL allows only that user. A separate local PowerShell 5.1 helper generates the 32-byte staging-access token with `RandomNumberGenerator`, stores it only as a `SecureString` in that same vault, and verifies that CLIXML contains no plaintext copy. The runner converts values to plaintext only in process memory, passes them to child processes through temporary environment variables, and clears every temporary environment value and unmanaged buffer. Source, logs, URLs, command arguments, test artifacts, browser-visible content, and Git never receive plaintext credentials.

Credential rotation uses a separate masked refresh prompt. It removes retired values from the encrypted vault before input, preserves the already-validated Supabase and Sandbox publishable credentials, requests only the replacement Resend and Stripe Sandbox secret keys, and atomically promotes the refreshed CLIXML only after import, format, and plaintext-absence checks pass.

Resend provisioning uses one temporary Full-access key only long enough to validate the verified sender domain, create a `sending_access` runtime key restricted to that domain, and collect confirmation/recovery delivery evidence. Supabase SMTP receives only the restricted runtime key. After hosted email verification and synthetic cleanup pass, the runner deletes the temporary Full-access key through Resend and removes it from CLIXML; the restricted runtime key remains encrypted for staging SMTP.

## Hosted verification

The hosted runner provisions or reconciles resources idempotently, migrates Supabase from empty, runs remote database lint and pgTAP, configures email/password Auth with required confirmation, and deploys the exact clean and pushed feature-branch commit to the isolated project's Production target. It requires the exact isolated project ID, expected commit and branch metadata, Ready status, complete sensitive Production variables, and no custom domains.

`MVH_STAGING_ACCESS_REQUIRED=true` activates a server-side gate. Anonymous application requests receive an empty genuine HTTP 404 with `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`. A single internal POST endpoint accepts the staging token only as an Authorization Bearer credential, compares it in constant time, and sets a signed `__Host-` cookie with Secure, HttpOnly, SameSite=Lax, and Path=/ attributes. Only the Stripe webhook path bypasses the staging cookie; Stripe signature verification remains mandatory. The lifecycle cannot begin until anonymous and authorized behavior pass against the automatic alias and public assets contain no staging token.

The authorized browser context then verifies signup, confirmation, sign-in/out, recovery with old-password rejection, Setup Checkout, exactly one 86,400-second trial, USD 599 monthly billing, entitlement-protected canonical assets, Portal ownership, cancellation, renewal failure, one non-extending seven-day grace period, recovery, period-end expiry, webhook signature/replay/stale-event controls, prohibited-data absence, and cleanup-to-zero.

Synthetic Auth users, application rows, Stripe Customers, active subscriptions, and Test Clocks are removed. The reusable staging projects, sender identity, Sandbox Product/Price/Portal, and staging webhook remain. Resend retains transactional delivery records under its provider retention controls; repository evidence stores no email address, message body, link, token, or delivery identifier.

## Rollback and shutdown

The public rollback site needs no action because its domain never moves. To pause staging, disable Checkout and webhook environment flags on `mathnexa-platform-staging`, revoke its automation bypass, disable the Stripe Sandbox webhook endpoint, and pause the Vercel and Supabase staging projects. Full teardown deletes only those Phase 7D projects and the staging webhook after confirming all synthetic records are zero. Never point `mathnexa.com` at this project without a separately approved commercial-launch phase.
