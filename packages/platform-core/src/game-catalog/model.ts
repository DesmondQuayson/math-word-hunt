export const GAME_LAUNCH_TYPES = ["canonical", "hosted_package", "external_https"] as const;
export type GameLaunchType = (typeof GAME_LAUNCH_TYPES)[number];

export type GameLaunchTarget =
  | Readonly<{ type: "canonical"; route: "/play" }>
  | Readonly<{ type: "hosted_package"; packageId: string }>
  | Readonly<{ type: "external_https"; url: string; host: string }>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HOST = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const ENCODED_REDIRECT = /%(?:00|09|0a|0d|2f|3a|40|5c)/i;

export function parseExternalGameDestination(value: unknown, allowedHosts: readonly string[]): URL | null {
  if (typeof value !== "string" || value.length > 2048 || value !== value.trim() ||
    /[\u0000-\u001f\u007f\\]/.test(value) || ENCODED_REDIRECT.test(value) || value.startsWith("//")) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || url.username || url.password || url.port || !HOST.test(host) ||
      url.href !== value || !allowedHosts.some((item) => item.toLowerCase() === host)) return null;
    return url;
  } catch {
    return null;
  }
}

export function parseGameLaunchTarget(value: unknown, allowedHosts: readonly string[] = []): GameLaunchTarget | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (item.type === "canonical" && Object.keys(item).sort().join("|") === "route|type" && item.route === "/play") {
    return Object.freeze({ type: "canonical", route: "/play" });
  }
  if (item.type === "hosted_package" && Object.keys(item).sort().join("|") === "packageId|type" && typeof item.packageId === "string" && UUID.test(item.packageId)) {
    return Object.freeze({ type: "hosted_package", packageId: item.packageId });
  }
  if (item.type === "external_https" && Object.keys(item).sort().join("|") === "host|type|url" && typeof item.host === "string") {
    const url = parseExternalGameDestination(item.url, allowedHosts);
    if (url && item.host.toLowerCase() === url.hostname.toLowerCase()) return Object.freeze({ type: "external_https", url: url.href, host: url.hostname.toLowerCase() });
  }
  return null;
}
