/**
 * The sink: where an emitted line goes after the console.
 *
 * What matters here is the availability contract. Persistence is scheduled,
 * never awaited by the producer; a store that is missing, slow or broken
 * changes nothing about the request that produced the event; and a failing
 * store reports itself on the console only, so it can never recurse.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceClient = vi.hoisted(() => ({ current: null as null | { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } }));
const afterCalls = vi.hoisted(() => ({ current: [] as Array<() => unknown>, throwOutsideScope: true }));

vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => serviceClient.current }));
vi.mock("next/server", async (importOriginal) => {
  const original = await importOriginal<typeof import("next/server")>();
  return {
    ...original,
    after: (work: () => unknown) => {
      if (afterCalls.throwOutsideScope) throw new Error("after() was called outside a request scope");
      afterCalls.current.push(work);
    }
  };
});

const { ingestSecurityEvents, platformMonitoringAdapter, scheduleSecurityEventPersistence, securityEventSinkMode } = await import("./security-sink");
const { emitOperationalEvent } = await import("./server");

const emitted = () => ({
  category: "billing" as const, severity: "warning" as const, code: "webhook-signature-invalid",
  correlationId: `probe-${Math.random().toString(36).slice(2, 12)}`, detail: { reason: "absent" },
  eventId: "0123456789abcdef0123456789abcdef", emittedAt: "2026-09-09T02:00:00.000Z"
});

function captureConsole() {
  const lines: string[] = [];
  const info = vi.spyOn(console, "info").mockImplementation((line: unknown) => { lines.push(String(line)); });
  return { lines, restore: () => info.mockRestore() };
}

beforeEach(() => {
  serviceClient.current = null;
  afterCalls.current = [];
  afterCalls.throwOutsideScope = true;
  delete process.env.MVH_SECURITY_EVENT_SINK;
  delete process.env.MVH_SECURITY_ALERT_WEBHOOK_URL;
});
afterEach(() => vi.restoreAllMocks());

describe("sink mode", () => {
  it("defaults to console and enables the database only on an exact opt-in", () => {
    expect(securityEventSinkMode({})).toBe("console");
    expect(securityEventSinkMode({ MVH_SECURITY_EVENT_SINK: "database" })).toBe("database");
    expect(securityEventSinkMode({ MVH_SECURITY_EVENT_SINK: " Database\n" })).toBe("database");
    expect(securityEventSinkMode({ MVH_SECURITY_EVENT_SINK: "db" })).toBe("console");
    expect(securityEventSinkMode({ MVH_SECURITY_EVENT_SINK: "true" })).toBe("console");
  });

  it("keeps today's behaviour exactly when the sink is not configured: one console line, no store call", () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    serviceClient.current = { rpc };
    const console_ = captureConsole();
    try {
      expect(emitOperationalEvent(platformMonitoringAdapter(), { category: "billing", severity: "warning", code: "webhook-signature-invalid", correlationId: `probe-${Date.now()}abc` })).toBe(true);
    } finally {
      console_.restore();
    }
    expect(console_.lines).toHaveLength(1);
    expect(JSON.parse(console_.lines[0]!)).toMatchObject({ code: "webhook-signature-invalid", eventId: expect.stringMatching(/^[0-9a-f]{32}$/), emittedAt: expect.any(String) });
    expect(rpc).not.toHaveBeenCalled();
    expect(afterCalls.current).toEqual([]);
  });
});

describe("in-process persistence", () => {
  it("is scheduled after the response and never awaited by the emitter", () => {
    process.env.MVH_SECURITY_EVENT_SINK = "database";
    afterCalls.throwOutsideScope = false;
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    serviceClient.current = { rpc };
    const console_ = captureConsole();
    try {
      emitOperationalEvent(platformMonitoringAdapter(), { category: "billing", severity: "warning", code: "webhook-signature-invalid", correlationId: `probe-${Date.now()}def` });
    } finally {
      console_.restore();
    }
    // The console line is unchanged and the store has not been touched yet.
    expect(console_.lines).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
    expect(afterCalls.current).toHaveLength(1);
  });

  it("falls back to a detached write outside a request scope, still without awaiting", async () => {
    process.env.MVH_SECURITY_EVENT_SINK = "database";
    // The store answers only when the test says so; if scheduling awaited the
    // write, this call would never return.
    let settle: (value: { data: unknown; error: unknown }) => void = () => undefined;
    const rpc = vi.fn(() => new Promise<{ data: unknown; error: unknown }>((resolve) => { settle = resolve; }));
    serviceClient.current = { rpc };
    const started = Date.now();
    scheduleSecurityEventPersistence(emitted());
    expect(Date.now() - started).toBeLessThan(50);
    expect(rpc).toHaveBeenCalledWith("record_security_events", expect.objectContaining({ p_events: expect.any(Array) }));
    settle({ data: 1, error: null });
    await new Promise((resolve) => setTimeout(resolve, 20));
  });

  it("never throws or rejects when the store is missing, failing or throwing", async () => {
    process.env.MVH_SECURITY_EVENT_SINK = "database";
    const console_ = captureConsole();
    try {
      // No store at all.
      expect(await ingestSecurityEvents([{ raw: emitted() }], { ingestSource: "in-process", environment: "staging" })).toMatchObject({ stored: null, failure: "store-unavailable" });
      // A store that answers with an error.
      serviceClient.current = { rpc: async () => ({ data: null, error: { message: "boom" } }) };
      expect(await ingestSecurityEvents([{ raw: emitted() }], { ingestSource: "in-process", environment: "staging" })).toMatchObject({ stored: null, failure: "store-write-failed" });
      // A store that throws.
      serviceClient.current = { rpc: async () => { throw new Error("connection reset"); } };
      expect(await ingestSecurityEvents([{ raw: emitted() }], { ingestSource: "in-process", environment: "staging" })).toMatchObject({ stored: null, failure: "store-write-failed" });
      // The scheduled form swallows all of it.
      expect(() => scheduleSecurityEventPersistence(emitted())).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 20));
    } finally {
      console_.restore();
    }
    // The failure was reported on the console, once per reason, and is itself
    // a non-persisted event.
    const reports = console_.lines.map((line) => JSON.parse(line) as Record<string, unknown>).filter((line) => line.code === "security-pipeline-error");
    expect(reports.length).toBeGreaterThanOrEqual(2);
    expect(new Set(reports.map((line) => (line.detail as Record<string, unknown>).reason))).toEqual(new Set(["store-unavailable", "store-write-failed"]));
  });
});

describe("ingest batch", () => {
  it("normalizes, stores and evaluates alerts in one pass, and separates the synthetic partition", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    serviceClient.current = {
      rpc: async (name, args) => {
        calls.push({ name, args });
        if (name === "record_security_events") return { data: (args.p_events as unknown[]).length, error: null };
        if (name === "count_security_events_since") return { data: args.p_synthetic ? 6 : 1, error: null };
        if (name === "claim_security_alert") return { data: true, error: null };
        if (name === "record_security_alert") return { data: "00000000-0000-4000-8000-000000000000", error: null };
        return { data: null, error: { message: `unexpected ${name}` } };
      }
    };
    const console_ = captureConsole();
    let outcome;
    try {
      outcome = await ingestSecurityEvents([
        { raw: emitted() },
        { raw: { ...emitted(), eventId: "abcdefabcdefabcdefabcdefabcdefab", detail: { reason: "absent", synthetic: true } } },
        { raw: { ...emitted(), code: "not-a-security-code" } }
      ], { ingestSource: "synthetic", environment: "staging" });
    } finally {
      console_.restore();
    }
    expect(outcome).toMatchObject({ received: 3, normalized: 2, stored: 2, failure: null });
    // Only the synthetic partition crossed its threshold; the real one did not.
    expect(outcome.alerts).toHaveLength(1);
    expect(outcome.alerts[0]!.synthetic).toBe(true);
    expect(outcome.alerts[0]!.rule.key).toBe("webhook-signature-spike");
    const counted = calls.filter((call) => call.name === "count_security_events_since").map((call) => call.args.p_synthetic);
    expect(new Set(counted)).toEqual(new Set([true, false]));
    expect(calls.some((call) => call.name === "record_security_alert" && call.args.p_synthetic === true)).toBe(true);
    const announced = console_.lines.map((line) => JSON.parse(line) as Record<string, unknown>).find((line) => line.code === "security-alert-raised");
    expect(announced).toBeDefined();
    expect((announced!.detail as Record<string, unknown>).synthetic).toBe(true);
    expect((announced!.detail as Record<string, unknown>).deployment).toBe("staging");
  });

  it("stores nothing and calls nothing when no line is a security event", async () => {
    const rpc = vi.fn(async () => ({ data: 0, error: null }));
    serviceClient.current = { rpc };
    const outcome = await ingestSecurityEvents([{ raw: { ...emitted(), code: "preview.ready", category: "health" } }], { ingestSource: "log-drain", environment: "staging" });
    expect(outcome).toMatchObject({ received: 1, normalized: 0, stored: 0, failure: null });
    expect(rpc).not.toHaveBeenCalled();
  });
});
