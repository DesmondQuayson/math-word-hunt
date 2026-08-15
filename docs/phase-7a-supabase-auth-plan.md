# Phase 7A Production Supabase and public Auth plan

Status: architecture only. Phase 7A creates or links no Supabase project.

## Minimal account model

Production uses general public accounts. It has no roles for teachers,
students, schools, classes, rosters, organizations, assignments, or learning
progress.

Recommended application account fields:

- `user_id uuid` referencing `auth.users`;
- `account_status`: `active`, `suspended`, or `deletion_requested`;
- `trial_redeemed_at` or equivalent immutable one-trial marker;
- `created_at` and `updated_at`.

Email and credentials remain in Supabase Auth and are not duplicated in the
application schema. Do not request display name, school, age, role, or profile
biography. Do not persist gameplay selections, results, scores, words,
sessions, or progress.

## Existing schema transition

The current repository creates teacher profiles, classes, activity drafts,
class/activity limits, and teacher-oriented billing foreign keys. A fresh
Production database must still migrate deterministically from the repository's
history, then apply forward-only Phase 7 migrations that:

1. create/rename the minimal general account record;
2. remove display-name and organization-label collection from Production;
3. remove Production grants, triggers, RPCs, tables, and routes for classes and
   activity drafts;
4. rename account/billing ownership fields away from teacher terminology;
5. replace legacy plan/capability rows with one monthly game-access product;
6. preserve necessary billing/deletion evidence and foreign-key integrity;
7. leave Protected Preview unmodified by not applying Production migrations to
   that hosted project.

No historical migration is rewritten. The Production project is created from
empty only after the new migration chain and pgTAP suite pass locally.

## Project and migration procedure

1. Create a new isolated Production project after separate owner approval.
2. Record region, plan, PostgreSQL version, project reference, and operator
   roles without recording secrets.
3. Apply every migration from empty in order.
4. Run schema inventory, grants, RLS, pgTAP, and forbidden-data assertions.
5. Seed only the one game product and entitlement policy. Do not seed users,
   subscriptions, gameplay data, or educational structures.
6. Test two synthetic public accounts, reciprocal denial, suspension, deletion
   request, and cleanup.
7. Return synthetic Auth and application data to zero before live activation.

## Auth configuration

- public email/password sign-up enabled;
- email confirmation required before sign-in;
- anonymous, social, phone, and manual-linking sign-in disabled;
- refresh-token rotation enabled;
- production password and leaked-password controls approved;
- CAPTCHA/rate-limit controls reviewed for account and card-trial abuse;
- exact Site URL `https://mathnexa.com`;
- exact confirmation and recovery callback allowlist;
- no wildcard Preview, localhost, branch, or external redirect in Production;
- supported Supabase SSR cookie handling and server `auth.getUser()` validation;
- generic sign-up, sign-in, and recovery errors.

Account creation alone grants no game access. It permits the account page and
subscription flow only.

## Account lifecycle

| State | Account access | Checkout/Portal | Game access |
| --- | --- | --- | --- |
| unconfirmed | confirmation flow only | deny | deny |
| active, no subscription | account and subscribe routes | Checkout allowed if trial unused; Portal only with Customer | deny |
| active, valid trial | account and Portal | duplicate Checkout denied | allow until verified `trial_end` |
| active, active subscription | account and Portal | duplicate Checkout denied | allow until verified period end |
| suspended | safe status/sign-out | deny | deny |
| deletion requested | deletion status/sign-out; support path | ordinary Checkout/Portal deny | deny |
| missing/malformed account | fail closed | deny | deny |
| deleted | no sign-in | provider/legal cleanup only | deny |

## Confirmation and recovery evidence

Production must prove:

- unconfirmed accounts cannot sign in or subscribe;
- one confirmation creates exactly one minimal application account;
- expired, reused, altered, cross-environment, and open-redirect links fail;
- known and unknown recovery requests have equivalent public responses;
- recovery links are single-use and expire;
- the new password works and the old password fails;
- session revocation behavior matches policy;
- no token, link, password, or email enters repository evidence.

The old-password, new-password, and unknown-account equivalence checks deferred
in Preview are mandatory for Production.

## RLS and negative tests

For synthetic accounts A and B:

- A cannot read or mutate B's account, entitlement, subscription summary, or
  deletion request, and B cannot do the reciprocal operations;
- neither can read raw billing Customer, Subscription, webhook, or private
  policy tables;
- forged user, Customer, Subscription, Price, trial, status, or entitlement
  values are ignored or denied;
- anonymous and unconfirmed users cannot access account or game assets;
- suspended/deletion-requested accounts lose game and billing actions;
- service operations reject mismatched ownership tuples;
- no table, form, RPC, API, log event, or fixture accepts prohibited
  educational or progress data.

## Production email

Use a MathNexa sender on an owner-controlled domain through approved Supabase
custom SMTP. Verify SPF, DKIM, DMARC review, confirmation, recovery, expiry,
bounce, spam placement, rate limits, tracking disabled unless approved, and
provider retention/privacy controls. Store only sanitized delivery evidence.

## Deletion

A deletion request immediately denies game access and new billing actions.
Operator workflow must resolve/cancel the Stripe subscription, retain only
legally required billing evidence, remove or pseudonymize application linkage,
delete the Auth user, and record sanitized completion evidence. Permanent
execution remains disabled until retention, refund, and operator policies are
approved.
