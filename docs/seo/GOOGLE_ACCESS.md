# Direct Google access and private baseline

2026-11-27 discovery found no authorized GSC/GA4 environment connection, gcloud
installation, ADC file, or upstream Google OAuth profile at the documented local
paths. The available Supermetrics connector returned NOT_AUTHENTICATED for both
GSC and GA4; it is not used as a dependency. Windsor is not required or used.
Existing GTM/Ads tags do not establish a GA4 property or correct event tracking.
No analytics values, credentials or customer records were collected or committed.
On 2026-11-28, the signed-in Google Cloud console for `showme-math-lab` showed
Google Auth Platform unconfigured and no OAuth clients. Its existing TTS service
account is for another purpose; do not reuse or expand it for analytics.
The same signed-in identity opened Search Console's `sc-domain:mathnexa.com`
property and its Performance, Links and beta generative AI reports. That is
authorized UI access, **not** an API token. A read-only GSC comparison used the
exact windows 2026-10-28–11-24 and 2026-09-30–10-27; its totals and page rows
were discussed privately, not committed. The latest date avoids Google's newest
processing days, but final-data status has not been verified through the API. The
GA4 UI showed setup/onboarding for this identity, so GA4 property access is not
established. GSC counts and URL-level export data remain outside this public file.

## Exact connection needed

The owner must authorize the identity already verified for MathNexa's Search
Console property and grant it access to the correct GA4 property, using
read-only OAuth scopes:

```text
https://www.googleapis.com/auth/webmasters.readonly
https://www.googleapis.com/auth/analytics.readonly
```

Use the Search Console API, Analytics Admin API and Analytics Data API. Obtain
the token through an authorized OAuth client/credential manager, never chat or
repository files. Supply it privately as `GOOGLE_OAUTH_ACCESS_TOKEN`. The helper
does not create accounts, request wider scopes, rotate credentials or enable APIs.
Enable the relevant APIs in the existing authorized Google project if they are
disabled; that setup requires the project owner. Do not purchase a connector.

Run discovery first to identify actual permissions and exact property IDs. The
GSC domain property `sc-domain:mathnexa.com` is visible in the authorized UI;
API discovery must verify it separately. Do not sum overlapping properties.
GA4 numeric property ID is unknown. The baseline verifies
a web stream whose default hostname is mathnexa.com before querying.

The owner must also select a private output folder **outside every Git repo**.
The script rejects public CI/GitHub Actions and Git-contained output. On Windows,
the owner should confirm the chosen folder's account ACLs and sync/sharing policy;
POSIX file modes alone are not a Windows ACL guarantee.

### Owner sign-in / consent step

The exact missing grant is a dedicated Google OAuth desktop client in an
authorized project, with a consenting Google identity that can read the
MathNexa GSC property and GA4 property. Configure the consent screen and client
in Google Auth Platform, and enable Search Console API, Google Analytics Admin
API and Google Analytics Data API if disabled. Request **only** the two scopes
above. The owner completes Google sign-in/consent and keeps the resulting client
identifier/token in a private credential manager; do not paste either into chat
or this public repository. If the current Cloud project is not the approved
project for this access, use the approved project instead. A Cloud project alone
does not grant access to Search Console or GA4; property-level access must be
verified in discovery. The existing direct API helper does not perform OAuth
sign-in itself, so a trusted credential manager must supply its short-lived
access token privately before the commands below run.

```text
node scripts/seo/google-readonly.mjs --mode discover --output ABSOLUTE_PRIVATE_FOLDER
node scripts/seo/google-readonly.mjs --mode baseline --site sc-domain:mathnexa.com --property VERIFIED_NUMERIC_ID --end YYYY-MM-DD --days 28 --output ABSOLUTE_PRIVATE_FOLDER
```

Use the latest verified complete date, accounting for GSC final-data delay and
GA4 processing/property timezone. The helper makes a real read-only request only
after credentials exist. Discovery can save a working source when the other
fails; an unavailable source does not become a zero. No raw provider errors or
data print to stdout. Files contain private data and must never be attached to
public issues, PRs, report history or Actions artifacts.

## Comparison and interpretation

Initial: complete 28 days versus preceding 28. Weekly: `--days 7`, plus a separate
28-day context run within the same workflow. GSC dates are Pacific time; GA4 uses
the property timezone; report scheduling remains Chicago. Verify coverage and
processing status before comparing. The helper records truncation and uses final
GSC data; omitted dates/queries are not proof of no activity.

GSC reports date, page, query, country and device separately, with clicks,
impressions, CTR and position supplied by Google. Query suppression/top-row
limits mean query rows cannot reconstruct site totals. GA4 requests organic
sessions, engaged sessions and users by date/landing page, exact main hostname.
No query strings, user IDs, emails, transaction IDs, revenue or customer dimensions
are requested. GA4 metadata retains thresholding/sampling flags where returned.
Both report queries are restricted to the main hostname. ShowMe tracking and
the cross-subdomain signup journey remain separate, unverified follow-up work.

Next private analysis: reconcile GA4 stream and hostname configuration; inspect
existing signup/trial/checkout/key-event definitions before using them as funnel
steps; map conversion definitions and consent/data gaps. Confirm actual billing
aggregates from the authorized payment system separately (new paid vs renewal,
refunds and currency). A GA4 event or thank-you page is not a verified payment.
Billing access/storage has not been tested for this SEO workflow; do not duplicate
the unrelated operations monitor or export customer records for SEO.

## Cloud boundary

This helper is a prepared direct-API path, **not a configured private cloud job**.
An access token is short lived. Reliable unattended analytics needs owner-approved
private hosting/storage plus a durable OAuth/service-identity credential grant.
Do not place it in this public workflow or add a second scheduler. Extend the
single executor only after private execution and recovery are verified. No paid
AI execution or connector subscription is configured.

Sources: [GSC discovery](https://developers.google.com/webmaster-tools/v1/sites/list),
[Search Analytics limits](https://developers.google.com/webmaster-tools/v1/searchanalytics/query),
[GA4 discovery](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list),
[GA4 reports](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport).
