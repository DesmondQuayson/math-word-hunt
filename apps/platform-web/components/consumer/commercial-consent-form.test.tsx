import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const checkout = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/app/billing-actions", () => ({
  // Never settles, like a redirect to Stripe that is still in flight.
  startCheckoutAction: vi.fn(() => { checkout.calls += 1; return new Promise(() => {}); })
}));

import { COMMERCIAL_CONSENT_FIELDS, COMMERCIAL_CONSENT_INPUTS, parseCommercialConsentForm } from "@/lib/commercial/policy";

import { CommercialConsentForm } from "./commercial-consent-form";

afterEach(() => { cleanup(); checkout.calls = 0; });

const textOf = (element: Element) => (element.textContent ?? "").replace(/\s+/g, " ").trim();

describe("CommercialConsentForm", () => {
  it("asks for two separate, unticked, required agreements and offers the trial only when eligible", () => {
    render(<CommercialConsentForm />);
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((box) => box.name)).toEqual(Object.keys(COMMERCIAL_CONSENT_INPUTS));
    for (const box of boxes) {
      expect(box.required).toBe(true);
      expect(box.checked).toBe(false);
      expect(box.defaultChecked).toBe(false);
    }
    expect(screen.getByRole("button", { name: "Start free trial" })).toBeTruthy();
    cleanup();
    render(<CommercialConsentForm trialEligible={false} />);
    expect(screen.queryByRole("button", { name: "Start free trial" })).toBeNull();
    expect(screen.getByRole("button", { name: "Continue to secure checkout" })).toBeTruthy();
  });

  it("states every material term right above the agreements", () => {
    render(<CommercialConsentForm />);
    const terms = textOf(screen.getByLabelText("Key subscription terms"));
    expect(terms).toContain("24-hour free trial starts. You are not charged today. One free trial per account.");
    expect(terms).toContain("Stripe charges your card $5.99 USD, then $5.99 USD every month, automatically, until you cancel.");
    expect(terms).toContain("choose “Manage or cancel in Stripe”");
    expect(terms).toContain("Cancel before the trial ends and you won’t be charged.");
    expect(terms).toContain("Refunds are not automatic or guaranteed. Questions: MathNexa Support.");
    // The cancel-by and first-charge date, in the reader's time zone, once the page has loaded.
    expect(terms).toMatch(/If you start now, the trial ends and the first charge is due on \w{3}, \w{3} \d{1,2}, \d{4}, \d{1,2}:\d{2}\s?[AP]M \S+; cancel before then to pay nothing\./);
    const due = Date.parse(screen.getByTestId("trial-end-estimate").textContent!.replace(/\s(?:[A-Z]{2,5}|GMT[+-]\d+(?::\d{2})?|UTC)$/, ""));
    expect(Math.abs(due - (Date.now() + 86_400_000))).toBeLessThan(120_000 + 24 * 3_600_000); // a calendar date about a day ahead (parsed without its zone)
    const [renewal, agreement] = screen.getAllByRole("checkbox").map((box) => textOf(box.closest("label")!));
    expect(renewal).toBe("I agree to the automatic renewal terms above and authorize MathNexa to charge my card $5.99 USD when my 24-hour free trial ends and then every month until I cancel.");
    expect(screen.getByText("By starting your free trial, you enroll in a MathNexa subscription that renews automatically every month until you cancel.")).toBeTruthy();
    expect(agreement).toBe("I agree to the Subscription Terms, including the cancellation policy and refund policy, and I have read the Privacy Notice.");
    const links = within(screen.getAllByRole("checkbox")[1].closest("label") as HTMLElement).getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(links).toEqual(["/terms", "/cancellation", "/refunds", "/privacy"]);
  });

  it("tells an account whose trial is used that it is charged today", () => {
    render(<CommercialConsentForm trialEligible={false} />);
    const terms = textOf(screen.getByLabelText("Key subscription terms"));
    expect(terms).toContain("Your account has already used its free trial.");
    expect(terms).toContain("are charged $5.99 USD today.");
    expect(terms).not.toContain("Cancel before the trial ends");
    expect(terms).not.toContain("If you start now");
    expect(textOf(screen.getAllByRole("checkbox")[0].closest("label")!)).toBe(
      "I agree to the automatic renewal terms above and authorize MathNexa to charge my card $5.99 USD today and then every month until I cancel. My account has already used its free trial."
    );
    expect(screen.getByText("By continuing, you enroll in a MathNexa subscription that renews automatically every month until you cancel.")).toBeTruthy();
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

describe("parseCommercialConsentForm", () => {
  const form = (entries: Record<string, string>) => {
    const data = new FormData();
    for (const [key, value] of Object.entries(entries)) data.set(key, value);
    return data;
  };

  it("records all seven acceptances only when both agreements are ticked", () => {
    const decision = parseCommercialConsentForm(form({ automaticRenewalConsent: "accepted", subscriptionTermsConsent: "accepted" }));
    expect(decision).toEqual(Object.fromEntries(COMMERCIAL_CONSENT_FIELDS.map((field) => [field, true])));
    expect(Object.isFrozen(decision)).toBe(true);
  });

  it("refuses a missing, altered or old-style submission", () => {
    expect(parseCommercialConsentForm(form({ automaticRenewalConsent: "accepted" }))).toBeNull();
    expect(parseCommercialConsentForm(form({ subscriptionTermsConsent: "accepted" }))).toBeNull();
    expect(parseCommercialConsentForm(form({ automaticRenewalConsent: "on", subscriptionTermsConsent: "accepted" }))).toBeNull();
    expect(parseCommercialConsentForm(form(Object.fromEntries(COMMERCIAL_CONSENT_FIELDS.map((field) => [field, "accepted"]))))).toBeNull();
  });

  it("maps every recorded acceptance to exactly one agreement", () => {
    const mapped = Object.values(COMMERCIAL_CONSENT_INPUTS).flat();
    expect([...mapped].sort()).toEqual([...COMMERCIAL_CONSENT_FIELDS].sort());
    expect(new Set(mapped).size).toBe(mapped.length);
    expect(COMMERCIAL_CONSENT_INPUTS.automaticRenewalConsent).toEqual(["automaticRenewalAccepted", "trialAccepted", "monthlyPriceAccepted"]);
  });
});
