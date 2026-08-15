# Phase 6B participant and support operations

## Participant lifecycle

1. The owner records three adult-teacher identities privately.
2. Provider, privacy, support, email, access, dates, incident, and rollback prerequisites are verified.
3. Hosted testing uses exactly two synthetic adult-teacher users while the pilot remains inactive.
4. Synthetic records and messages are removed and application counts return to zero.
5. The owner gives the separate final GO.
6. Exactly the three privately approved teachers receive human Preview access and the reviewed invitation.
7. Each teacher uses an individual account, confirms the address, and acknowledges all pilot boundaries.
8. Support, withdrawal, revocation, and incident stops are handled through the private access channel.
9. The pilot ends after 21 calendar days.
10. Cleanup review completes no later than 14 days after pilot end.

No participant name, email address, support address, or provider credential belongs in this repository.

## Support channel

The participant uses the same private channel through which access was provided. The operating target is acknowledgment within one business day; it is not 24/7 emergency support.

Safe reports contain the workflow, approximate time, browser and device category, impact, expected behavior, observed behavior, and a safe correlation ID if shown. Reports must exclude student or school data, screenshots, files, passwords, cookies, tokens, one-time links, raw headers, payment data, and provider sessions.

The primary operator owns triage. The backup operator owns continuity. Both identities and the actual channel remain in the private owner record.

## Confirmation test

- use only an operator-controlled synthetic mailbox
- expect exactly one message
- verify reviewed sender identity, semantic HTML and plain text, support guidance, and exact HTTPS destination
- verify valid confirmation, expired link, replay, malformed link, missing token, altered token, and wrong-token-type behavior
- confirm no address, token, or URL is logged
- confirm sign-in remains generic before and after confirmation

## Recovery test

- request recovery for one known and one unknown synthetic account
- require the same generic browser response
- expect delivery only for the known account
- verify the exact internal recovery destination
- verify valid update, old-password failure, new-password success, replay denial, malformed and expired links, and prior-session revocation where supported
- document provider-specific JWT delay without weakening account-status checks

## Withdrawal and revocation

A teacher can stop at any time by logging out, stopping use, and contacting the pilot coordinator through the original access channel. The operator revokes human Preview access and restricts the account. A staged deletion request may follow, but permanent deletion remains separately disabled.

Revocation expectations:

- stop new protected writes immediately
- preserve only minimum records needed for the approved review
- do not promise immediate JWT invalidation where the provider cannot provide it
- retain server checks for account status, ownership, RLS, and authorization
- record only sanitized evidence

## Incident stop

Immediately pause the pilot for student data, secret exposure, cross-account access, RLS failure, public Preview exposure, failed revocation, failed cleanup, confirmation or recovery security failure, billing activation, Production action, unresolved critical accessibility failure, or provider privacy incompatibility.

The owner controls stop, investigation, rollback, reopening, and final go/no-go. Do not copy exposed data into tickets or repository evidence.
