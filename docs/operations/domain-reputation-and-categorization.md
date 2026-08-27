# mathnexa.com — Domain Reputation & Education Categorization Dossier

Purpose: get `mathnexa.com` (and `showme.mathnexa.com`) correctly categorized as
**Education / Educational Technology / Mathematics Learning** across the filtering
ecosystems used by K-12 districts, and retire the "newly registered domain" penalty the
domain (registered late July 2026) currently attracts. Every step below is the vendor's own
legitimate review process — one submission each, no automation, no gaming.

## Submission-ready description (use verbatim)

> MathNexa is an educational mathematics platform providing teacher-led math games, MAP
> preparation, homework, quizzes, and interactive learning resources.
>
> Website: https://mathnexa.com/
> Owner: Desmond Quayson
> Contact: quaysondesmond@yahoo.com
> Requested category: Education / Educational Technology
>
> Technical profile: HTTPS-only on standard port 443; first page load contacts only
> mathnexa.com (no ads, trackers, or third-party scripts); no downloads required; no
> student personal information required for general use. IT reference page:
> https://mathnexa.com/school-network — connectivity test: https://mathnexa.com/network-check

## Vendor review channels (submit to each once)

| Ecosystem | Where to submit |
| --- | --- |
| Palo Alto Networks URL Filtering | "Test A Site" portal (urlfiltering.paloaltonetworks.com) → request category change |
| Fortinet FortiGuard | FortiGuard Web Filter lookup (fortiguard.com/webfilter) → submit reclassification |
| Cisco Talos | Talos Intelligence reputation lookup (talosintelligence.com) → categorization dispute |
| Broadcom / Symantec (BlueCoat) | Symantec Site Review (sitereview.bluecoat.com) |
| Zscaler | Zscaler URL lookup (sitereview.zscaler.com) → suggest category |
| Trellix (McAfee) | TrustedSource (trustedsource.org) → check single URL → suggest category |
| Lightspeed Systems | Lightspeed support / "Web Filter category review" request |
| Securly | Securly support ticket — site categorization review |
| Linewize / ContentKeeper | Vendor support categorization request |
| GoGuardian | GoGuardian support — site review request |
| iBoss | iBoss support — URL category dispute |
| Google Safe Browsing (hygiene) | Search Console — verify property, confirm no security issues flagged |
| Microsoft SmartScreen (hygiene) | Report-a-site portal only if ever flagged |

Submit both hostnames where the form allows multiple; otherwise submit `mathnexa.com` and
mention `showme.mathnexa.com` in the comment field.

## Why this works for the reported school failure

The observed symptom (TCP accepted, then connection closed on SNI, only on district WiFi,
while long-established education sites work) is the signature of newly-registered /
uncategorized-domain policies. Correct categorization removes the trigger at the vendor
level for every district using that vendor; the district allowlist packet
(`mathnexa-school-it-whitelist-request.md`, release branch) fixes the single district
immediately without waiting.

## Reputation-supporting posture (already live or in this branch)

- Stable ownership signals: `Author: Desmond Quayson` + contact in the site footer;
  `/.well-known/security.txt`; `/school-network` IT page; `/network-check` probe page.
- Clean technical posture: HTTPS-only, HSTS, valid public CA, canonical URLs, accurate
  robots.txt + sitemap, favicon, zero third-party scripts, no downloads.
- The "newly registered" penalty also ages out naturally (30–90 days in most stacks) —
  categorization submissions accelerate rather than replace that.

## Cadence

1. Week 0: submit all vendors above + send the district IT packet.
2. Week 1–2: re-check each lookup portal; most publish the updated category.
3. Keep this dossier updated with each vendor's returned category for future districts.
