import { describe, expect, it } from "vitest";

import { BILLING_EVENT_ALLOWLIST, isAllowlistedBillingEvent, parseCheckoutIntent } from "./contracts";

describe("server-only billing boundaries", () => {
  it("accepts only internal paid plan keys and allowlisted return destinations", () => {
    expect(parseCheckoutIntent({ planKey: "teacher-pro-monthly", returnDestination: "/account" })).toEqual({
      planKey: "teacher-pro-monthly",
      returnDestination: "/account"
    });
    for (const forged of [
      { planKey: "price_forged", returnDestination: "/account" },
      { planKey: "teacher-pro-monthly", returnDestination: "https://evil.test" },
      { planKey: "free", returnDestination: "/account" }
    ]) expect(() => parseCheckoutIntent(forged)).toThrow("Invalid checkout request");
  });

  it("does not accept arbitrary event types", () => {
    expect(BILLING_EVENT_ALLOWLIST).toHaveLength(6);
    expect(isAllowlistedBillingEvent("customer.subscription.updated")).toBe(true);
    expect(isAllowlistedBillingEvent("charge.refunded")).toBe(false);
  });
});

