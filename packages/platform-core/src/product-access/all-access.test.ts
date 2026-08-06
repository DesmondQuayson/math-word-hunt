import { describe, expect, it } from "vitest";

import {
  decideMathNexaAccess,
  hasMathNexaModuleAccess,
  MATHNEXA_ALL_ACCESS,
  MATHNEXA_PRODUCT_MODULES
} from "./all-access";

const now = new Date("2026-08-05T12:00:00.000Z");
const active = {
  capabilityKey: MATHNEXA_ALL_ACCESS,
  entitlement: { state: "subscription-active", periodEndsAt: "2026-09-05T12:00:00.000Z" }
} as const;

describe("MathNexa all-access capability", () => {
  it("unlocks every approved module from one authoritative entitlement", () => {
    const decision = decideMathNexaAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence: active, serverNow: now });
    expect(decision.allowed).toBe(true);
    expect(decision.modules).toEqual(MATHNEXA_PRODUCT_MODULES);
    for (const module of MATHNEXA_PRODUCT_MODULES) expect(hasMathNexaModuleAccess(decision, module)).toBe(true);
  });

  it("denies missing, malformed, expired, and browser-invented capabilities for every module", () => {
    const values = [
      {},
      { capabilityKey: "games", entitlement: active.entitlement },
      { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement: active.entitlement, forged: true },
      { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement: { state: "subscription-expired", endedAt: "2026-08-01T00:00:00.000Z" } }
    ];
    for (const evidence of values) {
      const decision = decideMathNexaAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence, serverNow: now });
      expect(decision.allowed).toBe(false);
      expect(decision.modules).toEqual([]);
    }
  });

  it("preserves account and identity restrictions above subscription state", () => {
    expect(decideMathNexaAccess({ authenticated: false, accountStatus: "active", emailConfirmed: false, evidence: active, serverNow: now }).reason).toBe("authentication-required");
    expect(decideMathNexaAccess({ authenticated: true, accountStatus: "suspended", emailConfirmed: true, evidence: active, serverNow: now }).reason).toBe("account-suspended");
    expect(decideMathNexaAccess({ authenticated: true, accountStatus: "deletion-pending", emailConfirmed: true, evidence: active, serverNow: now }).reason).toBe("account-deletion-pending");
  });
});
