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
//  - redact() removes the value from anything that is logged or reported.
// The only header added to browser requests is the non-secret
// x-vercel-skip-toolbar, and only for the trusted origin.
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
     * the context, and same-origin browser requests get the toolbar opt-out.
     */
    async install(context) {
      if (!value) return;
      const bootstrap = `${trusted}${bootstrapPath}`;
      const response = await context.request.get(bootstrap, { headers: headersFor(bootstrap, { setCookie: true }), maxRedirects: 0 });
      // Vercel accepts by answering (often with a 307 back to the same URL)
      // and setting its cookie; it refuses with a 401/403 or a redirect to
      // its SSO page on another host. The redirect is never followed here.
      const location = response.headers().location;
      const backToOrigin = response.status() >= 300 && response.status() < 400 && Boolean(location) && isTrusted(new URL(location, bootstrap).href);
      if (!response.ok() && !backToOrigin) {
        throw new Error(`protection bypass was refused for the review origin (${response.status()})`);
      }
      // Prove the cookie alone now opens the origin - this request carries no secret.
      const verified = await context.request.get(bootstrap, { maxRedirects: 0 });
      if (!verified.ok()) {
        const refusedByVercel = verified.status() === 401 || verified.status() === 403 || /^https:\/\/vercel\.com\/sso/.test(verified.headers().location ?? "");
        throw new Error(refusedByVercel
          ? `protection bypass cookie was not accepted by Vercel for the review origin (${verified.status()})`
          : `the review origin answered ${verified.status()} for ${bootstrapPath} behind the bypass (an app-level gate in front of this deployment?)`);
      }
      await context.route((url) => isTrusted(url.href), (route) => route.continue({
        headers: { ...route.request().headers(), [SKIP_TOOLBAR_HEADER]: "1" }
      }));
    },
    /** The text with every occurrence of the secret replaced. */
    redact(text) {
      return value ? String(text).split(value).join("[bypass-secret]") : String(text);
    }
  });
}
