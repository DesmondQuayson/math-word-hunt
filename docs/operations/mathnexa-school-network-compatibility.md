# MathNexa School-Network Compatibility — Clean Baseline (V1)

Fresh investigation from frozen `v1.2.0` (`787fc21`). Every fact below was re-measured
independently on 2026-08-27; nothing is inherited from earlier experiments.

## Phase 1 — Production network audit (measured)

| Item | Result |
| --- | --- |
| DNS | `mathnexa.com` → 216.150.16.129 / 216.150.1.129 (Vercel anycast); authoritative DNS = Vercel (`ns1/ns2.vercel-dns.com`, Vercel-registered domain) |
| IPv6 | **No AAAA records** → no IPv6 failure path |
| TLS | TLS 1.3 negotiated; **TLS 1.2-only clients also handshake successfully** (managed-proxy compatible); cert = Let's Encrypt wildcard `*.mathnexa.com`, valid chain, trusted |
| SNI | Standard; one wildcard cert for apex/www/showme |
| HTTP | ALPN h2 (HTTP/2 over TCP); **no `alt-svc` → HTTP/3/QUIC never required**; HTTP/1.1 fallback via ALPN |
| Port | 443/TCP only |
| Redirects | `http→https` 308; `www→apex` 308; `*.vercel.app→apex` 308; canonical `https://mathnexa.com` on every page |
| HSTS | `max-age=63072000` |
| CSP / CORS | No CSP on public platform pages (no third-party scripts exist to police); no cross-origin requests on first load |
| Cookies | **No Set-Cookie on the anonymous homepage** — first paint requires no cookie |
| Storage | No localStorage/sessionStorage/IndexedDB use in the platform app |
| Service worker | None |
| Third-party scripts | None |

## Phases 2–3 — Browser network dependency map (measured by asset scan)

| Host | Purpose | Initial page | Sign in | Authorized code | Subscription | MAP Prep | Optional |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mathnexa.com` | Everything on first load: HTML, JS, CSS, images, thumbnails | **YES — the only one** | YES | YES | YES | entry | — |
| `www.mathnexa.com` | 308 redirect to apex | no | no | no | no | no | yes (legacy links) |
| `<ref>.supabase.co` | Browser auth session refresh | no | YES (after submit) | **no** (server action on mathnexa.com) | YES | no | — |
| `checkout.stripe.com` / `billing.stripe.com` | Stripe-hosted checkout/portal (full-page navigations) | no | no | no | YES | no | — |
| `showme.mathnexa.com` | MAP Prep module (self-contained) | no | no | no | no | YES | — |
| `*.vercel.app` | Legacy/preview hosts, 308 to apex | no | no | no | no | no | yes |

**The initial public homepage requires exactly one host: `mathnexa.com`.** No third-party
fonts, images, analytics, CDNs, remote scripts, or WebSockets exist on the shell. The
authorized-code flow never leaves `mathnexa.com` from the browser.

## Phase 4 — `/network-check`

Tiny no-JS HTML route (see `apps/platform-web/app/network-check/route.ts`): no auth, no
Supabase, no Stripe, no database, no images/fonts, no PII. Shows "Connection to MathNexa
successful." + hostname. If it opens on school WiFi while the homepage doesn't → the block
is application-level; if it also fails → the block occurs before the application (DNS/TCP/TLS).

## Phase 6 — Decision tree (read the diagnostic report against this)

| Case | Signature | Meaning | Response |
| --- | --- | --- | --- |
| **A** | `DNS_FAIL` for MathNexa, `DNS_PASS` for CONTROL | School DNS/content filter blocks the name | District allowlist request (Phase 8 packet); no code change |
| **B** | `DNS_PASS` + `TCP_FAIL` | Firewall/domain filter drops the connection | Same as A; note whether VERCEL_DIRECT differs |
| **C** | `TCP_PASS` + `TLS_FAIL` / connection closed | SSL inspection / SNI-based appliance reset | Packet asks IT to check decryption policy; our TLS is 1.2/1.3-standard, inspection-tolerant |
| **D** | MathNexa fails, `VERCEL_DIRECT` passes | Custom-domain categorization/reputation (likely "newly registered") | Phase 7 recategorization + district allowlist |
| **E** | MathNexa **and** VERCEL_DIRECT fail, CONTROL passes | Provider-level (Vercel/CDN) policy | Only this case reopens infrastructure discussion — with evidence in hand |
| **F** | Scripts pass, browser still fails | Managed browser/device policy (extension, DoH, PAC, cached state) | District device-management review; try `/network-check` in the browser |

Do not recommend any migration before a case is identified from a real school-network report.

## Phase 7 — Domain categorization plan

`mathnexa.com` was registered late July 2026. Most K-12 filter stacks penalize
"newly registered / newly observed / uncategorized" domains for 30–90 days — the leading
hypothesis for the reported `ERR_CONNECTION_CLOSED` (appliance accepts TCP, reads SNI,
resets), while long-categorized education sites (Blooket, Wayground) pass.

Current classifications: **not asserted** — the major vendors (Palo Alto Test-A-Site,
FortiGuard Web Filter lookup, Cisco Talos, Broadcom Site Review, Zscaler, Trellix
TrustedSource, Lightspeed, Securly, Linewize, GoGuardian, iBoss) expose lookups through
interactive portals (login/CAPTCHA); results must be read there by a person. Do not guess.

Plan (one legitimate submission per vendor, no automation):
1. Look up `mathnexa.com` in each vendor portal above; record the returned category.
2. Where wrong/uncategorized, submit reclassification as
   **Education / Educational Technology / Mathematics Learning** using this text:

   > MathNexa is an educational mathematics platform providing teacher-led math games, MAP
   > preparation, homework, quizzes and visual learning resources.
   > Website: https://mathnexa.com/ · Owner: Desmond Quayson ·
   > Contact: quaysondesmond@yahoo.com · HTTPS-only (TCP 443); the first page load contacts
   > only mathnexa.com; no ads, trackers, or downloads; no student PII required.
   > Category requested: Education / Educational Technology.

3. Recheck in 1–2 weeks; the newly-registered penalty also ages out on its own.

## Phase 9 — Safari / managed-device test results (local rehearsal build of this branch)

Recorded in the final report for this pass: WebKit render, storage-unavailable simulation,
JavaScript disabled, blocked optional APIs (Supabase/Stripe/images/audio), refresh and
Back/Forward — the shell, navigation, footer, and authorized-code entry must stay visible
in every scenario.

## Phase 10 — Infrastructure position

No current evidence implicates Vercel infrastructure. Cloudflare (or any migration) is
documented only as the pre-planned response to a verified **Case E** report and requires
owner approval. No nameserver, proxy, Workers, or domain change is part of this phase.
