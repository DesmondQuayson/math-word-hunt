# Phase 5 owner approval checklist

Every checkbox is independent. Approval of one line does not authorize a later line. Record approver, UTC timestamp, exact resource name, cost ceiling, and expiry in an owner-controlled decision log; never put secrets in that log.

## Planning decisions

- [ ] Approve Vercel plan, owner/team, project label, region behavior, Standard Protection, and monthly cost ceiling.
- [ ] Approve Supabase organization, plan, region, project label, backup expectations, spend cap, and monthly cost ceiling.
- [ ] Approve Stripe Sandbox rather than shared test mode, resource labels, provisional test amounts, and cleanup policy.
- [ ] Approve captured-email mechanism and permitted adult test addresses; real delivery remains prohibited.
- [ ] Approve captured-log monitoring, incident owner, security contact, retention, and access list.
- [ ] Approve preview data reset cadence and preview shutdown owner.
- [ ] Approve pilot privacy notice, no-student-data rule, support channel, feedback form, exit criteria, dates, and exact 3–10 adult participants.

## External mutation gates

- [ ] Create the isolated Supabase preview project.
- [ ] Link this repository to that exact preview project.
- [ ] Apply migrations to the empty preview database.
- [ ] Configure exact Supabase Site URL, redirects, email confirmation, and recovery settings.
- [ ] Create the Vercel preview project.
- [ ] Link this repository to that exact Vercel project.
- [ ] Add preview-only environment values and owner-held secrets.
- [ ] Enable Vercel Authentication/Standard Protection and an automation bypass.
- [ ] Create a preview deployment (never `--prod`).
- [ ] Create Stripe Sandbox/test Product, Prices, and Portal configuration.
- [ ] Register a Stripe Sandbox/test webhook.
- [ ] Configure an external email sandbox. This does not approve real email.
- [ ] Configure an external monitoring target.
- [ ] Run read-only hosted checks against the restricted preview.
- [ ] Create approved disposable adult-teacher fixtures and run hosted cross-account tests.
- [ ] Send pilot invitations to the exact approved adult list.

## Explicitly not approved in Phase 5

Production or public deployment, production DNS, Stripe live mode/resources, real payments, real outbound customer email, student accounts/data, permanent deletion, production customer data, public launch, or expansion beyond the approved pilot. Any of these requires a later phase and new review.
