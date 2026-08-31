/**
 * Distributed credential-attack simulation.
 *
 * The point of this file is to prove a claim that is easy to assert and hard to
 * believe without evidence: that the network dimension ALONE can be walked
 * around by an attacker with addresses to spare, and that the account dimension
 * is what actually stops them.
 *
 * It runs entirely against a fake in-memory implementation of the deployed
 * `consume_admin_auth_rate_limit` function, so nothing here touches a database,
 * a network, staging or production.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const serviceClient = vi.hoisted(() => ({ current: null as null | { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> } }));
const requestHeaders = vi.hoisted(() => ({ current: new Headers() }));

vi.mock("@/lib/supabase/service", () => ({
  createServiceSupabaseClient: () => serviceClient.current
}));
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
/**
 * Events are CAPTURED, not discarded.
 *
 * The first version of this file stubbed the emitter to `() => true`, which made
 * emitted events invisible to every assertion here. That is how a detection
 * signal that fired on every ordinary classroom sign-in passed the suite:
 * nothing was counting. The volume of a signal is part of its contract.
 */
const emitted = vi.hoisted(() => ({ current: [] as Array<Record<string, unknown>> }));

vi.mock("@/lib/observability/server", () => ({
  ConsoleMonitoringAdapter: class { emit() { /* transport is not under test */ } },
  emitOperationalEvent: (_adapter: unknown, event: Record<string, unknown>) => {
    emitted.current.push(event);
    return true;
  }
}));

const { consumeConsumerAuthAttempt, clearConsumerAuthAttempts, observeFailedSignIn } =
  await import("@/lib/auth/rate-limit");

function sprayEvents(): Array<Record<string, unknown>> {
  return emitted.current.filter((event) => event.code === "auth-spray-suspected");
}

/**
 * Faithful in-memory stand-in for the deployed Postgres function, including its
 * argument validation. If the application ever sends a budget the real function
 * would reject, this throws exactly as the real one raises.
 */
function createRateLimitBackend() {
  const rows = new Map<string, { windowStartedAt: number; attempts: number; blockedUntil: number | null }>();
  let now = Date.UTC(2026, 0, 1) / 1000;

  return {
    advanceSeconds(seconds: number) { now += seconds; },
    get size() { return rows.size; },
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "clear_admin_auth_rate_limit") {
        rows.delete(`${args.p_scope}:${args.p_subject_hash}`);
        return { data: null, error: null };
      }
      if (name !== "consume_admin_auth_rate_limit") return { data: null, error: { message: "unknown rpc" } };

      const scope = String(args.p_scope);
      const hash = String(args.p_subject_hash);
      const max = Number(args.p_max_attempts);
      const windowSeconds = Number(args.p_window_seconds);
      const blockSeconds = Number(args.p_block_seconds);

      // The real function raises on a contract violation.
      if (!["login", "mfa"].includes(scope) || !/^[0-9a-f]{64}$/.test(hash) ||
        max < 1 || max > 20 || windowSeconds < 30 || windowSeconds > 3600 ||
        blockSeconds < 30 || blockSeconds > 86400) {
        return { data: null, error: { message: "Invalid admin rate-limit contract" } };
      }

      const key = `${scope}:${hash}`;
      const row = rows.get(key);
      if (row?.blockedUntil && row.blockedUntil > now) return { data: false, error: null };

      if (!row || row.windowStartedAt + windowSeconds <= now) {
        rows.set(key, { windowStartedAt: now, attempts: 1, blockedUntil: null });
        return { data: true, error: null };
      }
      const attempts = row.attempts + 1;
      rows.set(key, {
        windowStartedAt: row.windowStartedAt,
        attempts,
        blockedUntil: attempts > max ? now + blockSeconds : null
      });
      return { data: attempts <= max, error: null };
    }
  };
}

let backend: ReturnType<typeof createRateLimitBackend>;
let previousEnvironment: NodeJS.ProcessEnv;

