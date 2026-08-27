# MathNexa — District Network Allowlist & Compatibility Reference

Audited against live production (V1.2.0, 2026-08-26) by scanning the served HTML, every
first-load script/style chunk, the sign-in page, and the MAP Prep site for external hosts.

## Headline finding

**The MathNexa initial shell requires exactly ONE hostname: `mathnexa.com`.**
The served homepage, all first-load JS/CSS, images, and the sign-in page reference no other
origin — no third-party fonts (system font stacks), no analytics, no external CDNs, no
third-party scripts, no WebSockets, no QUIC requirement. This is already the ideal posture
for filtered school networks: if `mathnexa.com` is allowed, the site renders.

## Allowlist by function

| Priority | Hostname(s) | Port | Used for |
| --- | --- | --- | --- |
| **CRITICAL — initial page load** | `mathnexa.com` | 443/TCP | Everything on first render: HTML, JS, CSS, images, product thumbnails |
| **CRITICAL — initial page load** | `www.mathnexa.com` | 443/TCP | Redirect-only (308 → apex); allow so old links work |
| **CRITICAL — MAP Prep** | `showme.mathnexa.com` | 443/TCP | The MAP Prep product (self-contained: its own HTML/JS/audio; Desmos disabled) |
| **CRITICAL — auth** | `*.supabase.co` (the project's `<ref>.supabase.co`) | 443/TCP | Account session token refresh; sign-in/up submits go through mathnexa.com server actions, but the browser auth client may refresh against the Supabase host |
| **CRITICAL — subscriptions** | `checkout.stripe.com`, `billing.stripe.com` | 443/TCP | Stripe-hosted Checkout and Customer Portal (full-page navigations; MathNexa embeds no Stripe JS) |
| OPTIONAL — legacy links | `mathnexa-production.vercel.app`, `*.vercel.app` | 443/TCP | Old bookmarks/search results; permanent 308 redirect to mathnexa.com |
| Not used | fonts/analytics/CDN/third-party script hosts | — | None exist in the product |

Notes:
- Everything is HTTPS on standard TCP 443. No UDP/443 (QUIC/HTTP-3) requirement — the site
  negotiates HTTP/2 over TCP and publishes no `alt-svc`.
- DNS: `mathnexa.com` and `showme.mathnexa.com` publish IPv4 A records only (Vercel anycast,
  e.g. 216.150.x.x). No AAAA records exist, so no broken-IPv6 failure path is possible.
- TLS: TLS 1.3, ALPN h2, valid Let's Encrypt wildcard `*.mathnexa.com`, complete chain,
  no client-certificate requirement.

## Compatibility posture (Phase 5 audit result)

- Homepage renders with only `mathnexa.com` reachable — verified.
- Non-critical server-side reads (operational notices, game catalog) are time-boxed and fail
  open to empty states; a blocked/slow dependency cannot blank the page.
- Fonts, images, JS, CSS: all same-origin. No render-blocking third parties exist.
- No change is needed to meet the "initial shell requires only mathnexa.com" goal — V1.2.0
  already meets it.

## Likely school-filter causes, ranked

1. **Newly-registered-domain category block.** `mathnexa.com` was registered ~4 weeks ago
   (late July 2026). Most K-12 filter stacks (Palo Alto, Fortinet, Lightspeed, Securly,
   iBoss, Linewize/ContentKeeper, GoGuardian) block or quarantine the
   "Newly Registered/Newly Observed Domains" category for 30–90 days by default. The
   symptom matches exactly: the appliance accepts the TCP connection, reads the TLS SNI
   `mathnexa.com`, and resets — Chrome reports `ERR_CONNECTION_CLOSED`. Established sites
   (Blooket, Wayground) are categorized "Education" and pass.
2. **Uncategorized-domain default-deny.** Same mechanism, different rule: the domain has no
   category yet and the district denies uncategorized traffic.
3. **SSL-inspection incompatibility.** Less likely (standard TLS 1.3/LE chain), but a
   decryption policy that exempts known-education domains and intercepts unknown ones can
   close connections for uncategorized names.
4. **Hosting-provider (Vercel) range block.** Least likely — many education products ride
   Vercel — and cleanly disambiguated by the diagnostic's `VERCEL_DIRECT` probe.

## Vendor-neutral categorization remediation

Do this once regardless of which filter the district runs — it fixes the "newly registered /
uncategorized" root cause at the source:

1. Submit `https://mathnexa.com/` (and `https://showme.mathnexa.com/`) for categorization as
   **Education / Educational Institutions / Reference** at the public lookup portals the
   major vendors operate (each has a "suggest a category / report miscategorization" form):
   Palo Alto Test-A-Site, Fortinet FortiGuard web-filter lookup, Symantec/Broadcom Site
   Review, Zscaler URL lookup, Cisco Talos reputation, McAfee/Trellix TrustedSource,
   Lightspeed and Securly support portals.
2. In each submission: identify the site as a teacher-led math education platform, owner
   Desmond Quayson, contact quaysondesmond@yahoo.com, HTTPS-only, no downloads, no ads.
3. Recheck after 1–2 weeks; the "newly registered" flag also ages out on its own in most
   stacks within 30–90 days of registration.
4. In parallel, send the district IT packet (below) — a district allowlist entry works
   immediately and does not wait on vendor recategorization.

See `mathnexa-school-it-whitelist-request.md` for the ready-to-send district request.

## Hosting-alternative decision rule (Phase 8 — analysis only, nothing implemented)

- **Diagnostic shows Case A/C/D (name-based block): stay on Vercel.** The block is against
  the domain name/category. A CDN front (e.g. Cloudflare) would not help — the school is
  blocking the *name* `mathnexa.com`, which any front would still serve. Fix =
  categorization + district allowlist (above).
- **Case E (both custom domain AND `*.vercel.app` fail, control sites pass): consider a
  front/migration.** Only this result implicates Vercel's network itself. Then evaluate, in
  order: (B) Cloudflare in front of mathnexa.com (keeps Vercel origin; standards-compliant;
  minimal change; Supabase/Stripe unaffected; test Safari + TLS-inspection compatibility on
  the district network first), then (C) full migration to another mainstream edge platform
  (larger operational cost; only if fronting fails), and (D) dual-origin high availability
  (highest complexity; not justified by a single district datapoint).
- Never rotate domains, disguise the product, or tunnel around filters — categorization and
  district approval are the legitimate mechanisms.
