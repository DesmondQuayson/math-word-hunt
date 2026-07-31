# Phase 7A Production testing and evidence plan

Status: required gates for Phase 7B through commercial activation. Existing
test passes do not prove the corrected public subscription model.

## Repository verification

Create one official Phase 7 verification command that includes:

- lint, typecheck, unit/integration tests, dependency audit, and two consecutive
  clean production builds;
- migration from empty and complete pgTAP;
- public account, Auth, route, subscription, entitlement, deletion, and
  cross-account tests;
- Stripe Checkout, trial, Portal, webhook, reconciliation, and failure tests;
- canonical gameplay tests through the authenticated gateway;
- direct/static asset bypass tests;
- production-public and Protected Preview regression tests;
- mobile, keyboard, pointer, accessibility, reduced-motion, and audio-blocked
  game behavior;
- browser bundle, response, log, and artifact secret audits;
- canonical/historical hashes and forbidden-file checks.

Do not weaken tests, use force clicks, add arbitrary sleeps, hide retries, or
skip the final build.

## Schema and data-minimization tests

From empty:

1. apply the complete migration chain;
2. assert the minimal account, billing, entitlement, webhook, and deletion
   schema;
3. assert Production has no writable teacher, student, school, class, roster,
   organization, assignment, report, session, score, or progress structure;
4. assert no display-name/profile field is required;
5. verify exact service grants and RLS;
6. verify two-account reciprocal isolation;
7. verify browser roles cannot write billing or entitlement authority;
8. verify prohibited forged fields are rejected/ignored and never logged;
9. verify cleanup-to-zero for synthetic data.

## Auth/email tests

- general public sign-up without profile or educational fields;
- confirmation required before sign-in and Checkout;
- confirmation single use, expiry, tampering, and redirect safety;
- sign-in/out, refresh, restoration, and signed-out route denial;
- known/unknown recovery response equivalence;
- recovery expiry/reuse/tampering;
- new password accepted and old password rejected;
- suspended and deletion-requested denial;
- sender SPF/DKIM/DMARC review, delivery, bounce, spam, rate limits, and
  tracking/retention controls;
- no addresses, passwords, links, tokens, or cookies in evidence.

## Stripe test-mode scenarios

- exactly one Product and one active USD 599 monthly Price;
- no annual or legacy tier Price accepted;
- Checkout requires a payment method;
- one account receives exactly one full 24-hour trial;
- account creation, Checkout creation, and redirect arrival grant nothing;
- verified trialing subscription grants until exact `trial_end`;
- access denies at the trial boundary unless Stripe is authoritatively active;
- automatic test billing changes the subscription to active and extends access
  only to the verified period end;
- failed first or renewal payment denies immediately;
- canceled, paused, unpaid, incomplete, expired, duplicate, wrong-owner,
  wrong-mode, wrong-Price, stale, malformed, and conflicting states deny;
- a second trial attempt for the same account denies;
- another account's Checkout Session, Customer, Subscription, Portal, or game
  asset request denies;
- valid signed duplicate events are idempotent;
- conflicting payload hashes and poison events enter manual review;
- provider/database outage is retry-safe and never grants;
- cancellation during trial prevents automatic billing and ends access no
  later than the verified trial end;
- period-end cancellation retains access only while status is active and
  before period end;
- deletion request denies immediately and invokes support cleanup;
- refund behavior remains blocked/manual until policy approval.

Use Stripe test clocks or supported test simulation for the 24-hour and monthly
boundaries. Do not wait in real time or fabricate elapsed-time evidence.

## Game entitlement gateway tests

- `/play` requires a confirmed account and valid entitlement;
- every canonical asset request independently denies without entitlement;
- `docs/index.html`, `docs/vocab.js`, historical, backup, GitHub Pages, Vercel
  static, object-storage, source-map, and alternate-host URLs cannot bypass;
- trial expiry during a session denies the next protected navigation/resource
  according to the approved session policy;
- logout and account suspension deny subsequent asset requests;
- private/no-store cache behavior prevents cross-user delivery;
- authenticated packaging remains byte-identical to canonical source;
- no gameplay state is sent to or persisted by the platform.

## Security evidence

Scan source, build output, network responses, logs, screenshots, traces, and
test reports for Supabase secrets, Stripe secrets/webhook keys, SMTP
credentials, tokens, sessions, emails, payment data, and prohibited educational
data. Verify the browser cannot select account status, trial use, timestamps,
Price, Customer, Subscription, entitlement, environment, or activation.

## Hosted launch evidence

Hosted passes must be recorded as hosted; local mocks cannot substitute. Record
release commit, environment, timestamp, operator role, sanitized outcome, and
rollback reference.

Stop on any cross-account read, public game bypass, secret leak, prohibited
data field, unsigned billing mutation, duplicate trial, wrong charge amount,
wrong interval, trial shorter than 24 hours, entitlement timing error,
migration mismatch, canonical regression, or failed rollback.
