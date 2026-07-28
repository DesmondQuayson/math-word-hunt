# Phase 6 verification contract

Status: final candidate gate for **ready for owner decision**. Passing this
gate does not approve or activate Phase 6B.

## Authoritative command

```text
npm run phase6:verify
```

The command first runs the complete `phase5:verify` baseline. It then runs the
Phase 6 policy/operations unit suites, local synthetic pilot rehearsal, pilot
browser and accessibility matrix, Phase 4 accessibility checks, Phase 6
security/static audits, deterministic email-template tests without delivery,
production-default denial, bundle/billing/capability audits, canonical v7,
historical v5, dependency audit, final production build, whitespace check,
protected-file diff check, and SHA-256 verification.

## Phase 6-specific evidence

- missing, malformed, unknown, and requested-active pilot configuration stays
  inactive and denied;
- readiness is distinct from activation and grants no role, entitlement,
  ownership, or database access;
- restricted Preview, adult-teacher-only, no-student-data, unsupported-feature,
  no-billing, support, recovery, and exit copy is present and truthful;
- feedback stays in component memory, prepares text only, and makes no
  persistence, analytics, session-replay, upload, or delivery request;
- obvious prohibited student/secret content receives accessible validation;
- disposable adult-teacher rehearsal verifies session restoration, permitted
  planning, direct-route denial, reciprocal RLS denial, forged-update denial,
  canonical Pointer Events and keyboard interaction, restriction, signed-out
  denial, and zero final fixture counts;
- pilot routes pass keyboard/focus/44px, reduced motion, forced colors, text
  spacing, 200% scaling, 400%-equivalent reflow, and the phone/landscape/tablet/
  desktop/Smart Board matrix with no horizontal page overflow;
- tracked source has no active pilot default, real email dependency, live key,
  analytics/session replay dependency, student persistence field, or public
  pilot authority.

## Preserved boundaries

The gate does not contact the accepted hosted Preview, mutate a provider,
create a participant, send email, activate recovery delivery, create billing,
deploy Production, expose public access, or execute permanent deletion. It
uses local Supabase/Docker only for deterministic reset and synthetic tests.

The final command result, commit, hashes, warnings, and owner-decision status
belong in the Phase 6 final report. This document deliberately does not
pre-claim a pass.
