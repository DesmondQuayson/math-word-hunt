import { describe, expect, it } from "vitest";

import { isSyntheticSecurityTestingAllowed, securityEnvironmentBanner, securityEnvironmentLabel } from "./security-environment";

describe("security environment label", () => {
  it("labels the canonical origin as production and every other platform deployment as staging", () => {
    expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: "production-platform", MVH_APPLICATION_ORIGIN: "https://mathnexa.com" })).toBe("production");
    expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: "production-platform", MVH_APPLICATION_ORIGIN: "https://mathnexa-platform-staging.vercel.app" })).toBe("staging");
    // Transport whitespace on either variable must not change the answer.
    expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: " production-platform\n", MVH_APPLICATION_ORIGIN: " https://mathnexa.com \n" })).toBe("production");
  });

  it("never lets a lookalike or an insecure origin claim the production label", () => {
    for (const origin of ["https://mathnexa.com.evil.example", "https://www.mathnexa.com", "http://mathnexa.com", "https://evil.example/mathnexa.com", "not a url", ""]) {
      expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: "production-platform", MVH_APPLICATION_ORIGIN: origin }), origin).toBe("staging");
    }
  });

  it("maps the remaining identities and treats an unreadable one as unknown", () => {
    expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: "production-public" })).toBe("production");
    expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: "preview" })).toBe("preview");
    expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: "local" })).toBe("local");
    expect(securityEnvironmentLabel({})).toBe("unknown");
    expect(securityEnvironmentLabel({ MVH_APP_ENVIRONMENT: "prod" })).toBe("unknown");
  });

  it("allows synthetic testing only where a false alarm is harmless", () => {
    expect(isSyntheticSecurityTestingAllowed({ MVH_APP_ENVIRONMENT: "production-platform", MVH_APPLICATION_ORIGIN: "https://mathnexa-platform-staging.vercel.app" })).toBe(true);
    expect(isSyntheticSecurityTestingAllowed({ MVH_APP_ENVIRONMENT: "local" })).toBe(true);
    expect(isSyntheticSecurityTestingAllowed({ MVH_APP_ENVIRONMENT: "preview" })).toBe(true);
    expect(isSyntheticSecurityTestingAllowed({ MVH_APP_ENVIRONMENT: "production-platform", MVH_APPLICATION_ORIGIN: "https://mathnexa.com" })).toBe(false);
    expect(isSyntheticSecurityTestingAllowed({ MVH_APP_ENVIRONMENT: "production-public" })).toBe(false);
    // An unreadable identity is not a licence to treat the deployment as a test bed.
    expect(isSyntheticSecurityTestingAllowed({})).toBe(false);
  });

  it("banners are upper-case so STAGING is never mistaken for PRODUCTION in an alert", () => {
    expect(securityEnvironmentBanner("staging")).toBe("STAGING");
    expect(securityEnvironmentBanner("production")).toBe("PRODUCTION");
  });
});
