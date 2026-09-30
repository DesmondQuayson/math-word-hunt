import { describe, expect, it } from "vitest";

import {
  adminSessionCookieOptions,
  createAdminCsrfToken,
  createAdminSessionCsrfToken,
  decideAdminAccess,
  decideCookieOnlyAccess,
  verifyAdminCsrfToken,
  verifyAdminSessionCsrfToken
} from "./security";
import type { AdminSessionRecord, AdminUserRecord } from "./types";

const config = {
  csrfSecret: "phase2b-test-only-secret-that-is-long-enough",
  applicationOrigin: "https://mathnexa.example",
  secureCookie: true,
  sessionMinutes: 120,
  loginMaxAttempts: 5,
  mfaMaxAttempts: 5,
  rateWindowSeconds: 300,
  rateBlockSeconds: 900
} as const;

const admin: AdminUserRecord = {
  id: "20000000-0000-4000-8000-000000000001",
  user_id: "20000000-0000-4000-8000-000000000002",
  role: "owner",
  mfa_enrolled: true,
  created_at: "2026-09-30T08:00:00.000Z",
  revoked_at: null
};

// A session started at 10:00 with the full 2-hour lifetime.
const session: AdminSessionRecord = {
  id: "20000000-0000-4000-8000-000000000003",
  admin_user_id: admin.id,
  token_hash: "b".repeat(64),
  assurance_level: "aal2",
  started_at: "2026-09-30T10:00:00.000Z",
  expires_at: "2026-09-30T12:00:00.000Z",
  last_activity_at: "2026-09-30T10:00:00.000Z",
  step_up_at: "2026-09-30T10:00:00.000Z",
  ended_at: null,
  revoked_at: null,
  end_reason: null
};
const otherSessionId = "20000000-0000-4000-8000-000000000004";

function decide(overrides: Partial<AdminSessionRecord> = {}, at = "2026-09-30T10:30:00.000Z", extra: Partial<Parameters<typeof decideAdminAccess>[0]> = {}) {
  return decideAdminAccess({
    featureEnabled: true, infrastructureAvailable: true, authenticated: true, emailVerified: true,
    assuranceLevel: "aal2", admin, session: { ...session, ...overrides }, sessionTokenValid: true, now: new Date(at), ...extra
  });
}

describe("Phase 2B session lifetime and idle decisions", () => {
  it("keeps a session valid well beyond the old 15-minute limit", () => {
    expect(decide({ last_activity_at: "2026-09-30T11:40:00.000Z" }, "2026-09-30T11:55:00.000Z").state).toBe("authorized");
  });

  it("ends a session at its absolute expiry, even with recent activity, and lets the administrator sign in again", () => {
    expect(decide({ last_activity_at: "2026-09-30T11:59:00.000Z" }, "2026-09-30T12:00:00.000Z"))
      .toEqual({ state: "reauth-required", reason: "expired", recoverable: true });
  });

  it("ends a session after 60 minutes without activity", () => {
    expect(decide({}, "2026-09-30T10:59:59.000Z").state).toBe("authorized");
    expect(decide({}, "2026-09-30T11:00:00.000Z")).toEqual({ state: "reauth-required", reason: "idle", recoverable: true });
  });

  it("treats recent activity as a fresh idle window", () => {
    expect(decide({ last_activity_at: "2026-09-30T10:45:00.000Z" }, "2026-09-30T11:30:00.000Z").state).toBe("authorized");
  });

  it("sends a verified administrator without a session cookie to sign in again", () => {
    expect(decide({}, undefined, { sessionTokenValid: false })).toEqual({ state: "reauth-required", reason: "missing", recoverable: true });
    expect(decide({}, undefined, { session: null })).toEqual({ state: "reauth-required", reason: "missing", recoverable: true });
  });

  it("keeps sign-out, revocation and another administrator's session concealed", () => {
    expect(decide({ ended_at: "2026-09-30T10:20:00.000Z", end_reason: "signed-out" })).toEqual({ state: "reauth-required", reason: "ended", recoverable: false });
    expect(decide({ ended_at: "2026-09-30T10:20:00.000Z", revoked_at: "2026-09-30T10:20:00.000Z", end_reason: "emergency-revocation" }))
      .toEqual({ state: "reauth-required", reason: "revoked", recoverable: false });
    expect(decide({ admin_user_id: "20000000-0000-4000-8000-000000000099" })).toEqual({ state: "reauth-required", reason: "mismatch", recoverable: false });
  });

  it("lets an administrator whose session already ended by time sign in again", () => {
    expect(decide({ ended_at: "2026-09-30T11:00:00.000Z", end_reason: "idle-expired" })).toMatchObject({ recoverable: true });
    expect(decide({ ended_at: "2026-09-30T12:00:00.000Z", end_reason: "expired" })).toMatchObject({ recoverable: true });
  });

  it("never lets a session decision bypass the non-admin, MFA or revocation checks", () => {
    expect(decide({}, undefined, { admin: null }).state).toBe("non-admin");
    expect(decide({}, undefined, { admin: { ...admin, revoked_at: "2026-09-30T09:00:00.000Z" } }).state).toBe("non-admin");
    expect(decide({}, undefined, { assuranceLevel: "aal1" }).state).toBe("mfa-required");
    expect(decide({}, undefined, { authenticated: false }).state).toBe("unauthenticated");
    expect(decide({}, undefined, { featureEnabled: false }).state).toBe("disabled");
  });
});

