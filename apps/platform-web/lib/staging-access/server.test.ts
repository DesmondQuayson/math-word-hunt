import { describe, expect, it } from "vitest";

import {
  createStagingAccessCookieValue,
  getStagingAccessToken,
  isStagingAccessRequired,
  isValidStagingAccessCookie,
  isValidStagingBearerAuthorization,
  stagingAccessNotFoundResponse
} from "./server";

const token = "A".repeat(43);
const enabled = {
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_STAGING_ACCESS_REQUIRED: "true",
  MVH_STAGING_ACCESS_TOKEN: token
};

describe("staging access security primitives", () => {
  it("requires the lock only for the explicit isolated staging contract", () => {
    expect(isStagingAccessRequired(enabled)).toBe(true);
    expect(isStagingAccessRequired({ ...enabled, MVH_APP_ENVIRONMENT: "production-public" })).toBe(false);
    expect(isStagingAccessRequired({ ...enabled, MVH_STAGING_ACCESS_REQUIRED: "false" })).toBe(false);
  });

  it("fails closed for missing or malformed secrets", () => {
    expect(getStagingAccessToken({ ...enabled, MVH_STAGING_ACCESS_TOKEN: "short" })).toBeNull();
    expect(isValidStagingBearerAuthorization(`Bearer ${token}`, { ...enabled, MVH_STAGING_ACCESS_TOKEN: "short" })).toBe(false);
    expect(createStagingAccessCookieValue({ ...enabled, MVH_STAGING_ACCESS_TOKEN: "short" })).toBeNull();
  });

  it("accepts only the exact Bearer credential", () => {
    expect(isValidStagingBearerAuthorization(`Bearer ${token}`, enabled)).toBe(true);
    expect(isValidStagingBearerAuthorization(`bearer ${token}`, enabled)).toBe(true);
    expect(isValidStagingBearerAuthorization(`Bearer ${"B".repeat(43)}`, enabled)).toBe(false);
    expect(isValidStagingBearerAuthorization(`Bearer ${token} extra`, enabled)).toBe(false);
    expect(isValidStagingBearerAuthorization(null, enabled)).toBe(false);
  });

  it("uses an opaque signed cookie and rejects tampering", () => {
    const cookie = createStagingAccessCookieValue(enabled);
    expect(cookie).toMatch(/^v1\.[A-Za-z0-9_-]{43}$/);
    expect(cookie).not.toContain(token);
    expect(isValidStagingAccessCookie(cookie ?? undefined, enabled)).toBe(true);
    expect(isValidStagingAccessCookie(`${cookie?.slice(0, -1)}B`, enabled)).toBe(false);
    expect(isValidStagingAccessCookie(undefined, enabled)).toBe(false);
  });

  it("returns a content-free, non-cacheable, non-indexable hard 404", async () => {
    const response = stagingAccessNotFoundResponse();
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});
