import { describe, expect, it } from "vitest";

import {
  normalizeSecurityEvent,
  parseEmittedLine,
  resolveOccurredAt,
  securityEventId,
  toStorageRow,
  type NormalizationContext,
  type RawEmittedEvent
} from "./security-pipeline";

const receivedAt = new Date("2026-09-09T02:00:00.000Z");
const context: NormalizationContext = { environment: "staging", ingestSource: "log-drain", receivedAt };

function raw(overrides: Partial<Record<keyof RawEmittedEvent, unknown>> = {}): RawEmittedEvent {
  return {
    category: "billing",
    severity: "warning",
    code: "webhook-signature-invalid",
    correlationId: "cle1-abcdef123456",
    detail: { reason: "verification-failed", hasForwardedFor: true, userAgentFamily: "scripted", environment: "production-platform", deployment: "staging" },
    eventId: "0123456789abcdef0123456789abcdef",
    emittedAt: "2026-09-09T01:59:58.000Z",
    ...overrides
  };
}

describe("security event normalization", () => {
  it("produces a schema-v1 event from an emitted line", () => {
    const event = normalizeSecurityEvent(raw(), context);
    expect(event).not.toBeNull();
    expect(event).toMatchObject({
      version: 1,
      eventId: "0123456789abcdef0123456789abcdef",
      eventType: "webhook-signature-invalid",
      category: "billing",
      severity: "medium",
      occurredAt: "2026-09-09T01:59:58.000Z",
      environment: "staging",
      source: "billing-webhook",
      outcome: "denied",
      correlationId: "cle1-abcdef123456",
      synthetic: false,
      ingestSource: "log-drain",
      actorRefRedacted: null,
      networkRefRedacted: null
    });
    // Consumed keys are not stored twice; useful coarse context is kept.
    expect(event!.metadataSafe).toEqual({ reason: "verification-failed", hasForwardedFor: true, userAgentFamily: "scripted" });
  });

  it("ignores every line that is not a registered, persisted security code", () => {
    expect(normalizeSecurityEvent(raw({ code: "preview.ready", category: "health" }), context)).toBeNull();
    expect(normalizeSecurityEvent(raw({ code: "security-pipeline-error", category: "health" }), context)).toBeNull();
    expect(normalizeSecurityEvent(raw({ code: "security-alert-raised", category: "health" }), context)).toBeNull();
    expect(normalizeSecurityEvent(raw({ code: undefined }), context)).toBeNull();
    // A registered code under the wrong category is not the event it claims to be.
    expect(normalizeSecurityEvent(raw({ category: "authentication" }), context)).toBeNull();
  });

  it("redacts again at the read boundary: a smuggled credential or identity never reaches the store", () => {
    const event = normalizeSecurityEvent(raw({ detail: {
      reason: "ok",
      password: "hunter2",
      // Key-shaped values are built at runtime so the repository never carries the literal.
      note: `sk_live_${"ABCDEFGH".repeat(3)}`,
      token: "abc",
      contact: "person@example.test",
      customerId: "cus_1234567890ABCDEFG",
      clientIp: "203.0.113.9",
      nested: { deep: "secret" },
      bearer: "Bearer abcdefghijklmnopqrstuvwxyz",
      jwt: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijklmnop",
      long: "x".repeat(500),
      forged: "line one\r\nline two"
    } }), context);
    const serialized = JSON.stringify(event);
    for (const forbidden of ["hunter2", "sk_" + "live_", "person@example.test", "cus_1234567890", "203.0.113.9", "deep", "Bearer abc", "eyJhbGci"]) {
      expect(serialized, `must not carry ${forbidden}`).not.toContain(forbidden);
    }
    expect(event!.metadataSafe.reason).toBe("ok");
    expect(String(event!.metadataSafe.long)).toHaveLength(120);
    expect(event!.metadataSafe.forged).toBe("line one  line two");
  });

  it("lifts a redacted provider reference into the account column and out of the metadata", () => {
    const event = normalizeSecurityEvent(raw({ code: "webhook-manual-review", detail: { objectSuffix: "…abc123", failureClass: "invalid_owner" } }), context);
    expect(event!.accountRefRedacted).toBe("…abc123");
    expect(event!.metadataSafe).toEqual({ failureClass: "invalid_owner" });
    // A "suffix" that is a whole identifier is not a suffix and is refused.
    const whole = normalizeSecurityEvent(raw({ code: "webhook-manual-review", detail: { objectSuffix: "sub_1234567890ABCDEFGHIJ" } }), context);
    expect(whole!.accountRefRedacted).toBeNull();
  });

  it("prefers the emitting deployment's own label over the ingesting process's", () => {
    expect(normalizeSecurityEvent(raw({ detail: { deployment: "production" } }), context)!.environment).toBe("production");
    expect(normalizeSecurityEvent(raw({ detail: { deployment: "PRODUCTION" } }), context)!.environment).toBe("staging");
    expect(normalizeSecurityEvent(raw({ detail: {} }), context)!.environment).toBe("staging");
  });

  it("marks synthetic events only on a boolean true", () => {
    expect(normalizeSecurityEvent(raw({ detail: { synthetic: true } }), context)!.synthetic).toBe(true);
    expect(normalizeSecurityEvent(raw({ detail: { synthetic: "true" } }), context)!.synthetic).toBe(false);
    expect(normalizeSecurityEvent(raw({ detail: { synthetic: 1 } }), context)!.synthetic).toBe(false);
  });

  it("escalates an anomaly and demotes an ignored synchronization", () => {
    const anomaly = normalizeSecurityEvent(raw({ code: "authorization-denied", category: "authorization", detail: { surface: "game-ticket", anomaly: true } }), context);
    expect(anomaly!.severity).toBe("high");
    const ignored = normalizeSecurityEvent(raw({ code: "subscription-synchronized", detail: { result: "stale_ignored" } }), context);
    expect(ignored!.outcome).toBe("ignored");
  });
});

