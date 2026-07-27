import { describe, expect, it } from "vitest";

import { CAPABILITY_KEYS, parseCapabilityKey } from "./keys";
import { CAPABILITIES_BY_KEY, CAPABILITY_REGISTRY, defineCapabilityRegistry, parseCapabilityDefinition } from "./registry";
import { decideCapability } from "./authorization";
import { getProductPackage, PRODUCT_PACKAGES } from "./packaging";

const active = { signedIn: true, userId: "teacher-a", accountStatus: "active" } as const;
const free = { state: "free", planKey: "free" } as const;
const environment = { sandbox: true, capabilityEnabled: true, emergencyProDeny: false } as const;

describe("capability registry", () => {
  it("defines every stable capability exactly once with serialization-safe data", () => {
    expect(CAPABILITY_REGISTRY).toHaveLength(CAPABILITY_KEYS.length);
    expect(new Set(CAPABILITY_REGISTRY.map((item) => item.key)).size).toBe(CAPABILITY_KEYS.length);
    expect(JSON.parse(JSON.stringify(CAPABILITY_REGISTRY))).toHaveLength(CAPABILITY_KEYS.length);
    for (const key of CAPABILITY_KEYS) expect(CAPABILITIES_BY_KEY[key].key).toBe(key);
  });

  it("strictly rejects unknown, incomplete, and extended definitions", () => {
    expect(() => parseCapabilityKey("stripe.checkout")).toThrow();
    expect(parseCapabilityDefinition({})).toBeNull();
    expect(parseCapabilityDefinition({ ...CAPABILITY_REGISTRY[0], providerId: "price_forbidden" })).toBeNull();
    expect(() => defineCapabilityRegistry([CAPABILITY_REGISTRY[0]])).toThrow();
  });

  it("keeps unfinished capabilities unavailable on every plan", () => {
    for (const key of ["managed_session.create", "managed_session.view_placeholder", "report.view_placeholder"] as const) {
      expect(CAPABILITIES_BY_KEY[key]).toMatchObject({ availability: "unavailable", free: "not-included", pro: "not-included", operational: false });
    }
  });
});

describe("product packaging", () => {
  it("uses the approved reversible limits and rejects unknown plans", () => {
    expect(getProductPackage("free")).toMatchObject({ activeClassLimit: 2, activeActivityLimit: 3 });
    expect(getProductPackage("teacher-pro-monthly")).toMatchObject({ activeClassLimit: 25, activeActivityLimit: 100 });
    expect(getProductPackage("teacher-pro-annual")).toMatchObject({ activeClassLimit: 25, activeActivityLimit: 100 });
    expect(getProductPackage("enterprise")).toBeNull();
    expect(PRODUCT_PACKAGES).toHaveLength(3);
  });
});

describe("capability authorization", () => {
  it("allows public canonical play while signed out", () => {
    expect(decideCapability({ capabilityKey: "game.launch.canonical", actor: { signedIn: false, userId: null, accountStatus: "active" }, entitlement: free, environment }).allowed).toBe(true);
  });

  it("uses Free and verified Pro limits without trusting a plan string alone", () => {
    const freeAtLimit = decideCapability({ capabilityKey: "class.create", actor: active, entitlement: free, usage: { current: 2 }, environment });
    expect(freeAtLimit).toMatchObject({ allowed: false, reason: "denied_limit_reached", upgradeEligible: true });
    const pro = decideCapability({ capabilityKey: "class.create", actor: active, entitlement: { state: "verified", planKey: "teacher-pro-monthly", expiresAt: "2035-01-01T00:00:00.000Z" }, usage: { current: 24 }, environment, now: new Date("2030-01-01T00:00:00.000Z") });
    expect(pro).toMatchObject({ allowed: true, effectivePlanKey: "teacher-pro-monthly", limit: { maximum: 25, remaining: 1 } });
  });

  it("falls back to Free limits for expired or emergency-denied Pro access", () => {
    const expired = decideCapability({ capabilityKey: "activity.create", actor: active, entitlement: { state: "expired", planKey: "teacher-pro-annual", expiredAt: "2029-01-01T00:00:00.000Z" }, usage: { current: 3 }, environment, now: new Date("2030-01-01T00:00:00.000Z") });
    expect(expired).toMatchObject({ allowed: false, reason: "denied_limit_reached", effectivePlanKey: "free" });
    const emergency = decideCapability({ capabilityKey: "class.create", actor: active, entitlement: { state: "verified", planKey: "teacher-pro-monthly", expiresAt: "2035-01-01T00:00:00.000Z" }, usage: { current: 2 }, environment: { ...environment, emergencyProDeny: true }, now: new Date("2030-01-01T00:00:00.000Z") });
    expect(emergency).toMatchObject({ allowed: false, reason: "denied_limit_reached", effectivePlanKey: "free" });
  });

  it.each([
    ["unknown capability", { capabilityKey: "class.delete", actor: active, entitlement: free, environment }, "denied_malformed_state"],
    ["malformed actor", { capabilityKey: "class.view", actor: { signedIn: true, userId: null, accountStatus: "active" }, entitlement: free, environment }, "denied_malformed_state"],
    ["wrong owner", { capabilityKey: "class.edit", actor: active, entitlement: free, resource: { ownerUserId: "teacher-b", archived: false }, environment }, "denied_wrong_owner"],
    ["suspended", { capabilityKey: "class.view", actor: { ...active, accountStatus: "suspended" }, entitlement: free, environment }, "denied_suspended"],
    ["deletion requested", { capabilityKey: "class.create", actor: { ...active, accountStatus: "deletion-requested" }, entitlement: free, environment }, "denied_deletion_requested"],
    ["manual review", { capabilityKey: "class.create", actor: active, entitlement: { state: "manual-review", planKey: "teacher-pro-monthly" }, environment }, "denied_manual_review"],
    ["unavailable", { capabilityKey: "managed_session.create", actor: active, entitlement: free, environment }, "denied_unavailable"],
    ["environment", { capabilityKey: "billing.checkout", actor: active, entitlement: free, environment: { ...environment, sandbox: false } }, "denied_environment"],
    ["malformed entitlement", { capabilityKey: "class.view", actor: active, entitlement: { state: "verified", planKey: "forged", expiresAt: "never" }, environment }, "denied_malformed_state"]
  ])("denies %s safely", (_label, input, reason) => {
    expect(decideCapability(input)).toMatchObject({ allowed: false, reason });
  });
});
