// Vercel "Protection Bypass for Automation", confined to one trusted origin.
//
// The bypass secret opens protected deployments, so it must reach nothing but
// the deployment under review:
//  - it travels only in request headers, never in a URL;
//  - a browser context sends it exactly once: one API request to the trusted
//    origin that does not follow redirects, asking Vercel for its bypass
//    cookie (x-vercel-set-bypass-cookie). Every page, fetch, redirect and API
//    request afterwards is carried by that cookie, which is host-only, so no
//    other host ever receives the secret or the cookie;
//  - redact() removes the value (raw or URL-encoded) from anything that is
//    logged or reported, and a failure of the one secret-bearing request is
//    rethrown without Playwright's call log, which lists every request header
//    (2026-11-07: a refused connection or timeout otherwise printed the secret).
// Nothing is added to browser requests: no context-wide header and no request
// interception. An earlier version re-continued every review-origin request
// through context.route() to add the non-secret x-vercel-skip-toolbar header;
// it did not keep Vercel's preview toolbar out, and on the protected preview
// Chromium's in-flight requests then stalled for 4-23 s (2026-10-07 Tug
// staging review), so the browser now relies on the bypass cookie alone.
export const PROTECTION_BYPASS_HEADER = "x-vercel-protection-bypass";
export const SET_BYPASS_COOKIE_HEADER = "x-vercel-set-bypass-cookie";
export const SKIP_TOOLBAR_HEADER = "x-vercel-skip-toolbar";

export function createProtectionBypass({ origin, secret, bootstrapPath = "/api/health" }) {
  const trusted = new URL(origin).origin;
  const value = typeof secret === "string" && secret.length > 0 ? secret : null;
  const isTrusted = (url) => {
    try {
      return new URL(String(url)).origin === trusted;
    } catch {
      return false;
    }
  };
  /** The text with every occurrence of the secret (raw or URL-encoded) replaced. */
  const redact = (text) => {
    if (!value) return String(text);
    return String(text).split(value).join("[bypass-secret]").split(encodeURIComponent(value)).join("[bypass-secret]");
  };
  /** Headers for one direct request: the bypass only when its URL is on the trusted origin. */
  const headersFor = (url, { setCookie = false } = {}) => {
    if (!value || !isTrusted(url)) return {};
    return {
      [PROTECTION_BYPASS_HEADER]: value,
      [SKIP_TOOLBAR_HEADER]: "1",
      ...(setCookie ? { [SET_BYPASS_COOKIE_HEADER]: "true" } : {})
    };
  };
  return Object.freeze({
    enabled: Boolean(value),
    origin: trusted,
    isTrusted,
    headersFor,
    /**
     * Gives a browser context access to the protected deployment: one
     * redirect-free API request obtains Vercel's host-only bypass cookie for
     * the context; every later request rides on that cookie, unmodified.
     *
     * `unlock(context)` is for a deployment whose app puts its own gate in
     * front of every route (MathNexa's locked staging alias answers 404 until
     * its staging-access cookie is set). It runs once the bypass cookie is in
     * place, before the secret-free verification, and its requests are carried
     * by that cookie: it must never send the secret itself.
     */
    async install(context, { unlock } = {}) {
      const bootstrap = `${trusted}${bootstrapPath}`;
      if (value) {
        let response;
        try {
          response = await context.request.get(bootstrap, { headers: headersFor(bootstrap, { setCookie: true }), maxRedirects: 0 });
        } catch (error) {
          // Playwright's call log lists every request header, so a network error or timeout on this one
          // request would carry the secret in its message. Rethrow without the call log, redacted.
          const message = error instanceof Error ? error.message.split("\nCall log:")[0] : String(error);
          throw new Error(`protection bypass bootstrap request failed for the review origin: ${redact(message)}`);
        }
        // Vercel accepts by answering (often with a 307 back to the same URL)
        // and setting its cookie; it refuses with a 401/403 or a redirect to
        // its SSO page on another host. The redirect is never followed here.
        const location = response.headers().location;
        const backToOrigin = response.status() >= 300 && response.status() < 400 && Boolean(location) && isTrusted(new URL(location, bootstrap).href);
        if (!response.ok() && !backToOrigin) {
          throw new Error(`protection bypass was refused for the review origin (${response.status()})`);
        }
      }
      if (unlock) await unlock(context);
      if (!value) return;
      // Prove the cookie alone now opens the origin - this request carries no secret.
      const verified = await context.request.get(bootstrap, { maxRedirects: 0 });
      if (!verified.ok()) {
        const refusedByVercel = verified.status() === 401 || verified.status() === 403 || /^https:\/\/vercel\.com\/sso/.test(verified.headers().location ?? "");
        throw new Error(refusedByVercel
          ? `protection bypass cookie was not accepted by Vercel for the review origin (${verified.status()})`
          : `the review origin answered ${verified.status()} for ${bootstrapPath} behind the bypass (an app-level gate in front of this deployment?)`);
      }
    },
    redact
  });
}
