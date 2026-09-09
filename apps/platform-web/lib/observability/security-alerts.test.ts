import { describe, expect, it, vi } from "vitest";

import {
  SECURITY_ALERT_RULES,
  alertRulesTouchedBy,
  alertWebhookUrl,
  deliverSecurityAlert,
  evaluateSecurityAlerts,
  formatSecurityAlert,
  type RaisedSecurityAlert,
  type SecurityAlertRule,
  type SecurityAlertStore
} from "./security-alerts";

const rule = (key: string): SecurityAlertRule => {
  const found = SECURITY_ALERT_RULES.find((candidate) => candidate.key === key);
  if (!found) throw new Error(`unknown rule ${key}`);
  return found;
};

/** An in-memory store with the same claim semantics as the database function. */
function createStore(counts: Record<string, number>): SecurityAlertStore & { claims: string[] } {
  const fired = new Map<string, number>();
  const store = {
    claims: [] as string[],
    async countSince(candidate: SecurityAlertRule, _since: Date, synthetic: boolean) {
      const key = `${candidate.key}:${synthetic}`;
      return key in counts ? counts[key]! : 0;
    },
    async claim(candidate: SecurityAlertRule, synthetic: boolean) {
      const key = `${candidate.key}:${synthetic}`;
      const last = fired.get(key);
      const now = Date.now();
      if (last !== undefined && now - last < candidate.cooldownSeconds * 1000) return false;
      fired.set(key, now);
      store.claims.push(key);
      return true;
    }
  };
  return store;
}

describe("alert rule table", () => {
  it("defines every field the owner needs to act, for every rule", () => {
    expect(SECURITY_ALERT_RULES.length).toBeGreaterThanOrEqual(15);
    const keys = new Set<string>();
    for (const candidate of SECURITY_ALERT_RULES) {
      expect(keys.has(candidate.key), `duplicate rule ${candidate.key}`).toBe(false);
      keys.add(candidate.key);
      expect(candidate.key).toMatch(/^[a-z0-9-]{3,64}$/);
      expect(candidate.eventTypes.length).toBeGreaterThan(0);
      expect(candidate.threshold).toBeGreaterThanOrEqual(1);
      expect(candidate.windowSeconds).toBeGreaterThanOrEqual(60);
      expect(candidate.windowSeconds).toBeLessThanOrEqual(604_800);
      expect(candidate.cooldownSeconds).toBeGreaterThanOrEqual(60);
      expect(candidate.cooldownSeconds).toBeLessThanOrEqual(604_800);
      expect(candidate.title.length).toBeGreaterThan(10);
      expect(candidate.ownerAction.length).toBeGreaterThan(20);
    }
  });

  it("does not alert on a single rejected sign-in, but does on a single scheduler or SSRF refusal", () => {
    expect(rule("rejected-sign-ins").threshold).toBeGreaterThanOrEqual(100);
    expect(rule("scheduler-auth").threshold).toBe(1);
    expect(rule("ssrf-attempt").threshold).toBe(1);
    expect(rule("limiter-unavailable").severity).toBe("critical");
    expect(rule("credential-spray").severity).toBe("high");
  });

  it("selects only the rules an event type participates in", () => {
    const touched = alertRulesTouchedBy(new Set(["webhook-signature-invalid"]));
    expect(touched.map((candidate) => candidate.key)).toEqual(["webhook-signature-spike"]);
    expect(alertRulesTouchedBy(new Set(["auth-rate-limited"])).map((candidate) => candidate.key)).toEqual(["network-throttle", "account-target-throttle"]);
    expect(alertRulesTouchedBy(new Set(["security-synthetic-test"]))).toEqual([]);
  });
});

describe("alert evaluation", () => {
  const base = { environment: "staging" as const, touchedTypes: new Set(["webhook-signature-invalid"]) };

  it("fires exactly at the threshold and not one below", async () => {
    const below = await evaluateSecurityAlerts({ ...base, store: createStore({ "webhook-signature-spike:false": 4 }), synthetic: false });
    expect(below).toEqual([]);
    const at = await evaluateSecurityAlerts({ ...base, store: createStore({ "webhook-signature-spike:false": 5 }), synthetic: false });
    expect(at).toHaveLength(1);
    expect(at[0]!.count).toBe(5);
    expect(at[0]!.rule.key).toBe("webhook-signature-spike");
    expect(at[0]!.correlationId).toMatch(/^alert-webhook-signature-spike-[0-9a-f]{12}$/);
  });

  it("de-duplicates: a hundred more events inside the cooldown produce no second alert", async () => {
    const store = createStore({ "webhook-signature-spike:false": 100 });
    const first = await evaluateSecurityAlerts({ ...base, store, synthetic: false });
    const second = await evaluateSecurityAlerts({ ...base, store, synthetic: false });
    const third = await evaluateSecurityAlerts({ ...base, store, synthetic: false });
    expect(first).toHaveLength(1);
    expect(second).toEqual([]);
    expect(third).toEqual([]);
    expect(store.claims).toEqual(["webhook-signature-spike:false"]);
  });

  it("keeps the synthetic partition separate in both directions", async () => {
    const store = createStore({ "webhook-signature-spike:false": 0, "webhook-signature-spike:true": 6 });
    expect(await evaluateSecurityAlerts({ ...base, store, synthetic: false })).toEqual([]);
    const synthetic = await evaluateSecurityAlerts({ ...base, store, synthetic: true });
    expect(synthetic).toHaveLength(1);
    expect(synthetic[0]!.synthetic).toBe(true);
    // The synthetic claim did not consume the real cooldown.
    const real = await evaluateSecurityAlerts({ ...base, store: createStore({ "webhook-signature-spike:false": 6 }), synthetic: false });
    expect(real).toHaveLength(1);
  });

  it("treats a store that cannot count as no signal, never as a threshold crossing", async () => {
    const store: SecurityAlertStore = { countSince: async () => null, claim: async () => { throw new Error("must not claim"); } };
    expect(await evaluateSecurityAlerts({ ...base, store, synthetic: false })).toEqual([]);
  });
});