beforeEach(() => {
  previousEnvironment = { ...process.env };
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.SUPABASE_SECRET_KEY = "s".repeat(40);
  delete process.env.MVH_AUTH_RATE_LIMIT_SECRET;
  delete process.env.MVH_ADMIN_CSRF_SECRET;
  backend = createRateLimitBackend();
  emitted.current = [];
  serviceClient.current = backend;
  requestHeaders.current = new Headers();
});

afterEach(() => {
  process.env = previousEnvironment;
  vi.clearAllMocks();
});

/** One attempt as it would arrive from a given address and user agent. */
async function attemptFrom(address: string, agent: string, account: string) {
  requestHeaders.current = new Headers({ "x-vercel-forwarded-for": address, "user-agent": agent });
  return consumeConsumerAuthAttempt("sign-in", account);
}

const VICTIM = "victim@example.test";

describe("a single attacker address is stopped by the network dimension", () => {
  it("throttles after the per-request budget is spent", async () => {
    const verdicts: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      verdicts.push(await attemptFrom("203.0.113.10", "Mozilla/5.0", VICTIM));
    }
    expect(verdicts.slice(0, 20).every((v) => v === "allowed")).toBe(true);
    expect(verdicts[20]).toBe("throttled");
  });
});

describe("changing the user agent no longer buys a fresh budget", () => {
  it("keeps one attacker address on one budget however many agents it forges", async () => {
    // This is the bypass Phase 2 closed. Before it, each new agent string was a
    // brand-new bucket, so this loop would never have been throttled.
    const verdicts: string[] = [];
    for (let i = 0; i < 25; i += 1) {
      verdicts.push(await attemptFrom("203.0.113.10", `ForgedAgent/${i}`, VICTIM));
    }
    expect(verdicts.filter((v) => v === "throttled").length).toBeGreaterThan(0);
    expect(verdicts[20]).toBe("throttled");
  });

  it("creates one limiter row per address, not one per forged agent", async () => {
    for (let i = 0; i < 15; i += 1) {
      await attemptFrom("203.0.113.10", `ForgedAgent/${i}`, VICTIM);
    }
    // Two rows, both bounded: the request dimension and the account dimension.
    // The address-scoped spray observation is deliberately NOT among them —
    // it only counts rejected credentials, so it is not touched by the limiter
    // path at all. The old user-agent key would have produced fifteen request
    // rows in a table that has no TTL; the count is the point, not the number.
    expect(backend.size).toBe(2);
  });
});

describe("a distributed attacker defeats the network dimension", () => {
  it("gets a fresh network budget from every new address", async () => {
    // Deliberately demonstrating the weakness, so the account dimension below is
    // shown to be load-bearing rather than decorative.
    const perAddressFirstVerdicts: string[] = [];
    for (let i = 0; i < 15; i += 1) {
      perAddressFirstVerdicts.push(await attemptFrom(`198.51.100.${i}`, "Mozilla/5.0", VICTIM));
    }
    // Every one of those is the first attempt from its own address, so the
    // network dimension never objects.
    expect(perAddressFirstVerdicts.every((v) => v === "allowed")).toBe(true);
  });

  it("is nonetheless capped by the account dimension", async () => {
    const verdicts: string[] = [];
    // A hundred distinct addresses, one guess each — the classic proxy-pool shape.
    for (let i = 0; i < 100; i += 1) {
      verdicts.push(await attemptFrom(`198.51.100.${Math.floor(i / 4)}.${i % 4}`, `Agent/${i}`, VICTIM));
    }
    const allowed = verdicts.filter((v) => v === "allowed").length;
    const throttled = verdicts.filter((v) => v === "throttled").length;

    // The account budget is 20 per 15-minute window. The attacker gets those and
    // no more within the window, however many addresses they own.
    expect(allowed).toBe(20);
    expect(throttled).toBe(80);
  });

  it("caps each targeted account separately, so one victim does not shield another", async () => {
    for (let i = 0; i < 30; i += 1) await attemptFrom(`198.51.100.${i}`, "Agent", VICTIM);
    // A different account still has its own untouched budget.
    await expect(attemptFrom("198.51.100.200", "Agent", "other@example.test")).resolves.toBe("allowed");
  });
});

