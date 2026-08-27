# MathNexa Universal Network Resilience — Strategy & Front-Door Study

Companion to `mathnexa-network-architecture-v1.2.md` (current state) and
`domain-reputation-and-categorization.md` (filter remediation). Nothing here is deployed to
production; every option below requires explicit owner approval.

## Phase 7 — Edge front-door options

### Option A — Cloudflare DNS only, Vercel origin unchanged
- Nameservers move to Cloudflare (grey-cloud). Traffic still terminates at Vercel.
- Compatibility: identical to today (same edge, same TLS). Security: adds DNSSEC option.
- School-firewall effect: **none** — the served infrastructure is unchanged.
- Complexity: low; Rollback: revert nameservers. Cost: free tier.
- Verdict: only worth doing for DNSSEC/DNS-management preferences, not for reachability.

### Option B — Cloudflare reverse proxy (orange-cloud) in front of Vercel origin
- Browser → Cloudflare edge (Cloudflare cert for mathnexa.com) → origin pull from Vercel.
- Compatibility: high for this app (pure HTTPS, no WebSockets, no streaming requirements;
  auth cookies are first-party and survive proxying; Stripe/Supabase are separate origins,
  unaffected). Vercel officially discourages fronting its edge but it functions; must set
  SSL mode Full (strict) and keep caching conservative (`no-store` admin, default others).
- School-firewall effect: changes the served IP space/TLS fingerprint from Vercel's to
  Cloudflare's — **only helps if a district blocks Vercel infrastructure specifically**
  (diagnostic Case E). Does nothing against a name/category block.
- SEO: neutral (same canonical). Safari: standard. Complexity: moderate; two vendors in the
  serving path; Vercel deployment protection/skew features degrade.
- Rollback: flip DNS records back (minutes at low TTL).

### Option C — Application moved to Cloudflare Workers (vinext / OpenNext)
- Full replatform. Compatibility must be proven per adapter (see POC notes in the final
  report: local `wrangler dev` POC from the exact V1.2.0 tree).
- Risks: Next 16 App Router + server actions + @supabase/ssr cookie flows + Stripe SDK on
  workerd runtime; build/deploy pipeline rewrite; Node-API gaps.
- Justified only if evidence shows Vercel-network blocking at multiple districts AND
  Option B proves insufficient.

### Option D — Dual-provider / controlled failover
- Primary Vercel + warm standby (Cloudflare Workers or a second host) with health-based DNS
  failover (low TTL A-record swap or Cloudflare load-balancer with origin pools).
- Feasibility: real but the most operationally expensive: every release must build+deploy
  twice; env parity must be audited every change; Supabase/Stripe remain single external
  dependencies either way (they are the actual availability ceiling).
- Split-brain risk is low for this app (no server state outside Supabase), so failover is
  clean if deployments are version-locked together.

## Phase 8 — DNS resilience study

- Current: Vercel-registered domain, Vercel authoritative DNS, IPv4-only A records, no CAA,
  DNSSEC not enabled (Vercel DNS does not sign; enabling DNSSEC requires moving
  authoritative DNS, e.g. Option A).
- Recommendations (owner-approval items, none urgent for the school issue):
  1. Keep TTLs low-ish (≤300 s) on A records whenever a migration window approaches.
  2. Add a `CAA` record (`letsencrypt.org` + the Google Trust Services CA Vercel uses) once
     DNS lives somewhere that supports it — modest hardening, zero user impact.
  3. IPv6: publishing AAAA is optional; today's IPv4-only posture avoids broken-IPv6
     school-network paths entirely. Revisit only with a provider that guarantees clean v6.
  4. DNSSEC: nice-to-have via Option A; not implicated in the reported failure.

## Phase 14 — Provider-redundancy / disaster-recovery plan (design only)

- **RTO target:** ≤ 60 minutes for provider-level outage (redeploy prebuilt artifact to the
  standby and swap DNS at 300 s TTL). **RPO:** 0 for application code (git tags); user data
  lives solely in Supabase (independent of the web host), so a web-host failure loses nothing.
- Mechanics: keep the release artifact reproducible from the tag (`v1.2.0` → build →
  deploy anywhere); document per-provider env var sets; never fork content between
  providers; assets are all in-repo (no external asset store to sync).
- Rollback: the same mechanism in reverse; production rollback procedure already recorded in
  `docs/releases/mathnexa-v1.2.0-release-record.md`.

## Phase 15 — Global health monitoring (design only; not enabled)

- Probe set: DNS resolve, TCP 443, TLS handshake, `GET /network-check` (expects the literal
  "Connection to MathNexa successful."), `GET /` (expects 200 + "MathNexa"), `GET /access`
  (expects the authorized-code heading), `GET https://showme.mathnexa.com/api/health`.
- Frequency 1–5 min from ≥3 regions; alert only on 2 consecutive failures from ≥2 regions
  (kills single-network false positives). Any uptime vendor (UptimeRobot/BetterStack/
  Checkly free tiers) or a scheduled GitHub Action can run this; enabling one is an owner
  choice — no production change involved.

## Recommendation ladder (matches the diagnostic cases)

1. **Now (no evidence yet): Option A′ = keep Vercel exactly as-is + finish domain
   categorization** (`domain-reputation-and-categorization.md`) + district allowlist packet.
   The measured architecture already needs only `mathnexa.com` over vanilla HTTPS.
2. **If school diagnostics show Case E (Vercel-infra block):** pilot Option B on a staging
   hostname first, then owner-approved cutover of mathnexa.com to Cloudflare-proxied DNS.
3. **Option C/D:** only with multi-district evidence and after B under-performs. Never as a
   speculative move.
