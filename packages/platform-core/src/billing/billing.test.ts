import { describe, expect, it } from "vitest";

import { BILLING_CATALOG, defineBillingCatalog } from "./catalog";
import { parseBillingPlanKey } from "./plan-keys";
import { deriveBillingEntitlement, normalizeBillingSubscriptionStatus } from "./subscription-state";
import { BILLING_UI_COPY, BILLING_UI_STATES } from "./ui-state";

const now = new Date("2026-07-26T12:00:00.000Z");
const eligible = {
  accountStatus: "active" as const,
  planKey: "teacher-pro-monthly" as const,
  planApproved: true,
  environmentMatches: true,
  subscriptionStatus: "active",
  currentPeriodEnd: "2026-08-26T12:00:00.000Z",
  duplicateActiveSubscriptions: false,
  now
};

describe("billing contracts", () => {
  it("freezes the authorized sandbox catalog", () => {
    expect(BILLING_CATALOG.map((plan) => plan.key)).toEqual(["free", "teacher-pro-monthly", "teacher-pro-annual", "mathnexa-monthly"]);
    expect(BILLING_CATALOG.map((plan) => plan.amountMinorUnits)).toEqual([0, 999, 7999, 599]);
    expect(() => parseBillingPlanKey("district-enterprise")).toThrow("Unknown billing plan key");
  });

  it("rejects duplicate plans and prematurely priced paid plans", () => {
    const free = BILLING_CATALOG[0]!;
    const monthly = BILLING_CATALOG[1]!;
    expect(() => defineBillingCatalog([free, free])).toThrow(/Duplicate billing plan/);
    expect(() => defineBillingCatalog([{ ...monthly, amountMinorUnits: null, currency: null }])).toThrow("Paid test pricing must be explicit");
  });

  it("allows only verified active state with a future period", () => {
    expect(deriveBillingEntitlement(eligible)).toMatchObject({ access: "allow", disposition: "active" });
    expect(deriveBillingEntitlement({ ...eligible, currentPeriodEnd: "2026-01-01T00:00:00.000Z" }).access).toBe("deny");
  });

  it.each(["incomplete", "incomplete_expired", "past_due", "unpaid", "paused", "canceled", "deleted", "malformed"])("defaults %s to denial", (status) => {
    expect(deriveBillingEntitlement({ ...eligible, subscriptionStatus: status }).access).toBe("deny");
  });

  it("denies trials and applies account and emergency overrides", () => {
    expect(deriveBillingEntitlement({ ...eligible, subscriptionStatus: "trialing" }).access).toBe("deny");
    expect(deriveBillingEntitlement({ ...eligible, emergencyDefaultDeny: true }).reason).toBe("emergency-default-deny");
    expect(deriveBillingEntitlement({ ...eligible, accountStatus: "suspended" }).reason).toBe("account-restricted");
    expect(deriveBillingEntitlement({ ...eligible, accountStatus: "deletion-requested" }).access).toBe("deny");
  });

  it("sends mismatches and duplicates to manual review without access", () => {
    expect(deriveBillingEntitlement({ ...eligible, environmentMatches: false })).toMatchObject({ access: "deny", disposition: "manual-review" });
    expect(deriveBillingEntitlement({ ...eligible, duplicateActiveSubscriptions: true }).reason).toBe("duplicate-subscription");
    expect(normalizeBillingSubscriptionStatus("future_status")).toBeNull();
  });

  it("defines direct, nontechnical copy for every UI state", () => {
    expect(Object.keys(BILLING_UI_COPY).sort()).toEqual([...BILLING_UI_STATES].sort());
    expect(JSON.stringify(BILLING_UI_COPY)).not.toMatch(/cus_|sub_|webhook|database/i);
  });
});
