// @vitest-environment node
/**
 * The Google Ads conversion file is fetched by Google with a credential and
 * holds ad click identifiers. It must stay closed: concealed until a password
 * is configured, refused without the exact credential, never cached or
 * indexed, and limited to the columns Google Ads imports.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
let stripeMode: "test" | "live" | null = "live";
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc }) }));
vi.mock("@/lib/billing/consumer-config", () => ({
  tryGetConsumerBillingConfiguration: () => stripeMode ? { stripeMode } : null
}));

import { GET } from "@/app/api/internal/ads/google-ads-conversions.csv/route";

const PASSWORD = ["feed", "password", "for", "tests", "only", "0123456789"].join("-");
const GCLID = "Cj0KCQjw-TESTgclid_0123456789AbCdEf";
const basic = (user: string, password: string) => `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
const originalEnvironment = { ...process.env };
const call = (authorization?: string, query = "") => GET(new Request(`https://mathnexa.com/api/internal/ads/google-ads-conversions.csv${query}`, {
  headers: authorization === undefined ? {} : { authorization }
}));
const rows = [
  { conversion_id: "11111111-1111-4111-8111-111111111111", event_name: "account_created", occurred_at: "2026-11-14T09:00:00+00:00", value_minor_units: null, currency: null, gclid: GCLID, gbraid: null, wbraid: null },
  { conversion_id: "33333333-3333-4333-8333-333333333333", event_name: "subscription_started", occurred_at: "2026-11-15T14:03:09+00:00", value_minor_units: 599, currency: "usd", gclid: GCLID, gbraid: null, wbraid: null },
  { conversion_id: "not-a-uuid", event_name: "subscription_started", occurred_at: "2026-11-15T14:03:09+00:00", value_minor_units: 599, currency: "usd", gclid: GCLID, gbraid: null, wbraid: null }
];

beforeEach(() => {
  rpc.mockReset();
  rpc.mockResolvedValue({ data: rows, error: null });
  stripeMode = "live";
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.MVH_ADS_FEED_PASSWORD = PASSWORD;
});
afterEach(() => { process.env = { ...originalEnvironment }; });

describe("Google Ads conversion file protection", () => {
  it("is concealed outside the production platform and until a password of 24 characters is configured", async () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    expect((await call(basic("mathnexa-ads-feed", PASSWORD))).status).toBe(404);
    process.env.MVH_APP_ENVIRONMENT = "production-platform";
    for (const password of [undefined, "", "short-password", "x".repeat(23)]) {
      if (password === undefined) delete process.env.MVH_ADS_FEED_PASSWORD; else process.env.MVH_ADS_FEED_PASSWORD = password;
      const response = await call(basic("mathnexa-ads-feed", password ?? ""));
      expect(response.status, String(password)).toBe(404);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses every caller without the exact credential", async () => {
    for (const authorization of [undefined, "", PASSWORD, basic("mathnexa-ads-feed", `${PASSWORD}x`), basic("mathnexa-ads-feed", PASSWORD.slice(0, -1)),
      basic("someone-else", PASSWORD), basic("", PASSWORD), `Basic ${Buffer.from(PASSWORD).toString("base64")}`, "Basic !!!", `Bearer ${PASSWORD}x`, `bearer ${PASSWORD}`]) {
      const response = await call(authorization);
      expect(response.status, JSON.stringify(authorization)).toBe(401);
      expect(response.headers.get("www-authenticate")).toMatch(/^Basic /);
      expect(response.headers.get("cache-control")).toBe("no-store");
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("serves the file to Google's Basic credential and to a Bearer token, never cached or indexed", async () => {
    for (const authorization of [basic("mathnexa-ads-feed", PASSWORD), `Bearer ${PASSWORD}`]) {
      const response = await call(authorization);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
      expect(response.headers.get("cache-control")).toBe("no-store");
      expect(response.headers.get("x-robots-tag")).toBe("noindex, nofollow");
      expect((await response.text()).split("\r\n")).toEqual([
        "Google Click ID,GBRAID,WBRAID,Conversion Name,Conversion Time,Conversion Value,Conversion Currency,Order ID,Ad User Data,Ad Personalization",
        `${GCLID},,,account_created,2026-11-14T09:00:00+00:00,,,11111111-1111-4111-8111-111111111111,Granted,Denied`,
        `${GCLID},,,subscription_started,2026-11-15T14:03:09+00:00,5.99,USD,33333333-3333-4333-8333-333333333333,Granted,Denied`,
        ""
      ]);
    }
  });

  it("asks only for this deployment's billing mode and a bounded window", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-20T00:00:00.000Z") });
    try {
      await call(basic("mathnexa-ads-feed", PASSWORD));
      expect(rpc).toHaveBeenLastCalledWith("list_reportable_ads_conversions", { p_since: "2026-10-21T00:00:00.000Z", p_stripe_environment: "live" });
      await call(basic("mathnexa-ads-feed", PASSWORD), "?days=7&layout=legacy");
      expect(rpc).toHaveBeenLastCalledWith("list_reportable_ads_conversions", { p_since: "2026-11-13T00:00:00.000Z", p_stripe_environment: "live" });
      for (const query of ["?days=0", "?days=91", "?days=abc", "?days=-5", "?days=1.5"]) {
        await call(basic("mathnexa-ads-feed", PASSWORD), query);
        expect(rpc, query).toHaveBeenLastCalledWith("list_reportable_ads_conversions", { p_since: "2026-10-21T00:00:00.000Z", p_stripe_environment: "live" });
      }
      stripeMode = null;
      await call(basic("mathnexa-ads-feed", PASSWORD));
      expect(rpc).toHaveBeenLastCalledWith("list_reportable_ads_conversions", { p_since: "2026-10-21T00:00:00.000Z", p_stripe_environment: null });
    } finally {
      vi.useRealTimers();
    }
  });

  it("fails closed when the database is unavailable", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    const response = await call(basic("mathnexa-ads-feed", PASSWORD));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ state: "database-unavailable" });
  });
});
