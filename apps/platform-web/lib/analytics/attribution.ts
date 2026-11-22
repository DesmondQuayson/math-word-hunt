// Attribution vocabulary for Vercel Web Analytics.
//
// Everything that leaves the browser for analytics passes through these
// functions. They reduce free text (paths, referrers, campaign tags) to fixed
// vocabularies so that no analytics event can carry a token, an email, a
// session id, a code or any other value that identifies a person. Pure
// functions: no DOM, no network.
import type { BeforeSendEvent } from "@vercel/analytics";

export const ANALYTICS_EVENTS = Object.freeze({
  /** The sign-up form was accepted by the server (a confirmation email is on its way). */
  signUpSubmitted: "sign_up_submitted",
  /** Both subscription agreements were ticked and secure checkout was requested for a free trial. */
  trialCheckoutSubmitted: "trial_checkout_submitted",
  /** The same for an account whose trial is used, so it is charged at checkout. */
  paidCheckoutSubmitted: "paid_checkout_submitted"
} as const);
export type AnalyticsEventName = (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

// Paths a visit may start on. Anything else is reported as "other".
export const LANDING_PATHS = Object.freeze([
  "/",
  "/about",
  "/online-math-prep",
  "/math-games",
  "/math-games/math-tug-of-war",
  "/homework-pdfs",
  "/quiz-pdfs",
  "/pricing",
  "/help",
  "/support",
  "/privacy",
  "/terms",
  "/accessibility",
  "/status",
  "/sign-up",
  "/sign-in",
  "/access",
  "/join",
  "/subscription",
  "/games",
  "/map-prep",
  "/homework",
  "/quizzes",
  "/worksheets",
  "/play"
] as const);
export type LandingPath = (typeof LANDING_PATHS)[number] | "other";
const landingPaths = new Set<string>(LANDING_PATHS);

export const SOURCE_CLASSES = Object.freeze([
  "direct", "google-ads", "google", "bing", "duckduckgo", "yahoo", "search", "facebook", "instagram", "youtube", "tiktok",
  "pinterest", "reddit", "x", "linkedin", "chatgpt", "perplexity", "showme", "other"
] as const);
export type SourceClass = (typeof SOURCE_CLASSES)[number];
const sourceClasses = new Set<string>(SOURCE_CLASSES);

// Registrable domains per class. A host matches when it equals the domain or
// ends with "." + domain, so l.facebook.com, m.youtube.com and www.google.co.uk
// all classify without listing every subdomain or country code.
const REFERRER_DOMAINS: ReadonlyArray<readonly [SourceClass, readonly string[]]> = [
  ["google", ["google.com", "google.ad", "google.ae", "google.ca", "google.co.in", "google.co.uk", "google.com.au", "google.com.br", "google.com.mx", "google.de", "google.es", "google.fr", "google.it", "google.nl", "googleusercontent.com"]],
  ["bing", ["bing.com"]],
  ["duckduckgo", ["duckduckgo.com"]],
  ["yahoo", ["yahoo.com", "yahoo.co.jp"]],
  ["search", ["ecosia.org", "search.brave.com", "startpage.com", "qwant.com", "baidu.com", "yandex.com", "yandex.ru", "ask.com", "aol.com"]],
  ["facebook", ["facebook.com", "fb.com", "fb.me", "messenger.com"]],
  ["instagram", ["instagram.com"]],
  ["youtube", ["youtube.com", "youtu.be"]],
  ["tiktok", ["tiktok.com"]],
  ["pinterest", ["pinterest.com", "pin.it"]],
  ["reddit", ["reddit.com", "redd.it"]],
  ["x", ["x.com", "twitter.com", "t.co"]],
  ["linkedin", ["linkedin.com", "lnkd.in"]],
  ["chatgpt", ["chatgpt.com", "openai.com"]],
  ["perplexity", ["perplexity.ai"]]
];

/** Campaign tags (utm_source) that name a known source; anything else is ignored. */
const CAMPAIGN_SOURCES: Readonly<Record<string, SourceClass>> = Object.freeze({
  facebook: "facebook", fb: "facebook", instagram: "instagram", ig: "instagram", tiktok: "tiktok",
  youtube: "youtube", yt: "youtube", pinterest: "pinterest", reddit: "reddit", linkedin: "linkedin", x: "x", twitter: "x"
});

const OWN_APEX = "mathnexa.com";
const SHOWME_HOST = "showme.mathnexa.com";

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

export function classifyLandingPath(pathname: string): LandingPath {
  const path = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return landingPaths.has(path) ? path as LandingPath : "other";
}

// `ownHost` is the host serving the page (window.location.host). Any referrer
// on that host, or on the apex and its subdomains other than ShowMe, is an
// internal navigation and counts as "direct". The raw host is never returned.
export function classifyReferrer(referrer: string, ownHost: string): SourceClass {
  const value = referrer.trim();
  if (value.length === 0) return "direct";
  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase();
  } catch {
    return "other";
  }
  const own = ownHost.trim().toLowerCase().replace(/:\d+$/, "");
  if (host === SHOWME_HOST) return own === SHOWME_HOST ? "direct" : "showme";
  if (host === own || hostMatches(host, OWN_APEX)) return "direct";
  for (const [sourceClass, domains] of REFERRER_DOMAINS) {
    if (domains.some((domain) => hostMatches(host, domain))) return sourceClass;
  }
  // Google's regional domains (google.<cc> and google.com.<cc>) without
  // enumerating every country code.
  if (/^(?:[a-z0-9-]+\.)*google\.(?:com?\.)?[a-z]{2,3}$/.test(host)) return "google";
  return "other";
}

