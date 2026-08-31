# MathNexa Incident Response

Written to be usable at 3am by whoever is holding the pager. Each section is
detect → contain → preserve → eradicate → recover → verify → communicate.

**No secret values appear in this document, and none should be pasted into an
incident record.** Refer to secrets by variable name only.

## Before anything else

| Fact | Value |
|---|---|
| Production | `https://mathnexa.com` |
| Production project | `mathnexa-platform-production` / `prj_frhZ7EKPTnPJot97ioxNVv3oFi33` |
| Current release | `v1.2.4` → `7c01ff2`, deployment `dpl_7dTiNcKyhWaZKuGGMyAhnDgLypbs` |
| Rollback target | `dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd` (the v1.2.3 build, retained and Ready) |
| Staging | `mathnexa-platform-staging` / `prj_O61Cyx9WMjc0jljpM9erCiSXsJA0`, gate locked |

**Rollback is one command and should not be agonised over.** From a worktree
linked to the production project:

```bash
npx vercel rollback dpl_DJB9tXsqXMF5F9WEgQgy2YfaN2Jd
```

Rolling back is cheap and reversible. Leaving a compromised build serving traffic
while deciding is not.

**Do not verify what is deployed from `/api/health`.** Its `build` field is set
independently and is currently 34 commits stale. Confirm from the Vercel
deployment ID.

---

## 1. Suspected credential attack on customer accounts

**Detect.** A rise in `auth-rate-limited` or `auth-login-failed` in the runtime
logs; any `auth-spray-suspected`; customer reports of unexpected lockouts.

**Contain.** The limiters are already enforcing — that is what produced the
signal. If the volume is beyond them, add a Vercel Firewall rule on the auth
paths keyed on **`ja4`**, not `ip`: a school shares one address, and an
address-keyed rule will lock out a classroom.

```
path starts with /sign-in, /sign-up, /forgot-password, /access
action rate_limit, key ja4, 60 requests / 60s, exceed -> challenge
```

Stage it, review the draft, then publish.

**Preserve.** Runtime logs are short-lived — export the relevant window before
doing anything else. `admin_auth_rate_limits` holds the counters.

**Eradicate / recover.** If specific accounts were reached, revoke their sessions
via the admin console's `revoke-sessions` operation and require a password reset.
A password change already revokes every other session automatically.

**Verify.** `auth-rate-limited` returns to baseline; no `auth-password-changed`
for accounts the owner did not expect.

**Communicate.** Only affected account holders, and only once the scope is known.

---

## 2. Suspected secret leak

**Detect.** A secret appears in a log, a bundle, a screenshot, a support ticket,
a public repository, or a provider alert.

**Contain first, investigate second.** Rotate before establishing how it leaked.

| Secret | Rotate at | Notes |
|---|---|---|
| `SUPABASE_SECRET_KEY` | Supabase dashboard | Also the rate-limiter's fallback key; rotating resets limiter counters, which is harmless |
| `STRIPE_SECRET_KEY` | Stripe dashboard | Roll, do not delete, until the new key is deployed |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook settings | Webhooks fail closed until redeployed — expected |
| `MVH_ADMIN_CSRF_SECRET` | Regenerate | Invalidates in-flight admin CSRF tokens; admins re-submit |
| `MATHNEXA_SCHOOL_ACCESS_CODE` | Regenerate | Every school needs the new code — plan the comms |
| `MVH_STAGING_ACCESS_TOKEN` | Regenerate | Staging only |
| `MVH_AUTH_RATE_LIMIT_SECRET` | Regenerate | Resets limiter counters only |

**Preserve.** Record where it was seen and for how long. **Do not rewrite git
history** — that destroys evidence and breaks every clone. If a secret is in
history, rotate it and leave the history alone.

**Verify.** Re-run the standing scans: `npm run test:security` for the bundle
audits, and the history scan for the pattern in question. Confirm the old value
no longer authenticates against the provider.

---

## 3. Admin compromise

