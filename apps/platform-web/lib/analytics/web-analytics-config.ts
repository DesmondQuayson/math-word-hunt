/**
 * Vercel Web Analytics is off unless the server environment says exactly
 * MVH_WEB_ANALYTICS=enabled. It also needs the owner to press Enable for the
 * project in the Vercel dashboard (and a redeploy) before anything is
 * collected; with the variable unset, no analytics script is rendered at all.
 */
export function isWebAnalyticsEnabled(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  return source.MVH_WEB_ANALYTICS?.trim() === "enabled";
}
