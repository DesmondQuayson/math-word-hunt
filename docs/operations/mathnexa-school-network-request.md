# Network Access Request — MathNexa (ready to send to school/district IT)

Subject: Educational site review request — mathnexa.com (ERR_CONNECTION_CLOSED on district network)

Hello,

Could you review network access to an educational mathematics website that does not open on
the district network?

**Product:** MathNexa — educational mathematics platform for math games, MAP preparation,
homework, quizzes and visual learning.

**Website:** https://mathnexa.com/

**Owner:** Desmond Quayson · **Contact:** quaysondesmond@yahoo.com

**Observed problem:** On district WiFi, browsers show "This site can't be reached —
mathnexa.com unexpectedly closed the connection" (ERR_CONNECTION_CLOSED). The same device
opens the site normally on standard residential networks, and comparable education sites
open normally on the district network. The domain is recent (July 2026), so a
"newly observed / uncategorized domain" policy is the likely trigger.

**Please allowlist (HTTPS on standard TCP 443 only):**

- `mathnexa.com` — primary site (all first-load content is served from this single host)
- `www.mathnexa.com` — redirect to the above
- `showme.mathnexa.com` — the MAP Prep practice module

**Technical notes:**
- HTTPS-only; modern TLS (1.2/1.3) with a publicly trusted certificate; no special ports,
  no VPN, no UDP/QUIC requirement.
- First page load contacts only mathnexa.com — no ads, trackers, analytics or third-party
  scripts; no downloads required; no student personal information required for general use.
- A no-JavaScript connectivity test page is available at https://mathnexa.com/network-check
- Suggested category: Education / Educational Technology.

Could you check whether the domain is currently **blocked, uncategorized, newly-observed,
or affected by SSL inspection**, and allowlist/reclassify it as an educational website if
appropriate?

Thank you,

Desmond Quayson
quaysondesmond@yahoo.com
