import { describe, expect, it } from "vitest";

import { parseConsumerBillingConfiguration } from "./consumer-config";

const valid = {
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true",
  MVH_STRIPE_MODE: "test",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "fixture",
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-07-29.dahlia",
  STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345",
  STRIPE_SECRET_KEY: "sk_test_fixture12345",
  STRIPE_WEBHOOK_SECRET: "whsec_fixture12345",
  STRIPE_PRODUCT_MATHNEXA: "prod_mathnexa123",
  STRIPE_PRICE_MATHNEXA_MONTHLY: "price_mathnexa123",
  STRIPE_PORTAL_CONFIGURATION_ID: "bpc_mathnexa123",
  BILLING_APP_BASE_URL: "http://127.0.0.1:3000",
  BILLING_CHECKOUT_ENABLED: "true",
  BILLING_PORTAL_ENABLED: "true",
  BILLING_WEBHOOK_ENABLED: "true",
  BILLING_EMERGENCY_DEFAULT_DENY: "false",
  BILLING_RENEWAL_GRACE_DAYS: "7",
  BILLING_REFUND_REVIEW_DAYS: "7",
  BILLING_AUTOMATIC_REFUNDS: "false"
};

describe("MathNexa Stripe Sandbox configuration", () => {
  it("accepts only the complete consumer monthly Sandbox contract", () => {
    expect(parseConsumerBillingConfiguration(valid)).toMatchObject({
      provider: "fixture",
      stripeMode: "test",
      renewalGraceDays: 7,
      refundReviewDays: 7,
      automaticRefunds: false
    });
  });

  it.each([
    ["mixed live mode", { STRIPE_MODE: "live" }],
    ["annual price", { STRIPE_PRICE_MATHNEXA_MONTHLY: "" }],
    ["automatic refunds", { BILLING_AUTOMATIC_REFUNDS: "true" }],
    ["unsafe URL", { BILLING_APP_BASE_URL: "https://safe.test/?next=https://evil.test" }],
    ["fixture outside rehearsal", { MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "false" }],
    ["invalid grace", { BILLING_RENEWAL_GRACE_DAYS: "0" }]
  ])("fails closed for %s", (_label, override) => {
    expect(() => parseConsumerBillingConfiguration({ ...valid, ...override })).toThrow();
  });

  it("keeps Checkout disabled when the flag is absent", () => {
    const withoutCheckout = Object.fromEntries(Object.entries(valid).filter(([key]) => key !== "BILLING_CHECKOUT_ENABLED"));
    expect(parseConsumerBillingConfiguration(withoutCheckout).checkoutEnabled).toBe(false);
  });

  it("accepts Live only with exact production, legal, support, and activation gates", () => {
    const live = {
      ...valid,
      MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "false",
      MVH_STRIPE_MODE: "live",
      MVH_COMMERCIAL_ACTIVATION: "live",
      MVH_EMAIL_DELIVERY: "transactional-verified",
      MVH_FIXTURE_POLICY: "forbidden",
      MVH_IDENTITY_MODEL: "consumer-v1",
      MVH_LEGAL_REVIEW: "owner-approved",
      MVH_TERMS_VERSION: "2026-08-01",
      MVH_PRIVACY_VERSION: "2026-08-01",
      MVH_CANCELLATION_POLICY_VERSION: "2026-08-01",
      MVH_REFUND_POLICY_VERSION: "2026-08-01",
      MVH_SUPPORT_EMAIL: "support@mathnexa.com",
      MVH_APPLICATION_ORIGIN: "https://mathnexa.com",
      MVH_SUBSCRIBER_MANAGEMENT_ORIGIN: "https://mathnexa-platform-production.vercel.app",
      BILLING_PROVIDER: "stripe",
      BILLING_LIVE_ACTIVATION: "owner-approved",
      BILLING_APP_BASE_URL: "https://mathnexa.com",
      STRIPE_MODE: "live",
      STRIPE_PUBLISHABLE_KEY: "pk_live_fixture12345",
      STRIPE_SECRET_KEY: "sk_live_fixture12345"
    };
    expect(parseConsumerBillingConfiguration(live)).toMatchObject({
      stripeMode: "live",
      commercialActivation: "live",
      applicationBaseUrl: "https://mathnexa.com",
      subscriberManagementBaseUrl: "https://mathnexa-platform-production.vercel.app",
      checkoutEnabled: true
    });
    expect(() => parseConsumerBillingConfiguration({ ...live, STRIPE_SECRET_KEY: "sk_test_fixture12345" })).toThrow(/mode-or-format/);
    expect(() => parseConsumerBillingConfiguration({ ...live, STRIPE_PUBLISHABLE_KEY: "pk_test_fixture12345" })).toThrow(/mode-or-format/);
    expect(() => parseConsumerBillingConfiguration({ ...live, BILLING_LIVE_ACTIVATION: "not-approved" })).toThrow(/activation/);
    expect(parseConsumerBillingConfiguration({ ...live, BILLING_CHECKOUT_ENABLED: "false" })).toMatchObject({
      stripeMode: "live",
      checkoutEnabled: false
    });
  });

  it("rejects Live activation in Stripe Test mode", () => {
    expect(() => parseConsumerBillingConfiguration({
      ...valid,
      BILLING_PROVIDER: "stripe",
      MVH_COMMERCIAL_ACTIVATION: "live",
      BILLING_LIVE_ACTIVATION: "owner-approved"
    })).toThrow(/conflict/);
  });

  it("never returns a supplied secret in an error", () => {
    const marker = "never-print-this-secret";
    try {
      parseConsumerBillingConfiguration({ ...valid, STRIPE_SECRET_KEY: marker });
      throw new Error("expected rejection");
    } catch (error) {
      expect(String(error)).not.toContain(marker);
    }
  });
});
