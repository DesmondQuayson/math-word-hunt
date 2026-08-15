import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import type { AdminSecurityConfig } from "./config";
import type { AdminAccessDecision, AdminClientContext, AdminSessionRecord, AdminUserRecord } from "./types";

const CSRF_VERSION = "v1";
const CSRF_MAX_AGE_SECONDS = 10 * 60;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

function constantTimeEqual(candidate: string, expected: string): boolean {
  const candidateBytes = Buffer.from(candidate, "utf8");
  const expectedBytes = Buffer.from(expected, "utf8");
  const normalized = Buffer.alloc(expectedBytes.length);
  candidateBytes.copy(normalized, 0, 0, Math.min(candidateBytes.length, expectedBytes.length));
  return timingSafeEqual(normalized, expectedBytes) && candidateBytes.length === expectedBytes.length;
}

export function createAdminCsrfToken(
  config: AdminSecurityConfig,
  now = new Date(),
  nonce = randomBytes(18).toString("base64url")
): string {
  const issuedAt = Math.floor(now.getTime() / 1000);
  const payload = `${CSRF_VERSION}.${issuedAt}.${nonce}`;
  const signature = createHmac("sha256", config.csrfSecret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAdminCsrfToken(token: string, config: AdminSecurityConfig, now = new Date()): boolean {
  const match = /^(v1)\.(\d{10})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const issuedAt = Number(match[2]);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > nowSeconds + 30 || nowSeconds - issuedAt > CSRF_MAX_AGE_SECONDS) return false;
  const payload = `${match[1]}.${match[2]}.${match[3]}`;
  const expected = createHmac("sha256", config.csrfSecret).update(payload).digest("base64url");
  return constantTimeEqual(match[4], expected);
}

export function isSameOriginAdminRequest(headers: Headers, configuredOrigin?: string): boolean {
  const originValue = headers.get("origin");
  if (!originValue) return false;
  let origin: URL;
  try { origin = new URL(originValue); } catch { return false; }
  if (origin.protocol !== "https:" && origin.protocol !== "http:") return false;

  const forwardedHost = headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const requestHost = forwardedHost || headers.get("host")?.trim();
  if (!requestHost || origin.host !== requestHost) return false;

  if (configuredOrigin) {
    try {
      const configured = new URL(configuredOrigin);
      if (configured.origin !== origin.origin) return false;
    } catch { return false; }
  }
  return true;
}

export function createAdminSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashAdminSessionToken(token: string): string | null {
  if (!SESSION_TOKEN_PATTERN.test(token)) return null;
  return createHash("sha256").update(token).digest("hex");
}

export function createAdminRateSubjectHash(
  scope: "login" | "mfa",
  subject: string,
  context: AdminClientContext,
  config: AdminSecurityConfig
): string {
  return createHmac("sha256", config.csrfSecret)
    .update(`${scope}\u0000${subject.toLowerCase()}\u0000${context.ip ?? "unknown"}`)
    .digest("hex");
}

export function getAdminClientContext(headers: Headers): AdminClientContext {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = headers.get("x-real-ip")?.trim() ?? "";
  const candidate = isIP(forwarded) ? forwarded : isIP(realIp) ? realIp : null;
  const userAgent = headers.get("user-agent")?.trim();
  return Object.freeze({ ip: candidate, userAgent: userAgent ? userAgent.slice(0, 512) : null });
}

export function decideAdminAccess(input: Readonly<{
  featureEnabled: boolean;
  infrastructureAvailable: boolean;
  authenticated: boolean;
  emailVerified: boolean;
  assuranceLevel: string | null;
  admin: AdminUserRecord | null;
  session: AdminSessionRecord | null;
  sessionTokenValid: boolean;
  now?: Date;
}>): AdminAccessDecision {
  if (!input.featureEnabled) return { state: "disabled" };
  if (!input.infrastructureAvailable) return { state: "unavailable" };
  if (!input.authenticated || !input.emailVerified) return { state: "unauthenticated" };
  if (!input.admin || input.admin.revoked_at !== null) return { state: "non-admin" };
  if (!input.admin.mfa_enrolled || input.assuranceLevel !== "aal2") return { state: "mfa-required" };
  if (!input.sessionTokenValid || !input.session || input.session.admin_user_id !== input.admin.id ||
      input.session.revoked_at !== null || input.session.ended_at !== null || input.session.assurance_level !== "aal2") {
    return { state: "reauth-required" };
  }
  const expiresAt = Date.parse(input.session.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= (input.now ?? new Date()).getTime()) return { state: "reauth-required" };
  return { state: "authorized", admin: input.admin, session: input.session };
}
