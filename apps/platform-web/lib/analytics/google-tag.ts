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
 * The CSP hosts this container needs are in lib/security/headers.mjs.
 */

export const GOOGLE_TAG_CONTAINER_ID = "GTM-53VDQ6ZL";

export const GOOGLE_TAG_SCRIPT_URL = `https://www.googletagmanager.com/gtm.js?id=${GOOGLE_TAG_CONTAINER_ID}`;

/**
 * Google's supplied initialisation, verbatim. `window.dataLayer || []` keeps
 * anything already queued. The root layout is never re-rendered by client-side
 * navigation, so this runs once per document load.
 */
export const GOOGLE_TAG_INITIALIZATION = [
  "window.dataLayer = window.dataLayer || [];",
  "function gtag(){dataLayer.push(arguments);}",
  "gtag('js', new Date());"
].join("\n");

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export function isGoogleTagEnabled(mathNexa: boolean, source: EnvironmentSource = process.env): boolean {
  const vercelEnvironment = source.VERCEL_ENV?.trim();
  return mathNexa && (vercelEnvironment === "production" || vercelEnvironment === "preview");
}
