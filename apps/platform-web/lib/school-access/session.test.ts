// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import {
  SCHOOL_ACCESS_DURATION_SECONDS,
  createSchoolAccessToken,
  schoolAccessCookieOptions,
  verifySchoolAccessToken
} from "./session";

const secret = "school-access-session-test-secret-32-bytes-minimum";
const id = "11111111-1111-4111-8111-111111111111";
const now = new Date("2026-08-23T18:00:00.000Z");
const original = { ...process.env };

afterEach(() => { process.env = { ...original }; });

describe("temporary authorized-access session", () => {
  it("creates a signed PII-free token that lasts exactly twelve hours", () => {
    const token = createSchoolAccessToken(secret, now, id);
    expect(token).toBeTruthy();
    expect(token).not.toContain("AESM");
    const session = verifySchoolAccessToken(token!, secret, now);
    expect(session).toEqual({
      id,
      issuedAt: Math.floor(now.getTime() / 1000),
      expiresAt: Math.floor(now.getTime() / 1000) + SCHOOL_ACCESS_DURATION_SECONDS
    });
  });

  it("rejects tampering, the wrong signing key, and expiry", () => {
    const token = createSchoolAccessToken(secret, now, id)!;
    expect(verifySchoolAccessToken(`${token.slice(0, -1)}x`, secret, now)).toBeNull();
    expect(verifySchoolAccessToken(token, `${secret}-wrong`, now)).toBeNull();
    expect(verifySchoolAccessToken(token, secret, new Date(now.getTime() + 12 * 60 * 60 * 1000))).toBeNull();
  });

  it("uses HttpOnly, SameSite=Lax, path-wide, production-Secure cookie settings", () => {
    process.env = { ...process.env, NODE_ENV: "production" };
    expect(schoolAccessCookieOptions()).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: SCHOOL_ACCESS_DURATION_SECONDS
    });
  });
});