describe("occurredAt resolution", () => {
  it("prefers the platform capture time, then the emitter stamp, then the read-back time", () => {
    const capture = new Date("2026-09-09T01:59:59.000Z");
    expect(resolveOccurredAt(raw(), { ...context, occurredAt: capture }).toISOString()).toBe(capture.toISOString());
    expect(resolveOccurredAt(raw(), context).toISOString()).toBe("2026-09-09T01:59:58.000Z");
    expect(resolveOccurredAt(raw({ emittedAt: undefined }), context).toISOString()).toBe(receivedAt.toISOString());
    expect(resolveOccurredAt(raw({ emittedAt: "not a date" }), context).toISOString()).toBe(receivedAt.toISOString());
  });

  it("distrusts a stamp too far in the future or the past", () => {
    expect(resolveOccurredAt(raw({ emittedAt: "2026-09-09T02:04:59.000Z" }), context).toISOString()).toBe("2026-09-09T02:04:59.000Z");
    expect(resolveOccurredAt(raw({ emittedAt: "2026-09-09T02:06:00.000Z" }), context).toISOString()).toBe(receivedAt.toISOString());
    expect(resolveOccurredAt(raw({ emittedAt: "2020-01-01T00:00:00.000Z" }), context).toISOString()).toBe(receivedAt.toISOString());
  });
});

describe("event identity", () => {
  it("keeps the emitter's id so the same emission on two paths is one row", () => {
    expect(securityEventId(raw(), receivedAt)).toBe("0123456789abcdef0123456789abcdef");
  });

  it("derives a stable id per second when the stamp is unusable", () => {
    const first = securityEventId(raw({ eventId: "bad" }), new Date("2026-09-09T02:00:00.100Z"));
    const same = securityEventId(raw({ eventId: undefined }), new Date("2026-09-09T02:00:00.900Z"));
    const next = securityEventId(raw({ eventId: undefined }), new Date("2026-09-09T02:00:01.000Z"));
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(same).toBe(first);
    expect(next).not.toBe(first);
  });
});

describe("line parsing and storage rows", () => {
  it("parses only a JSON object with the four SafeEvent fields", () => {
    expect(parseEmittedLine(JSON.stringify(raw()))).not.toBeNull();
    expect(parseEmittedLine("Error: boom\n at x")).toBeNull();
    expect(parseEmittedLine("{\"code\":\"x\"}")).toBeNull();
    expect(parseEmittedLine("[1,2]")).toBeNull();
    expect(parseEmittedLine(`{${"\"a\":1,".repeat(3000)}"b":2}`)).toBeNull();
  });

  it("maps to the column names the database function reads", () => {
    const row = toStorageRow(normalizeSecurityEvent(raw(), context)!);
    expect(Object.keys(row).sort()).toEqual([
      "account_ref", "category", "correlation_id", "environment", "event_id", "event_type", "ingest_source",
      "metadata", "occurred_at", "outcome", "severity", "source", "synthetic"
    ]);
  });
});