describe("Phase 2B cookie-only recovery (no Supabase session)", () => {
  const at = new Date("2026-09-30T10:30:00.000Z");
  it("conceals unknown tokens, revoked administrators, sign-outs and revocations", () => {
    expect(decideCookieOnlyAccess({ admin: null, session: null, now: at }).state).toBe("unauthenticated");
    expect(decideCookieOnlyAccess({ admin: { ...admin, revoked_at: "2026-09-30T09:00:00.000Z" }, session, now: at }).state).toBe("unauthenticated");
    expect(decideCookieOnlyAccess({ admin, session: { ...session, ended_at: "2026-09-30T10:20:00.000Z", end_reason: "signed-out" }, now: at }).state).toBe("unauthenticated");
    expect(decideCookieOnlyAccess({ admin, session: { ...session, ended_at: "2026-09-30T10:20:00.000Z", revoked_at: "2026-09-30T10:20:00.000Z", end_reason: "emergency-revocation" }, now: at }).state).toBe("unauthenticated");
    expect(decideCookieOnlyAccess({ admin: { ...admin, id: "20000000-0000-4000-8000-000000000098" }, session, now: at }).state).toBe("unauthenticated");
  });

  it("sends the owner of an expired, idle or still-live session to sign in again", () => {
    expect(decideCookieOnlyAccess({ admin, session, now: new Date("2026-09-30T12:00:01.000Z") })).toMatchObject({ reason: "expired", recoverable: true });
    expect(decideCookieOnlyAccess({ admin, session, now: new Date("2026-09-30T11:10:00.000Z") })).toMatchObject({ reason: "idle", recoverable: true });
    expect(decideCookieOnlyAccess({ admin, session, now: at })).toMatchObject({ reason: "missing", recoverable: true });
  });
});

describe("Phase 2B session-bound CSRF", () => {
  const issued = new Date("2026-09-30T10:00:00.000Z");
  const token = createAdminSessionCsrfToken(config, session.id, issued, "C".repeat(24));

  it("accepts a token for its own session for as long as the session can last", () => {
    expect(verifyAdminSessionCsrfToken(token, config, session.id, new Date("2026-09-30T10:10:01.000Z")), "no more 10-minute expiry").toBe(true);
    expect(verifyAdminSessionCsrfToken(token, config, session.id, new Date("2026-09-30T11:59:00.000Z"))).toBe(true);
  });

  it("rejects the token for any other admin session", () => {
    expect(verifyAdminSessionCsrfToken(token, config, otherSessionId, issued)).toBe(false);
  });

  it("rejects tampering, a different secret, and anything older than the longest possible session", () => {
    expect(verifyAdminSessionCsrfToken(`${token.slice(0, -1)}${token.endsWith("A") ? "B" : "A"}`, config, session.id, issued)).toBe(false);
    expect(verifyAdminSessionCsrfToken(token, { ...config, csrfSecret: "another-secret-that-is-also-long-enough" }, session.id, issued)).toBe(false);
    expect(verifyAdminSessionCsrfToken(token, config, session.id, new Date("2026-09-30T12:01:01.000Z"))).toBe(false);
    expect(verifyAdminSessionCsrfToken(token, config, session.id, new Date("2026-09-30T09:59:00.000Z")), "issued in the future").toBe(false);
  });

  it("keeps the two token kinds apart", () => {
    const preSession = createAdminCsrfToken(config, issued, "D".repeat(24));
    expect(verifyAdminSessionCsrfToken(preSession, config, session.id, issued)).toBe(false);
    expect(verifyAdminCsrfToken(token, config, issued)).toBe(false);
  });

  it("refuses to bind a token to anything but a session id", () => {
    expect(() => createAdminSessionCsrfToken(config, "not-a-session")).toThrow();
    expect(verifyAdminSessionCsrfToken(token, config, "not-a-session", issued)).toBe(false);
  });
});

describe("Phase 2B admin session cookie", () => {
  it("is Lax, HttpOnly, Secure, scoped to /admin and expires with the session", () => {
    const expiresAt = new Date("2026-09-30T12:00:00.000Z");
    expect(adminSessionCookieOptions(config, expiresAt)).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/admin", expires: expiresAt });
  });

  it("is only non-Secure for a plain-HTTP loopback origin", () => {
    expect(adminSessionCookieOptions({ ...config, secureCookie: false }, new Date()).secure).toBe(false);
  });
});
