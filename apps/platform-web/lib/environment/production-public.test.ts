import { describe, expect, it } from "vitest";

import { PLATFORM_HOST_REDIRECT_EXEMPT_PATHS, getPlatformCanonicalRedirectUrl, getProductionPublicCanonicalRedirectUrl, getProductionPublicConfigurationErrors, hasRestrictedProviderConfiguration, isProductionPublicRestrictedPath } from "./production-public";

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

describe("production-platform host normalization and machine endpoints", () => {
  const platform = { MVH_APPLICATION_ORIGIN: "https://mathnexa.com" };

  it("still converges browsers from www and *.vercel.app onto the apex", () => {
    expect(getPlatformCanonicalRedirectUrl("https://www.mathnexa.com/account", "www.mathnexa.com", platform)?.toString()).toBe("https://mathnexa.com/account");
    expect(getPlatformCanonicalRedirectUrl("https://mathnexa-platform-production.vercel.app/pricing?x=1", "mathnexa-platform-production.vercel.app", platform)?.toString()).toBe("https://mathnexa.com/pricing?x=1");
    expect(getPlatformCanonicalRedirectUrl("https://mathnexa.com/account", "mathnexa.com", platform)).toBeNull();
  });

  it("never redirects the Stripe webhook or health endpoint away from the host they were configured with", () => {
    // Stripe does not follow redirects. A 308 on the webhook path is a failed
    // delivery, and a failed delivery on every renewal is a paying customer who
    // loses access. The endpoint must answer wherever the account points it.
    for (const host of ["www.mathnexa.com", "mathnexa-platform-production.vercel.app", "mathnexa-production.vercel.app"]) {
      expect(getPlatformCanonicalRedirectUrl(`https://${host}/api/billing/webhook`, host, platform), host).toBeNull();
      expect(getPlatformCanonicalRedirectUrl(`https://${host}/api/health`, host, platform), host).toBeNull();
    }
    expect(PLATFORM_HOST_REDIRECT_EXEMPT_PATHS).toEqual(["/api/billing/webhook", "/api/health"]);
  });
});
