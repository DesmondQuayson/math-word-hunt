/**
 * Google Ads click attribution: the rules both the browser and the server use.
 *
 * A visitor who arrives from a Google ad carries a click identifier in the URL
 * (`gclid`, or `gbraid` / `wbraid` from iOS). To report later that this visitor
 * created an account, started the trial or paid, MathNexa keeps that identifier
 * in a first-party, HttpOnly cookie and, at sign-up, with the account
 * (lib/analytics/ad-attribution.ts). See docs/google-ads-conversion-tracking.md.
 *
 * Consent. Ad measurement is opt-out and runs only where that is the rule:
 * visitors in AD_MEASUREMENT_COUNTRIES, unless the browser sends Global Privacy
 * Control or the visitor turned it off on the Privacy page. Everywhere else it
 * stays off, because MathNexa has no consent banner to ask with. The Google tag
 * gets the same answer through Consent Mode (lib/analytics/google-tag.ts).
 *
 * This module is plain logic with no server or browser dependency, so the
 * browser bundle can import it. The cookie encoding is in ad-click-cookie.ts.
 */

/** ISO 3166-1 alpha-2 codes, as the hosting platform reports the visitor's country. */
export const AD_MEASUREMENT_COUNTRIES: readonly string[] = Object.freeze(["US"]);

/** The visitor's own choice, set from the Privacy page and readable by the page. */
export const AD_CHOICE_COOKIE = "mathnexa-ad-choice";
export const AD_CHOICE_OPT_OUT = "opt-out";
export const AD_CHOICE_LIFETIME_SECONDS = 365 * 24 * 60 * 60;

/** The click identifier, HttpOnly, never readable by page scripts. */
export const AD_CLICK_COOKIE = "mathnexa-ad-click";
/** Google Ads accepts a conversion for 90 days after the click. */
export const AD_CLICK_LIFETIME_SECONDS = 90 * 24 * 60 * 60;

export const AD_CLICK_PARAMETERS = ["gclid", "gbraid", "wbraid"] as const;
export type AdClickParameter = (typeof AD_CLICK_PARAMETERS)[number];
export type AdClickIdentifiers = Readonly<Record<AdClickParameter, string | null>>;
export type AdClick = AdClickIdentifiers & Readonly<{ clickedAt: string }>;

const IDENTIFIER = /^[A-Za-z0-9_-]{10,512}$/;

export function parseAdClickIdentifier(value: unknown): string | null {
  return typeof value === "string" && IDENTIFIER.test(value) ? value : null;
}

/** The identifiers in a landing URL's query string, or null when it has none. */
export function readAdClickIdentifiers(source: Readonly<Record<string, unknown>> | URLSearchParams): AdClickIdentifiers | null {
  const read = (name: AdClickParameter) =>
    parseAdClickIdentifier(source instanceof URLSearchParams ? source.get(name) : source[name]);
  const identifiers = { gclid: read("gclid"), gbraid: read("gbraid"), wbraid: read("wbraid") };
  return identifiers.gclid || identifiers.gbraid || identifiers.wbraid ? identifiers : null;
}

export function isAdMeasurementAllowed(input: Readonly<{
  /** The visitor's country, or null when the platform did not report one. */
  country: string | null;
  globalPrivacyControl: boolean;
  optedOut: boolean;
  /**
   * False only where no platform geolocation exists (a local rehearsal), so the
   * flow can be exercised there. A hosted deployment always requires a country.
   */
  countryRequired: boolean;
}>): boolean {
  if (input.globalPrivacyControl || input.optedOut) return false;
  if (input.country === null) return !input.countryRequired;
  return AD_MEASUREMENT_COUNTRIES.includes(input.country.toUpperCase());
}

export function isAdChoiceOptOut(cookieValue: string | null | undefined): boolean {
  return cookieValue === AD_CHOICE_OPT_OUT;
}
