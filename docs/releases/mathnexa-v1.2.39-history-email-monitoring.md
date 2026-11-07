# MathNexa v1.2.39 — incident history, email delivery and monitoring review (2026-11-07)

Read-only investigation behind the v1.2.39 candidate (`mathnexa-v1.2.39-system-health-candidate.md`). Nothing in
production was written, replayed, resent, released or reconfigured. Identifiers are 6-character suffixes; no address,
key, token or payload appears here.

## Sources reviewed

| Source | Access | What it gave |
|---|---|---|
| Prior Claude sessions: 22 transcripts of the release sessions (2026-10-10 to 11-07), the platform worktree sessions, this project's earlier sessions, and saved memory notes | read | Owner reports, past diagnoses, release work, test-account practice |
| Git: tags v1.2.20 to v1.2.38, per-release diffs, release records, security and phase documents | read | Which release changed what |
| Production database, read-only (`auth.users`, `auth.flow_state`, `auth.one_time_tokens`, webhook ledger, subscriptions, entitlements, analytics signals, resource files) | read | Sign-up, confirmation, link-opened and billing timelines |
| `auth.audit_log_entries` | readable, **empty** | Supabase writes the Auth audit trail to its log store, not this table |
| Vercel request logs (32-day retention, from 2026-10-06) | read | `/auth/callback` hits after every sign-up, sign-up form posts, webhook endpoint traffic, 5xx |
| Vercel runtime logs (7 days) | read | The platform's structured billing and security events |
| Stripe, restricted read-only key (earlier on 11-07) | read | Endpoint enabled, 0 undelivered of 72 events in 30 days |
| Public DNS (`mathnexa.com`, `auth.mathnexa.com`) and the public site | read | Sending-domain records, published support address |
| **Supabase Auth logs and hosted Auth settings** (SMTP host, sender, templates, link expiry, redirect list) | **not accessible** | Vault management token returns 401 (expired since at least 10-18); the Supabase CLI has no read command for them |
| **Resend email log and domain status** | **not accessible** | Both vault keys are sending-only by design (`restricted_api_key`) |
| Vercel request logs before 2026-10-06 | not accessible | Retention |

## Timeline (UTC)

| Date | Event | Evidence |
|---|---|---|
| 08-02 to 08-06 | System Health panel built (command center, Email row, storage/package/PDF/ZIP rows). Rules: Webhooks = any `failed`/`manual_review` row ever; Application = degraded on any such row; Email = attention on any failure signal ever; quarantine = all-time counts. Panel code then unchanged through v1.2.38. | de2d1dc, 7577e11, 8b8ad6e |
| 08-06 to 08-23 | 10 uploads quarantined (embedded JavaScript, automatic actions, bad thumbnail dimensions). Validator worked; none published, none downloaded. | diagnosis record |
| 08-31 | Server-side resend budget added; "no log drain / no alerts" recorded as an owner action (PH2-07, paused). | security phase 2 record |
| 09-26 | v1.2.15: the **production** project's bypass token appeared in CLI debug output and was rotated by the owner (staging was separate). | v1.2.15 record |
| **09-28 13:59** | First `trial_shape_conflict` manual review (second at 22:22). **Webhooks ATTENTION and Application DEGRADED begin here** and never clear, because the rule counted all-time rows. Local records matched Stripe 1–2 s later; no access impact. | webhook ledger |
| 10-02 | Phase 3A audit notes the 2 reviews and that the panel counts an obsolete `failed` state. | 47d232f |
| **10-04 21:45** | First email "failure": a resend 7 s after sign-up refused by the provider's 60-second limit; that account confirmed 35 s later. **Email ATTENTION begins here.** | analytics signals |
| 10-07 03:50 | Owner reported the identical panel. Diagnosis found the reconcile cron answering 308. Fixes written; at 07:31 the owner chose to fold the panel fix into Super Admin V2 (G, local, unreleased) instead of shipping it separately. Confined-bypass branch written, unmerged. | session transcript; 683d8ae |
| 10-11 to 10-15 | v1.2.21–v1.2.23 (Tug 3D): new staging review script puts the bypass secret in a URL query and in context-wide headers. | release diffs |
| 10-15 11:16 | Third manual review (a subscription now active and paid). 12:57: last confirmed sign-up until 11-07. | ledger; `auth.users` |
| to 10-18 06:17 | Reconcile cron answered 308 every day (webhooks kept projections in sync; no impact found). | v1.2.25 hotfix record |
| 10-18 | v1.2.24 (dependencies). v1.2.25 22:26: 24-hour trial shape and cron fix. | tags |
| 10-19 06:17 | First successful reconciliation sweep; daily since (7 of 7 in the last 7 days). | runtime logs |
| 10-22 20:34 | Sign-up `6c20b5` (Gmail). Resend pressed at +5 s and +10 s (provider-refused: the second "failure"). Link never opened. | DB; request logs |
| 10-27 00:22 | Sign-up `94ae64` (Gmail). Four more form actions and a sign-in attempt within 53 s. Link never opened. | DB; request logs |
| 11-01 | DNS checked (apex only); support address changed to the owner's mailbox; owner item "check the Supabase email sender" left open. | session transcript; v1.2.31 record |
| 11-05 to 11-07 | v1.2.35–v1.2.38 (Math Bingo Live): new Bingo staging scripts again put the bypass secret in a URL query and in context-wide headers. v1.2.35 changed sign-up copy only. | release diffs |
| 11-07 14:04 | Sign-up `228db7` (other domain, iPhone). Single submission. Link never opened. | DB; request logs |
| 11-07 14:10 | v1.2.39 read-only diagnosis; panel reproduced exactly. | diagnosis record |
| **11-07 15:46** | Sign-up `f0d06f` (Gmail, iPhone) **confirmed 20 s later** (`/auth/callback` 307 at 15:47:17), signed in, opened the subscription page; 15:51 checkout completed and `customer.subscription.created` **processed** — a 24-hour trial, the **first production trial since the v1.2.25 fix**, entitlement `trial-active`. | DB; request logs; ledger |
| 11-07 17:46 | Staging lifecycle (Stripe test clocks) passes with the confined harness; Bingo staging review 42/42. | candidate record |

