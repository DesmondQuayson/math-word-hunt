import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import type { GameAccessDecision } from "@math-vocabulary-hunt/platform-core";

import { GameAccessStatus } from "./game-access-status";

afterEach(cleanup);

const REASONS: GameAccessDecision["reason"][] = [
  "authentication-required", "email-confirmation-required", "checkout-required", "trial-activation-pending",
  "trial-access-active", "trial-ended", "subscription-access-active", "payment-past-due", "renewal-grace-active",
  "canceled-access-active", "subscription-ended", "account-suspended", "account-deletion-pending",
  "subscription-verification-unavailable", "malformed-entitlement"
];

describe("access status messages", () => {
  it.each(REASONS)("%s speaks of access to MathNexa resources, not game access", (reason) => {
    const decision = { allowed: false, reason, nextAction: "none", accessEndsAt: null } as unknown as GameAccessDecision;
    const { container } = render(<GameAccessStatus decision={decision} />);
    expect(screen.getByRole("status", { name: "Access status" })).toBeTruthy();
    expect(container.textContent).not.toMatch(/game[- ]access|game launch/i);
  });

  it("asks a signed-out visitor to sign in to check their access", () => {
    const decision = { allowed: false, reason: "authentication-required", nextAction: "sign-in", accessEndsAt: null } as unknown as GameAccessDecision;
    render(<GameAccessStatus decision={decision} />);
    expect(screen.getByText("Sign in to check your access.")).toBeTruthy();
  });
});
