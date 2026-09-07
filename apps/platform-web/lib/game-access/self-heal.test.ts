import { describe, expect, it } from "vitest";

import { decideGameAccess } from "@math-vocabulary-hunt/platform-core";

import { classifyEntitlementVerification, verifiedRecently } from "./self-heal";

const now = new Date("2026-09-07T12:00:00.000Z");
const classify = (evidence: unknown) => classifyEntitlementVerification({
  evidence,
  decision: decideGameAccess({ authenticated: true, accountStatus: "active", emailConfirmed: true, evidence, serverNow: now }),
  nowMs: now.getTime()
});

describe("when a denied access decision must be confirmed with the billing provider", () => {
  it("never re-checks an allowed decision", () => {
    expect(classify({ state: "subscription-active", periodEndsAt: "2026-10-01T00:00:00.000Z" })).toBeNull();
    expect(classify({ state: "trial-active", trialRedeemedAt: "2026-09-07T00:00:00.000Z", startsAt: "2026-09-07T00:00:00.000Z", endsAt: "2026-09-08T00:00:00.000Z" })).toBeNull();
  });

  it("flags a denial that exists only because the stored paid boundary passed (a missed renewal locally)", () => {
    expect(classify({ state: "subscription-active", periodEndsAt: "2026-09-01T00:00:00.000Z" })).toBe("clock-expired");
    expect(classify({ state: "subscription-canceled-through-period-end", periodEndsAt: "2026-09-07T12:00:00.000Z" })).toBe("clock-expired");
    expect(classify({ state: "subscription-grace-period", periodEndsAt: "2026-08-25T00:00:00.000Z", graceEndsAt: "2026-09-01T00:00:00.000Z" })).toBe("clock-expired");
    expect(classify({ state: "trial-active", trialRedeemedAt: "2026-09-05T00:00:00.000Z", startsAt: "2026-09-05T00:00:00.000Z", endsAt: "2026-09-06T00:00:00.000Z" })).toBe("clock-expired");
  });

  it("re-checks stored denials the provider may have moved past", () => {
    expect(classify({ state: "subscription-past-due", periodEndsAt: null })).toBe("denied-recoverable");
    expect(classify({ state: "subscription-expired", endedAt: "2026-08-01T00:00:00.000Z" })).toBe("denied-recoverable");
    expect(classify({ state: "trial-expired", trialRedeemedAt: "2026-08-01T00:00:00.000Z", endedAt: "2026-08-02T00:00:00.000Z" })).toBe("denied-recoverable");
    expect(classify({ state: "no-entitlement", trialRedeemedAt: null })).toBe("denied-recoverable");
  });

  it("leaves activation-in-flight and malformed evidence alone", () => {
    expect(classify({ state: "trial-pending", trialRedeemedAt: "2026-09-07T11:00:00.000Z" })).toBeNull();
    expect(classify({})).toBeNull();
    expect(classify({ state: "subscription-active" })).toBeNull();
  });
});

describe("recent verification window", () => {
  it("trusts a stored denial only when the provider confirmed it inside the window", () => {
    expect(verifiedRecently("2026-09-07T11:58:00.000Z", now.getTime(), 300)).toBe(true);
    expect(verifiedRecently("2026-09-07T11:50:00.000Z", now.getTime(), 300)).toBe(false);
    expect(verifiedRecently(null, now.getTime(), 300)).toBe(false);
    expect(verifiedRecently("not a date", now.getTime(), 300)).toBe(false);
  });
});

describe("evidence envelope handling", () => {
  it("classifies the all-access envelope the repository actually returns, not only a bare entitlement", () => {
    const envelope = { capabilityKey: "MATHNEXA_ALL_ACCESS", entitlement: { state: "subscription-active", periodEndsAt: "2026-09-01T00:00:00.000Z" } };
    expect(classify(envelope)).toBe("clock-expired");
    expect(classify({ capabilityKey: "GAMES_ONLY", entitlement: envelope.entitlement })).toBeNull();
  });
});
