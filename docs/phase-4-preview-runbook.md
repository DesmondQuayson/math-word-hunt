# Hosted preview runbook

## Readiness and secrets

Owner-controlled values: preview domain, platform access-control credentials, hosted database URLs/keys, Stripe test key/webhook secret/resource IDs, optional email sandbox credentials, and optional monitoring credentials. Developers may know variable names and non-secret resource labels; browsers receive only approved publishable connectivity values. Never copy secrets into source, documentation, build output, logs, or support forms.

Before deployment: choose an HTTPS preview origin; enable platform password/allowlist/owner authentication; configure the Phase 4 registry; initialize an empty dedicated preview database; apply migrations; optionally load labeled disposable fixtures; configure exact auth redirects; configure a Stripe **test** webhook only if approved; keep checkout/portal/webhook flags off until sandbox validation; set `robots`/noindex; record the build ID; run `phase4:verify`.

Smoke test: access restriction, banner on every page, robots disallow, health/status minimality, signup/verification/recovery, cross-account isolation, Free limits, canonical game launch, keyboard/pointer/mobile/reduced motion, captured email, test billing emergency deny, and no secrets in bundles/logs.

Rollback: block preview access, disable checkout/portal/webhooks, enable emergency deny, restore the last verified build, restore the database only into a separate recovery project, rerun security/smoke gates, then reopen deliberately. Shutdown: revoke platform access, remove preview redirects/webhooks, rotate/revoke secrets, pause/delete preview services per provider policy, and record disposal. Reset: export only approved audit evidence, recreate the preview database from empty migrations, reload disposable fixtures, rerun pgTAP and smoke tests.

Known limitations: no production service, live payments, real email, student accounts/rosters, assignments, managed sessions, persisted reports, AI reporting, district administration, or approved permanent deletion. A non-public URL is not an access control.

