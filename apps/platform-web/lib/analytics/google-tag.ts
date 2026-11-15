/**
 * Google tag (Google Tag Manager container) for mathnexa.com.
 *
 * The container is the one the MathNexa Google Ads account issued. Its only
 * destination today is the Google Ads tag; conversion actions (for example a
 * paid subscription) are configured in that account, not here, and are not
 * implied by this base tag loading.
 *
 * Where it runs: the root layout, so every page rendered through it (public
 * pages, sign-in, account, subscription, teacher pages). It does NOT run on the
 * game documents students play (`/join`, `/games/<id>/play`, Polygon Showdown,
 * Math Race Champions, Math Bingo Live): those are route handlers with their
 * own strict CSP and never render the root layout.
 *
 * When it runs: MathNexa builds on Vercel (Production and preview
 * deployments). Local development and the local e2e suites have no
 * VERCEL_ENV, so they never contact Google.
 *
 * Consent: the tag starts with Consent Mode defaults (GOOGLE_TAG_CONSENT_DEFAULTS).
 * Conversions are not sent from the browser at all: the three Google Ads
 * conversions are recorded on the server and imported by click identifier
 * (docs/google-ads-conversion-tracking.md).
 *
 * The CSP hosts this container needs are in lib/security/headers.mjs.
 */

import { AD_CHOICE_COOKIE, AD_CHOICE_OPT_OUT, AD_MEASUREMENT_COUNTRIES } from "./ad-measurement";

export const GOOGLE_TAG_CONTAINER_ID = "GTM-53VDQ6ZL";

export const GOOGLE_TAG_SCRIPT_URL = `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_CONTAINER_ID}`;

const CONSENT_TYPES = ["ad_storage", "ad_user_data", "ad_personalization", "analytics_storage"] as const;
/** Measurement only: ad personalisation (remarketing) is never granted. */
const consent = (state: "granted" | "denied") => CONSENT_TYPES
  .map((type) => `${type}:'${type === "ad_personalization" ? "denied" : state}'`).join(",");

/**
 * Consent Mode defaults, queued before the tag starts so it never acts without
 * them. They follow the same rule as MathNexa's own click attribution
 * (lib/analytics/ad-measurement.ts):
 *   - everywhere: denied. The tag sends cookieless pings only, writes and reads
 *     no advertising cookie, and (`ads_data_redaction`) drops ad click
 *     identifiers from what it sends.
 *   - visitors Google places in AD_MEASUREMENT_COUNTRIES: storage and ad
 *     measurement granted, unless the browser sends Global Privacy Control or
 *     the visitor turned ad measurement off on the Privacy page. The more
 *     specific region default wins. Ad personalisation stays denied for
 *     everyone: MathNexa measures its ads, it does not build audiences.
 */
export const GOOGLE_TAG_CONSENT_DEFAULTS = [
  "(function(){",
  `var optedOut=navigator.globalPrivacyControl===true||document.cookie.split('; ').indexOf('${AD_CHOICE_COOKIE}=${AD_CHOICE_OPT_OUT}')!==-1;`,
  `gtag('consent','default',{${consent("denied")}});`,
  `if(!optedOut){gtag('consent','default',{${consent("granted")},region:${JSON.stringify(AD_MEASUREMENT_COUNTRIES)}});}`,
  "gtag('set','ads_data_redaction',true);",
  "})();"
].join("");

/**
 * Google's supplied initialisation, with the consent defaults placed where
 * Google requires them: after `gtag` exists and before `gtag('js')`.
 * `window.dataLayer || []` keeps anything already queued. The root layout is
 * never re-rendered by client-side navigation, so this runs once per document
 * load.
 */
export const GOOGLE_TAG_INITIALIZATION = [
  "window.dataLayer = window.dataLayer || [];",
  "function gtag(){dataLayer.push(arguments);}",
  GOOGLE_TAG_CONSENT_DEFAULTS,
  "gtag('js', new Date());"
].join("\n");

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export function isGoogleTagEnabled(mathNexa: boolean, source: EnvironmentSource = process.env): boolean {
  const vercelEnvironment = source.VERCEL_ENV?.trim();
  return mathNexa && (vercelEnvironment === "production" || vercelEnvironment === "preview");
}
