import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const checkout = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/app/billing-actions", () => ({
  // Never settles, like a redirect to Stripe that is still in flight.
  startCheckoutAction: vi.fn(() => { checkout.calls += 1; return new Promise(() => {}); })
}));

import { CommercialConsentForm } from "./commercial-consent-form";

afterEach(() => { cleanup(); checkout.calls = 0; });

describe("CommercialConsentForm", () => {
  it("keeps all seven required consents and offers the trial only when eligible", () => {
    render(<CommercialConsentForm />);
    expect(screen.getAllByRole("checkbox")).toHaveLength(7);
    for (const box of screen.getAllByRole("checkbox")) expect((box as HTMLInputElement).required).toBe(true);
    expect(screen.getByRole("button", { name: "Start free trial" })).toBeTruthy();
    cleanup();
    render(<CommercialConsentForm trialEligible={false} />);
    expect(screen.queryByRole("button", { name: "Start free trial" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue to secure checkout" })).toBeTruthy();
  });

  it("submits once, shows progress and blocks repeated taps", async () => {
    const user = userEvent.setup();
    render(<CommercialConsentForm />);
    for (const box of screen.getAllByRole("checkbox")) await user.click(box);
    const button = screen.getByRole("button", { name: "Start free trial" });
    await user.click(button);
    await user.click(button);
    await user.click(button);
    await waitFor(() => expect(screen.getByRole("button", { name: /Opening secure checkout/ })).toHaveProperty("disabled", true));
    expect(checkout.calls).toBe(1);
  });
});
