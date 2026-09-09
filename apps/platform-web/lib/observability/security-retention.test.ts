import { describe, expect, it } from "vitest";

import { DEFAULT_SECURITY_EVENT_RETENTION_DAYS, SECURITY_ALERT_RETENTION_DAYS, securityEventRetentionDays } from "./security-retention";

describe("security event retention", () => {
  it("defaults to thirty days and is bounded to seven through ninety", () => {
    expect(DEFAULT_SECURITY_EVENT_RETENTION_DAYS).toBe(30);
    expect(SECURITY_ALERT_RETENTION_DAYS).toBe(90);
    expect(securityEventRetentionDays({})).toBe(30);
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: "14" })).toBe(14);
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: " 90\n" })).toBe(90);
    // Nothing can disable retention or stretch it: out-of-range values fall back.
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: "0" })).toBe(30);
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: "6" })).toBe(30);
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: "91" })).toBe(30);
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: "3650" })).toBe(30);
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: "forever" })).toBe(30);
    expect(securityEventRetentionDays({ MVH_SECURITY_EVENT_RETENTION_DAYS: "-1" })).toBe(30);
  });
});
