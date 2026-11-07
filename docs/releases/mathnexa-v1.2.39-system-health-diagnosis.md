# MathNexa System Health — read-only production diagnosis (2026-11-07)

Phase 1 of the System Health investigation. Everything here was gathered read-only: SELECT statements through the
session pooler, Stripe retrieve/list calls with the restricted `rk_live_` key, Vercel deployment and log reads, and a
public `GET /api/health`. Nothing in production was written, replayed, released or reconfigured. Identifiers are
shortened to their last 6 characters; no address, key, token or payload appears.

## Production identity

| Item | Value |
|---|---|
| Domain | `mathnexa.com` → `dpl_BrcgEH24X3AaoFqdteCqdaXfF38o` (project `mathnexa-platform-production`, Ready, created 2026-11-07 06:44 UTC) |
| Release | v1.2.38, commit `093f5a6a506a5646939ce87b297cb64fff95aa6d` (`/api/health` build field and the v1.2.38 release record agree) |
| Health endpoint | `200 {"status":"ready","environment":"production-platform","payments":"live"}` |
| Database | Supabase project `mathnexa-platform-production`, platform status `ACTIVE_HEALTHY`; 44 migrations, latest `20261108110000` |
| System Health code | `lib/admin/dashboard.ts` and `components/admin/admin-command-center.tsx` are byte-identical between v1.2.20 and v1.2.38 |

## How the panel decides each row (v1.2.38)

| Row | Rule in `dashboard.ts` | Window |
|---|---|---|
| Application | `operational` only when storage is healthy **and** the webhook "failure" count is 0; otherwise `degraded` | all time |
| Email | `attention` when any `email-confirmation-failure` / `email-recovery-failure` signal exists | all time (signals are kept 400 days) |
| Webhooks | `attention` when any receipt is in `failed` or `manual_review` (`failed` no longer exists: the processing-state CHECK refuses it) | all time |
| Private storage | `healthy` when the four required private buckets are listed | live |
| Game package validation | `no-packages` when `game_packages` is empty | live |
| PDF quarantine | count of `resource_files` in `quarantined` | all time |
| ZIP quarantine | count of `game_package_quarantine_events` | all time |

Application is not an application check: it mirrors the webhook count. Retryable failures, processing receipts with an
expired lease and receipts that were never claimed are not counted at all.

## Findings

### Application: DEGRADED — incorrect classification, no application failure

- The only input that makes it `degraded` today is the webhook count (3). Storage is healthy.
- The application itself is healthy: production returned **0** HTTP 5xx responses and **0** runtime `error` / `fatal`
  logs in the last 7 days (positive control: 69 4xx responses in the last 24 hours, all bots, release probes and game
  "room not found" answers). `/api/health` is ready; the database answers; feature flags (maintenance, checkout and admin
  emergency switches) are all off.
- The daily reconciliation now runs: the Vercel scheduler received **200** at 06:17:42 UTC on every day from 11-01 to
  11-07 (the v1.2.25 fix). Every 401 on that path in the window is a release-certification probe proving the route
  fails closed.

### Webhooks: ATTENTION — three historical, superseded manual reviews; delivery is healthy

| Receipt | Event | Reason | Event time (UTC) | Overtaken by | Local vs Stripe |
|---|---|---|---|---|---|
| `..1a67ac` | `customer.subscription.created` | `trial_shape_conflict` | 2026-09-28 13:59:59 | processed `customer.subscription.updated` 2 s later | canceled = canceled |
| `..97da3f` | `customer.subscription.created` | `trial_shape_conflict` | 2026-09-28 22:22:50 | processed update 1 s later; daily reconciliation 2026-11-07 06:17 | active = active, period to 2026-11-29 |
| `..b176e3` | `customer.subscription.created` | `trial_shape_conflict` | 2026-10-15 11:16:18 | processed update 1 s later; daily reconciliation 2026-11-06 06:17 | active = active, period to 2026-11-16 |

- Cause: the trial was created as checkout time + 24 h while Stripe stamps `trial_start` 1–2 s later. Fixed in v1.2.25
  (2026-10-18). No subscription has been created since 2026-10-15, so the fix has not yet been exercised by a real trial.
- Stripe (restricted read-only key): one live endpoint, `mathnexa-platform-production.vercel.app/api/billing/webhook`,
  `enabled`, API `2026-07-29.dahlia`, 7 event types; **0** undelivered events and **0** events with pending deliveries
  among 72 events in 30 days.
- Ledger: 37 receipts (30 processed, 4 ignored, 3 manual review), 0 retryable, 0 pending, 0 expired leases, 0 replays;
  last processed 2026-11-06 23:19 UTC. Both Stripe deliveries in the last 7 days answered 200.
- Customer impact: none. All three subscriptions match Stripe; the two active subscribers hold
  `subscription-active` entitlements to their period ends.

### Email: ATTENTION — the trigger is two throttled resends; delivery since 2026-10-15 is unverified

- The two recorded "failures" (2026-10-04 21:45 and 2026-10-22 20:34 UTC) are confirmation **resends** 7 s and 10 s after
  sign-up. Supabase Auth sends at most one confirmation per address per 60 seconds, so both were refused by pacing, not
  by delivery. The 10-04 account confirmed 35 s later. The resend dialog allowed the click because sign-up cleared the
  countdown (fixed by the cooldown change on branch `75673fb`, not yet shipped).
