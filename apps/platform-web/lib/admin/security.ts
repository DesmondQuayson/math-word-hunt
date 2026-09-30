import "server-only";

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { isIP } from "node:net";

import type { AdminSecurityConfig } from "./config";
import { ADMIN_SESSION_MAX_MINUTES, isAdminSessionIdle } from "./session-policy";
import type { AdminAccessDecision, AdminClientContext, AdminReauthReason, AdminSessionRecord, AdminUserRecord } from "./types";

/**
 * Two CSRF token kinds, both HMAC-signed with the server-only admin secret:
 *
 * - v1 (pre-session): the sign-in, MFA and account-switch forms, which run
 *   before an admin session exists. Valid for 10 minutes.
 * - v2 (session-bound): every form inside the Super Admin shell. The signature
 *   covers the admin session id, so a token is useless for any other session,
 *   and it is accepted only while that session is valid (every protected route
 *   authorizes the session before checking the token). Its age is bounded by
 *   the longest possible session, so a form left open never expires before the
 *   session does.
 *
 * Both are checked together with an exact same-origin Origin header.
 */
const CSRF_VERSION = "v1";
const CSRF_MAX_AGE_SECONDS = 10 * 60;
const CSRF_SESSION_VERSION = "v2";
const CSRF_SESSION_MAX_AGE_SECONDS = ADMIN_SESSION_MAX_MINUTES * 60 + 60;
const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const SESSION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

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

function sessionCsrfSignature(config: AdminSecurityConfig, sessionId: string, issuedAt: string, nonce: string): string {
  return createHmac("sha256", config.csrfSecret)
    .update(`${CSRF_SESSION_VERSION}.${sessionId}.${issuedAt}.${nonce}`)
    .digest("base64url");
}

export function createAdminSessionCsrfToken(
  config: AdminSecurityConfig,
  sessionId: string,
  now = new Date(),
  nonce = randomBytes(18).toString("base64url")
): string {
  if (!SESSION_ID_PATTERN.test(sessionId)) throw new Error("Admin session id required for a session-bound CSRF token.");
  const issuedAt = String(Math.floor(now.getTime() / 1000));
  return `${CSRF_SESSION_VERSION}.${issuedAt}.${nonce}.${sessionCsrfSignature(config, sessionId, issuedAt, nonce)}`;
}

export function verifyAdminSessionCsrfToken(
  token: string,
  config: AdminSecurityConfig,
  sessionId: string,
  now = new Date()
): boolean {
  if (!SESSION_ID_PATTERN.test(sessionId)) return false;
  const match = /^v2\.(\d{10})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/.exec(token);
  if (!match) return false;
  const issuedAt = Number(match[1]);
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (!Number.isSafeInteger(issuedAt) || issuedAt > nowSeconds + 30 || nowSeconds - issuedAt > CSRF_SESSION_MAX_AGE_SECONDS) return false;
  return constantTimeEqual(match[3], sessionCsrfSignature(config, sessionId, match[1], match[2]));
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

/**
 * The admin session cookie. SameSite=Lax (was Strict) so that opening an admin
 * link from another site (an email, a bookmark manager) keeps the session;
 * cross-site POSTs still carry no cookie, and every mutation also requires a
 * session-bound CSRF token and a same-origin Origin header. HttpOnly, scoped to
 * /admin, Secure outside local development, and it expires with the absolute
 * session lifetime. It carries only an opaque random token, never a role.
 */
export function adminSessionCookieOptions(config: AdminSecurityConfig, expiresAt: Date) {
  return {
    httpOnly: true,
    secure: config.secureCookie,
    sameSite: "lax" as const,
    path: "/admin",
    expires: expiresAt
  };
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
  // `x-vercel-forwarded-for` is set by the platform and cannot be forged by the
  // caller; `x-forwarded-for` can be prepended to, so its leftmost entry is
  // attacker-controlled. This address keys the admin login and MFA rate limits
  // (createAdminRateSubjectHash), so trusting the spoofable header first let an
  // attacker mint a fresh admin-login budget per request. The consumer limiters
  // were corrected in Phase 2; this brings the admin surface in line.
  const platform = headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const realIp = headers.get("x-real-ip")?.trim() ?? "";
  const candidate = isIP(platform) ? platform : isIP(forwarded) ? forwarded : isIP(realIp) ? realIp : null;
  const userAgent = headers.get("user-agent")?.trim();
  return Object.freeze({ ip: candidate, userAgent: userAgent ? userAgent.slice(0, 512) : null });
}

function reauth(reason: AdminReauthReason, recoverable: boolean): AdminAccessDecision {
  return { state: "reauth-required", reason, recoverable };
}

/** A session that ran out on its own (not signed out, not revoked) can be recovered by signing in again. */
function endedByTime(session: AdminSessionRecord): boolean {
  return session.end_reason === "expired" || session.end_reason === "idle-expired";
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
  // From here the caller is a verified, active, AAL2 administrator.
  const session = input.session;
  if (!input.sessionTokenValid || !session) return reauth("missing", true);
  if (session.admin_user_id !== input.admin.id) return reauth("mismatch", false);
  if (session.revoked_at !== null || session.end_reason === "emergency-revocation") return reauth("revoked", false);
  if (session.ended_at !== null) return reauth("ended", endedByTime(session));
  if (session.assurance_level !== "aal2") return reauth("ended", false);
  const now = input.now ?? new Date();
  const expiresAt = Date.parse(session.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return reauth("expired", true);
  if (isAdminSessionIdle(session, now)) return reauth("idle", true);
  return { state: "authorized", admin: input.admin, session };
}

/**
 * The caller has no Supabase session but still presents an admin session
 * cookie. Only a well-formed token that maps to a session of a still-active
 * administrator, which ran out on its own or is otherwise untouched, earns the
 * sign-in redirect; a signed-out or revoked session, an unknown token, or a
 * revoked administrator stays concealed as unauthenticated.
 */
export function decideCookieOnlyAccess(input: Readonly<{
  admin: AdminUserRecord | null;
  session: AdminSessionRecord | null;
  now?: Date;
}>): AdminAccessDecision {
  const { admin, session } = input;
  if (!session || !admin || admin.id !== session.admin_user_id || admin.revoked_at !== null || !admin.mfa_enrolled) {
    return { state: "unauthenticated" };
  }
  if (session.revoked_at !== null || session.end_reason === "emergency-revocation" || session.end_reason === "signed-out") {
    return { state: "unauthenticated" };
  }
  if (session.ended_at !== null) return reauth("ended", true);
  const now = input.now ?? new Date();
  const expiresAt = Date.parse(session.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) return reauth("expired", true);
  if (isAdminSessionIdle(session, now)) return reauth("idle", true);
  // The admin session is still live but the Supabase sign-in is gone.
  return reauth("missing", true);
}
