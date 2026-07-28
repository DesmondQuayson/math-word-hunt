# Phase 6 participant access and exit runbook

Status: owner-operated draft. It does not authorize an invitation or hosted
mutation.

## Onboarding checklist

- Confirm the person is an approved adult teacher; record no participant list
  in source control.
- Provide the restricted Preview and no-student-data drafts through the owner-
  approved channel.
- Confirm the participant understands permitted planning labels, unsupported
  features, non-persistent feedback, support reporting, and exit options.
- Verify Standard Protection and teacher-only authentication before access.
- Never request student data, a password, token, cookie, or payment detail.

## Access procedure

After separate Phase 6B approval only: create the minimum teacher identity,
grant Preview access through the approved owner-controlled mechanism, verify
email/account ownership, and confirm no role, entitlement, or browser flag is
being used as a pilot shortcut. Record only a sanitized event code and safe
correlation ID.

## Revocation procedure

1. Block or revoke the participant's Preview access through the approved owner
   boundary.
2. Restrict the teacher account through the trusted server/operator path.
3. Verify protected routes and writes deny.
4. Revoke sessions through the identity-provider procedure if approved.
5. Record a sanitized event; do not store the email in operational logs.

## Participant exit checklist

- Ask the teacher to log out and stop using the Preview.
- Confirm Preview access is revoked and the account is restricted.
- Record whether staged deletion review was requested.
- Inventory only the participant's allowed records through trusted tools.
- Apply the approved retention decision; permanent deletion remains disabled.
- Confirm no support or feedback record contains prohibited information.
- Close access only after verification evidence is complete.

## Synthetic fixture cleanup checklist

- identify the disposable fixture run by safe correlation ID;
- remove owned activities, classes, entitlement/test projections, profile, and
  disposable Auth identity through the existing test cleanup path;
- verify reciprocal cross-account denial before removal when applicable;
- verify final counts for Auth users, profiles, classes, activities,
  entitlements, deletion requests, and billing fixtures are zero;
- preserve no password, token, cookie, email, or raw provider response.
