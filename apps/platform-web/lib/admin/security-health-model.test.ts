import { describe, expect, it } from "vitest";

import {
  buildAdminSecurityHealthSnapshot,
  describeSecurityMetadata,
  describeWindowSeconds,
  summarizeSecurityClasses,
  toSecurityAlertView,
  toSecurityEventView,
  type SecurityHealthInput
} from "./security-health-model";

const now = new Date("2026-09-09T02:00:00.000Z");
const base: SecurityHealthInput = {
  environment: "staging", now, sinkMode: "database", drainConfigured: false, alertWebhookConfigured: false,
  syntheticAllowed: true, retentionDays: 30, summary: [], events: [], alerts: [], pipeline: [], rules: [], scenarios: []
};

describe("security class summary", () => {
  it("totals real events per severity and window and keeps synthetic ones apart", () => {
    const summarized = summarizeSecurityClasses([
      { event_type: "auth-login-failed", severity: "info", synthetic: false, last_hour: 2, last_day: "10", last_week: 40, last_occurred_at: "2026-09-09T01:50:00Z" },
      { event_type: "auth-rate-limited", severity: "medium", synthetic: false, last_hour: 1, last_day: 3, last_week: 3, last_occurred_at: "2026-09-09T01:55:00Z" },
      { event_type: "auth-rate-limited", severity: "medium", synthetic: true, last_hour: 12, last_day: 12, last_week: 12, last_occurred_at: "2026-09-09T01:59:00Z" },
      { event_type: "rate-limiter-unavailable", severity: "critical", synthetic: false, last_hour: 0, last_day: 0, last_week: 1, last_occurred_at: "2026-09-03T00:00:00Z" }
    ]);
    expect(summarized.severityTotals.hour).toEqual({ info: 2, medium: 1, high: 0, critical: 0 });
    expect(summarized.severityTotals.day).toEqual({ info: 10, medium: 3, high: 0, critical: 0 });
    expect(summarized.severityTotals.week).toEqual({ info: 40, medium: 3, high: 0, critical: 1 });
    expect(summarized.syntheticTotals).toEqual({ hour: 12, day: 12, week: 12 });
    // Ordered by severity first, so the critical class leads even with a lower count.
    expect(summarized.classes.map((item) => item.eventType)).toEqual(["rate-limiter-unavailable", "auth-rate-limited", "auth-login-failed"]);
    expect(summarized.classes[1]).toMatchObject({ hour: 1, day: 3, week: 3, source: "consumer-auth", summary: "A sign-in budget was exhausted" });
  });

  it("treats malformed counts as zero rather than as a number it invented", () => {
    const summarized = summarizeSecurityClasses([
      { event_type: "auth-login-failed", severity: "info", synthetic: false, last_hour: "many", last_day: -4, last_week: Number.NaN, last_occurred_at: "not a date" }
    ]);
    expect(summarized.classes[0]).toMatchObject({ hour: 0, day: 0, week: 0, lastOccurredAt: null });
  });
});

