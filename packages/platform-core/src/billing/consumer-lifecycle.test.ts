import { describe, expect, it } from "vitest";

import {
  classifyConsumerSubscriptionStatus,
  describeConsumerSubscription,
  isTerminalConsumerSubscriptionStatus,
  selectAuthoritativeConsumerSubscription
} from "./consumer-lifecycle";

const now = new Date("2026-09-07T12:00:00.000Z");

type TestRow = Parameters<typeof describeConsumerSubscription>[0] & { stripeSubscriptionId: string };

function row(overrides: Partial<TestRow> = {}): TestRow {
  return {
    stripeSubscriptionId: "sub_test",
    status: "active",
    currentPeriodEnd: "2026-10-01T00:00:00.000Z",
    cancelAtPeriodEnd: false,
    trialEnd: null,
    ...overrides
  };
}

describe("consumer subscription status mapper", () => {
  it("maps every Stripe status deliberately and refuses unknown ones", () => {
    expect(classifyConsumerSubscriptionStatus("active")).toBe("entitled");
    expect(classifyConsumerSubscriptionStatus("trialing")).toBe("entitled");
    expect(classifyConsumerSubscriptionStatus("past_due")).toBe("grace-eligible");
    for (const status of ["incomplete", "unpaid", "paused"]) expect(classifyConsumerSubscriptionStatus(status), status).toBe("pending");
    for (const status of ["canceled", "incomplete_expired"]) expect(classifyConsumerSubscriptionStatus(status), status).toBe("not-entitled");
    for (const status of ["brand_new_status", "", null, undefined, 42]) expect(classifyConsumerSubscriptionStatus(status), String(status)).toBe("unknown");
  });

  it("treats only canceled and incomplete_expired as terminal", () => {
    expect(isTerminalConsumerSubscriptionStatus("canceled")).toBe(true);
    expect(isTerminalConsumerSubscriptionStatus("incomplete_expired")).toBe(true);
    for (const status of ["active", "trialing", "past_due", "unpaid", "incomplete", "paused", "mystery"]) {
      expect(isTerminalConsumerSubscriptionStatus(status), status).toBe(false);
    }
  });
});

describe("authoritative subscription selection", () => {
  it("prefers the live subscription over a more recently updated canceled one", () => {
    const canceled = row({ stripeSubscriptionId: "sub_old", status: "canceled", currentPeriodEnd: "2026-08-01T00:00:00.000Z", updatedAt: "2026-09-07T11:59:00.000Z" });
    const active = row({ stripeSubscriptionId: "sub_new", status: "active", currentPeriodEnd: "2026-10-01T00:00:00.000Z", updatedAt: "2026-09-01T00:00:00.000Z" });
    expect(selectAuthoritativeConsumerSubscription([canceled, active])?.stripeSubscriptionId).toBe("sub_new");
    expect(selectAuthoritativeConsumerSubscription([active, canceled])?.stripeSubscriptionId).toBe("sub_new");
  });

  it("falls back to the furthest-reaching historical subscription and never to an arbitrary row", () => {
    const older = row({ stripeSubscriptionId: "sub_a", status: "canceled", currentPeriodEnd: "2026-06-01T00:00:00.000Z" });
    const newer = row({ stripeSubscriptionId: "sub_b", status: "canceled", currentPeriodEnd: "2026-08-01T00:00:00.000Z" });
    expect(selectAuthoritativeConsumerSubscription([older, newer])?.stripeSubscriptionId).toBe("sub_b");
    expect(selectAuthoritativeConsumerSubscription([newer, older])?.stripeSubscriptionId).toBe("sub_b");
    expect(selectAuthoritativeConsumerSubscription([])).toBeNull();
  });

  it("uses the trial boundary when a trialing row has no period end", () => {
    const trialing = row({ stripeSubscriptionId: "sub_trial", status: "trialing", currentPeriodEnd: null, trialEnd: "2026-09-08T12:00:00.000Z" });
    const canceled = row({ stripeSubscriptionId: "sub_old", status: "canceled" });
    expect(selectAuthoritativeConsumerSubscription([canceled, trialing])?.stripeSubscriptionId).toBe("sub_trial");
  });
});

describe("customer-facing subscription description", () => {
  it("shows renewal for an active subscription and the cancel date for a scheduled cancellation", () => {
    expect(describeConsumerSubscription(row(), now)).toMatchObject({ label: "Active", boundaryLabel: "Renews", boundaryAt: "2026-10-01T00:00:00.000Z", tone: "success" });
    expect(describeConsumerSubscription(row({ cancelAtPeriodEnd: true }), now)).toMatchObject({ label: "Active until period end", boundaryLabel: "Cancels", tone: "information" });
  });

  it("never calls a live subscription with a stale local period ended", () => {
    const stale = describeConsumerSubscription(row({ currentPeriodEnd: "2026-09-01T00:00:00.000Z" }), now);
    expect(stale.label).not.toMatch(/ended/i);
    expect(stale.label).toMatch(/confirming renewal/i);
    expect(stale.tone).toBe("information");
  });

  it("describes trials, payment attention, and ended subscriptions honestly", () => {
    expect(describeConsumerSubscription(row({ status: "trialing", currentPeriodEnd: null, trialEnd: "2026-09-08T12:00:00.000Z" }), now)).toMatchObject({ label: "Trial active", boundaryLabel: "Trial ends" });
    expect(describeConsumerSubscription(row({ status: "trialing", currentPeriodEnd: null, trialEnd: "2026-09-07T11:00:00.000Z" }), now).label).not.toMatch(/ended/i);
    for (const status of ["past_due", "unpaid", "incomplete", "paused"]) {
      expect(describeConsumerSubscription(row({ status }), now), status).toMatchObject({ label: "Payment requires attention", tone: "warning" });
    }
    expect(describeConsumerSubscription(row({ status: "canceled", endedAt: "2026-09-01T00:00:00.000Z" }), now)).toMatchObject({ label: "Ended", boundaryLabel: "Ended", boundaryAt: "2026-09-01T00:00:00.000Z" });
    expect(describeConsumerSubscription(row({ status: "something_new" }), now)).toMatchObject({ label: "Status under review", category: "unknown" });
  });
});
