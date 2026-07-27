import { describe, expect, it } from "vitest";

import { billingAccountCopy } from "./copy";

const base = { id: "record", stripeSubscriptionId: "hidden", planKey: "teacher-pro-monthly" as const, status: "active", periodEnd: "2030-01-01T00:00:00.000Z", cancelAtPeriodEnd: false };

describe("teacher-facing billing copy", () => {
  const now = new Date("2029-01-01T00:00:00.000Z");
  it("covers free, active, ending, payment issue, ended, and review states without IDs", () => {
    const states = [billingAccountCopy(null, now), billingAccountCopy(base, now), billingAccountCopy({ ...base, cancelAtPeriodEnd: true }, now), billingAccountCopy({ ...base, status: "past_due" }, now), billingAccountCopy({ ...base, status: "canceled" }, now), billingAccountCopy({ ...base, status: "paused" }, now)];
    expect(states.map((state) => state.title)).toEqual(["Free account", "Teacher Pro active", "Teacher Pro ending at period end", "Payment needs attention", "Subscription ended", "Billing review needed"]);
    expect(JSON.stringify(states)).not.toMatch(/cus_|sub_|price_|evt_/);
  });
  it("treats an expired active projection as ended", () => expect(billingAccountCopy({ ...base, periodEnd: "2028-01-01T00:00:00.000Z" }, now).title).toBe("Subscription ended"));
  it("requires the subscription projection to match verified product access", () => {
    expect(billingAccountCopy(base, now, "free").title).toBe("Billing review needed");
    expect(billingAccountCopy(base, now, "teacher-pro-monthly").title).toBe("Teacher Pro active");
  });
});
