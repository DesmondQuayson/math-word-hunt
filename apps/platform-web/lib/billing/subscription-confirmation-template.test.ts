import { describe, expect, it } from "vitest";

import { centralDateTime, ordinalDay, renderSubscriptionConfirmation, usTimes } from "./subscription-confirmation-template";

const trial = {
  kind: "trial" as const,
  startedAt: "2026-11-22T21:14:00.000Z",
  trialEndsAt: "2026-11-23T21:14:00.000Z",
  applicationOrigin: "https://mathnexa.com",
  supportEmail: "help@example.com"
};

describe("subscription confirmation email", () => {
  it("confirms a trial with its exact end, the charge, how to cancel, versions and contact, and no refunds section", () => {
    const message = renderSubscriptionConfirmation(trial)!;
    expect(message.subject).toBe("Your MathNexa free trial has started");
    const text = message.text;
    expect(text).toContain("Your 24-hour MathNexa free trial has started.");
    expect(text).toContain("Trial started: Sun, Nov 22, 2026, 3:14 PM CST");
    expect(text).toContain("Trial ends: Mon, Nov 23, 2026, 3:14 PM CST");
    expect(text).toContain("(That is 4:14 PM EST · 3:14 PM CST · 2:14 PM MST · 1:14 PM PST.)");
    expect(text).toContain("When the trial ends, your card is charged $5.99 USD, then $5.99 USD every month on or about the 23rd, automatically, until you cancel. There is no minimum term.");
    expect(text).toContain("To pay nothing, cancel before Mon, Nov 23, 2026, 3:14 PM CST: open https://mathnexa.com/subscription and choose \"Manage or cancel in Stripe\".");
    // The free-trial email has no Refunds section (owner, 2026-11-22); the Terms it links still hold the policy.
    expect(text).not.toMatch(/(^|\n)Refunds\n/);
    expect(text).not.toContain("Ask within seven days");
    expect(text).not.toContain("Refunds are not automatic or guaranteed");
    expect(message.html).not.toContain(">Refunds</h2>");
    expect(message.html).not.toContain("seven days");
    expect(text).toContain("the MathNexa Subscription Terms (version 2026-08-01) including the cancellation and refund policies, and the Privacy Notice (version 2026-08-01).");
    // The sections, in order.
    expect([...text.matchAll(/\n\n([A-Z][^\n]+)\n- /g)].map(([, title]) => title)).toEqual(["What happens next", "How to cancel", "What you agreed to", "Questions"]);
    expect(text).toContain("Subscription Terms: https://mathnexa.com/terms");
    expect(text).toContain("Visit https://mathnexa.com/support or write to help@example.com.");
    expect(text).toContain("it is not marketing");
    expect(message.html).toContain("<a href=\"https://mathnexa.com/subscription\">https://mathnexa.com/subscription</a>");
    expect(message.html).toContain("&quot;Manage or cancel in Stripe&quot;");
    expect(message.html).not.toMatch(/<script|on\w+=/i);
  });

  it("confirms a paid subscription without a trial", () => {
    const message = renderSubscriptionConfirmation({ ...trial, kind: "subscription", trialEndsAt: null })!;
    expect(message.subject).toBe("Your MathNexa subscription has started");
    expect(message.text).toContain("Your card was charged $5.99 USD today and will be charged $5.99 USD every month on or about the 22nd, automatically, until you cancel.");
    expect(message.text).toContain("Your account has already used its free trial.");
    expect(message.text).not.toContain("To pay nothing");
    // A charge was made today, so the paid email keeps the refund-review rule.
    expect(message.text).toContain("Refunds\n- Ask within seven days of your first charge and we review a refund by hand. Refunds are not automatic or guaranteed.");
    expect([...message.text.matchAll(/\n\n([A-Z][^\n]+)\n- /g)].map(([, title]) => title)).toEqual(["What happens next", "How to cancel", "Refunds", "What you agreed to", "Questions"]);
  });

  it("refuses unsafe or incomplete input instead of guessing", () => {
    expect(renderSubscriptionConfirmation({ ...trial, applicationOrigin: "javascript:alert(1)" })).toBeNull();
    expect(renderSubscriptionConfirmation({ ...trial, applicationOrigin: "https://mathnexa.com/evil?x=" })).toBeNull();
    expect(renderSubscriptionConfirmation({ ...trial, trialEndsAt: null })).toBeNull();
    expect(renderSubscriptionConfirmation({ ...trial, startedAt: "not a date" })).toBeNull();
    // A malformed support address is left out rather than printed.
    const message = renderSubscriptionConfirmation({ ...trial, supportEmail: "<b>x</b>@example.com" })!;
    expect(message.text).toContain("Visit https://mathnexa.com/support.");
    expect(message.html).not.toContain("<b>x</b>");
  });

  it("formats dates in US time zones across daylight saving", () => {
    expect(centralDateTime("2026-07-04T17:00:00.000Z")).toBe("Sat, Jul 4, 2026, 12:00 PM CDT");
    expect(usTimes("2026-07-04T17:00:00.000Z")).toBe("1:00 PM EDT · 12:00 PM CDT · 11:00 AM MDT · 10:00 AM PDT");
    expect(["2026-11-01T18:00:00Z", "2026-11-02T18:00:00Z", "2026-11-03T18:00:00Z", "2026-11-11T18:00:00Z", "2026-11-12T18:00:00Z", "2026-11-21T18:00:00Z", "2026-11-22T18:00:00Z", "2026-11-23T18:00:00Z", "2026-11-30T18:00:00Z"].map(ordinalDay))
      .toEqual(["1st", "2nd", "3rd", "11th", "12th", "21st", "22nd", "23rd", "30th"]);
  });
});
