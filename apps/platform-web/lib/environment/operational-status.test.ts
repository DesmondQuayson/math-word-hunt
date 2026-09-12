import { describe, expect, it } from "vitest";
import { getOperationalStatus } from "./operational-status";

/**
 * Production bug sweep BS-02. `/status` claimed "Search indexing: Blocked" and
 * "Live payments: Disabled" on a site that allows crawling and takes live
 * payments. These tests pin the truthful derivation and the fail-closed
 * behaviour: the contract observes configuration and never guesses.
 */

const liveProduction = {
  NODE_ENV: "production",
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_APPLICATION_ORIGIN: "https://mathnexa.com",
  MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: "https://mathnexa-platform-production.vercel.app",
  MVH_LEGAL_REVIEW: "owner-approved",
  MVH_TERMS_VERSION: "2026-08-01",
  MVH_PRIVACY_VERSION: "2026-08-01",
  MVH_CANCELLATION_POLICY_VERSION: "2026-08-01",
  MVH_REFUND_POLICY_VERSION: "2026-08-01",
  MVH_SUPABASE_PROJECT_REF: "production-live",
  MVH_PRODUCTION_SUPABASE_PROJECT_REF: "production-live",
  MVH_PREVIEW_SUPABASE_PROJECT_REF: "preview-isolated",
  MVH_IDENTITY_MODEL: "consumer-v1",
  NEXT_PUBLIC_SUPABASE_URL: "https://production-live.supabase.co",
  SUPABASE_URL: "https://production-live.supabase.co",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "publishable-production-live-key",
  SUPABASE_SECRET_KEY: "secret-production-live-key",
  MVH_STRIPE_MODE: "live",
  MVH_COMMERCIAL_ACTIVATION: "live",
  MVH_EMAIL_DELIVERY: "transactional-verified",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_DELETION_MODE: "dry-run",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  MVH_SUPPORT_EMAIL: "support@mathnexa.com",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "stripe",
  BILLING_LIVE_ACTIVATION: "owner-approved",
  BILLING_APP_BASE_URL: "https://mathnexa.com",
  BILLING_CHECKOUT_ENABLED: "false",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false",
  STRIPE_MODE: "live",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: ["pk", "live", "production12345"].join("_"),
  STRIPE_SECRET_KEY: ["sk", "live", "production12345"].join("_"),
  STRIPE_WEBHOOK_SECRET: "whsec_production12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_production123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_production123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_production123"
} as NodeJS.ProcessEnv;

const testModeProduction = {
  ...liveProduction,
  MVH_STRIPE_MODE: "test",
  STRIPE_MODE: "test",
  STRIPE_PUBLISHABLE_KEY: ["pk", "test", "sandbox12345"].join("_"),
  STRIPE_SECRET_KEY: ["sk", "test", "sandbox12345"].join("_"),
  STRIPE_WEBHOOK_SECRET: "whsec_sandbox12345",
  MVH_COMMERCIAL_ACTIVATION: undefined,
  BILLING_LIVE_ACTIVATION: undefined
} as NodeJS.ProcessEnv;

const billingDisabledProduction = {
  ...testModeProduction,
  MVH_STRIPE_MODE: "disabled",
  BILLING_ENABLED: "false"
} as NodeJS.ProcessEnv;

const publicSiteProduction = {
  NODE_ENV: "production",
  MVH_APP_ENVIRONMENT: "production-public",
  MVH_APPLICATION_ORIGIN: "https://mathnexa.com",
  MVH_STRIPE_MODE: "disabled",
  MVH_EMAIL_DELIVERY: "disabled",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "forbidden",
  MVH_DELETION_MODE: "disabled",
  MVH_PILOT_STATE: "inactive",
  MVH_INVITATIONS_ENABLED: "false",
  BILLING_ENABLED: "false"
} as NodeJS.ProcessEnv;

