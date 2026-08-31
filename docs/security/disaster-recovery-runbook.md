# MathNexa Disaster Recovery

What is backed up, what is not, and what recovery actually requires. Written
from what the providers do by default, because nothing bespoke has been built.

**Nothing in this document was executed.** Creating backups would need access and
spend this work does not have; the gaps are recorded rather than closed.

## What holds state

| Asset | Where | Backed up by | Recovery |
|---|---|---|---|
| Accounts, entitlements, subscriptions, admin records, audit log | Supabase Postgres | Supabase automated backups (plan-dependent) | Point-in-time or daily restore from the dashboard |
| Uploaded resources, CMS media, game packages | Supabase Storage | **Verify separately** — object storage is often NOT covered by database backups | Re-upload from source, if source exists |
| Subscription and payment records | Stripe | Stripe (system of record) | Stripe is authoritative; our rows are a cache |
| Application code | GitHub, plus `v1.2.x` tags | Git | `git checkout v1.2.4` |
| Deployment artifacts | Vercel | Vercel retains prior deployments | `vercel rollback <deployment-id>` |
| **Environment variables** | Vercel | **Not backed up anywhere** | Manual re-entry from the owner's password manager |
| Secrets | Vercel + providers | Not backed up | Rotate and re-enter |

## The two real gaps

**1. Environment configuration has no backup.** Roughly 52 production variables
exist only in the Vercel project. If that project were deleted, the application
could be rebuilt from git in minutes and would then sit unable to start, because
nothing records what the variables were. Values live in the owner's password
manager or nowhere.

*Owner action:* keep an offline inventory of variable **names** and where each
value is obtained. Names are not secrets; the inventory is what turns an
afternoon into a week.

**2. Storage backup coverage is unverified.** Supabase Storage backup policy
differs from Postgres and depends on the plan. Uploaded PDFs and game packages
may have no copy outside the bucket.

*Owner action:* confirm the plan's Storage retention. If it is not covered,
decide whether source files are retained elsewhere.

## Recovery procedures

**Bad deployment.** Roll back — cheap, fast, reversible:
`npx vercel rollback dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd` (the retained v1.2.3
build). Confirm from the deployment ID, never from `/api/health`, whose build
field is set independently and is currently stale.

**Database corruption or loss.** Restore from the Supabase dashboard, then
reconcile entitlement against Stripe — Stripe is the system of record for
subscriptions, so a restore to an earlier point recovers correctly by replaying
from it. Rotate `SUPABASE_SECRET_KEY` if the loss was not clearly accidental.

**Total Vercel project loss.** Recreate the project, re-enter every environment
variable (see gap 1), redeploy the `v1.2.4` tag, re-point the domain. The long
pole is the variables, not the code.

**Supabase project loss.** The most serious case: it holds accounts and
entitlements. Restore from backup; if none exists, accounts must be recreated and
entitlement rebuilt from Stripe. Users would need to reset passwords.

## Recovery objectives — proposed, not agreed

No RPO or RTO has been agreed. Reasonable starting positions for a paid
classroom product:

| Scenario | Proposed RTO | Proposed RPO |
|---|---|---|
| Bad deployment | 15 minutes | 0 — rollback loses nothing |
| Database restore | 4 hours | 24 hours, or better with point-in-time |
| Full project rebuild | 1 day | Bounded by the above |

These are for the owner to accept or change; they are written down so the
conversation has a starting point.

## What would make this materially better

1. An offline inventory of environment variable **names** and their source.
2. Confirmation of Supabase Storage backup coverage.
3. One rehearsed restore into a scratch project — an untested backup is a
   hypothesis, not a backup.