Treat as the most serious scenario: admin can grant entitlements and read
customer records.

**Detect.** `admin-auth-failed` volume; unexpected rows in `admin_audit_log`;
an admin operation nobody performed.

**Contain immediately.** Set the admin emergency flag —
`admin-emergency-disabled` in `platform_feature_flags` — which makes
`inspectAdminAccess()` return `disabled` and closes the entire console without a
deploy. Then revoke admin sessions.

**Preserve.** `admin_audit_log` is the record: admin id, action, target, IP,
user agent, timestamp. Export before any cleanup.

**Eradicate.** Revoke the compromised `admin_users` row (`revoked_at`), reset that
person's Supabase credentials, and re-enrol MFA from scratch.

**Recover.** Review every `admin_audit_log` entry in the window, especially
`grant-complimentary`, `set-status` and refund operations. Reverse what was not
authorised.

---

## 4. Payment webhook attack

**Detect.** `webhook-signature-invalid` (should be zero in steady state) or
`webhook-replay-detected`.

**Assess honestly.** Both events mean the controls *worked* — signature
verification and idempotency refused the request. A burst is reconnaissance, not
a breach. Investigate; do not panic.

**Contain.** If it becomes a flood, `BILLING_WEBHOOK_ENABLED=false` stops
processing; entitlement is unaffected because it is read from our own database.
Stripe retries, so nothing is lost.

**Verify.** Reconcile entitlement rows against Stripe subscriptions for the
window.

---

## 5. Database breach

**Detect.** Supabase alert, anomalous query volume, or data appearing elsewhere.

**Contain.** Rotate `SUPABASE_SECRET_KEY` immediately — that is the credential
which bypasses RLS. Pause the project if exfiltration is ongoing.

**Assess exposure.** MathNexa stores email addresses, entitlement state and
billing references. It stores **no** student names, rosters, grades or gameplay
progress — the consumer sign-up refuses those fields by design, which materially
limits the blast radius.

**Communicate.** Email addresses plus subscription status is personal data;
notification obligations apply. Involve the owner before any statement.

---

## 6. Malicious or unintended deployment

**Detect.** A production deployment nobody recognises, or `mathnexa.com` serving
an unexpected deployment ID.

**Contain.** Roll back first (command above), investigate after.

**Preserve.** Do not delete the suspect deployment — it is the evidence.

**Eradicate.** Rotate the Vercel token that performed it, review team access,
and confirm no branch protection was bypassed.

---

## 7. Staging exposure

**Detect.** Staging returns anything other than an empty-body `404` to an
anonymous request.

**Contain.**

```bash
printf 'true' | npx vercel env add MVH_STAGING_ACCESS_REQUIRED production
npx vercel deploy --prod --yes    # staging project; env changes need a new build
```

**Never set this through a PowerShell pipeline** — it appends a newline, and that
is precisely how MN-09 happened. Always confirm afterwards:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://mathnexa-platform-staging.vercel.app/
```

Expect `404` with a zero-byte body. The command reporting success is not proof.

---

## 8. Dependency zero-day

**Detect.** Advisory, `npm audit`, or provider notice.

**Assess before acting.** Determine whether the package is a *production*
dependency: `npm audit --omit=dev`. A dev-only advisory is not a production
incident. `docs/security/sbom-production.cdx.json` lists exactly what ships.

**Contain.** If reachable in production, pin a patched version through the
`overrides` block in the root `package.json` — that mechanism is already in use
for five packages and does not require the upstream to release.

**Verify.** `npm audit --omit=dev` clean, `npm run build` succeeds, regenerate
the SBOM, and confirm the resolved version with `npm ls <package>`.

---

## Evidence handling

- Export runtime logs **first**; retention is short and they disappear.
- Never paste a secret into an incident record, a ticket, or a chat.
- Record deployment IDs and commit SHAs, not screenshots of dashboards.
- Keep `admin_audit_log` and `admin_auth_rate_limits` intact until the incident
  closes.