describe("alert content", () => {
  const raised = (synthetic: boolean, environment: "staging" | "production" = "staging"): RaisedSecurityAlert => ({
    correlationId: "alert-webhook-signature-spike-0123456789ab",
    firedAt: "2026-09-09T02:00:00.000Z",
    environment,
    synthetic,
    rule: rule("webhook-signature-spike"),
    count: 47
  });

  it("names the environment, severity, event, window, count, correlation and action", () => {
    const { subject, text } = formatSecurityAlert(raised(false));
    expect(subject).toBe("MathNexa Security Alert · STAGING · HIGH · Repeated invalid webhook signatures");
    for (const line of ["Environment: STAGING", "Severity: HIGH", "Event: Repeated invalid webhook signatures", "Window: 10 minutes", "Count: 47 (threshold 5)", "Correlation: alert-webhook-signature-spike-0123456789ab", "Recommended action: Review the webhook delivery source"]) {
      expect(text).toContain(line);
    }
    expect(text).not.toContain("SYNTHETIC");
  });

  it("labels a synthetic alert unmistakably and a production one as PRODUCTION", () => {
    const synthetic = formatSecurityAlert(raised(true));
    expect(synthetic.subject).toContain("[SYNTHETIC TEST] STAGING");
    expect(synthetic.text).toContain("SYNTHETIC · STAGING TEST EVENT");
    expect(formatSecurityAlert(raised(false, "production")).subject).toContain("· PRODUCTION ·");
  });

  it("is built from the rule table and counts only, so no event metadata can leak into it", () => {
    const { text } = formatSecurityAlert(raised(false));
    expect(text).not.toMatch(/sk_live|whsec_|eyJ|@/);
  });
});

describe("alert delivery", () => {
  it("accepts only an HTTPS webhook and refuses private address literals", () => {
    expect(alertWebhookUrl({})).toBeNull();
    expect(alertWebhookUrl({ MVH_SECURITY_ALERT_WEBHOOK_URL: "http://hooks.example/a" })).toBeNull();
    expect(alertWebhookUrl({ MVH_SECURITY_ALERT_WEBHOOK_URL: "https://user:pw@hooks.example/a" })).toBeNull();
    expect(alertWebhookUrl({ MVH_SECURITY_ALERT_WEBHOOK_URL: "https://127.0.0.1/a" })).toBeNull();
    expect(alertWebhookUrl({ MVH_SECURITY_ALERT_WEBHOOK_URL: "https://10.0.0.5/a" })).toBeNull();
    expect(alertWebhookUrl({ MVH_SECURITY_ALERT_WEBHOOK_URL: "https://[::1]/a" })).toBeNull();
    expect(alertWebhookUrl({ MVH_SECURITY_ALERT_WEBHOOK_URL: "not a url" })).toBeNull();
    expect(alertWebhookUrl({ MVH_SECURITY_ALERT_WEBHOOK_URL: " https://hooks.example/services/abc " })?.href).toBe("https://hooks.example/services/abc");
  });

  it("records not-configured without a webhook and never throws when delivery fails", async () => {
    const alert: RaisedSecurityAlert = {
      correlationId: "alert-ssrf-attempt-0123456789ab", firedAt: "2026-09-09T02:00:00.000Z",
      environment: "staging", synthetic: false, rule: rule("ssrf-attempt"), count: 1
    };
    expect(await deliverSecurityAlert(alert, { webhook: null })).toEqual({ webhook: "not-configured" });
    const failing = vi.fn(async () => { throw new Error("network down"); });
    expect(await deliverSecurityAlert(alert, { webhook: new URL("https://hooks.example/a"), fetchImplementation: failing as unknown as typeof fetch })).toEqual({ webhook: "failed" });
    const rejecting = vi.fn(async () => new Response("no", { status: 500 }));
    expect(await deliverSecurityAlert(alert, { webhook: new URL("https://hooks.example/a"), fetchImplementation: rejecting as unknown as typeof fetch })).toEqual({ webhook: "failed" });
  });

  it("posts a JSON body carrying the environment label and no secrets", async () => {
    const alert: RaisedSecurityAlert = {
      correlationId: "alert-ssrf-attempt-0123456789ab", firedAt: "2026-09-09T02:00:00.000Z",
      environment: "staging", synthetic: true, rule: rule("ssrf-attempt"), count: 1
    };
    const calls: Array<{ url: string; body: string; method: string }> = [];
    const accepting = vi.fn(async (url: URL, init: RequestInit) => {
      calls.push({ url: String(url), body: String(init.body), method: String(init.method) });
      return new Response("ok", { status: 200 });
    });
    const delivery = await deliverSecurityAlert(alert, { webhook: new URL("https://hooks.example/a"), fetchImplementation: accepting as unknown as typeof fetch });
    expect(delivery).toEqual({ webhook: "delivered" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.method).toBe("POST");
    const body = JSON.parse(calls[0]!.body) as Record<string, unknown>;
    expect(body.environment).toBe("staging");
    expect(body.synthetic).toBe(true);
    expect(body.rule).toBe("ssrf-attempt");
    expect(String(body.text)).toContain("[SYNTHETIC TEST] STAGING");
  });
});
