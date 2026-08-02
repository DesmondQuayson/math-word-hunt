import { afterEach, describe, expect, it } from "vitest";

import { getAdminSecurityConfig, isAdminFeatureEnabled } from "./config";
import {
  createAdminCsrfToken,
  createAdminRateSubjectHash,
  decideAdminAccess,
  hashAdminSessionToken,
  isSameOriginAdminRequest,
  verifyAdminCsrfToken
} from "./security";
import type { AdminSessionRecord, AdminUserRecord } from "./types";

const original = { ...process.env };
afterEach(() => { process.env = { ...original }; });

const config = {
  csrfSecret: "phase8a-test-only-secret-that-is-long-enough",
  applicationOrigin: "https://mathnexa.example",
  secureCookie: true,
  sessionMinutes: 15,
  loginMaxAttempts: 5,
  mfaMaxAttempts: 5,
  rateWindowSeconds: 300,
  rateBlockSeconds: 900
} as const;

const admin: AdminUserRecord = {
  id: "10000000-0000-4000-8000-000000000001",
  user_id: "10000000-0000-4000-8000-000000000002",
  role: "owner",
  mfa_enrolled: true,
  created_at: "2026-08-02T12:00:00.000Z",
  revoked_at: null
};

const session: AdminSessionRecord = {
  id: "10000000-0000-4000-8000-000000000003",
  admin_user_id: admin.id,
  token_hash: "a".repeat(64),
  assurance_level: "aal2",
  started_at: "2026-08-02T12:00:00.000Z",
  expires_at: "2026-08-02T12:15:00.000Z",
  ended_at: null,
  revoked_at: null,
  end_reason: null
};

function decision(overrides: Partial<Parameters<typeof decideAdminAccess>[0]> = {}) {
  return decideAdminAccess({
    featureEnabled: true,
    infrastructureAvailable: true,
    authenticated: true,
    emailVerified: true,
    assuranceLevel: "aal2",
    admin,
    session,
    sessionTokenValid: true,
    now: new Date("2026-08-02T12:05:00.000Z"),
    ...overrides
  });
}

describe("Phase 8A admin security primitives", () => {
  it("is controlled by one explicit fail-closed feature flag", () => {
    delete process.env.MVH_ADMIN_ENABLED;
    process.env.MVH_ADMIN_CSRF_SECRET = config.csrfSecret;
    process.env.MVH_APPLICATION_ORIGIN = config.applicationOrigin;
    expect(isAdminFeatureEnabled()).toBe(false);
    expect(getAdminSecurityConfig()).toBeNull();
    process.env.MVH_ADMIN_ENABLED = "true";
    expect(getAdminSecurityConfig()?.sessionMinutes).toBe(15);
    expect(getAdminSecurityConfig()?.secureCookie).toBe(true);
    process.env.MVH_ADMIN_CSRF_SECRET = "too-short";
    expect(getAdminSecurityConfig()).toBeNull();
  });

  it("bounds privileged session lifetime configuration", () => {
    process.env.MVH_ADMIN_ENABLED = "true";
    process.env.MVH_ADMIN_CSRF_SECRET = config.csrfSecret;
    process.env.MVH_APPLICATION_ORIGIN = config.applicationOrigin;
    process.env.MVH_ADMIN_SESSION_MINUTES = "90";
    expect(getAdminSecurityConfig()?.sessionMinutes).toBe(15);
    process.env.MVH_ADMIN_SESSION_MINUTES = "5";
    expect(getAdminSecurityConfig()?.sessionMinutes).toBe(5);
  });

  it("fails closed on missing or insecure non-local application origins", () => {
    const source = { MVH_ADMIN_ENABLED: "true", MVH_ADMIN_CSRF_SECRET: config.csrfSecret };
    expect(getAdminSecurityConfig(source)).toBeNull();
    expect(getAdminSecurityConfig({ ...source, MVH_APPLICATION_ORIGIN: "http://mathnexa.example" })).toBeNull();
    expect(getAdminSecurityConfig({ ...source, MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3000", NODE_ENV: "test" })?.secureCookie).toBe(false);
    expect(getAdminSecurityConfig({ ...source, MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3000", NODE_ENV: "production" })).toBeNull();
  });

  it("signs, expires, and rejects tampered CSRF tokens", () => {
    const now = new Date("2026-08-02T12:00:00.000Z");
    const token = createAdminCsrfToken(config, now, "A".repeat(24));
    expect(verifyAdminCsrfToken(token, config, new Date("2026-08-02T12:09:59.000Z"))).toBe(true);
    expect(verifyAdminCsrfToken(`${token.slice(0, -1)}B`, config, now)).toBe(false);
    expect(verifyAdminCsrfToken(token, config, new Date("2026-08-02T12:10:01.000Z"))).toBe(false);
  });

  it("requires exact same-origin state-changing requests", () => {
    const valid = new Headers({ origin: "https://mathnexa.example", host: "mathnexa.example" });
    expect(isSameOriginAdminRequest(valid, "https://mathnexa.example")).toBe(true);
    expect(isSameOriginAdminRequest(new Headers({ origin: "https://evil.example", host: "mathnexa.example" }), "https://mathnexa.example")).toBe(false);
    expect(isSameOriginAdminRequest(new Headers({ host: "mathnexa.example" }), "https://mathnexa.example")).toBe(false);
  });

  it("hashes only correctly formed opaque session tokens", () => {
    expect(hashAdminSessionToken("A".repeat(43))).toMatch(/^[0-9a-f]{64}$/);
    expect(hashAdminSessionToken("forged-admin=true")).toBeNull();
  });

  it("uses a keyed pseudonymous rate-limit subject", () => {
    const result = createAdminRateSubjectHash("login", "owner@example.test", { ip: "127.0.0.1", userAgent: null }, config);
    expect(result).toMatch(/^[0-9a-f]{64}$/);
    expect(result).not.toContain("owner");
  });

  it("denies unauthenticated and ordinary authenticated users", () => {
    expect(decision({ authenticated: false, emailVerified: false, admin: null, session: null }).state).toBe("unauthenticated");
    expect(decision({ admin: null, session: null }).state).toBe("non-admin");
  });

  it("denies an admin until TOTP-backed AAL2 is present", () => {
    expect(decision({ assuranceLevel: "aal1" }).state).toBe("mfa-required");
    expect(decision({ admin: { ...admin, mfa_enrolled: false } }).state).toBe("mfa-required");
  });

  it("denies forged, missing, expired, and ended server sessions", () => {
    expect(decision({ sessionTokenValid: false }).state).toBe("reauth-required");
    expect(decision({ session: null }).state).toBe("reauth-required");
    expect(decision({ now: new Date(session.expires_at) }).state).toBe("reauth-required");
    expect(decision({ session: { ...session, ended_at: "2026-08-02T12:04:00.000Z", end_reason: "signed-out" } }).state).toBe("reauth-required");
  });

  it("denies revocation immediately despite a previously valid session", () => {
    expect(decision({ admin: { ...admin, revoked_at: "2026-08-02T12:04:00.000Z" } }).state).toBe("non-admin");
    expect(decision({ session: { ...session, revoked_at: "2026-08-02T12:04:00.000Z", ended_at: "2026-08-02T12:04:00.000Z", end_reason: "emergency-revocation" } }).state).toBe("reauth-required");
  });

  it("authorizes only the complete server-verified contract", () => {
    expect(decision()).toMatchObject({ state: "authorized", admin, session });
  });
});
