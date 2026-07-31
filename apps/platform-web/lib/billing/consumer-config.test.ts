import { describe, expect, it } from "vitest";

import { parseConsumerBillingConfiguration } from "./consumer-config";

const valid = {
  MVH_APP_ENVIRONMENT: "production-platform",
  MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "true",
  MVH_STRIPE_MODE: "test",
  BILLING_ENABLED: "true",
  BILLING_PROVIDER: "fixture",
  STRIPE_MODE: "test",
  STRIPE_API_VERSION: "2026-02-25.clover",
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
    ["live mode", { STRIPE_MODE: "live" }],
    ["annual price", { STRIPE_PRICE_MATHNEXA_MONTHLY: "" }],
    ["automatic refunds", { BILLING_AUTOMATIC_REFUNDS: "true" }],
    ["unsafe URL", { BILLING_APP_BASE_URL: "https://safe.test/?next=https://evil.test" }],
    ["fixture outside rehearsal", { MVH_ALLOW_LOCAL_PRODUCTION_REHEARSAL: "false" }],
    ["invalid grace", { BILLING_RENEWAL_GRACE_DAYS: "0" }]
  ])("fails closed for %s", (_label, override) => {
    expect(() => parseConsumerBillingConfiguration({ ...valid, ...override })).toThrow();
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