No release from v1.2.21 to v1.2.38 touched the panel, the confirmation callback, the email templates, migrations of
`auth`, or (on any record) the hosted Supabase Auth settings. The only production changes between the last confirmed
sign-up (10-15) and the first unconfirmed one (10-22) were v1.2.24 (dependencies) and v1.2.25 (billing). No recorded
Claude session was active at any of the unconfirmed sign-ups; since 09-27, automated production checks use synthetic
`@example.invalid` accounts created through the admin API, which send no email.

## What was fixed, what remains, who was affected

| Warning | Underlying problem | Fixed by | Remaining | Customers affected |
|---|---|---|---|---|
| Webhooks ATTENTION | 3 trial-shape reviews (09-28, 09-28, 10-15), each overtaken 1–2 s later | Trial shape: v1.2.25 (proven in production 11-07 15:51). Panel: v1.2.39 | Nothing; the 3 rows stay as historical records | None: records matched Stripe; access correct |
| Application DEGRADED | Mirror of the webhook count, not an application check | v1.2.39 | Nothing | None: 0 HTTP 5xx and 0 runtime errors in 7 days |
| Email ATTENTION | Two provider-refused resends inside 60 s, counted forever | v1.2.39 (countdown from sign-up; pacing is not failure) | Provider delivery logs unreadable | See below |
| (no panel row) | Reconcile cron 308 until 10-18 | v1.2.25; v1.2.39 adds a Subscription sync row | Nothing | None found |
| PDF quarantine 10 | Legitimate August quarantines | Working as designed; v1.2.39 splits awaiting / historical | Owner decision on the 3 non-archived drafts | None: none published |

## Email delivery investigation

**How mail is sent.** Supabase Auth sends confirmation mail itself (the app has no mail code path for sign-up). The
hosted SMTP settings are unreadable; staging is documented as Resend SMTP (`smtp.resend.com:587`) from
`auth.mathnexa.com`, and production DNS carries exactly the records Resend needs for that domain. The flow is PKCE:
`signUp(emailRedirectTo=https://mathnexa.com/auth/callback?next=…)` → Supabase emails a `pkce_` link → Supabase verifies
it, confirms the address and redirects to `/auth/callback?code=…` → the app exchanges the code.

| Item | Finding |
|---|---|
| Supabase Auth email logs | **UNKNOWN** — inaccessible (management token 401) |
| Custom SMTP configuration | **UNKNOWN** directly; evidence points to Resend via `auth.mathnexa.com` |
| Resend delivery logs, suppressions, bounces, complaints | **UNKNOWN** — keys are sending-only |
| Sending-domain verification | Resend's own status unreadable; every DNS record Resend checks is present |
| DKIM | Present: `resend._domainkey.auth.mathnexa.com` |
| SPF | Present on the bounce domain: `send.auth.mathnexa.com` → `v=spf1 include:amazonses.com ~all`, bounce MX `feedback-smtp.us-east-1.amazonses.com` |
| DMARC | **Missing** for `auth.mathnexa.com` and `mathnexa.com` (allowed for low volume; recommended) |
| Rate limits | Provider refuses a resend to the same address within 60 s (the two "failures"); sign-up volume (≤ 6 a day) is far below any hourly cap |
| Delivery delay | None seen: median time from send to confirmation about 21 s in September and October, 19 s in November |
| Link generation | Working: a PKCE flow row and a pending confirmation token exist for every sign-up; 11 links verified since 10-01 |
| Link expiry | Hosted value unknown; irrelevant here — none of the three links was ever opened, not even late |
| Redirect | `/auth/callback` answered all 14 callback requests seen since 10-15 (8 confirmations, plus duplicates from mail scanners and repeat taps); confirmed users then signed in |
| App resend behaviour | v1.2.38 let users resend at once, the provider refused, users saw an error and the panel counted a failure. Fixed in v1.2.39 |
| Historical rates | Aug 3/3, Sep 16/19, Oct 11/15, Nov 1/2 (31 of 39 overall). 8 unconfirmed since 09-21: 5 before 10-16, 3 after |

