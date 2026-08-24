// @vitest-environment node

import { afterEach, describe, expect, it } from "vitest";

import {
  authorizedCodeMatches,
  getSchoolAccessConfiguration,
  normalizeAuthorizedCode
} from "./config";

const secret = "school-access-session-test-secret-32-bytes-minimum";

describe("authorized school-code configuration", () => {
  const original = process.env;
  afterEach(() => { process.env = { ...original }; });

  it("normalizes case and surrounding whitespace without exposing the configured value", () => {
    const configuration = getSchoolAccessConfiguration({
      MATHNEXA_SCHOOL_ACCESS_CODE: "AESM",
      MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: secret
    });
    expect(configuration).not.toBeNull();
    for (const value of ["AESM", "aesm", "Aesm", " AESM "]) {
      expect(authorizedCodeMatches(value, configuration!)).toBe(true);
    }
    expect(authorizedCodeMatches("AES", configuration!)).toBe(false);
    expect(normalizeAuthorizedCode("  aesm  ")).toBe("AESM");
  });

  it("fails closed for missing, malformed, or browser-public-only configuration", () => {
    expect(getSchoolAccessConfiguration({})).toBeNull();
    expect(getSchoolAccessConfiguration({
      NEXT_PUBLIC_MATHNEXA_SCHOOL_ACCESS_CODE: "AESM",
      MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: secret
    })).toBeNull();
    expect(getSchoolAccessConfiguration({
      MATHNEXA_SCHOOL_ACCESS_CODE: "AESM",
      MATHNEXA_SCHOOL_ACCESS_SESSION_SECRET: "short"
    })).toBeNull();
  });
});