- Delivery evidence: until 2026-10-15, 21 of the 25 sign-ups in the 45-day window confirmed their emailed link, all but
  one within 9–82 s of creation (the other after a day). **Since 2026-10-15 13:00 UTC no account has confirmed.** Three accounts were created since
  (2026-10-22, 2026-10-27, 2026-11-07 14:04 UTC); each has a `confirmation_sent_at`, which Supabase Auth writes only after
  its SMTP provider accepted the message (a failed send rolls the sign-up back). So the provider accepted all three;
  whether they reached an inbox, bounced or were filed as spam is not visible to the application.
- UNKNOWN (owner check needed): the production Resend runtime key may only send (it is refused for read calls), and the
  vault's Supabase management token returned 401, so neither the provider's delivery log nor Supabase Auth's settings
  and logs could be read. The owner can check both dashboards; see "Owner actions".
- Customer impact: possible, unconfirmed. If confirmation emails are not reaching inboxes, new sign-ups cannot confirm
  and therefore cannot sign in or start a trial. The three unconfirmed accounts since 10-15 are consistent with that,
  but also with normal abandonment (4 of 25 earlier sign-ups never confirmed).

### PDF quarantine: 10 — legitimate security quarantines, all historical, no customer exposure

The validator is structural (`phase8d-pdf-structure-v1`, `phase8d-image-magic-v1`); there is no malware scanner. Every
file below sits in the private `resource-quarantine` bucket, has never been downloaded, and matches no accepted file
by hash. No published resource uses any of them.

| File | Role | Quarantined (UTC) | Rule | Resource state | Assessment |
|---|---|---|---|---|---|
| `..e01f15` | homework PDF | 2026-08-06 22:07 | `pdf-javascript` | ready for review (never published) | true policy violation (embedded JavaScript) |
| `..95c8e0` | homework PDF | 2026-08-22 04:23 | `pdf-javascript` | draft | true policy violation |
| `..ad18c2` | thumbnail (WebP) | 2026-08-22 04:31 | `invalid-dimensions` | draft | format rule, not a security risk |
| `..f92b01` | homework PDF | 2026-08-22 19:37 | `pdf-javascript` | archived (a newer version exists) | true policy violation, historical |
| `..ae3baa` | answer-key PDF | 2026-08-22 19:37 | `pdf-javascript` | archived | true policy violation, historical |
| `..efdbc5` | homework PDF | 2026-08-22 19:38 | `additional-actions` | archived | true policy violation, historical |
| `..b6dac6` | homework PDF | 2026-08-22 20:42 | `pdf-javascript`, `additional-actions` | archived | true policy violation, historical |
| `..d4a296` | homework PDF | 2026-08-22 22:07 | `additional-actions` | archived | true policy violation, historical |
| `..a58e3b` | homework PDF | 2026-08-23 02:39 | `pdf-javascript` | archived | true policy violation, historical |
| `..bba254` | homework PDF | 2026-08-23 09:44 | `pdf-javascript` | archived | true policy violation, historical |

- "True policy violation" means the file contains what the policy forbids (JavaScript or automatic actions). Whether the
  script is malicious was not assessed: the files were not downloaded or opened, and nothing should release them.
- Recovery path for any lesson still wanted: re-export the PDF without scripts or form actions and upload it as a new
  version; the validator then accepts it. Quarantined bytes are never released.
- The count is current (the rows exist) but stale as a warning: 7 belong to archived resources and 3 to abandoned
  August drafts.

### Healthy rows (verified)

- **Private storage: HEALTHY** — all four required private buckets exist (`resource-files`, `resource-quarantine`,
  `game-packages`, `game-package-quarantine`); 294 objects in `resource-files`, 10 in `resource-quarantine`.
- **Game package validation: NO PACKAGES** — accurate: 0 packages, 0 package assets; all six published games are
  internal or canonical.
- **ZIP quarantine: 0** — accurate: 0 package quarantine events.

## Active incident assessment

No active production incident is confirmed. Payments, webhooks, reconciliation, storage and the application are
working. The single open risk is email deliverability since 2026-10-15, which needs the provider's delivery log.
No containment action is needed while that is checked; the check itself is read-only.

## Owner actions (read-only checks)

1. Resend dashboard → Emails: the confirmation messages sent on 2026-10-22, 2026-10-27 and 2026-11-07 — delivered,
   bounced, or complained? Domains: is the sending domain still verified?
2. Supabase dashboard → Authentication → Logs for the same times, and Authentication → SMTP settings (custom SMTP still
   enabled, sender domain matches the verified Resend domain).
3. If the 2026-11-07 14:04 UTC sign-up was the owner's own test, report whether the confirmation email arrived.
4. Optional: refresh the vault's `SUPABASE_ACCESS_TOKEN` so Auth logs can be read by the diagnosis tooling.

## Remediation plan (staging only until production approval)

1. A truthful System Health model (based on the 2026-10-06 design `187ddc7`): per-row state from evidence
   (healthy / attention / degraded / unavailable / no recent signal / no packages), last success, last failure, last
   checked, reason and action; superseded manual reviews shown as historical; retryable, stuck and unclaimed receipts
   counted; Application aggregated from named child states; quarantine informational with a breakdown.
2. Email: the resend countdown starts at sign-up and provider pacing is recorded as `unavailable` (`75673fb`); the
   Email row names the unconfirmed sign-ups since the last confirmed delivery.
3. The Analytics provider-health rows use the same rules, so the two pages cannot disagree.
4. Regression tests for every rule, staging verification of each state, and the full business regression suite.
