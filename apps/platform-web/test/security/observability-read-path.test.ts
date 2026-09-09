/**
 * Standing contract for the PH2-07 security observability read path.
 *
 * Written against the real routes and the real source files the application
 * ships. The first group exercises the three new HTTP surfaces with the store
 * and the admin session mocked; the second pins the structural invariants a
 * later "clean-up" could quietly remove; the third re-proves the three
 * non-obvious rate-limit contracts that observability must never alter.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const repositoryRoot = resolve(__dirname, "../../../..");
const read = (relativePath: string): string => readFileSync(resolve(repositoryRoot, relativePath), "utf8");

const ingest = vi.hoisted(() => ({ calls: [] as Array<{ inputs: unknown; options: unknown }>, failure: null as string | null }));
const store = vi.hoisted(() => ({ rpc: vi.fn(async (name: string) => name === "purge_security_events" ? { data: [{ events_deleted: 3, alerts_deleted: 1 }], error: null } : { data: null, error: null }) }));
const admin = vi.hoisted(() => ({
  access: { state: "unauthenticated" } as Record<string, unknown>,
  csrf: false,
  audits: [] as unknown[],
  scenarios: [] as string[]
}));

vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => store }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vercel-id": "cle1-abcdef123456" }), cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/observability/security-sink", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/observability/security-sink")>();
  return {
    ...original,
    ingestSecurityEvents: async (inputs: unknown, options: unknown) => {
      ingest.calls.push({ inputs, options });
      const received = Array.isArray(inputs) ? inputs.length : 0;
      return { received, normalized: received, stored: ingest.failure ? null : received, alerts: [], failure: ingest.failure };
    }
  };
});
vi.mock("@/lib/admin/session", () => ({
  inspectAdminAccess: async () => admin.access,
  validateAdminMutationCsrf: async () => admin.csrf
}));
vi.mock("@/lib/admin/repository", () => ({
  createAdminRepository: () => ({ recordAudit: async (event: unknown) => { admin.audits.push(event); } })
}));
vi.mock("@/lib/observability/security-synthetic", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/observability/security-synthetic")>();
  return {
    ...original,
    runSyntheticSecurityScenario: async (key: string) => {
      admin.scenarios.push(key);
      return { received: 6, normalized: 6, stored: 6, alerts: [{ rule: { key: "webhook-signature-spike" } }], failure: null };
    }
  };
});

const { drainSignature } = await import("@/lib/observability/security-drain");
const ingestRoute = await import("@/app/api/internal/security/ingest/route");
const retentionRoute = await import("@/app/api/internal/security/retention/route");
const syntheticRoute = await import("@/app/admin/security/synthetic/route");

const DRAIN_SECRET = "drain-secret-0123456789abcdefghijklmnopqrstuv";
const CRON_SECRET = "scheduler-secret-0123456789";
const STAGING = { MVH_APP_ENVIRONMENT: "production-platform", MVH_APPLICATION_ORIGIN: "https://mathnexa-platform-staging.vercel.app" };
const PRODUCTION = { MVH_APP_ENVIRONMENT: "production-platform", MVH_APPLICATION_ORIGIN: "https://mathnexa.com" };

const originalEnvironment = { ...process.env };
function setEnvironment(values: Record<string, string | undefined>) {
  for (const key of ["MVH_APP_ENVIRONMENT", "MVH_APPLICATION_ORIGIN", "MVH_SECURITY_DRAIN_SECRET", "CRON_SECRET", "MVH_SECURITY_EVENT_RETENTION_DAYS"]) delete process.env[key];
  for (const [key, value] of Object.entries(values)) if (value !== undefined) process.env[key] = value;
}

beforeEach(() => {
  ingest.calls = [];
  ingest.failure = null;
  admin.access = { state: "unauthenticated" };
  admin.csrf = false;
  admin.audits = [];
  admin.scenarios = [];
  store.rpc.mockClear();
  setEnvironment({});
});
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
  Object.assign(process.env, originalEnvironment);
});

const securityLine = JSON.stringify({
  category: "billing", severity: "warning", code: "webhook-signature-invalid", correlationId: "cle1-abcdef123456",
  detail: { reason: "absent" }, eventId: "0123456789abcdef0123456789abcdef", emittedAt: "2026-09-09T02:00:00.000Z"
});
const delivery = JSON.stringify([{ message: securityLine, timestamp: 1_788_400_000_000, source: "lambda" }, { message: "GET / 200", timestamp: 1_788_400_000_001, source: "edge" }]);

function drainRequest(body: string, headers: Record<string, string> = {}) {
  return new Request("https://mathnexa-platform-staging.vercel.app/api/internal/security/ingest", { method: "POST", body, headers: { "content-type": "application/json", ...headers } });
}

describe("log-drain ingest route", () => {
  it("does not exist without a drain secret, for any caller and any header", async () => {
    setEnvironment(STAGING);
    expect((await ingestRoute.POST(drainRequest(delivery, { "x-vercel-signature": drainSignature(delivery, DRAIN_SECRET) }))).status).toBe(404);
    expect((await ingestRoute.GET(new Request("https://x.test/api/internal/security/ingest", { headers: { "x-vercel-verify": "token" } }))).status).toBe(404);
    expect(ingest.calls).toEqual([]);
  });

  it("refuses an unsigned or mis-signed delivery before parsing it", async () => {
    setEnvironment({ ...STAGING, MVH_SECURITY_DRAIN_SECRET: DRAIN_SECRET });
    const attempts: Record<string, string>[] = [{}, { "x-vercel-signature": "deadbeef" }, { "x-vercel-signature": drainSignature(delivery, "another-secret-0123456789abcdefghij") }, { "x-vercel-signature": drainSignature(`${delivery} `, DRAIN_SECRET) }];
    for (const headers of attempts) {
      const response = await ingestRoute.POST(drainRequest(delivery, headers));
      expect(response.status, JSON.stringify(headers)).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(ingest.calls).toEqual([]);
  });

  it("accepts a correctly signed delivery, filters it to security lines and stores idempotently", async () => {
    setEnvironment({ ...STAGING, MVH_SECURITY_DRAIN_SECRET: DRAIN_SECRET });
    const response = await ingestRoute.POST(drainRequest(delivery, { "x-vercel-signature": drainSignature(delivery, DRAIN_SECRET) }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ received: 1, stored: 1, alerts: 0, failure: null });
    expect(ingest.calls).toHaveLength(1);
    const [call] = ingest.calls;
    expect(call!.options).toEqual({ ingestSource: "log-drain" });
    const inputs = call!.inputs as Array<{ raw: { code: string }; occurredAt: Date }>;
    expect(inputs[0]!.raw.code).toBe("webhook-signature-invalid");
    expect(inputs[0]!.occurredAt.getTime()).toBe(1_788_400_000_000);
  });

  it("answers 503 when the store fails so the platform retries, and bounds the body", async () => {
    setEnvironment({ ...STAGING, MVH_SECURITY_DRAIN_SECRET: DRAIN_SECRET });
    ingest.failure = "store-timeout";
    expect((await ingestRoute.POST(drainRequest(delivery, { "x-vercel-signature": drainSignature(delivery, DRAIN_SECRET) }))).status).toBe(503);
    const oversized = drainRequest("[]", { "x-vercel-signature": drainSignature("[]", DRAIN_SECRET), "content-length": String(5 * 1024 * 1024) });
    expect((await ingestRoute.POST(oversized)).status).toBe(413);
  });

  it("echoes the ownership-verification token and nothing else", async () => {
    setEnvironment({ ...STAGING, MVH_SECURITY_DRAIN_SECRET: DRAIN_SECRET });
    const response = await ingestRoute.GET(new Request("https://x.test/api/internal/security/ingest", { headers: { "x-vercel-verify": "verify-token-123" } }));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("verify-token-123");
    expect(response.headers.get("x-vercel-verify")).toBe("verify-token-123");
    expect((await ingestRoute.GET(new Request("https://x.test/api/internal/security/ingest"))).status).toBe(405);
    expect((await ingestRoute.GET(new Request("https://x.test/api/internal/security/ingest", { headers: { "x-vercel-verify": "<script>" } }))).status).toBe(405);
  });
});

describe("security retention route", () => {
  const request = (authorization?: string) => new Request("https://x.test/api/internal/security/retention", { headers: authorization ? { authorization } : {} });

  it("fails closed exactly like the billing scheduler route", async () => {
    setEnvironment({ MVH_APP_ENVIRONMENT: "local", CRON_SECRET });
    expect((await retentionRoute.GET(request(`Bearer ${CRON_SECRET}`))).status).toBe(404);
    setEnvironment(STAGING);
    expect((await retentionRoute.GET(request(`Bearer ${CRON_SECRET}`))).status).toBe(503);
    setEnvironment({ ...STAGING, CRON_SECRET });
    expect((await retentionRoute.GET(request())).status).toBe(401);
    expect((await retentionRoute.GET(request("Bearer wrong-secret-0123456789"))).status).toBe(401);
    expect(store.rpc).not.toHaveBeenCalled();
  });

  it("purges with the bounded retention windows and reports counts only", async () => {
    setEnvironment({ ...STAGING, CRON_SECRET, MVH_SECURITY_EVENT_RETENTION_DAYS: "14" });
    const response = await retentionRoute.POST(request(`Bearer ${CRON_SECRET}`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ state: "purged", eventRetentionDays: 14, alertRetentionDays: 90, eventsDeleted: 3, alertsDeleted: 1 });
    expect(store.rpc).toHaveBeenCalledWith("purge_security_events", { p_event_retention_days: 14, p_alert_retention_days: 90 });
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
});

describe("synthetic scenario route", () => {
  const form = (fields: Record<string, string>) => {
    const body = new FormData();
    for (const [key, value] of Object.entries(fields)) body.append(key, value);
    return new Request("https://mathnexa-platform-staging.vercel.app/admin/security/synthetic", { method: "POST", body });
  };
  const valid = { csrfToken: "token", scenario: "webhook-signature-spike", reason: "Owner alert pipeline proof", confirm: "synthetic" };
  const authorized = { state: "authorized", admin: { id: "admin-1" }, session: { id: "session-1" } };

  it("is a 404 for anyone who is not an authorized admin, and never runs", async () => {
    setEnvironment(STAGING);
    for (const state of ["unauthenticated", "non-admin", "mfa-required", "reauth-required", "disabled", "unavailable"]) {
      admin.access = { state };
      expect((await syntheticRoute.POST(form(valid))).status, state).toBe(404);
    }
    expect((await syntheticRoute.GET()).status).toBe(404);
    expect(admin.scenarios).toEqual([]);
    expect(admin.audits).toEqual([]);
  });

  it("does not exist on a production deployment even for the owner with a valid token", async () => {
    setEnvironment(PRODUCTION);
    admin.access = authorized;
    admin.csrf = true;
    expect((await syntheticRoute.POST(form(valid))).status).toBe(404);
    expect(admin.scenarios).toEqual([]);
  });

  it("requires the CSRF token, a known scenario, a reason and explicit confirmation", async () => {
    setEnvironment(STAGING);
    admin.access = authorized;
    admin.csrf = false;
    const denied = await syntheticRoute.POST(form(valid));
    expect(denied.status).toBe(303);
    expect(new URL(denied.headers.get("location")!).searchParams.get("security")).toBe("csrf-denied");
    admin.csrf = true;
    for (const broken of [{ ...valid, scenario: "drop-tables" }, { ...valid, reason: "no" }, { ...valid, confirm: "yes" }]) {
      const response = await syntheticRoute.POST(form(broken));
      expect(new URL(response.headers.get("location")!).searchParams.get("security")).toBe("invalid-scenario");
    }
    expect(admin.scenarios).toEqual([]);
  });

  it("audits and runs the scenario for an authorized owner on staging, and reports what happened", async () => {
    setEnvironment(STAGING);
    admin.access = authorized;
    admin.csrf = true;
    const response = await syntheticRoute.POST(form(valid));
    expect(response.status).toBe(303);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toBe("https://mathnexa-platform-staging.vercel.app");
    expect(location.searchParams.get("section")).toBe("security");
    expect(location.searchParams.get("security")).toBe("synthetic-webhook-signature-spike-stored-6-alerts-1");
    expect(admin.scenarios).toEqual(["webhook-signature-spike"]);
    expect(admin.audits).toEqual([expect.objectContaining({ adminUserId: "admin-1", action: "admin.security.synthetic-test", target: "webhook-signature-spike" })]);
  });
});

describe("structural invariants of the read path", () => {
  it("keeps persistence off the request path: scheduled after the response, never awaited by the emitter", () => {
    const sink = read("apps/platform-web/lib/observability/security-sink.ts");
    expect(sink).toContain('import { after } from "next/server"');
    expect(sink).toMatch(/after\(work\)/);
    const server = read("apps/platform-web/lib/observability/server.ts");
    expect(server).toMatch(/void adapter\.emit\(/);
    expect(server).not.toMatch(/await adapter\.emit/);
  });

  it("routes every producer through the platform adapter so nothing is silently console-only", () => {
    for (const file of ["apps/platform-web/lib/auth/rate-limit.ts", "apps/platform-web/lib/billing/consumer-observability.ts", "apps/platform-web/lib/observability/security-events.ts"]) {
      const source = read(file);
      expect(source, file).toContain("platformMonitoringAdapter()");
      expect(source, file).not.toMatch(/emitOperationalEvent\(new ConsoleMonitoringAdapter\(\)/);
    }
  });

  it("redacts twice: at emission and again when a line is read back", () => {
    expect(read("apps/platform-web/lib/observability/security-events.ts")).toMatch(/\.\.\.sanitizeSecurityDetail\(detail\)/);
    expect(read("apps/platform-web/lib/observability/security-pipeline.ts")).toMatch(/sanitizeSecurityDetail\(rawDetail\)/);
    // One definition, not two: the pipeline reuses the emitter's filter set.
    expect(read("apps/platform-web/lib/observability/security-pipeline.ts")).not.toMatch(/new RegExp\(/);
  });

  it("labels every emitted line with the deployment, derived from server configuration only", () => {
    const source = read("apps/platform-web/lib/observability/security-events.ts");
    expect(source).toContain("deployment: securityEnvironmentLabel()");
    const environment = read("apps/platform-web/lib/observability/security-environment.ts");
    expect(environment).not.toMatch(/headers\(|request\.|NEXT_PUBLIC/);
  });

  it("guards the synthetic route with admin authorization, CSRF and a production refusal that precedes the form", () => {
    const source = read("apps/platform-web/app/admin/security/synthetic/route.ts");
    expect(source).toContain("inspectAdminAccess()");
    expect(source).toContain("validateAdminMutationCsrf(form)");
    expect(source.indexOf("isSyntheticSecurityTestingAllowed()")).toBeLessThan(source.indexOf("request.formData()"));
    expect(source).toContain('action: "admin.security.synthetic-test"');
  });

  it("fails the ingest and retention routes closed", () => {
    const ingestSource = read("apps/platform-web/app/api/internal/security/ingest/route.ts");
    expect(ingestSource).toContain("drainSecretConfigured()");
    expect(ingestSource).toContain("verifyDrainSignature(");
    expect(ingestSource.indexOf("verifyDrainSignature(")).toBeLessThan(ingestSource.indexOf("parseDrainPayload("));
    const retention = read("apps/platform-web/app/api/internal/security/retention/route.ts");
    expect(retention).toContain("schedulerAuthorization(request)");
    expect(retention).toContain("isProductionPlatformMode()");
  });

  it("wires the new signals at every surface the inventory named", () => {
    const wired: ReadonlyArray<readonly [string, string]> = [
      ["apps/platform-web/app/admin/actions.ts", "ADMIN_AUTH_FAILED"],
      ["apps/platform-web/app/admin/actions.ts", "ADMIN_AUTH_RATE_LIMITED"],
      ["apps/platform-web/lib/admin/session.ts", "ADMIN_CSRF_REJECTED"],
      ["apps/platform-web/lib/admin/session.ts", "AUTHORIZATION_DENIED"],
      ["apps/platform-web/lib/admin/external-destination-health.ts", "SSRF_BLOCKED"],
      ["apps/platform-web/app/api/internal/billing/reconcile/route.ts", "SCHEDULER_AUTH_FAILED"],
      ["apps/platform-web/app/api/internal/billing/reconcile/route.ts", "SECURITY_CONFIG_ERROR"],
      ["apps/platform-web/app/api/internal/security/retention/route.ts", "SCHEDULER_AUTH_FAILED"],
      ["apps/platform-web/app/auth-actions.ts", "AUTH_RECOVERY_CLEARED_BLOCK"],
      ["apps/platform-web/lib/staging-access/server.ts", "STAGING_CONFIGURATION_INVALID"],
      ["apps/platform-web/lib/games/ticket.ts", "AUTHORIZATION_DENIED"]
    ];
    for (const [file, event] of wired) expect(read(file), `${file} must report ${event}`).toContain(event);
  });

  it("exposes the Security section through the existing admin architecture only", () => {
    expect(read("apps/platform-web/lib/admin/navigation.ts")).toContain('["security", "Security"');
    const page = read("apps/platform-web/app/admin/page.tsx");
    expect(page).toContain("loadAdminSecurityHealth()");
    expect(page).toContain("<AdminSecurityHealth");
    // No new page route: /admin?section=security lives behind the same inspectAdminAccess gate.
    expect(page.indexOf("inspectAdminAccess()")).toBeLessThan(page.indexOf("loadAdminSecurityHealth()"));
  });

  it("records the password-change outcome under a key the redaction layer keeps", async () => {
    const { emitSecurityEvent } = await import("@/lib/observability/security-events");
    const captured: string[] = [];
    const original = console.info;
    console.info = (line: string) => { captured.push(String(line)); };
    try {
      emitSecurityEvent("AUTH_PASSWORD_CHANGED", { otherDevicesSignedOut: true }, new Headers({ "x-vercel-id": `cle1-pwd-${Date.now()}` }));
    } finally {
      console.info = original;
    }
    expect(captured.join(" ")).toContain('"otherDevicesSignedOut":true');
    // The previous key was silently dropped by the "session" filter, so the line said nothing.
    expect(read("apps/platform-web/app/auth-actions.ts")).not.toMatch(/\{ otherSessionsRevoked \}/);
  });
});

describe("the three non-obvious rate-limit contracts, unchanged by observability", () => {
  const rateLimit = read("apps/platform-web/lib/auth/rate-limit.ts");

  it("A. spray observation has zero pre-authentication call sites and never blocks", () => {
    // The only caller is the rejected-credential branch of the sign-in action.
    const authActions = read("apps/platform-web/app/auth-actions.ts");
    expect(authActions.match(/observeFailedSignIn\(\)/g)).toHaveLength(1);
    expect(authActions.indexOf("signInWithPassword")).toBeLessThan(authActions.indexOf("observeFailedSignIn()"));
    // The limiter itself, which runs before the password is checked, does not observe.
    const limiterBody = rateLimit.slice(rateLimit.indexOf("export async function consumeConsumerAuthAttempt"), rateLimit.indexOf("const ACCOUNT_TARGET_BUDGET"));
    expect(limiterBody).not.toContain("observeFailedSignIn");
    expect(rateLimit).not.toContain("observeSprayPressure");
    // Observation only: the result is never returned as a verdict.
    const observer = rateLimit.slice(rateLimit.indexOf("export async function observeFailedSignIn"), rateLimit.indexOf("export async function clearConsumerAuthAttempts"));
    expect(observer).toContain("enforced: false");
    expect(observer).toMatch(/Promise<void>/);
    expect(observer).not.toMatch(/return "(throttled|unavailable)"/);
    expect(rateLimit).toMatch(/const SPRAY_OBSERVATION(: Budget)? = Object\.freeze\(\{\s*maxAttempts: 20,\s*windowSeconds: 900,\s*blockSeconds: 900\s*\}\)/);
  });

  it("B. the account-target dimension is guarded to sign-in only", () => {
    expect(rateLimit).toContain('if (scope !== "sign-in") return requestVerdict;');
    expect(rateLimit).toMatch(/const ACCOUNT_TARGET_BUDGET(: Budget)? = Object\.freeze\(\{\s*maxAttempts: 20,\s*windowSeconds: 900,\s*blockSeconds: 900\s*\}\)/);
  });

  it("C. the limiter secret keeps its 20-character floor and has no ceiling", () => {
    expect(rateLimit).toContain("const MINIMUM_SECRET_LENGTH = 20;");
    expect(rateLimit).not.toMatch(/MAXIMUM_SECRET_LENGTH|maximumSecretLength/);
    const resolver = rateLimit.slice(rateLimit.indexOf("function usableSecret"), rateLimit.indexOf("export function consumerAuthSubjectHash"));
    expect(resolver).not.toMatch(/length\s*(>|<=)\s*\d{2,}/);
  });

  it("network budget is 20 / 900 / 900 and unchanged", () => {
    expect(rateLimit).toContain('"sign-in": { maxAttempts: 20, windowSeconds: 900, blockSeconds: 900 }');
    expect(rateLimit).toContain('"sign-up": { maxAttempts: 10, windowSeconds: 900, blockSeconds: 900 }');
    expect(rateLimit).toContain('"password-recovery": { maxAttempts: 6, windowSeconds: 900, blockSeconds: 1800 }');
  });
});
