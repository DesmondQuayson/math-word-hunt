import { describe, expect, it } from "vitest";

import { getProductionPublicCanonicalRedirectUrl, getProductionPublicConfigurationErrors, hasRestrictedProviderConfiguration, isProductionPublicRestrictedPath } from "./production-public";

const safe = { MVH_APP_ENVIRONMENT: "production-public", BILLING_ENABLED: "false", MVH_PILOT_STATE: "inactive", MVH_INVITATIONS_ENABLED: "false" };

describe("public Production boundary", () => {
  it("recognizes every restricted route family", () => {
    for (const route of ["/account", "/api/health", "/auth/callback", "/checkout/status", "/forgot-password", "/pilot/privacy", "/pricing", "/sign-in", "/sign-up", "/status", "/teacher/classes", "/update-password"]) {
      expect(isProductionPublicRestrictedPath(route), route).toBe(true);
    }
    for (const route of ["/", "/play", "/about", "/help", "/privacy", "/accessibility"]) expect(isProductionPublicRestrictedPath(route), route).toBe(false);
  });

  it("rejects provider, billing, pilot, and invitation configuration", () => {
    expect(getProductionPublicConfigurationErrors(safe)).toEqual([]);
    expect(getProductionPublicConfigurationErrors({ ...safe, SUPABASE_SECRET_KEY: "not-a-real-secret" })).toContain("restricted-provider-configuration");
    expect(getProductionPublicConfigurationErrors({ ...safe, BILLING_ENABLED: "true" })).toContain("billing-not-disabled");
    expect(getProductionPublicConfigurationErrors({ ...safe, MVH_PILOT_STATE: "active" })).toContain("pilot-not-inactive");
    expect(getProductionPublicConfigurationErrors({ ...safe, MVH_INVITATIONS_ENABLED: "true" })).toContain("invitations-not-disabled");
  });

  it("treats all Preview and provider credentials as restricted", () => {
    for (const name of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "SUPABASE_URL", "SUPABASE_PUBLISHABLE_KEY", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "MVH_SUPABASE_PROJECT_REF", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "VERCEL_AUTOMATION_BYPASS_SECRET"]) {
      expect(hasRestrictedProviderConfiguration({ [name]: "configured" }), name).toBe(true);
    }
  });

  it("redirects only the www Production host to the canonical HTTPS origin", () => {
    expect(getProductionPublicCanonicalRedirectUrl("https://www.mathnexa.com/play?grade=6", "www.mathnexa.com")?.toString()).toBe("https://mathnexa.com/play?grade=6");
    expect(getProductionPublicCanonicalRedirectUrl("https://mathnexa.com/play", "mathnexa.com")).toBeNull();
    expect(getProductionPublicCanonicalRedirectUrl("https://preview.example.test/play", "preview.example.test")).toBeNull();
  });
});
