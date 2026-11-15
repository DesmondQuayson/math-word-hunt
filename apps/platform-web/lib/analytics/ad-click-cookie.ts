import {
  AD_CLICK_LIFETIME_SECONDS,
  readAdClickIdentifiers,
  type AdClick
} from "./ad-measurement";

/**
 * The value of the HttpOnly ad-click cookie: the identifiers and when the
 * visitor landed with them. Server code only (it uses Buffer).
 */
export function encodeAdClickCookie(click: AdClick): string {
  const compact = { g: click.gclid, b: click.gbraid, w: click.wbraid, t: click.clickedAt };
  return Buffer.from(JSON.stringify(compact), "utf8").toString("base64url");
}

/**
 * Reads the cookie back. Anything malformed, from the future or older than
 * Google Ads would accept is treated as absent, never repaired.
 */
export function decodeAdClickCookie(value: string | null | undefined, now: Date = new Date()): AdClick | null {
  if (!value || value.length > 4096) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const identifiers = readAdClickIdentifiers({ gclid: record.g, gbraid: record.b, wbraid: record.w });
  const clickedAt = typeof record.t === "string" ? Date.parse(record.t) : Number.NaN;
  if (!identifiers || !Number.isFinite(clickedAt)) return null;
  const age = now.getTime() - clickedAt;
  if (age < -5 * 60 * 1000 || age > AD_CLICK_LIFETIME_SECONDS * 1000) return null;
  return { ...identifiers, clickedAt: new Date(clickedAt).toISOString() };
}
