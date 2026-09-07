import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  evidence: [] as unknown[],
  reconcile: vi.fn(),
  billingConfigured: true
}));

vi.mock("@/lib/auth/consumer-context", () => ({
  resolveConsumerContext: vi.fn(async () => ({
    status: "active",
    userId: "22222222-2222-4222-8222-222222222222",
    email: null,
    account: {
      userId: "22222222-2222-4222-8222-222222222222",
      accountStatus: "active",
      emailConfirmedAt: "2026-08-01T00:00:00.000Z",
      trialRedeemedAt: "2026-08-01T00:00:00.000Z",
      deletionRequestedAt: null,
      deletionCompletedAt: null,
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z"
    }
  }))
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/school-access/session", () => ({ resolveSchoolAccessSession: vi.fn(async () => null) }));
vi.mock("@/lib/repositories/consumer-entitlement.repository", () => ({
  SupabaseConsumerEntitlementRepository: class {
    async getEvidence() { return state.evidence.length > 1 ? state.evidence.shift() : state.evidence[0]; }
  }
}));
vi.mock("@/lib/billing/consumer-config", () => ({ tryGetConsumerBillingConfiguration: vi.fn(() => state.billingConfigured ? { stripeMode: "test" } : null) }));
vi.mock("@/lib/billing/consumer-service", () => ({ createConsumerBillingRepository: vi.fn(() => ({})) }));
vi.mock("@/lib/billing/consumer-provider-factory", () => ({ createConsumerBillingProvider: vi.fn(() => ({})) }));
vi.mock("@/lib/billing/consumer-reconciliation", () => ({ reconcileConsumerBilling: (...args: unknown[]) => state.reconcile(...args) }));

import { getGameAccessView } from "./server";

const now = new Date("2026-09-07T12:00:00.000Z");
const MATHNEXA_ALL_ACCESS = "MATHNEXA_ALL_ACCESS";
const stale = { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement: { state: "subscription-active", periodEndsAt: "2026-09-01T00:00:00.000Z" } };
const renewed = { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement: { state: "subscription-active", periodEndsAt: "2026-10-01T00:00:00.000Z" } };
const ended = { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement: { state: "subscription-expired", endedAt: "2026-09-01T00:00:00.000Z" } };
const outcome = (value: string, changed: boolean) => ({ outcome: value, changed, states: [], lastSynchronizedAt: null, detail: null });

beforeEach(() => {
  state.evidence = [];
  state.billingConfigured = true;
  state.reconcile.mockReset();
});

describe("self-healing subscriber access", () => {
  it("second successful recurring renewal keeps subscriber access even when its webhook never arrived", async () => {
    // The stored period ended; Stripe has the renewal. The gate must ask Stripe
    // before it says anything, and then let the customer in.
    state.evidence = [stale, renewed];
    state.reconcile.mockResolvedValueOnce(outcome("synchronized", true));
    const view = await getGameAccessView(now);
    expect(state.reconcile).toHaveBeenCalledTimes(1);
    expect(state.reconcile).toHaveBeenCalledWith(expect.objectContaining({ ownerUserId: "22222222-2222-4222-8222-222222222222", source: "reconciliation" }));
    expect(view.decision).toMatchObject({ allowed: true, reason: "subscription-access-active", accessEndsAt: "2026-10-01T00:00:00.000Z" });
    expect(view.decision.modules).toContain("map_prep");
  });

  it("says the subscription ended only after the provider confirmed it ended", async () => {
    state.evidence = [stale, ended];
    state.reconcile.mockResolvedValueOnce(outcome("synchronized", true));
    const view = await getGameAccessView(now);
    expect(view.decision).toMatchObject({ allowed: false, reason: "subscription-ended", nextAction: "manage-subscription" });
  });

  it("never tells a customer the subscription ended when the provider could not be reached", async () => {
    state.evidence = [stale];
    state.reconcile.mockResolvedValueOnce(outcome("unavailable", false));
    const view = await getGameAccessView(now);
    expect(view.decision).toMatchObject({ allowed: false, reason: "subscription-verification-unavailable", nextAction: "manage-subscription", accessEndsAt: null });
    expect(view.decision.modules).toEqual([]);
  });

  it("stays honest when another request is already verifying and the record is still clock-expired", async () => {
    state.evidence = [stale];
    state.reconcile.mockResolvedValueOnce(outcome("throttled", false));
    const view = await getGameAccessView(now);
    expect(view.decision.reason).toBe("subscription-verification-unavailable");
    expect(view.decision.allowed).toBe(false);
  });

  it("does not call the provider for an allowed decision", async () => {
    state.evidence = [renewed];
    const view = await getGameAccessView(now);
    expect(state.reconcile).not.toHaveBeenCalled();
    expect(view.decision.allowed).toBe(true);
  });

  it("re-checks a stored expired record and keeps the honest ended copy when nothing changed", async () => {
    state.evidence = [ended];
    state.reconcile.mockResolvedValueOnce(outcome("synchronized", false));
    const view = await getGameAccessView(now);
    expect(state.reconcile).toHaveBeenCalledTimes(1);
    expect(view.decision).toMatchObject({ allowed: false, reason: "subscription-ended" });
  });

  it("cannot be turned into access by anything the client sends: the decision is recomputed from server evidence only", async () => {
    state.evidence = [ended, ended];
    state.reconcile.mockResolvedValueOnce(outcome("synchronized", true));
    const view = await getGameAccessView(now);
    expect(view.decision.allowed).toBe(false);
  });

  it("falls back to the honest verification copy when billing is not configured for a clock-expired record", async () => {
    state.evidence = [stale];
    state.billingConfigured = false;
    const view = await getGameAccessView(now);
    expect(state.reconcile).not.toHaveBeenCalled();
    expect(view.decision.reason).toBe("subscription-verification-unavailable");
  });
});
