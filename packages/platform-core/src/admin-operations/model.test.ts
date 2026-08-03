import { describe, expect, it } from "vitest";
import { parseAdminAnalyticsRange, parseAdminFeatureFlagAction } from "./model";

describe("Phase 8H analytics and operations contracts", () => {
  it("accepts bounded UTC date ranges and rejects ambiguous or excessive ranges", () => {
    expect(parseAdminAnalyticsRange({}, new Date("2026-08-02T15:00:00Z"))).toEqual({ from: "2026-07-04", to: "2026-08-02" });
    expect(parseAdminAnalyticsRange({ from: "2026-01-01", to: "2026-12-31" })).toEqual({ from: "2026-01-01", to: "2026-12-31" });
    expect(parseAdminAnalyticsRange({ from: "2026-13-01", to: "2026-12-31" })).toBeNull();
    expect(parseAdminAnalyticsRange({ from: "2025-01-01", to: "2026-12-31" })).toBeNull();
  });

  it("accepts only server-recognized flags with concurrency and audit evidence", () => {
    expect(parseAdminFeatureFlagAction({ flag: "checkout-emergency-disabled", enabled: "true", expectedVersion: "3", reason: "Provider incident response" }))
      .toMatchObject({ flag: "checkout-emergency-disabled", enabled: true, expectedVersion: 3 });
    expect(parseAdminFeatureFlagAction({ flag: "make-owner", enabled: "true", expectedVersion: "1", reason: "Attempt" })).toBeNull();
    expect(parseAdminFeatureFlagAction({ flag: "maintenance-mode", enabled: "true", expectedVersion: "1", reason: "Maintenance", message: "" })).toBeNull();
    expect(parseAdminFeatureFlagAction({ flag: "admin-emergency-disabled", enabled: "true", expectedVersion: "1", reason: "x" })).toBeNull();
  });
});
