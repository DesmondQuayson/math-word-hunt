# Phase 6 plan

Status: implementation workstream for **Controlled Teacher Pilot Governance and Readiness**.

Phase 6 prepares the restricted Preview for a later, separately approved pilot
with 3-5 adult teachers. The proposed duration is 2-4 weeks. Neither range is
an invitation, date, or activation approval.

## Work slices

1. **Governance freeze:** document the proposed pilot, data boundaries,
   retention choices, support operations, evidence, and owner decisions.
2. **Local pilot experience:** add truthful onboarding, privacy, support,
   feedback, and exit routes without persistence or delivery.
3. **Operational controls:** add a provider-independent, default-inactive pilot
   policy and safe rehearsal utilities. Existing identity, RLS, ownership,
   account-status, and entitlement controls remain authoritative.
4. **Synthetic rehearsal:** exercise the complete allowed journey with
   disposable adult-teacher fixtures and return fixture counts to zero.
5. **Readiness review:** run `npm run phase6:verify` and assemble a go/no-go
   packet. Activation remains a separate owner decision.

## Non-negotiable boundaries

Phase 6 does not invite participants, create hosted users, send email, enable
password-recovery delivery, deploy, change Vercel or Supabase, enable billing,
create Stripe resources, expose the Preview publicly, collect student data, or
execute permanent deletion. The canonical v7 game, historical builds, and
backups remain protected.

## Completion language

A passing implementation is **ready for owner decision**, not activated and
not legally approved. Phase 6B may begin only after the owner approves the
consolidated decisions in [`phase-6-owner-decisions.md`](phase-6-owner-decisions.md).
