import { describe, expect, it } from "vitest";

import { getPilotPolicy } from "./server";

describe("server pilot policy adapter", () => {
  it("is inactive when configuration is missing", () => expect(getPilotPolicy({})).toMatchObject({ state: "inactive", activationAllowed: false, configuration: "missing" }));
  const complete = {
    MVH_APP_ENVIRONMENT: "preview", MVH_PILOT_STATE: "active", MVH_PILOT_START_AT: "2026-09-01T14:00:00-05:00", MVH_PILOT_END_AT: "2026-09-22T14:00:00-05:00",
    MVH_EMAIL_DELIVERY: "transactional-verified", MVH_PILOT_OWNER_GO: "complete", MVH_PILOT_DATES_APPROVED: "complete", MVH_PILOT_SUPPORT_CHANNEL: "complete",
    MVH_PILOT_AUTH_EMAIL_VERIFIED: "complete", MVH_PILOT_CONFIRMATION_FLOW: "complete", MVH_PILOT_RECOVERY_FLOW: "complete", MVH_PILOT_HUMAN_ACCESS: "complete",
    MVH_PILOT_PRIVACY_POLICY: "complete", MVH_PILOT_INCIDENT_OPERATOR: "complete", MVH_PILOT_ROLLBACK_OPERATOR: "complete"
  } as const;
  it("activates only from a complete server-owned contract", () => expect(getPilotPolicy(complete)).toMatchObject({ state: "active", activationAllowed: true }));
  it("keeps ready-for-decision separate from activation", () => expect(getPilotPolicy({ ...complete, MVH_PILOT_OWNER_GO: "incomplete" })).toMatchObject({ state: "ready-for-owner-decision", readiness: "ready-for-owner-decision", activationAllowed: false }));
  it("denies active browser-public values", () => expect(getPilotPolicy({ NEXT_PUBLIC_MVH_PILOT_STATE: "active" })).toMatchObject({ state: "inactive", activationAllowed: false }));
  it.each(["maybe", "launch", "enabled"])("denies malformed state %s", (MVH_PILOT_STATE) => expect(getPilotPolicy({ ...complete, MVH_PILOT_STATE }).state).toBe("inactive"));
  it("denies active configuration with unverified email or missing support", () => {
    expect(getPilotPolicy({ ...complete, MVH_EMAIL_DELIVERY: "transactional-configured" }).activationAllowed).toBe(false);
    expect(getPilotPolicy({ ...complete, MVH_PILOT_SUPPORT_CHANNEL: undefined }).activationAllowed).toBe(false);
  });
});
