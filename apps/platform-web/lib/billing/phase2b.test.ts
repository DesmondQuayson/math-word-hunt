import { describe, expect, it } from "vitest";

import { parseBillingConfiguration } from "./config";
import { APPROVED_TEST_PLANS } from "./models";
import { billingIdempotencyKey, safeBillingMetadata } from "./security";
import { validateApprovedPrice, validateCustomerOwnership } from "./validation";

describe("Phase 2 billing security contracts", () => {
  it("maps only the authorized sandbox prices", () => expect(APPROVED_TEST_PLANS).toEqual({
    "teacher-pro-monthly": { amountMinorUnits: 999, currency: "usd", interval: "month" },
    "teacher-pro-annual": { amountMinorUnits: 7999, currency: "usd", interval: "year" }
  }));
  it("validates exact product, amount, currency, interval, mode and activity", () => {
    const price = { id: "price_monthly", productId: "prod_teacher", active: true, livemode: false, currency: "usd", amountMinorUnits: 999, interval: "month", intervalCount: 1, usageType: "licensed" };
    expect(validateApprovedPrice(price, "teacher-pro-monthly", "prod_teacher")).toBe(true);
    for (const change of [{ livemode: true }, { amountMinorUnits: 998 }, { productId: "prod_foreign" }, { interval: "year" }, { active: false }]) expect(validateApprovedPrice({ ...price, ...change }, "teacher-pro-monthly", "prod_teacher")).toBe(false);
  });
  it("requires corroborated immutable customer ownership", () => expect(validateCustomerOwnership({ id: "cus_x", livemode: false, deleted: false, ownerReference: "teacher-a", email: "changed@example.test" }, "teacher-a")).toBe(true));
  it("creates deterministic scoped idempotency keys and minimal metadata", () => {
    expect(billingIdempotencyKey("checkout", "teacher-a", "monthly")).toBe(billingIdempotencyKey("checkout", "teacher-a", "monthly"));
    expect(safeBillingMetadata("teacher-a", "teacher-pro-monthly")).toEqual({ mvh_teacher_id: "teacher-a", mvh_product_key: "math-vocabulary-hunt", mvh_plan_key: "teacher-pro-monthly" });
    expect(JSON.stringify(safeBillingMetadata("teacher-a"))).not.toMatch(/student|class|roster/i);
  });
  it("keeps production activation explicit and cannot use fixtures", () => {
    expect(() => parseBillingConfiguration({ BILLING_ENABLED: "true", BILLING_ENVIRONMENT: "production", BILLING_PROVIDER: "fixture" })).toThrow();
  });
});

