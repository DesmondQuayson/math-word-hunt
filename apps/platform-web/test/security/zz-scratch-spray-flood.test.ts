/** SCRATCH review probe - delete after running. */
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const serviceClient = vi.hoisted(() => ({ current: null as null | { rpc: (n: string, a: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } }));
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));
const captured = vi.hoisted(() => ({ events: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => serviceClient.current }));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("@/lib/observability/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/observability/server")>();
  return {
    ...actual,
    ConsoleMonitoringAdapter: class { emit(e: Record<string, unknown>) { captured.events.push(e); } }
  };
});

const { consumeConsumerAuthAttempt, clearConsumerAuthAttempts } = await import("@/lib/auth/rate-limit");

function createBackend() {
  const rows = new Map<string, { windowStartedAt: number; attempts: number; blockedUntil: number | null }>();
  let now = Date.UTC(2026, 0, 1) / 1000;
  return {
    advanceSeconds(s: number) { now += s; },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "clear_admin_auth_rate_limit") { rows.delete(`${args.p_scope}:${args.p_subject_hash}`); return { data: null, error: null }; }
      if (name !== "consume_admin_auth_rate_limit") return { data: null, error: { message: "unknown rpc" } };
      const scope = String(args.p_scope); const hash = String(args.p_subject_hash);
      const max = Number(args.p_max_attempts); const win = Number(args.p_window_seconds); const blk = Number(args.p_block_seconds);
      if (!["login", "mfa"].includes(scope) || !/^[0-9a-f]{64}$/.test(hash) || max < 1 || max > 20 || win < 30 || win > 3600 || blk < 30 || blk > 86400) {
        return { data: null, error: { message: "Invalid admin rate-limit contract" } };
      }
      const key = `${scope}:${hash}`; const row = rows.get(key);
      if (row?.blockedUntil && row.blockedUntil > now) return { data: false, error: null };
      if (!row || row.windowStartedAt + win <= now) { rows.set(key, { windowStartedAt: now, attempts: 1, blockedUntil: null }); return { data: true, error: null }; }
      const attempts = row.attempts + 1;
      rows.set(key, { windowStartedAt: row.windowStartedAt, attempts, blockedUntil: attempts > max ? now + blk : null });
      return { data: attempts <= max, error: null };
    }
  };
}

let backend: ReturnType<typeof createBackend>;
let previousEnv: NodeJS.ProcessEnv;

beforeEach(() => {
  previousEnv = { ...process.env };
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.SUPABASE_SECRET_KEY = "s".repeat(40);
  delete process.env.MVH_AUTH_RATE_LIMIT_SECRET;
  delete process.env.MVH_ADMIN_CSRF_SECRET;
  backend = createBackend();
  serviceClient.current = backend;
  captured.events = [];
});
afterEach(() => { process.env = previousEnv; vi.restoreAllMocks(); });

/** One school NAT, one student per sign-in, each a UNIQUE Vercel request id. */
async function classroomSignIn(index: number, email: string) {
  requestHeaders.current = new Headers({
    "x-vercel-forwarded-for": "198.51.100.10",
    "x-vercel-id": `iad1-request-${String(index).padStart(6, "0")}`,
    "user-agent": "Mozilla/5.0 (Chromebook)"
  });
  const verdict = await consumeConsumerAuthAttempt("sign-in", email);
  // Successful sign-in: the action clears afterwards.
  if (verdict === "allowed") await clearConsumerAuthAttempts("sign-in", email);
  return verdict;
}

describe("SCRATCH: classroom sign-in vs spray observation", () => {
  it("counts AUTH_SPRAY_SUSPECTED emissions for 30 successful student sign-ins", async () => {
    const verdicts: string[] = [];
    for (let i = 0; i < 30; i += 1) verdicts.push(await classroomSignIn(i, `student${i}@school.test`));
    const spray = captured.events.filter((e) => e.code === "auth-spray-suspected");
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
      allowed: verdicts.filter((v) => v === "allowed").length,
      throttled: verdicts.filter((v) => v === "throttled").length,
      sprayEvents: spray.length,
      totalEvents: captured.events.length,
      sample: spray[0] ?? null
    }, null, 2));
    expect(verdicts.every((v) => v === "allowed")).toBe(true);
    expect(spray.length).toBe(0);
  });

  it("counts emissions for a 200-sign-in school morning", async () => {
    for (let i = 0; i < 200; i += 1) await classroomSignIn(i, `student${i}@school.test`);
    const spray = captured.events.filter((e) => e.code === "auth-spray-suspected");
    // eslint-disable-next-line no-console
    console.warn(`200 sign-ins -> ${spray.length} AUTH_SPRAY_SUSPECTED events`);
    expect(spray.length).toBe(0);
  });
});
