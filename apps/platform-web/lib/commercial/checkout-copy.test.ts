import { describe, expect, it } from "vitest";

import { setupCheckoutSubmitMessage } from "./checkout-copy";
import { COMMERCIAL_POLICY } from "./policy";

describe("the line beside Stripe's button on the card page", () => {
  it("states the trial, the price after it and the cancel rule for an account whose trial is unused", () => {
    expect(setupCheckoutSubmitMessage({ trialEligible: true })).toBe(
      "Saving your card starts your 24-hour free trial. After the trial, MathNexa renews at $5.99 USD a month until you cancel. Cancel before the trial ends and you won't be charged."
    );
  });

  it("states only the price for an account that used its trial, and promises no trial", () => {
    const message = setupCheckoutSubmitMessage({ trialEligible: false });
    expect(message).toBe("MathNexa is $5.99 USD a month and renews until you cancel. This account has already used its free trial.");
    expect(message).not.toMatch(/starts your|won't be charged/);
  });

  it("follows the commercial policy, so it can never quote another price or trial length", () => {
    expect(setupCheckoutSubmitMessage({ trialEligible: true }, { ...COMMERCIAL_POLICY, amountMinorUnits: 799, trialSeconds: 172_800 }))
      .toContain("48-hour free trial. After the trial, MathNexa renews at $7.99 USD a month");
  });

  it("fits Stripe's custom text limit", () => {
    for (const trialEligible of [true, false]) expect(setupCheckoutSubmitMessage({ trialEligible }).length).toBeLessThan(1200);
  });
});
