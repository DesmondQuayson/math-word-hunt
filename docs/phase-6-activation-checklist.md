# Phase 6 activation checklist

Status: **default no-go**. This checklist prepares an owner decision; it does
not activate Phase 6B.

## Governance

- [ ] Final privacy and acceptable-use language approved.
- [ ] Exact dates, duration, count, and adult participants approved privately.
- [ ] Data categories, organization-label policy, retention, and deletion
      responsibilities approved.
- [ ] Support channel, security contact, incident owner, and response
      expectations approved.

## Product and access

- [ ] `npm run phase6:verify` passes on the proposed commit.
- [ ] Restricted Preview disclosure, Standard Protection, and anonymous denial
      are verified without exposing the bypass.
- [ ] Teacher-only authentication, session restoration, RLS, account status,
      and reciprocal cross-account denial pass.
- [ ] Canonical keyboard and Pointer Events gameplay pass with protected hashes.
- [ ] Critical workflows pass the accessibility and viewport matrix.

## Operations

- [ ] Password-recovery delivery is either separately approved and tested or
      explicitly accepted as unavailable with an owner-run recovery procedure.
- [ ] Feedback delivery method and participant instructions are approved.
- [ ] Access/revocation, restriction, incident, exit, and cleanup owners are
      assigned and rehearsed.
- [ ] Synthetic fixture counts return to zero and no real participant exists.
- [ ] Stop criteria and rollback responsibility are accepted.

Any unchecked item means **no-go**. Student data, public exposure, unresolved
security/RLS defects, inaccessible critical workflows, or failed cleanup are
automatic no-go conditions.