/**
 * The source of a visit: a Google Ads click when the landing address carries a
 * Google click id, then a known campaign tag (organic social posts use
 * utm_source), then the referring site. Only the class is returned, never the
 * click id or the tag itself.
 */
export function classifyEntrySource(search: string, referrer: string, ownHost: string): SourceClass {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    params = new URLSearchParams();
  }
  if (["gclid", "gbraid", "wbraid"].some((key) => (params.get(key) ?? "").trim().length > 0)) return "google-ads";
  const campaign = CAMPAIGN_SOURCES[(params.get("utm_source") ?? "").trim().toLowerCase()];
  return campaign ?? classifyReferrer(referrer, ownHost);
}

export function isSourceClass(value: unknown): value is SourceClass {
  return typeof value === "string" && sourceClasses.has(value);
}

// Paths that are never reported, even as a bare pathname: admin is concealed
// from anonymous callers, API, auth callbacks, game runtimes and protected
// files are not page views and their addresses can carry signed tickets.
const CONCEALED_PREFIXES = ["/admin", "/api", "/auth", "/_next", "/game/runtime", "/media", "/teacher", "/_vercel"] as const;
const CONCEALED_SEGMENTS = new Set(["runtime", "assets", "preview", "files"]);
// Identifiers in a path (resource UUIDs, long opaque keys) are replaced so a
// page count never carries one.
const IDENTIFIER = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[A-Za-z0-9_-]{24,})$/i;

function concealed(pathname: string): boolean {
  if (CONCEALED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  return pathname.split("/").some((segment) => CONCEALED_SEGMENTS.has(segment));
}

// Reduces an event URL to origin + pathname, with identifiers replaced. Query
// strings carry Stripe Checkout session ids, `next` destinations,
// password-recovery codes, click ids and similar values; none of them is
// needed for a page count, so they are always removed.
export function redactAnalyticsUrl(url: string): string | null {
  if (typeof url !== "string" || url.length === 0) return null;
  let parsed: URL;
  try {
    parsed = new URL(url, "https://mathnexa.com");
  } catch {
    return null;
  }
  if (concealed(parsed.pathname)) return null;
  const path = parsed.pathname.split("/").map((segment) => IDENTIFIER.test(segment) ? ":id" : segment).join("/");
  return `${parsed.origin}${path}`;
}

export function beforeSendAnalyticsEvent(event: BeforeSendEvent): BeforeSendEvent | null {
  try {
    const url = redactAnalyticsUrl(event.url);
    if (url === null) return null;
    return url === event.url ? event : { ...event, url };
  } catch {
    // When in doubt, send nothing.
    return null;
  }
}
