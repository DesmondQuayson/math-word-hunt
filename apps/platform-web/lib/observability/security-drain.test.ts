import { describe, expect, it } from "vitest";

import {
  drainSecretConfigured,
  drainSignature,
  extractSecurityLines,
  parseDrainPayload,
  verifyDrainSignature
} from "./security-drain";

const SECRET = "drain-secret-0123456789abcdefghijklmnopqrstuv";

const securityLine = JSON.stringify({
  category: "authentication", severity: "warning", code: "auth-rate-limited",
  correlationId: "throttled-sign-in-request", detail: { scope: "sign-in", dimension: "request" },
  eventId: "abcdefabcdefabcdefabcdefabcdefab", emittedAt: "2026-09-09T02:00:00.000Z"
});

describe("drain secret", () => {
  it("requires a printable secret of at least 32 characters", () => {
    expect(drainSecretConfigured({})).toBeNull();
    expect(drainSecretConfigured({ MVH_SECURITY_DRAIN_SECRET: "short" })).toBeNull();
    expect(drainSecretConfigured({ MVH_SECURITY_DRAIN_SECRET: "a".repeat(31) })).toBeNull();
    expect(drainSecretConfigured({ MVH_SECURITY_DRAIN_SECRET: "with space".padEnd(40, "x") })).toBeNull();
    expect(drainSecretConfigured({ MVH_SECURITY_DRAIN_SECRET: ` ${SECRET}\n` })).toBe(SECRET);
  });
});

describe("drain signature", () => {
  it("accepts only the HMAC-SHA1 of the exact body under the drain secret", () => {
    const body = "[]";
    const signature = drainSignature(body, SECRET);
    expect(signature).toMatch(/^[0-9a-f]{40}$/);
    expect(verifyDrainSignature(body, signature, SECRET)).toBe(true);
    expect(verifyDrainSignature(body, signature.toUpperCase(), SECRET)).toBe(true);
    expect(verifyDrainSignature(body, null, SECRET)).toBe(false);
    expect(verifyDrainSignature(body, "", SECRET)).toBe(false);
    expect(verifyDrainSignature(body, signature.slice(0, 39), SECRET)).toBe(false);
    expect(verifyDrainSignature(`${body} `, signature, SECRET)).toBe(false);
    expect(verifyDrainSignature(body, signature, `${SECRET}x`)).toBe(false);
    expect(verifyDrainSignature(body, drainSignature(body, "another-secret"), SECRET)).toBe(false);
  });
});

describe("drain payload parsing", () => {
  it("reads a JSON array and an NDJSON body alike", () => {
    const entry = { id: "1", message: securityLine, timestamp: 1_788_400_000_000, source: "lambda" };
    expect(parseDrainPayload(JSON.stringify([entry, entry]))).toHaveLength(2);
    expect(parseDrainPayload(`${JSON.stringify(entry)}\n${JSON.stringify(entry)}\nnot json\n`)).toHaveLength(2);
    expect(parseDrainPayload("")).toEqual([]);
    expect(parseDrainPayload("[garbage")).toEqual([]);
    expect(parseDrainPayload("{\"nope\":true}")).toEqual([]);
  });

  it("keeps only the message, the capture time and the source — never the request context", () => {
    const [entry] = parseDrainPayload(JSON.stringify([{
      message: securityLine, timestamp: 1_788_400_000_000, source: "lambda",
      proxy: { clientIp: "203.0.113.9", userAgent: "curl/8" }, host: "mathnexa.com", requestId: "req_1"
    }]));
    expect(Object.keys(entry!).sort()).toEqual(["message", "source", "timestamp"]);
    expect(entry!.timestamp?.toISOString()).toBe(new Date(1_788_400_000_000).toISOString());
    expect(JSON.stringify(entry)).not.toContain("203.0.113.9");
  });

  it("extracts only structured security lines from a mixed delivery", () => {
    const entries = parseDrainPayload(JSON.stringify([
      { message: securityLine, timestamp: 1_788_400_000_000, source: "lambda" },
      { message: "GET /sign-in 200", timestamp: 1_788_400_000_001, source: "edge" },
      { message: "Error: boom\n    at handler", timestamp: 1_788_400_000_002, source: "lambda" },
      { message: JSON.stringify({ scope: "billing", category: "consumer-webhook-processed" }), timestamp: 1_788_400_000_003, source: "lambda" }
    ]));
    const drained = extractSecurityLines(entries);
    expect(drained).toHaveLength(1);
    expect(drained[0]!.raw.code).toBe("auth-rate-limited");
    expect(drained[0]!.occurredAt?.getTime()).toBe(1_788_400_000_000);
  });
});
