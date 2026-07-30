import { describe, expect, it } from "vitest";

import { BillingConfigurationError, parseBillingConfiguration } from "./config";

const valid = {
  BILLING_ENABLED: "true",
  BILLING_ENVIRONMENT: "local",
  BILLING_PROVIDER: "stripe",
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-02-25.clover",
  STRIPE_PUBLISHABLE_KEY: "pk_test_example12345",
  STRIPE_SECRET_KEY: "sk_test_example12345",
  STRIPE_WEBHOOK_SECRET: "whsec_example12345",
  STRIPE_PRODUCT_TEACHER_PRO: "prod_example123",
  STRIPE_PRICE_TEACHER_PRO_MONTHLY: "price_monthly123",
  STRIPE_PRICE_TEACHER_PRO_ANNUAL: "price_annual123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_example123",
  BILLING_APP_BASE_URL: "http://127.0.0.1:3000",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false"
};

describe("billing configuration", () => {
  it("defaults only through an explicit disabled configuration", () => {
    expect(parseBillingConfiguration({ BILLING_ENABLED: "false", BILLING_ENVIRONMENT: "preview" })).toEqual({
      enabled: false,
      applicationEnvironment: "preview"
    });
    expect(() => parseBillingConfiguration({ BILLING_ENVIRONMENT: "local" })).toThrow(BillingConfigurationError);
  });

  it("accepts a complete local test-mode mapping", () => {
    const result = parseBillingConfiguration(valid);
    expect(result).toMatchObject({ enabled: true, applicationEnvironment: "local", stripeMode: "test" });
  });

  it("rejects missing, mixed, malformed, duplicate, and unsafe configuration", () => {
    expect(() => parseBillingConfiguration({ ...valid, STRIPE_SECRET_KEY: "" })).toThrow(/missing-stripe-secret-key/);
    expect(() => parseBillingConfiguration({ ...valid, STRIPE_MODE: "live" })).toThrow(/environment-mode-mismatch/);
    expect(() => parseBillingConfiguration({ ...valid, STRIPE_SECRET_KEY: "bad" })).toThrow(/secret-key-mode-or-format/);
    expect(() => parseBillingConfiguration({ ...valid, STRIPE_PRICE_TEACHER_PRO_ANNUAL: valid.STRIPE_PRICE_TEACHER_PRO_MONTHLY })).toThrow(/duplicate-plan-mapping/);
    expect(() => parseBillingConfiguration({ ...valid, BILLING_APP_BASE_URL: "https://example.test/account?next=https://evil.test" })).toThrow(/unsafe-application-base-url/);
    expect(() => parseBillingConfiguration({ ...valid, BILLING_ENVIRONMENT: "preview", BILLING_APP_BASE_URL: "http://localhost:3000" })).toThrow(/unsafe-application-base-url/);
    expect(() => parseBillingConfiguration({ ...valid, STRIPE_API_VERSION: "account-default" })).toThrow(/stripe-api-version-mismatch/);
    expect(() => parseBillingConfiguration({ ...valid, BILLING_CHECKOUT_ENABLED: "yes" })).toThrow(/invalid-billing-checkout-enabled/);
    expect(() => parseBillingConfiguration({ ...valid, BILLING_ENVIRONMENT: "preview", BILLING_PROVIDER: "fixture", BILLING_APP_BASE_URL: "https://preview.example.test" })).toThrow(/fixture-provider-environment/);
  });

  it("requires a separate owner activation marker for production live mode", () => {
    const live = ["live", "example12345"].join("_");
    const production = {
      ...valid,
      BILLING_ENVIRONMENT: "production",
      STRIPE_MODE: "live",
      STRIPE_PUBLISHABLE_KEY: `pk_${live}`,
      STRIPE_SECRET_KEY: `sk_${live}`,
      BILLING_APP_BASE_URL: "https://billing.example.test"
    };
    expect(() => parseBillingConfiguration(production)).toThrow(/production-not-owner-approved/);
    expect(parseBillingConfiguration({ ...production, BILLING_LIVE_ACTIVATION: "owner-approved" })).toMatchObject({ stripeMode: "live" });
  });

  it("allows only explicitly disabled billing in public Production", () => {
    expect(parseBillingConfiguration({ BILLING_ENABLED: "false", BILLING_ENVIRONMENT: "production-public" })).toEqual({ enabled: false, applicationEnvironment: "production-public" });
    expect(() => parseBillingConfiguration({ BILLING_ENABLED: "true", BILLING_ENVIRONMENT: "production-public" })).toThrow(/public-production-billing-disabled/);
  });

  it("never includes a supplied secret value in an error", () => {
    const marker = "do-not-echo-this-value";
    try {
      parseBillingConfiguration({ ...valid, STRIPE_WEBHOOK_SECRET: marker });
      throw new Error("expected rejection");
    } catch (error) {
      expect(String(error)).not.toContain(marker);
    }
  });
});
