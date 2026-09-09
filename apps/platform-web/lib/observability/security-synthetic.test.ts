import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceClient = vi.hoisted(() => ({ touched: false }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => { serviceClient.touched = true; return null; }
}));

const { SYNTHETIC_SECURITY_SCENARIOS, isSyntheticScenarioKey, runSyntheticSecurityScenario, syntheticScenarioEvents } = await import("./security-synthetic");
const { SECURITY_ALERT_RULES } = await import("./security-alerts");
const { normalizeSecurityEvent } = await import("./security-pipeline");

const originalEnvironment = { ...process.env };
beforeEach(() => {
  serviceClient.touched = false;
  delete process.env.MVH_APP_ENVIRONMENT;
  delete process.env.MVH_APPLICATION_ORIGIN;
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

describe("synthetic scenarios", () => {
  it("every scenario names a real rule it is designed to cross, or none, and enough events to cross it", () => {
    for (const [key, scenario] of Object.entries(SYNTHETIC_SECURITY_SCENARIOS)) {
      expect(isSyntheticScenarioKey(key)).toBe(true);
      if (scenario.expectedAlert === null) continue;
      const rule = SECURITY_ALERT_RULES.find((candidate) => candidate.key === scenario.expectedAlert);
      expect(rule, `${key} -> ${scenario.expectedAlert}`).toBeDefined();
      const produced = scenario.events.filter((event) => rule!.eventTypes.includes(event.type)).reduce((sum, event) => sum + event.count, 0);
      expect(produced, `${key} must reach the ${rule!.key} threshold`).toBeGreaterThanOrEqual(rule!.threshold);
    }
    expect(isSyntheticScenarioKey("drop-tables")).toBe(false);
    expect(isSyntheticScenarioKey("__proto__")).toBe(false);
  });

  it("marks every generated event as synthetic, unique, and normalizes into the synthetic partition", () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    process.env.MVH_APPLICATION_ORIGIN = "https://mathnexa-platform-staging.vercel.app";
    const now = new Date("2026-09-09T02:00:00.000Z");
    const inputs = syntheticScenarioEvents("webhook-signature-spike", now);
    expect(inputs).toHaveLength(6);
    const correlations = new Set(inputs.map((input) => input.raw.correlationId));
    const ids = new Set(inputs.map((input) => input.raw.eventId));
    expect(correlations.size).toBe(6);
    expect(ids.size).toBe(6);
    for (const input of inputs) {
      const detail = input.raw.detail as Record<string, unknown>;
      expect(detail.synthetic).toBe(true);
      expect(detail.scenario).toBe("webhook-signature-spike");
      expect(detail.deployment).toBe("staging");
      const event = normalizeSecurityEvent(input.raw, { environment: "staging", ingestSource: "synthetic", receivedAt: now });
      expect(event).not.toBeNull();
      expect(event!.synthetic).toBe(true);
      expect(event!.environment).toBe("staging");
      expect(event!.eventType).toBe("webhook-signature-invalid");
      expect(event!.occurredAt).toBe(now.toISOString());
    }
  });

  it("refuses to run on a production deployment or an unknown one, before touching any store", async () => {
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    process.env.MVH_APPLICATION_ORIGIN = "https://mathnexa.com";
    await expect(runSyntheticSecurityScenario("pipeline-heartbeat")).rejects.toThrow("synthetic-security-testing-refused");
    delete process.env.MVH_APP_ENVIRONMENT;
    await expect(runSyntheticSecurityScenario("pipeline-heartbeat")).rejects.toThrow("synthetic-security-testing-refused");
    expect(serviceClient.touched).toBe(false);
  });
});
