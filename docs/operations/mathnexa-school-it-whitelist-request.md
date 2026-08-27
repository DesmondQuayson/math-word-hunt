# Network Access Request — MathNexa (mathnexa.com)

*Ready to copy into an email to the school/district IT help desk.*

---

Subject: Allowlist request — MathNexa (teacher math platform) blocked on district network

Hello,

I'm requesting review and allowlisting of an educational website that appears to be blocked
on the district network.

**Product:** MathNexa — teacher-led mathematics resources: interactive math games, Missouri
MAP test preparation, printable homework, and topic quizzes.

**Website:** https://mathnexa.com/

**Owner / contact:** Desmond Quayson — quaysondesmond@yahoo.com

**What we observe:** On district WiFi, Chrome shows "This site can't be reached —
mathnexa.com unexpectedly closed the connection" (ERR_CONNECTION_CLOSED). The same device
opens the site normally on residential networks, and comparable education sites (e.g.
Blooket) work on the district network. The domain was registered recently (July 2026), so
it is likely being caught by a "newly registered / uncategorized domain" policy rather than
an intentional block.

**Please allowlist (all HTTPS, standard TCP port 443):**

| Hostname | Purpose |
| --- | --- |
| `mathnexa.com` | The site itself (all pages and assets are served from this one host) |
| `www.mathnexa.com` | Redirect to the above |
| `showme.mathnexa.com` | The MAP Prep practice module |

Optional, for account sign-in and (teacher-side only) subscription management:
`*.supabase.co`, `checkout.stripe.com`, `billing.stripe.com`.

**Technical notes for review:**
- HTTPS-only; TLS 1.3 with a valid publicly-trusted certificate; standard port 443; no
  QUIC/UDP requirement.
- The first page load contacts only `mathnexa.com` — no third-party ads, trackers,
  analytics, or external scripts.
- No file downloads are required to use the site; printable PDFs are teacher-initiated.
- Students do not need accounts, and the product does not request student personal
  information for general use.
- Category suggestion: Education / Reference.

Could you check whether the domain is currently blocked, uncategorized, DNS-filtered, or
incompatible with SSL decryption on your appliance, and add the hostnames above to the
allowlist? I'm happy to provide any further detail.

Thank you,

Desmond Quayson
quaysondesmond@yahoo.com
