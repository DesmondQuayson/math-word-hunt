# Phase 6B controlled-pilot implementation and activation contract

## Purpose and fixed boundaries

Phase 6B prepares a protected Preview for three approved adult teachers, with an absolute maximum of five, for exactly 21 calendar days. It does not authorize student use, student data, real school or organization labels, shared accounts, billing, payments, Production, public access, analytics, session replay, or permanent deletion.

The canonical v7 game and historical builds remain independent and unchanged.

## Server-owned activation

The provider-independent evaluator lives in platform-core. The web adapter reads only server environment values. Query strings, cookies, local storage, browser-public variables, participant metadata, and database records cannot independently activate the pilot.

The effective states are:

- inactive: participation is not authorized
- preparing: one or more safeguards are incomplete
- ready-for-owner-decision: operational readiness is complete but owner GO is absent
- active: every prerequisite is complete and the server requests active
- paused: participation must stop until an owner-controlled reopening
- ended: participation is closed and cleanup review follows

Missing configuration, unknown states, malformed prerequisites, Production, unsupported environments, invalid dates, and incomplete requirements fail closed. Readiness is informational; it does not grant identity, ownership, RLS, account status, entitlement, or route authorization.

## Server environment contract

Phase 6B uses:

- MVH_PILOT_STATE
- MVH_PILOT_START_AT
- MVH_PILOT_END_AT
- MVH_PILOT_OWNER_GO
- MVH_PILOT_DATES_APPROVED
- MVH_PILOT_SUPPORT_CHANNEL
- MVH_PILOT_AUTH_EMAIL_VERIFIED
- MVH_PILOT_CONFIRMATION_FLOW
- MVH_PILOT_RECOVERY_FLOW
- MVH_PILOT_HUMAN_ACCESS
- MVH_PILOT_PRIVACY_POLICY
- MVH_PILOT_INCIDENT_OPERATOR
- MVH_PILOT_ROLLBACK_OPERATOR

Prerequisite values are exactly complete or incomplete. No value contains a secret, participant identity, private address, provider identifier, confirmation link, recovery link, cookie, token, or automation bypass.

Active requires all ten categories:

1. owner GO recorded
2. approved start and end dates
3. approved support channel
4. verified transactional Auth email
5. verified confirmation flow
6. verified recovery flow
7. approved human Preview access
8. approved privacy and acceptable-use language
9. assigned incident operator
10. assigned rollback operator

## Transactional Auth email truth states

MVH_EMAIL_DELIVERY supports:

- disabled: external confirmation and recovery are unavailable
- local-capture: synthetic messages remain in the local capture service
- transactional-configured: provider configuration exists but delivery is not verified
- transactional-verified: confirmation and recovery have passed hosted verification

Only transactional-verified satisfies pilot activation. SMTP and provider credentials stay in provider or server configuration and are never browser variables. Signup and recovery responses remain generic to resist account enumeration. Redirects remain on the explicit internal allowlist.

## Organization-label restriction

The controlled pilot does not collect school, district, classroom, institution, or organization names.

- signup and profile forms do not expose an organization field
- forged server-action fields are rejected
- signup metadata sends only the display name
- profile saves update only the display name
- authenticated database column privileges exclude the organization label
- a database trigger denies introduction or change of a non-null label, including elevated writes
- existing non-null values are retained and unrelated data is not deleted
- null and empty values remain safe

This is a Phase 6B restriction, not a new organization model.

## Rollback

Set MVH_PILOT_STATE to paused or inactive in Preview, retain Standard Protection, revoke human access, verify the stable alias, and run the hosted smoke matrix. If a code rollback is required, point the stable Preview alias to the recorded prior Ready deployment. Do not use Production and do not weaken RLS, account status, or billing denial.