**The three unconfirmed sign-ups since 10-15.** Each was accepted by the SMTP provider (`confirmation_sent_at` is set
only after acceptance). None was ever opened: no PKCE auth code issued, the confirmation token is still pending, and the
production request log holds no `/auth/callback` request in the 24 hours after any of them that is not explained by
another account's confirmation (a failed or expired click would also appear there). Two of the three people (10-22,
10-27) pressed resend or tried to sign in within a minute, so they were looking for the email. A delivery problem for
specific mailboxes (spam folder, delay, suppression) therefore cannot be ruled out without the provider log — and an
email outage is ruled out: the same path delivered a Gmail confirmation that was clicked 20 s after sign-up today.

**Verdict.** No defect found in link generation, the callback or the application; the one confirmed defect (resend
inside the provider limit) is fixed in v1.2.39 and covered by the phase 7B e2e (Chromium and WebKit, local Supabase with
captured mail). Inbox delivery of the three emails is UNKNOWN. No customer email was sent or resent.

**Minimum owner actions to close it.**

1. Resend dashboard → Emails, filter 2026-10-22 20:34, 10-27 00:22 and 11-07 14:04 UTC: read each status (delivered,
   bounced, complained, suppressed, delayed). Also confirm `auth.mathnexa.com` shows Verified. (No read-only API scope
   exists; a full-access key would grant writes, so the dashboard is the least-privilege path.)
2. Supabase dashboard → Logs → Auth for the same times, or create a personal access token and store it as
   `SUPABASE_ACCESS_TOKEN` with `scripts/update-phase7d-vault.ps1` so the diagnosis reads Auth logs and settings itself.
3. Add DMARC: `_dmarc.mathnexa.com TXT "v=DMARC1; p=none; rua=mailto:<owner mailbox>"` (DNS; free; gives daily
   aggregate reports of who receives mail that passes or fails authentication).
4. Optional: if the three people should get another chance, Super Admin can resend their confirmation (an owner decision:
   it sends customer email).

## Monitoring and alerting review

| Area | What exists today | Gap |
|---|---|---|
| Application errors | Vercel request and runtime logs (CLI-queryable; request records kept 32 days); System Health Application row | No push alert |
| Email delivery failures | Resend failures recorded as aggregate signals; System Health Email row (v1.2.39: confirmations vs sign-ups) | A failed sign-up send records nothing; provider-side bounces and suppressions invisible |
| Webhook failures | Ledger states; `webhook-processing-failed` / `webhook-manual-review` events; System Health Webhooks row; Stripe emails the account owner after repeated endpoint failures | No app-side push alert |
| Reconciliation failures | Daily cron emits `reconciliation-sweep-completed` (7/7 days) and `subscription-reconciliation-unavailable`; v1.2.39 Subscription sync row turns to attention after 76 h without a sweep | No push alert |
| Unexpected access denials | `authorization-denied` security event (0 in 7 days) | No alert |
| Quarantined files | `resource_files` validation state; System Health quarantine rows | Adequate (owner reviews uploads) |
| Failed scheduled jobs | One cron; failures visible in request logs; Subscription sync row catches a dead cron within ~3 days | No push alert |
| Authentication anomalies | Security events (login failures, rate limits, spray suspicion, limiter unavailable) in runtime logs | No drain or alert; `webhook-signature-invalid` (64 in 7 days) is our own release certification probes (60 `MathNexa-Hotfix-Certification`, 11 curl), so an alert on it would need them excluded |

Logging is adequate and privacy-safe (structured events refuse any detail key resembling a credential or email). What
is missing is **anything that tells the owner without opening the panel**. Proposal, using existing infrastructure, no
new paid service, nothing customer-identifying:

- **P1 — daily health digest (recommended).** After the existing 06:17 reconciliation cron, evaluate the same
  `evaluateSystemHealth()` the panel uses and send one email to the owner's support address only when a row has been
  attention, degraded, unavailable or without a recent signal for more than 24 hours, or changed state. Existing Resend
  sending key; 0–1 email a day; row names and states only. Needs owner approval (it sends email).
- **P2 — record sign-up send failures** as email signals (provider pacing as `unavailable`, SMTP/5xx as `failure`), so a
  total email outage turns the Email row amber instead of only going quiet. About ten lines in `signUpAction`.
- **P3 — DMARC aggregate reports** (owner action 3 above): free, external evidence of delivery authentication.
- **P4 — restore provider read access** (owner action 2): the diagnosis then reads Auth logs automatically.
- Not proposed: a paid log drain or third-party APM (PH2-07 stays owner-gated).

**Automated diagnostics delivered in v1.2.39** (read-only, no new service):

```bash
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/invoke-system-health-production-diagnosis.ps1 -OutFile diagnosis.json
```

```bash
node scripts/system-health-vercel-evidence.mjs --diagnosis diagnosis.json
```

The first reproduces every panel input plus the sign-up/link timeline, sending-domain DNS and provider access; the
second adds callback evidence for every unconfirmed sign-up, 7 days of structured events and 5xx counts. Together they
replace the probes this investigation had to write by hand.