describe("legitimate use survives", () => {
  it("does not punish a classroom sharing one address", async () => {
    // Thirty students behind one school address, each with their own account,
    // each getting it right first time.
    const verdicts: string[] = [];
    for (let student = 0; student < 30; student += 1) {
      verdicts.push(await attemptFrom("203.0.113.50", "SchoolChromebook/1.0", `student${student}@school.test`));
    }
    expect(verdicts.every((v) => v === "allowed")).toBe(true);
  });

  it("gives a user their budget back once they succeed", async () => {
    for (let i = 0; i < 19; i += 1) await attemptFrom("203.0.113.10", "Mozilla/5.0", VICTIM);
    // A successful sign-in clears both dimensions.
    requestHeaders.current = new Headers({ "x-vercel-forwarded-for": "203.0.113.10" });
    await clearConsumerAuthAttempts("sign-in", VICTIM);
    const verdicts: string[] = [];
    for (let i = 0; i < 20; i += 1) verdicts.push(await attemptFrom("203.0.113.10", "Mozilla/5.0", VICTIM));
    expect(verdicts.every((v) => v === "allowed")).toBe(true);
  });

  it("releases an account block rather than holding it, so a targeted lockout is temporary", async () => {
    // This case found a real defect. With a window LONGER than the block, an
    // expired block lands inside a still-open, already-over-budget window and
    // re-blocks immediately — every further attempt pushing the release out
    // again. That is an indefinite lockout an attacker controls, not a
    // 15-minute one. The window and block are now equal so the counter really
    // does reset. Do not lengthen the window without re-reading this.
    for (let i = 0; i < 25; i += 1) await attemptFrom(`198.51.100.${i}`, "Agent", VICTIM);
    await expect(attemptFrom("198.51.100.250", "Agent", VICTIM)).resolves.toBe("throttled");

    backend.advanceSeconds(16 * 60);
    await expect(attemptFrom("203.0.113.99", "Mozilla/5.0", VICTIM)).resolves.toBe("allowed");
  });

  it("cannot be held shut indefinitely by an attacker who keeps knocking", async () => {
    // The attacker must sustain a full budget every window to keep the victim
    // out; a trickle of one attempt per block period must not suffice.
    for (let i = 0; i < 25; i += 1) await attemptFrom(`198.51.100.${i}`, "Agent", VICTIM);

    for (let cycle = 0; cycle < 3; cycle += 1) {
      backend.advanceSeconds(16 * 60);
      // One lone attacker attempt during the new window.
      await attemptFrom("198.51.100.251", "Agent", VICTIM);
      // The victim still gets in.
      await expect(
        attemptFrom("203.0.113.99", "Mozilla/5.0", VICTIM),
        `victim must not be locked out on cycle ${cycle}`
      ).resolves.toBe("allowed");
    }
  });

  it("leaves password recovery reachable while sign-in is blocked", async () => {
    // The escape hatch. A deliberate lockout must not also cut off the way back in.
    for (let i = 0; i < 25; i += 1) await attemptFrom(`198.51.100.${i}`, "Agent", VICTIM);
    await expect(attemptFrom("198.51.100.250", "Agent", VICTIM)).resolves.toBe("throttled");

    requestHeaders.current = new Headers({ "x-vercel-forwarded-for": "203.0.113.77" });
    await expect(consumeConsumerAuthAttempt("password-recovery", VICTIM)).resolves.toBe("allowed");
  });
});

describe("the simulated backend enforces the real function's contract", () => {
  it("would reject a budget the deployed function refuses", async () => {
    // Guards the simulation itself: if the app ever sends an out-of-contract
    // budget, the fake raises exactly as Postgres would, and the limiter denies.
    const result = await backend.rpc("consume_admin_auth_rate_limit", {
      p_scope: "login",
      p_subject_hash: "a".repeat(64),
      p_max_attempts: 21,
      p_window_seconds: 900,
      p_block_seconds: 900
    });
    expect(result.error).not.toBeNull();
  });
});

