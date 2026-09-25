import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { COMMERCIAL_POLICY } from "@/lib/commercial/policy";

import { describeApprovedPlan, TrialPlanSummary } from "./trial-plan-summary";

afterEach(cleanup);

describe("trial plan summary", () => {
  it("derives price, currency, interval and trial length from the commercial policy, never restated by hand", () => {
    const plan = describeApprovedPlan();
    expect(plan.price).toBe("$5.99");
    expect(plan.currency).toBe("USD");
    expect(plan.interval).toBe("month");
    expect(plan.intervalAdverb).toBe("monthly");
    expect(plan.trialLabel).toBe("24-hour");
    expect(COMMERCIAL_POLICY.amountMinorUnits).toBe(599);
    expect(COMMERCIAL_POLICY.trialSeconds).toBe(86_400);
  });

  it("names every protected product, Worksheet Generator included, with the unchanged trial and billing facts", () => {
    render(<TrialPlanSummary />);
    const facts = screen.getAllByRole("listitem").map((item) => item.textContent ?? "");
    expect(facts[0]).toBe("24-hour free trial with full access to Math Games, Online Math Prep, Homework PDFs, Quiz PDFs, and Worksheet Generator.");
    expect(facts[1]).toBe("After the trial, $5.99 USD is billed monthly and renews automatically until canceled.");
    expect(facts[2]).toBe("Cancel before the 24-hour trial ends and you won't be charged.");
    expect(screen.getByText("MathNexa monthly")).toBeTruthy();
    expect(document.body.textContent).not.toContain("Start learning");
  });
});