describe("views", () => {
  it("shows only allowlisted, bounded metadata", () => {
    const detail = describeSecurityMetadata({
      // Built at runtime so the repository never contains a key-shaped literal.
      reason: "verification-failed", scope: "sign-in", secretShaped: `sk_live_${"x".repeat(24)}`, password: "p", nested: { a: 1 },
      surface: "x".repeat(100), anomaly: true
    });
    expect(detail).toBe(`reason: verification-failed · scope: sign-in · surface: ${"x".repeat(40)} · anomaly: true`);
    expect(detail).not.toContain("sk_" + "live");
    expect(describeSecurityMetadata(null)).toBe("");
    expect(describeSecurityMetadata([1, 2])).toBe("");
  });

  it("maps rows defensively and drops rows without a time or a type", () => {
    expect(toSecurityEventView({ occurred_at: "2026-09-09T01:00:00Z", event_type: "ssrf-blocked", severity: "high", outcome: "blocked", correlation_id: "abcdefgh", synthetic: false, ingest_source: "in-process", metadata: { destinationClass: "loopback" } })).toMatchObject({
      eventType: "ssrf-blocked", severity: "high", source: "egress", detail: "destinationClass: loopback", summary: "An outbound destination was refused"
    });
    expect(toSecurityEventView({ event_type: "ssrf-blocked" })).toBeNull();
    expect(toSecurityEventView({ occurred_at: "2026-09-09T01:00:00Z" })).toBeNull();
    expect(toSecurityEventView({ occurred_at: "2026-09-09T01:00:00Z", event_type: "unknown-thing", severity: "bogus" })).toMatchObject({ severity: "info", summary: "Unregistered event class" });
    expect(toSecurityAlertView({ fired_at: "2026-09-09T01:00:00Z", rule_key: "ssrf-attempt", severity: "high", count: "1", threshold: 1, window_seconds: 3600, correlation_id: "alert-ssrf-attempt-0123456789ab", synthetic: true, delivery: { webhook: "not-configured" } })).toMatchObject({
      ruleKey: "ssrf-attempt", count: 1, windowSeconds: 3600, synthetic: true, delivery: "webhook: not-configured"
    });
    expect(toSecurityAlertView({ rule_key: "x" })).toBeNull();
  });

  it("describes windows in the unit a reader expects", () => {
    expect(describeWindowSeconds(600)).toBe("10 min");
    expect(describeWindowSeconds(3600)).toBe("1 h");
    expect(describeWindowSeconds(21_600)).toBe("6 h");
    expect(describeWindowSeconds(86_400)).toBe("1 d");
  });
});

describe("snapshot", () => {
  it("is ready only when every section loaded, and never estimates a missing one", () => {
    expect(buildAdminSecurityHealthSnapshot(base).state).toBe("ready");
    expect(buildAdminSecurityHealthSnapshot({ ...base, alerts: null }).state).toBe("partial");
    const unavailable = buildAdminSecurityHealthSnapshot({ ...base, summary: null, events: null, alerts: null, pipeline: null });
    expect(unavailable.state).toBe("unavailable");
    expect(unavailable.severityTotals.day).toEqual({ info: 0, medium: 0, high: 0, critical: 0 });
    expect(unavailable.classes).toEqual([]);
    expect(unavailable.lastEventAt).toBeNull();
  });

  it("derives the last event from the pipeline sources and groups classes by control", () => {
    const snapshot = buildAdminSecurityHealthSnapshot({
      ...base,
      summary: [
        { event_type: "webhook-signature-invalid", severity: "medium", synthetic: false, last_hour: 6, last_day: 6, last_week: 6, last_occurred_at: "2026-09-09T01:59:00Z" },
        { event_type: "staging-access-denied", severity: "info", synthetic: false, last_hour: 0, last_day: 30, last_week: 300, last_occurred_at: "2026-09-08T12:00:00Z" }
      ],
      pipeline: [
        { ingest_source: "in-process", last_received_at: "2026-09-09T01:59:30Z", events_last_day: 36 },
        { ingest_source: "log-drain", last_received_at: "2026-09-09T01:59:45Z", events_last_day: 36 }
      ]
    });
    expect(snapshot.lastEventAt).toBe("2026-09-09T01:59:45.000Z");
    expect(snapshot.topClasses.map((item) => item.eventType)).toEqual(["staging-access-denied", "webhook-signature-invalid"]);
    expect(snapshot.groups.find((group) => group.key === "billing")!.classes.map((item) => item.eventType)).toEqual(["webhook-signature-invalid"]);
    expect(snapshot.groups.find((group) => group.key === "environment")!.classes.map((item) => item.eventType)).toEqual(["staging-access-denied"]);
    expect(snapshot.groups.find((group) => group.key === "authentication")!.classes).toEqual([]);
  });
});