describe("password spraying is observed but never enforced", () => {
  /** One rejected credential from `address`, as the sign-in action reports it. */
  async function failedSignInFrom(address: string, account: string): Promise<void> {
    requestHeaders.current = new Headers({
      "x-vercel-forwarded-for": address,
      "x-vercel-id": `req-${Math.random().toString(36).slice(2, 12)}`
    });
    await consumeConsumerAuthAttempt("sign-in", account);
    await observeFailedSignIn();
  }

  /** One successful sign-in: the limiter is consulted, the credential is accepted. */
  async function successfulSignInFrom(address: string, account: string): Promise<string> {
    requestHeaders.current = new Headers({
      "x-vercel-forwarded-for": address,
      "x-vercel-id": `req-${Math.random().toString(36).slice(2, 12)}`
    });
    const verdict = await consumeConsumerAuthAttempt("sign-in", account);
    if (verdict === "allowed") await clearConsumerAuthAttempts("sign-in", account);
    return verdict;
  }

  it("stays completely silent through an ordinary school morning", async () => {
    // THE regression this test exists for. Spray observation used to run inside
    // the limiter, which executes BEFORE the password is checked, so every
    // SUCCESSFUL sign-in counted. Thirty students behind one school address
    // produced ten spray events and two hundred produced a hundred and seventy —
    // a signal guaranteed to saturate on a normal day and bury the real ones.
    for (let i = 0; i < 200; i += 1) {
      await expect(successfulSignInFrom("198.51.100.10", `student${i}@school.test`)).resolves.toBe("allowed");
    }
    expect(sprayEvents(), "a legitimate classroom must raise no spray signal").toHaveLength(0);
  });

  it("still sees a real spray, and lets it through", async () => {
    // One REJECTED guess against each of many accounts, from one address: the
    // shape neither account-keyed dimension can see. Enforcing here would be the
    // classroom lockout the product cannot afford, so the request proceeds.
    for (let i = 0; i < 30; i += 1) {
      await failedSignInFrom("203.0.113.200", `target${i}@example.test`);
      expect(
        await successfulSignInFrom("203.0.113.200", `target${i}@example.test`),
        "spraying must never be blocked"
      ).toBe("allowed");
    }
    expect(sprayEvents().length, "a real spray must raise a signal").toBeGreaterThan(0);
  });

  it("raises the signal at a readable rate rather than once per request", async () => {
    // Once the threshold is crossed the database function keeps returning false
    // for the rest of the window. A per-request correlation id would emit one
    // line for every subsequent attempt; a stable one lets the 5-second
    // de-duplication collapse a sustained condition into a readable trickle.
    for (let i = 0; i < 60; i += 1) await failedSignInFrom("203.0.113.202", `victim${i}@example.test`);
    expect(sprayEvents().every((event) => event.correlationId === "spray-observation")).toBe(true);
  });

  it("does not spend the spray budget on a single legitimate account", async () => {
    // A user failing repeatedly on their own account is caught by the account
    // dimension, and must not additionally trip the address observation for
    // everyone else behind that address.
    for (let i = 0; i < 5; i += 1) await attemptFrom("203.0.113.201", "Mozilla/5.0", VICTIM);
    await expect(attemptFrom("203.0.113.201", "Mozilla/5.0", "colleague@example.test")).resolves.toBe("allowed");
  });
});

describe("a blocked user cannot deadlock themselves by retrying", () => {
  it("does not extend its own block when the victim keeps polling", async () => {
    // A real person whose account has been blocked will retry, possibly a lot.
    // If each retry pushed the release further out, the product would punish
    // exactly the user it is meant to protect. The deployed function returns
    // early while blocked — before incrementing — so polling is free.
    for (let i = 0; i < 25; i += 1) await attemptFrom(`198.51.100.${i}`, "Agent", VICTIM);
    await expect(attemptFrom("203.0.113.60", "Mozilla/5.0", VICTIM)).resolves.toBe("throttled");

    // The victim retries repeatedly during the block.
    for (let i = 0; i < 10; i += 1) {
      await expect(attemptFrom("203.0.113.60", "Mozilla/5.0", VICTIM)).resolves.toBe("throttled");
    }

    // The block still releases on its original schedule.
    backend.advanceSeconds(16 * 60);
    await expect(attemptFrom("203.0.113.60", "Mozilla/5.0", VICTIM)).resolves.toBe("allowed");
  });
});