const preview = {
  NODE_ENV: "test",
  MVH_APP_ENVIRONMENT: "preview",
  MVH_APPLICATION_ORIGIN: "https://preview.example.invalid",
  MVH_SUPABASE_PROJECT_REF: "preview-only",
  MVH_STRIPE_MODE: "test",
  MVH_EMAIL_DELIVERY: "local-capture",
  MVH_MONITORING_MODE: "console",
  MVH_FIXTURE_POLICY: "allowed",
  MVH_DELETION_MODE: "dry-run"
} as NodeJS.ProcessEnv;

describe("operational status contract", () => {
  it("reports the live platform truthfully", () => {
    expect(getOperationalStatus(liveProduction)).toEqual({
      environment: "production",
      platform: "operational",
      searchIndexing: "enabled",
      payments: "live"
    });
  });

  it("reports test-mode billing as test, not live and not disabled", () => {
    expect(getOperationalStatus(testModeProduction)).toEqual({
      environment: "production",
      platform: "operational",
      searchIndexing: "enabled",
      payments: "test"
    });
  });

  it("reports unavailable payments when billing is genuinely off", () => {
    expect(getOperationalStatus(billingDisabledProduction)).toEqual({
      environment: "production",
      platform: "operational",
      searchIndexing: "enabled",
      payments: "unavailable"
    });
  });

  it("keeps the public marketing site indexable with no payment surface", () => {
    expect(getOperationalStatus(publicSiteProduction)).toEqual({
      environment: "production",
      platform: "operational",
      searchIndexing: "enabled",
      payments: "unavailable"
    });
  });

  it("reports a preview as staging, blocked and test", () => {
    expect(getOperationalStatus(preview)).toEqual({
      environment: "staging",
      platform: "operational",
      searchIndexing: "blocked",
      payments: "test"
    });
  });

  it("private and admin deny rules do not make the public site read as blocked", () => {
    // The platform's robots policy denies /admin, /api, /sign-in and the rest;
    // the public verdict must still be "enabled".
    expect(getOperationalStatus(liveProduction).searchIndexing).toBe("enabled");
  });

  it("says unknown rather than guessing when the server contract is invalid", () => {
    for (const source of [
      {} as NodeJS.ProcessEnv,
      { NODE_ENV: "production", MVH_APP_ENVIRONMENT: "production-platform" } as NodeJS.ProcessEnv,
      { ...liveProduction, MVH_APPLICATION_ORIGIN: "not-a-url" } as NodeJS.ProcessEnv
    ]) {
      expect(getOperationalStatus(source)).toEqual({
        environment: "unknown",
        platform: "configuration-required",
        searchIndexing: "unknown",
        payments: "unknown"
      });
    }
  });

  it("never claims live payments without the owner-approved live markers", () => {
    const withoutActivation = { ...liveProduction, BILLING_LIVE_ACTIVATION: undefined } as NodeJS.ProcessEnv;
    expect(getOperationalStatus(withoutActivation).payments).not.toBe("live");
    const withoutCommercial = { ...liveProduction, MVH_COMMERCIAL_ACTIVATION: undefined } as NodeJS.ProcessEnv;
    expect(getOperationalStatus(withoutCommercial).payments).not.toBe("live");
  });

  it("cannot be forged from browser-visible or request-shaped values", () => {
    const forged = {
      ...preview,
      NEXT_PUBLIC_MVH_APP_ENVIRONMENT: "production-platform",
      MVH_STATUS_OVERRIDE: "live",
      searchIndexing: "enabled",
      payments: "live"
    } as NodeJS.ProcessEnv;
    expect(getOperationalStatus(forged)).toEqual({
      environment: "staging",
      platform: "operational",
      searchIndexing: "blocked",
      payments: "test"
    });
  });

  it("publishes no secrets, provider identities or configuration names", () => {
    const serialized = JSON.stringify(getOperationalStatus(liveProduction));
    expect(serialized).not.toMatch(/secret|token|key|project|supabase|stripe|sk_|pk_|whsec/i);
    expect(serialized).not.toContain("production-live");
    expect(serialized).not.toContain("MVH_");
    expect(Object.keys(getOperationalStatus(liveProduction))).toEqual([
      "environment",
      "platform",
      "searchIndexing",
      "payments"
    ]);
  });
});
