/**
 * The ShowMe Math access pass: the rules MathNexa and ShowMe share.
 *
 * ShowMe Math (Online Math Prep and the Worksheet Generator, at
 * showme.mathnexa.com) is a static site with no accounts. Until this pass
 * existed, only MathNexa's own entries (/map-prep, /worksheets) checked
 * access, so anyone who knew the address could open the product. Now the
 * ShowMe host refuses every page without a pass, and only MathNexa can issue
 * one, after the same check those entries make: an account with a trial or a
 * subscription, or a school access code.
 *
 * The pass is `payload.signature`, both base64url. The payload is JSON with
 * exactly `v` (1), `iat` and `exp` in whole seconds, twelve hours apart. The
 * signature is HMAC-SHA256 of the payload text under a secret the two sites
 * share (MVH_SHOWME_ACCESS_SECRET here). It says "MathNexa confirmed access
 * at this time" and nothing about who: no account id, no email address.
 *
 * ShowMe's side of the same rules is hosting/access-gate/middleware.mjs in
 * the ShowMe repository; the test vector in pass.test.ts is asserted there
 * too, so the two cannot drift apart. See docs/showme-access-gate.md.
 *
 * Plain logic: no cookies, no request. The cookie handling is in server.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SHOWME_PASS_COOKIE = "mathnexa-showme-pass";
export const SHOWME_PASS_DURATION_SECONDS = 12 * 60 * 60;

/** Where the visitor wanted to go, kept while they sign in or subscribe. */
export const SHOWME_RETURN_COOKIE = "mathnexa-showme-return";
export const SHOWME_RETURN_SECONDS = 30 * 60;

/** The only places a pass is ever sent back to. Nothing in a request can name another. */
export const SHOWME_SITES = Object.freeze({
  production: "https://showme.mathnexa.com",
  staging: "https://showme-staging.mathnexa.com"
} as const);
export type ShowMeSite = keyof typeof SHOWME_SITES;

const MINIMUM_SECRET_LENGTH = 32;
const MAXIMUM_SECRET_LENGTH = 256;
const MAXIMUM_PASS_LENGTH = 600;
const MAXIMUM_RETURN_LENGTH = 1500;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

/**
 * The shared secret, or null when it is missing or malformed. Without it no
 * pass is issued and the pass route answers 404: the feature fails closed.
 */
export function getShowMeAccessSecret(source: EnvironmentSource = process.env): string | null {
  const secret = source.MVH_SHOWME_ACCESS_SECRET?.trim() ?? "";
  if (secret.length < MINIMUM_SECRET_LENGTH || secret.length > MAXIMUM_SECRET_LENGTH) return null;
  return /^[\x21-\x7e]+$/.test(secret) ? secret : null;
}

function sign(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function createShowMePass(secret: string, now: Date = new Date()): string | null {
  const issuedAt = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(issuedAt) || secret.length < MINIMUM_SECRET_LENGTH) return null;
  const payload = { v: 1, iat: issuedAt, exp: issuedAt + SHOWME_PASS_DURATION_SECONDS };
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${encoded}.${sign(encoded, secret).toString("base64url")}`;
}

/** The same check the ShowMe host makes. Used here by the tests and to avoid reissuing a fresh pass. */
export function verifyShowMePass(value: string | null | undefined, secret: string, now: Date = new Date()): boolean {
  if (typeof value !== "string" || value.length < 20 || value.length > MAXIMUM_PASS_LENGTH) return false;
  if (!Number.isFinite(now.getTime()) || secret.length < MINIMUM_SECRET_LENGTH) return false;
  const parts = value.split(".");
  if (parts.length !== 2 || !/^[A-Za-z0-9_-]+$/.test(parts[0]!) || !/^[A-Za-z0-9_-]+$/.test(parts[1]!)) return false;
  let supplied: Buffer;
  let parsed: unknown;
  try {
    supplied = Buffer.from(parts[1]!, "base64url");
    parsed = JSON.parse(Buffer.from(parts[0]!, "base64url").toString("utf8"));
  } catch {
    return false;
  }
  const expected = sign(parts[0]!, secret);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return false;
  const item = parsed as Record<string, unknown>;
  if (Object.keys(item).sort().join("|") !== "exp|iat|v" || item.v !== 1 ||
    !Number.isSafeInteger(item.iat) || !Number.isSafeInteger(item.exp)) return false;
  const issuedAt = item.iat as number;
  const expiresAt = item.exp as number;
  const current = Math.floor(now.getTime() / 1000);
  return expiresAt - issuedAt === SHOWME_PASS_DURATION_SECONDS && issuedAt <= current + 60 && expiresAt > current;
}

export function showMeSite(value: unknown): ShowMeSite {
  return value === "staging" ? "staging" : "production";
}

/**
 * The page on ShowMe to send the visitor back to: a path on that site and
 * nothing else. Anything that is not a plain absolute path (another origin, a
 * protocol-relative address, a backslash, a fragment, a control character)
 * becomes the home page.
 */
export function safeShowMeReturnPath(value: unknown): string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAXIMUM_RETURN_LENGTH) return "/";
  if (!/^\/(?!\/)[A-Za-z0-9\-._~%/?=&+,:;@!$'()*]*$/.test(value)) return "/";
  try {
    const resolved = new URL(value, SHOWME_SITES.production);
    if (resolved.origin !== SHOWME_SITES.production || resolved.hash !== "" || resolved.username !== "" || resolved.password !== "") return "/";
    return `${resolved.pathname}${resolved.search}` === value ? value : "/";
  } catch {
    return "/";
  }
}

/** The address a visitor with access is sent to. */
export function showMeDestination(site: ShowMeSite, path: string): string {
  return `${SHOWME_SITES[site]}${safeShowMeReturnPath(path)}`;
}

export function encodeShowMeReturn(site: ShowMeSite, path: string): string {
  return `${site === "staging" ? "s" : "p"}.${Buffer.from(safeShowMeReturnPath(path), "utf8").toString("base64url")}`;
}

export function decodeShowMeReturn(value: string | null | undefined): Readonly<{ site: ShowMeSite; path: string }> | null {
  if (typeof value !== "string" || value.length > 2100) return null;
  const match = /^([ps])\.([A-Za-z0-9_-]+)$/.exec(value);
  if (!match) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(match[2]!, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const path = safeShowMeReturnPath(decoded);
  if (path !== decoded) return null;
  return Object.freeze({ site: match[1] === "s" ? "staging" : "production", path });
}
