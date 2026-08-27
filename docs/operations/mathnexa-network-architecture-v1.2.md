# MathNexa Network Architecture — V1.2.0 (as deployed)

Measured live 2026-08-26 from an unfiltered network. This is the factual baseline every
resilience decision builds on.

## Request path

```
Browser
  → DNS (any resolver) — mathnexa.com A → Vercel anycast (216.150.x.x); NO AAAA records
  → TCP 443 → Vercel edge (nearest PoP)
      TLS 1.3, ALPN h2, SNI mathnexa.com
      Cert: Let's Encrypt wildcard *.mathnexa.com, full chain, publicly trusted
  → Vercel routing → mathnexa-platform-production deployment (Next.js 16, App Router)
      Server render may consult (server-side, never from the browser on first load):
        Supabase (<ref>.supabase.co) — session/catalog/notices (catalog+notices time-boxed 3–4 s, fail-open)
  → HTML + same-origin /_next assets back to the browser
```

Browser-side third parties on first load: **none** (verified by scanning served HTML, all
first-load chunks/styles, and /sign-in — only `mathnexa.com` appears).

Later, user-initiated only:
- Auth session refresh → `<ref>.supabase.co` (browser Supabase client)
- Checkout / billing portal → full-page navigation to `checkout.stripe.com` / `billing.stripe.com`
- MAP Prep → full-page navigation to `showme.mathnexa.com` (self-contained; Desmos disabled)

## Recorded facts

| Item | Value |
| --- | --- |
| Authoritative DNS | Vercel DNS (`ns1/ns2.vercel-dns.com`; domain registered at Vercel, Jul 29 2026) |
| A records | Vercel anycast IPv4 (e.g. 216.150.16.193, 216.150.1.129) |
| AAAA | **None published** → no IPv6 failure path exists |
| TLS | TLS 1.3, Let's Encrypt `*.mathnexa.com`, chain depth 4, authorized; no client certs |
| ALPN | h2 (HTTP/2 over TCP) |
| HTTP/3 | **Not advertised** (no `alt-svc`) → QUIC/UDP-443 is never required |
| Redirects | `http→https` 308 (platform), `www→apex` 308, `*.vercel.app→apex` 308 (app proxy), legacy project host 308 |
| HSTS | `max-age=63072000` (apex); showme adds `includeSubDomains` |
| CSP | Platform: none on public pages (no third-party scripts exist); ShowMe artifact: strict CSP |
| Canonical | `https://mathnexa.com` on every route (`metadataBase` + per-route canonical) |
| Required first-load hosts | `mathnexa.com` only |
| Optional hosts | `www` (redirect), `<ref>.supabase.co` (auth), `checkout/billing.stripe.com` (subscription), `showme.mathnexa.com` (MAP Prep) |

## Protocol-compatibility certification (Phase 9)

- Standard HTTPS on TCP 443 only; HTTP/2 with HTTP/1.1 fallback via ALPN.
- TLS 1.3 negotiated; Vercel edge also accepts TLS 1.2 clients (platform default).
- No QUIC requirement, no exotic ciphers, no client certificates, no nonstandard ports.
- A district blocking UDP/443 has zero effect on MathNexa.
- TLS-inspection appliances re-signing with a district CA work as long as they permit the
  connection: the app sets HSTS but not HPKP (pinning), and uses no certificate-transparency
  enforcement beyond browser defaults — i.e. nothing breaks under sanctioned SSL decryption.

## Diagnostic endpoints (added in V1.3 branch)

- `/network-check` — plain HTML, zero JS/assets, no data reads; proves the network path.
- `/school-network` — public IT-facing information page (domains, ports, category, contact).
- `/.well-known/security.txt` — ownership/abuse contact for reputation reviewers.
