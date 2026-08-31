/**
 * Runtime proof for the production rate-limiter contract.
 *
 * `security-baseline.test.ts` proves the pure decision function. This file
 * proves the wired-up `consumeConsumerAuthAttempt` — the thing the sign-in
 * action actually calls — reaches the same verdicts once the real environment
 * and the real Supabase service client are in play. The two together are what
 * makes "production cannot silently fail open" a fact rather than an intention.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceClient = vi.hoisted(() => ({ current: null as null | { rpc: ReturnType<typeof vi.fn> } }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => serviceClient.current
}));

vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "x-forwarded-for": "203.0.113.10", "user-agent": "contract-test" })
}));

const emitted: unknown[] = [];
vi.mock("@/lib/observability/server", () => ({
  ConsoleMonitoringAdapter: class {
    emit(event: unknown) { emitted.push(event); }
  },
  emitOperationalEvent: (adapter: { emit(event: unknown): void }, event: unknown) => {
    adapter.emit(event);
    return true;
  }
}));

const { consumeConsumerAuthAttempt } = await import("./rate-limit");

const PRODUCTION = "production-platform";
const SECRET = "s".repeat(40);

let previous: NodeJS.ProcessEnv;

beforeEach(() => {
  previous = { ...process.env };
  emitted.length = 0;
  serviceClient.current = null;
});

afterEach(() => {
  process.env = previous;
  vi.clearAllMocks();
});

function configureEnvironment(appEnvironment: string, withSecret: boolean) {
  process.env.MVH_APP_ENVIRONMENT = appEnvironment;
  delete process.env.MVH_AUTH_RATE_LIMIT_SECRET;
  delete process.env.MVH_ADMIN_CSRF_SECRET;
  if (withSecret) process.env.SUPABASE_SECRET_KEY = SECRET;
  else delete process.env.SUPABASE_SECRET_KEY;
}

function healthyClient(allowed: boolean) {
  return { rpc: vi.fn().mockResolvedValue({ data: allowed, error: null }) };
}

function failingClient() {
  return { rpc: vi.fn().mockResolvedValue({ data: null, error: { message: "unreachable" } }) };
}

describe("production runtime: limiter unavailable", () => {
  it("denies authentication rather than allowing it unlimited when unconfigured", async () => {
    configureEnvironment(PRODUCTION, false);
    serviceClient.current = null;
    await expect(consumeConsumerAuthAttempt("sign-in", "person@example.test")).resolves.toBe("unavailable");
  });

  it("denies authentication when the limiter backend fails", async () => {
    configureEnvironment(PRODUCTION, true);
    serviceClient.current = failingClient();
    await expect(consumeConsumerAuthAttempt("sign-in", "person@example.test")).resolves.toBe("unavailable");
  });

  it("denies every consumer credential surface, not only sign-in", async () => {
    configureEnvironment(PRODUCTION, false);
    serviceClient.current = null;
    for (const scope of ["sign-in", "sign-up", "password-recovery"] as const) {
      await expect(consumeConsumerAuthAttempt(scope, "person@example.test")).resolves.toBe("unavailable");
    }
  });

  it("records a privacy-safe event carrying no credential or subject material", async () => {
    configureEnvironment(PRODUCTION, false);
    serviceClient.current = null;
    await consumeConsumerAuthAttempt("sign-up", "person@example.test");

    expect(emitted).toHaveLength(1);
    const event = emitted[0] as Record<string, unknown>;
    expect(event.category).toBe("authentication");
    expect(event.severity).toBe("critical");
    expect(event.code).toBe("rate-limiter-unavailable");
    // correlationId must satisfy the SafeEvent contract even for the shortest scope.
    expect(String(event.correlationId)).toMatch(/^[a-zA-Z0-9_-]{8,80}$/);

    const serialized = JSON.stringify(event);
    expect(serialized).not.toContain("person@example.test");
    expect(serialized).not.toContain(SECRET);
    expect(serialized).not.toMatch(/[0-9a-f]{64}/);
  });
});

describe("production runtime: limiter healthy", () => {
  it("still allows a normal sign-in", async () => {
    configureEnvironment(PRODUCTION, true);
    serviceClient.current = healthyClient(true);
    await expect(consumeConsumerAuthAttempt("sign-in", "person@example.test")).resolves.toBe("allowed");
    expect(emitted).toHaveLength(0);
  });

  it("throttles once the budget is spent", async () => {
    configureEnvironment(PRODUCTION, true);
    serviceClient.current = healthyClient(false);
    await expect(consumeConsumerAuthAttempt("sign-in", "person@example.test")).resolves.toBe("throttled");
    // A spent budget is not an outage and must not be reported as one.
    expect(emitted).toHaveLength(0);
  });

  it("sends a budget the database function will accept", async () => {
    configureEnvironment(PRODUCTION, true);
    const client = healthyClient(true);
    serviceClient.current = client;
    await consumeConsumerAuthAttempt("password-recovery", "person@example.test");

    const [name, args] = client.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(name).toBe("consume_admin_auth_rate_limit");
    // consume_admin_auth_rate_limit raises outside these bounds, and a raise
    // would surface as an error and deny sign-in.
    expect(args.p_scope).toBe("login");
    expect(String(args.p_subject_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(Number(args.p_max_attempts)).toBeGreaterThanOrEqual(1);
    expect(Number(args.p_max_attempts)).toBeLessThanOrEqual(20);
    expect(Number(args.p_window_seconds)).toBeGreaterThanOrEqual(30);
    expect(Number(args.p_window_seconds)).toBeLessThanOrEqual(3600);
    expect(Number(args.p_block_seconds)).toBeGreaterThanOrEqual(30);
    expect(Number(args.p_block_seconds)).toBeLessThanOrEqual(86400);
  });

  it("never sends the raw address to the database", async () => {
    configureEnvironment(PRODUCTION, true);
    const client = healthyClient(true);
    serviceClient.current = client;
    await consumeConsumerAuthAttempt("sign-in", "person@example.test");
    expect(JSON.stringify(client.rpc.mock.calls[0])).not.toContain("person@example.test");
  });
});

describe("development runtime", () => {
  it("does not lock developers out when the infrastructure is simply absent", async () => {
    configureEnvironment("local", false);
    serviceClient.current = null;
    await expect(consumeConsumerAuthAttempt("sign-in", "person@example.test")).resolves.toBe("allowed");
    // The development fallback is not an incident, so it stays quiet.
    expect(emitted).toHaveLength(0);
  });

  it("still enforces a healthy limiter outside production", async () => {
    configureEnvironment("local", true);
    serviceClient.current = healthyClient(false);
    await expect(consumeConsumerAuthAttempt("sign-in", "person@example.test")).resolves.toBe("throttled");
  });

  it("treats an unset environment as non-production without failing open in production", async () => {
    delete process.env.MVH_APP_ENVIRONMENT;
    configureEnvironment("", false);
    delete process.env.MVH_APP_ENVIRONMENT;
    serviceClient.current = null;
    await expect(consumeConsumerAuthAttempt("sign-in", "person@example.test")).resolves.toBe("allowed");
  });
});
