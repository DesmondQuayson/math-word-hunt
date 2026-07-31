import { describe, expect, it } from "vitest";

import { decideGameAccess, isTrialEligible, parseGameEntitlementEvidence } from "./entitlement";

const now = new Date("2026-08-01T12:00:00.000Z");
const redeemed = "2026-08-01T00:00:00.000Z";

describe("general-public game entitlement", () => {
  it("requires confirmed identity and defaults missing evidence to deny", () => {
    expect(decideGameAccess({ authenticated: false, accountStatus: "active", emailConfirmed: false, evidence: {}, serverNow: now })).toMatchObject({
      allowed: false, reason: "authentication-required", nextAction: "sign-in"
    });
    expect(decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: false, evidence: { state: "no-entitlement", trialRedeemedAt: null }, serverNow: now })).toMatchObject({
      allowed: false, reason: "email-confirmation-required", nextAction: "confirm-email"
    });
    expect(decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence: {}, serverNow: now })).toMatchObject({
      allowed: false, reason: "malformed-entitlement"
    });
  });

  it("allows one active 24-hour trial only inside authoritative server time", () => {
    const evidence = { state: "trial-active", trialRedeemedAt: redeemed, startsAt: redeemed, endsAt: "2026-08-02T00:00:00.000Z" };
    expect(decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence, serverNow: now })).toMatchObject({
      allowed: true, state: "trial-active", accessEndsAt: "2026-08-02T00:00:00.000Z"
    });
    expect(decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence, serverNow: new Date("2026-08-02T00:00:00.000Z") })).toMatchObject({
      allowed: false, state: "trial-expired", reason: "trial-ended"
    });
  });

  it("allows active and period-end-canceled subscriptions only to their verified end", () => {
    for (const state of ["subscription-active", "subscription-canceled-through-period-end"] as const) {
      expect(decideGameAccess({
        authenticated: true, accountStatus: "active", emailConfirmed: true,
        evidence: { state, periodEndsAt: "2026-09-01T00:00:00.000Z" },
        serverNow: now
      }).allowed).toBe(true);
    }
    expect(decideGameAccess({
      authenticated: true, accountStatus: "active", emailConfirmed: true,
      evidence: { state: "subscription-active", periodEndsAt: "2026-07-01T00:00:00.000Z" },
      serverNow: now
    }).state).toBe("subscription-expired");
  });

  it("denies past-due, suspended, and deletion-pending access", () => {
    expect(decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence: { state: "subscription-past-due", periodEndsAt: null }, serverNow: now }).allowed).toBe(false);
    expect(decideGameAccess({ authenticated: true, accountStatus: "suspended", emailConfirmed: true, evidence: { state: "subscription-active", periodEndsAt: "2026-09-01T00:00:00.000Z" }, serverNow: now }).state).toBe("account-suspended");
    expect(decideGameAccess({ authenticated: true, accountStatus: "deletion-pending", emailConfirmed: true, evidence: { state: "subscription-active", periodEndsAt: "2026-09-01T00:00:00.000Z" }, serverNow: now }).state).toBe("account-deletion-pending");
  });

  it("rejects browser-style extra fields and forged timestamp shapes", () => {
    expect(parseGameEntitlementEvidence({ state: "no-entitlement", trialRedeemedAt: null, premium: true })).toBeNull();
    expect(parseGameEntitlementEvidence({ state: "trial-active", trialRedeemedAt: redeemed, startsAt: redeemed, endsAt: "forever" })).toBeNull();
    expect(parseGameEntitlementEvidence({ state: "trial-active", trialRedeemedAt: redeemed, startsAt: redeemed, endsAt: "2026-08-03T00:00:00.000Z" })).toBeNull();
    expect(decideGameAccess({
      authenticated: true, accountStatus: "active", emailConfirmed: true,
      evidence: { state: "trial-active", trialRedeemedAt: redeemed, startsAt: redeemed, endsAt: "2099-01-01T00:00:00.000Z", clientNow: "2026-01-01" },
      serverNow: now
    }).reason).toBe("malformed-entitlement");
  });

  it("marks a trial as eligible only before authoritative redemption", () => {
    expect(isTrialEligible(null)).toBe(true);
    expect(isTrialEligible(undefined)).toBe(false);
    expect(isTrialEligible(redeemed)).toBe(false);
  });
});
