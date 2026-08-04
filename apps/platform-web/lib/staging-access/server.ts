import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const STAGING_ACCESS_BOOTSTRAP_PATH = "/api/internal/staging-access/bootstrap";
export const STAGING_ACCESS_COOKIE_NAME = "__Host-mvh-staging-access";
export const STAGING_ACCESS_WEBHOOK_PATH = "/api/billing/webhook";

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const UUID_PATH = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";
const TICKET_PATH = "[A-Za-z0-9_-]{80,650}\\.[A-Za-z0-9_-]{43}";
const GAME_ASSET_PATH = "[A-Za-z0-9][A-Za-z0-9._/-]{0,511}";
const TICKETED_GAME_ASSET_PATH = new RegExp(
  `^/(?:admin/games/${UUID_PATH}/preview|games/${UUID_PATH}/runtime)/assets/${TICKET_PATH}/${GAME_ASSET_PATH}$`,
  "i"
);
const COOKIE_VERSION = "v1";
const COOKIE_PAYLOAD = "mathnexa-phase7d-staging-access-v1";
const COOKIE_SIGNATURE_LENGTH = 43;

type EnvironmentSource = Readonly<Record<string, string | undefined>>;

function constantTimeTextEqual(candidate: string, expected: string): boolean {
  const expectedBytes = Buffer.from(expected, "utf8");
  const candidateBytes = Buffer.from(candidate, "utf8");
  const normalizedCandidate = Buffer.alloc(expectedBytes.length);
  candidateBytes.copy(normalizedCandidate, 0, 0, Math.min(candidateBytes.length, expectedBytes.length));
  const equal = timingSafeEqual(normalizedCandidate, expectedBytes);
  return equal && candidateBytes.length === expectedBytes.length;
}

export function isStagingAccessRequired(source: EnvironmentSource = process.env): boolean {
  return source.MVH_APP_ENVIRONMENT === "production-platform" &&
    source.MVH_STAGING_ACCESS_REQUIRED === "true";
}

export function isTicketedGameAssetPath(pathname: string): boolean {
  return !pathname.includes("..") && !pathname.includes("//") && TICKETED_GAME_ASSET_PATH.test(pathname);
}

export function getStagingAccessToken(source: EnvironmentSource = process.env): string | null {
  if (!isStagingAccessRequired(source)) return null;
  const token = source.MVH_STAGING_ACCESS_TOKEN?.trim() ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

export function isValidStagingBearerAuthorization(
  authorization: string | null,
  source: EnvironmentSource = process.env
): boolean {
  const token = getStagingAccessToken(source);
  if (!token || !authorization) return false;
  const match = /^Bearer ([A-Za-z0-9_-]+)$/i.exec(authorization);
  return Boolean(match && constantTimeTextEqual(match[1], token));
}

export function createStagingAccessCookieValue(source: EnvironmentSource = process.env): string | null {
  const token = getStagingAccessToken(source);
  if (!token) return null;
  const signature = createHmac("sha256", token).update(COOKIE_PAYLOAD).digest("base64url");
  return `${COOKIE_VERSION}.${signature}`;
}

export function isValidStagingAccessCookie(
  cookieValue: string | undefined,
  source: EnvironmentSource = process.env
): boolean {
  const expected = createStagingAccessCookieValue(source);
  if (!expected || !cookieValue || cookieValue.length !== COOKIE_VERSION.length + 1 + COOKIE_SIGNATURE_LENGTH) {
    return false;
  }
  return constantTimeTextEqual(cookieValue, expected);
}

export function stagingAccessNotFoundResponse(): Response {
  return new Response(null, {
    status: 404,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
      "X-Content-Type-Options": "nosniff",
      "X-Robots-Tag": "noindex, nofollow"
    }
  });
}
