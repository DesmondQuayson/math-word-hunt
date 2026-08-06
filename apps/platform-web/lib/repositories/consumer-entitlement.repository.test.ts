import { describe, expect, it } from "vitest";

import { MATHNEXA_ALL_ACCESS } from "@math-vocabulary-hunt/platform-core";

import { SupabaseConsumerEntitlementRepository } from "./consumer-entitlement.repository";

const account = {
  userId: "90000000-0000-4000-8000-000000000001",
  accountStatus: "active",
  emailConfirmedAt: "2026-08-01T00:00:00.000Z",
  trialRedeemedAt: null,
  deletionRequestedAt: null,
  deletionCompletedAt: null,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z"
} as const;

function client(row: Record<string, unknown> | null) {
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: row, error: null })
  };
  return {
    rpc: async () => ({ data: [], error: null }),
    from: () => query
  } as never;
}

describe("consumer all-access repository", () => {
  it("represents an absent row as denied but checkout-eligible server evidence", async () => {
    await expect(new SupabaseConsumerEntitlementRepository(client(null)).getEvidence(account)).resolves.toEqual({
      capabilityKey: MATHNEXA_ALL_ACCESS,
      entitlement: { state: "no-entitlement", trialRedeemedAt: null }
    });
  });

  it("rejects a malformed or non-all-access capability", async () => {
    await expect(new SupabaseConsumerEntitlementRepository(client({ capability_key: "GAMES_ONLY", entitlement_state: "subscription-active", current_period_ends_at: "2099-01-01T00:00:00.000Z" })).getEvidence(account)).resolves.toEqual({});
  });

  it("maps one valid row to the exact shared capability", async () => {
    await expect(new SupabaseConsumerEntitlementRepository(client({ capability_key: MATHNEXA_ALL_ACCESS, entitlement_state: "subscription-active", current_period_ends_at: "2099-01-01T00:00:00.000Z" })).getEvidence(account)).resolves.toEqual({
      capabilityKey: MATHNEXA_ALL_ACCESS,
      entitlement: { state: "subscription-active", periodEndsAt: "2099-01-01T00:00:00.000Z" }
    });
  });
});
