import { describe, expect, it } from "vitest";

import { getPilotPolicy } from "./server";

describe("server pilot policy adapter", () => {
  it("is inactive when configuration is missing", () => expect(getPilotPolicy({})).toMatchObject({ activation: "inactive", activationAllowed: false, configuration: "missing" }));
  it("keeps ready-for-decision separate from activation", () => expect(getPilotPolicy({ MVH_PILOT_READINESS: "ready-for-owner-decision", MVH_PILOT_ACTIVATION: "inactive" })).toMatchObject({ readiness: "ready-for-owner-decision", activation: "inactive", activationAllowed: false }));
  it("denies active, browser-public, and malformed values", () => {
    expect(getPilotPolicy({ MVH_PILOT_READINESS: "ready-for-owner-decision", MVH_PILOT_ACTIVATION: "active" }).configuration).toBe("unsupported");
    expect(getPilotPolicy({ NEXT_PUBLIC_MVH_PILOT_READINESS: "ready-for-owner-decision", NEXT_PUBLIC_MVH_PILOT_ACTIVATION: "active" }).activationAllowed).toBe(false);
    expect(getPilotPolicy({ MVH_PILOT_READINESS: "yes", MVH_PILOT_ACTIVATION: "maybe" }).activationAllowed).toBe(false);
  });
});
