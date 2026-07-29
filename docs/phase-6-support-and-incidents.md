# Phase 6 support and incident operations

Status: readiness procedure approved by the owner; **Phase 6B remains NO-GO**.
The operating support address, email provider, and delivery configuration have
not been supplied or approved.

## Support workflow

1. Contact the pilot coordinator using the channel through which pilot access
   was provided.
2. Include workflow, approximate date/time, device/browser category, impact,
   expected result, observed result, and reproducible steps.
3. Do not include student data, passwords, tokens, cookies, payment details,
   provider IDs, raw payloads, screenshots, or uploads.
4. The coordinator records a sanitized event and safe correlation ID, confirms
   scope, and routes security/privacy issues to the approved incident owner.

Use one dedicated, tested, owner-controlled private support channel. Its exact
address remains private and must not be invented in this repository. Acknowledge
pilot support requests within one business day. No 24/7 availability or
guaranteed resolution time is offered.

## Severity

- **SEV-1:** secret exposure, cross-account access, public Preview exposure,
  student-data collection, or real-payment risk.
- **SEV-2:** contained authorization/data-integrity failure, inaccessible
  critical workflow, or inability to restrict/clean up pilot data.
- **SEV-3:** degraded workflow with a safe alternative.
- **SEV-4:** low-impact defect, copy issue, or documentation question.

## Triage checklist

Preserve only sanitized evidence; classify severity; block participant access
when required; restrict affected accounts; verify Standard Protection remains;
check RLS and server authorization; check for secret or student-data exposure;
identify the last verified build; record decisions; verify recovery with
cross-account, authentication, accessibility, and cleanup tests.

## Mandatory stop rules

- Suspected student data: stop affected participation, do not copy the data,
  restrict access, preserve minimal metadata, and escalate for owner/privacy
  review.
- Account access: revoke Preview access and restrict the account before further
  diagnosis.
- Security: block access, rotate any exposed secret through the owner-approved
  provider process, and do not resume while the defect is unresolved.
- Public exposure: restore Standard Protection immediately and verify anonymous
  denial before any participant resumes.

## Responsibilities

The project owner is the security contact, incident owner, rollback owner, and
final go/no-go authority; private contact details stay outside the repository.
A designated technical operator may contain an issue, collect sanitized
evidence, perform cleanup, and verify authorization and record counts. The
project owner approves incident declaration, participant communication,
retention, recovery, and resumption.

Serious privacy, security, RLS, authorization, secret-exposure, public-access,
student-data, cleanup, or critical-accessibility incidents require an immediate
pause of affected access. Access resumes only after verified correction and an
explicit owner decision.

## Communication template

> Pilot access is paused while an issue is reviewed. Do not use the Preview or
> send student information, passwords, tokens, or screenshots. The pilot
> coordinator will provide the next approved step through the channel used to
> provide access. No response time is promised in this draft.
