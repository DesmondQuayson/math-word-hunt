import { describe, expect, it } from "vitest";

import {
  createStagingAccessCookieValue,
  getStagingAccessToken,
  isStagingAccessRequired,
  isValidStagingAccessCookie,
  isValidStagingBearerAuthorization,
  stagingAccessNotFoundResponse,
  stagingAccessRequirement
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

/**
 * MN-09 regression contract.
 *
 * The gate previously compared `MVH_STAGING_ACCESS_REQUIRED` with strict
 * equality. A value carrying a trailing newline — which is what a shell
 * pipeline produces — read as "not required", and the staging deployment served
 * the complete site with HTTP 200 while appearing correctly configured. These
 * cases exist so that specific failure can never return.
 */
describe("staging gate configuration contract (MN-09)", () => {
  const gateToken = "A".repeat(43);
  const staging = (required?: string) => ({
    MVH_APP_ENVIRONMENT: "production-platform",
    ...(required === undefined ? {} : { MVH_STAGING_ACCESS_REQUIRED: required }),
    MVH_STAGING_ACCESS_TOKEN: gateToken
  });

  it("treats transport whitespace as protection, not as an off switch", () => {
    for (const value of ["true", " true ", "true\n", "\ttrue\r\n", "true\r", "\n\ntrue\n\n", " \t true \t "]) {
      expect(stagingAccessRequirement(staging(value)), `${JSON.stringify(value)} must protect`).toBe("required");
      expect(isStagingAccessRequired(staging(value))).toBe(true);
    }
  });

  it("accepts documented casing rather than silently dropping protection", () => {
    for (const value of ["TRUE", "True", "tRuE", " TRUE\n"]) {
      expect(stagingAccessRequirement(staging(value)), `${value} must protect`).toBe("required");
    }
  });

  it("opens staging only for an exact lowercase false, whitespace aside", () => {
    for (const value of ["false", " false ", "false\n", "\tfalse\r\n"]) {
      expect(stagingAccessRequirement(staging(value)), `${JSON.stringify(value)} must open`).toBe("not-required");
      expect(isStagingAccessRequired(staging(value))).toBe(false);
    }
  });

  it("does not accept a cased false as an instruction to open", () => {
    // Asymmetric on purpose: liberal about "protect", strict about "open".
    // PowerShell stringifies $false as "False", and symmetric case-folding
    // would have let that silently open staging.
    for (const value of ["False", "FALSE", "fAlSe", " FALSE\n"]) {
      expect(stagingAccessRequirement(staging(value)), `${value} must NOT open staging`).toBe("required");
    }
  });

  it("fails closed for every malformed or ambiguous value", () => {
    for (const value of [
      "yes", "1", "0", "on", "off", "no", "tru", "trueXYZ", "false-ish",
      "truthy", "enabled", "disable", "null", "undefined", "y", "n", "-", "true false"
    ]) {
      expect(stagingAccessRequirement(staging(value)), `${JSON.stringify(value)} must protect`).toBe("required");
    }
  });

  it("fails closed when the flag is missing or blank on a token-bearing deployment", () => {
    for (const value of [undefined, "", " ", "\n", "\t\r\n"]) {
      expect(
        stagingAccessRequirement(staging(value)),
        `${JSON.stringify(value)} must protect a staging deployment`
      ).toBe("required");
    }
  });

  it("leaves production open, because production carries no staging configuration", () => {
    // Verified against the live projects: the production project defines
    // neither MVH_STAGING_ACCESS_REQUIRED nor MVH_STAGING_ACCESS_TOKEN.
    expect(stagingAccessRequirement({ MVH_APP_ENVIRONMENT: "production-platform" })).toBe("not-required");
    expect(stagingAccessRequirement({ MVH_APP_ENVIRONMENT: "production-platform", MVH_STAGING_ACCESS_REQUIRED: "" })).toBe("not-required");
    expect(stagingAccessRequirement({})).toBe("not-required");
    // A token that is present but malformed is not a configured gate either,
    // and must not lock a deployment the gate could never be opened on.
    expect(stagingAccessRequirement({
      MVH_APP_ENVIRONMENT: "production-platform",
      MVH_STAGING_ACCESS_TOKEN: "too-short"
    })).toBe("not-required");
  });

  it("does not convert other environments into the staging-gate path", () => {
    for (const environment of ["production-public", "local", "preview", "", undefined]) {
      expect(
        stagingAccessRequirement({
          MVH_APP_ENVIRONMENT: environment,
          MVH_STAGING_ACCESS_REQUIRED: "true",
          MVH_STAGING_ACCESS_TOKEN: gateToken
        }),
        `${String(environment)} must not engage the staging gate`
      ).toBe("not-required");
    }
  });

  it("still protects when the environment name itself carries transport whitespace", () => {
    // The same defect class on a sibling variable: a newline here would skip the
    // gate entirely, however carefully the flag were parsed.
    for (const environment of ["production-platform\n", " production-platform ", "\tproduction-platform\r\n", "Production-Platform"]) {
      expect(
        stagingAccessRequirement({
          MVH_APP_ENVIRONMENT: environment,
          MVH_STAGING_ACCESS_REQUIRED: "true",
          MVH_STAGING_ACCESS_TOKEN: gateToken
        }),
        `${JSON.stringify(environment)} must still protect`
      ).toBe("required");
    }
  });

  it("never returns a third state, so callers cannot mis-handle it", () => {
    const observed = new Set<string>();
    for (const environment of ["production-platform", "production-public", undefined]) {
      for (const value of [undefined, "", "true", "false", "garbage", " TRUE\n"]) {
        observed.add(stagingAccessRequirement({
          MVH_APP_ENVIRONMENT: environment,
          MVH_STAGING_ACCESS_REQUIRED: value,
          MVH_STAGING_ACCESS_TOKEN: gateToken
        }));
      }
    }
    expect([...observed].sort()).toEqual(["not-required", "required"]);
  });

  it("keeps the token resolvable wherever the gate is engaged", () => {
    // A malformed flag now protects, so the token must resolve there too, or the
    // bootstrap endpoint could never mint the cookie and staging would brick.
    expect(getStagingAccessToken(staging("true\n"))).toBe(gateToken);
    expect(getStagingAccessToken(staging("garbage"))).toBe(gateToken);
    expect(getStagingAccessToken(staging("false"))).toBeNull();
  });
});

/**
 * Availability guard for the MN-09 fix.
 *
 * Failing closed on ambiguity is right for a gated staging deployment, but
 * applying it to a deployment with no gate token would mean one typo on the
 * production project blacked out mathnexa.com site-wide — and unrecoverably,
 * because with no token the bootstrap endpoint can never mint an access cookie.
 * These cases pin the line between the two.
 */
describe("staging gate cannot black out an ungated deployment", () => {
  const ungated = (required?: string) => ({
    MVH_APP_ENVIRONMENT: "production-platform",
    ...(required === undefined ? {} : { MVH_STAGING_ACCESS_REQUIRED: required })
  });

  it("leaves a token-less deployment open for every ambiguous value", () => {
    for (const value of [undefined, "", " ", "yes", "1", "tru", "trueXYZ", "false-ish", "garbage"]) {
      expect(
        stagingAccessRequirement(ungated(value)),
        `${JSON.stringify(value)} must not lock a deployment that has no gate token`
      ).toBe("not-required");
    }
  });

  it("still honours an explicitly written true or false anywhere", () => {
    // An explicit instruction is obeyed even without a token: refusing a plainly
    // written "true" would reintroduce the original defect.
    expect(stagingAccessRequirement(ungated("true"))).toBe("required");
    expect(stagingAccessRequirement(ungated(" TRUE\n"))).toBe("required");
    expect(stagingAccessRequirement(ungated("false"))).toBe("not-required");
    // A cased false is ambiguous, and on an ungated deployment ambiguity stays open.
    expect(stagingAccessRequirement(ungated("False"))).toBe("not-required");
  });

  it("keeps ambiguity protective once a real gate token is present", () => {
    const gated = (required?: string) => ({
      ...ungated(required),
      MVH_STAGING_ACCESS_TOKEN: "A".repeat(43)
    });
    for (const value of [undefined, "", "yes", "1", "tru", "garbage"]) {
      expect(
        stagingAccessRequirement(gated(value)),
        `${JSON.stringify(value)} must protect a gated deployment`
      ).toBe("required");
    }
  });
});
