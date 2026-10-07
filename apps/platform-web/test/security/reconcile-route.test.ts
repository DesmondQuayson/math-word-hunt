// @vitest-environment node
/**
 * The daily reconciliation route is exempt from the deployment-host redirect so
 * the Vercel scheduler can reach it. That exemption is only safe while the
 * route itself stays closed: concealed outside production, refused without the
 * scheduler's exact bearer secret, and reachable only through the read-at-
 * provider sweep. These tests fail the moment any of that loosens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sweep = vi.fn();
vi.mock("@/lib/billing/consumer-config", () => ({ tryGetConsumerBillingConfiguration: () => ({ environment: "live" }) }));
vi.mock("@/lib/billing/consumer-provider-factory", () => ({ createConsumerBillingProvider: () => ({}) }));
vi.mock("@/lib/billing/consumer-service", () => ({ createConsumerBillingRepository: () => ({}) }));
vi.mock("@/lib/billing/consumer-reconciliation", () => ({ runConsumerReconciliationSweep: (input: unknown) => sweep(input) }));

import { GET, POST } from "@/app/api/internal/billing/reconcile/route";

const SECRET = ["scheduler", "secret", "for", "tests", "only"].join("-");
const originalEnvironment = { ...process.env };
const call = (handler: typeof GET, authorization?: string) =>
  handler(new Request("https://mathnexa-platform-production.vercel.app/api/internal/billing/reconcile", {
    headers: authorization === undefined ? {} : { authorization }
  }));

beforeEach(() => {
  sweep.mockReset();
  sweep.mockResolvedValue({ checked: 0, synchronized: 0, repaired: 0, manualReview: 0, unavailable: 0, noSubscriptions: 0, candidates: 0, truncated: false });
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.CRON_SECRET = SECRET;
});
afterEach(() => { process.env = { ...originalEnvironment }; });

describe("daily reconciliation route protection", () => {
  it("is concealed outside the production platform, even with the right secret", async () => {
    for (const environment of [undefined, "staging", "preview", "local", "production-public", " production-platform"]) {
      if (environment === undefined) delete process.env.MVH_APP_ENVIRONMENT; else process.env.MVH_APP_ENVIRONMENT = environment;
      const response = await call(GET, `Bearer ${SECRET}`);
      expect(response.status, String(environment)).toBe(404);
      expect(await response.json()).toEqual({ error: "not-found" });
    }
    expect(sweep).not.toHaveBeenCalled();
  });

  it("refuses every caller without the exact scheduler bearer token", async () => {
    // Surrounding whitespace is stripped by the Fetch Headers layer before the route sees it.
    for (const authorization of [undefined, "", SECRET, `bearer ${SECRET}`, `Bearer  ${SECRET}`, `Bearer ${SECRET.slice(0, -1)}x`, `Bearer ${SECRET}x`, "Basic Zm9vOmJhcg=="]) {
      const response = await call(GET, authorization);
      expect(response.status, JSON.stringify(authorization)).toBe(401);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(sweep).not.toHaveBeenCalled();
  });

  it("fails closed when the scheduler secret is missing or too short", async () => {
    for (const secret of [undefined, "", "short-secret"]) {
      if (secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = secret;
      const response = await call(GET, `Bearer ${secret ?? ""}`);
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ state: "scheduler-secret-missing" });
    }
    expect(sweep).not.toHaveBeenCalled();
  });

  it("runs only the bounded sweep for the scheduler and answers aggregate counts only", async () => {
    for (const handler of [GET, POST]) {
      const response = await call(handler, `Bearer ${SECRET}`);
      expect(response.status).toBe(200);
      expect(Object.keys(await response.json()).sort()).toEqual(["candidates", "checked", "manualReview", "noSubscriptions", "repaired", "synchronized", "truncated", "unavailable"]);
    }
    expect(sweep).toHaveBeenCalledTimes(2);
    expect(sweep.mock.calls[0]![0]).toMatchObject({ limit: 50 });
  });
});
