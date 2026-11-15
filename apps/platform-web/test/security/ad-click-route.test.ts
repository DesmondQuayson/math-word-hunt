// @vitest-environment node
/**
 * The ad-click route keeps a Google Ads click identifier in an HttpOnly cookie
 * and sign-up stores it with the new account. Both are consent-gated and must
 * never be reachable cross-site, never store for a visitor who said no, and
 * never change what sign-up or Checkout does. These tests fail if any of that
 * loosens.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieOptions = { httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number };
const jar = new Map<string, string>();
const written: Array<{ name: string; value: string; options: CookieOptions }> = [];
const cookieStore = {
  get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  set: (name: string, value: string, options: CookieOptions) => {
    written.push({ name, value, options });
    if (options.maxAge === 0) jar.delete(name); else jar.set(name, value);
  }
};
let requestHeaders = new Headers();
const rpc = vi.fn();
const getUser = vi.fn();

vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => requestHeaders }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc }) }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ auth: { getUser } }) }));

import { DELETE, POST } from "@/app/api/ad-click/route";
import { rememberAdClickForAccount } from "@/lib/analytics/ad-attribution";
import { decodeAdClickCookie } from "@/lib/analytics/ad-click-cookie";

const GCLID = "Cj0KCQjw-TESTgclid_0123456789AbCdEf";
const USER_ID = "90000000-0000-4000-8000-000000000001";
const originalEnvironment = { ...process.env };
const post = (body: unknown, headers: Record<string, string> = {}) => POST(new Request("https://mathnexa.com/api/ad-click", {
  method: "POST",
  headers: { "content-type": "application/json", "sec-fetch-site": "same-origin", "x-vercel-ip-country": "US", ...headers },
  body: typeof body === "string" ? body : JSON.stringify(body)
}));

beforeEach(() => {
  jar.clear();
  written.length = 0;
  rpc.mockReset();
  rpc.mockResolvedValue({ data: "stored", error: null });
  getUser.mockReset();
  getUser.mockResolvedValue({ data: { user: null } });
  requestHeaders = new Headers({ "x-vercel-ip-country": "US" });
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.VERCEL = "1";
  process.env.APP_BASE_URL = "https://mathnexa.com";
});
afterEach(() => { process.env = { ...originalEnvironment }; });

describe("ad-click capture", () => {
  it("keeps the click in an HttpOnly, Secure, SameSite=Lax cookie for 90 days", async () => {
    const response = await post({ gclid: GCLID });
    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(written).toHaveLength(1);
    expect(written[0]!.name).toBe("mathnexa-ad-click");
    expect(written[0]!.options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 90 * 24 * 60 * 60 });
    expect(decodeAdClickCookie(written[0]!.value)).toMatchObject({ gclid: GCLID, gbraid: null, wbraid: null });
  });

  it("stores nothing that is not a click identifier, even when it is sent", async () => {
    await post({ gclid: GCLID, email: "someone@example.com", name: "Someone", userId: USER_ID });
    const stored = Buffer.from(written[0]!.value, "base64url").toString("utf8");
    expect(Object.keys(JSON.parse(stored)).sort()).toEqual(["b", "g", "t", "w"]);
    expect(stored).not.toMatch(/someone|Someone|90000000/);
  });

  it("answers 204 and stores nothing for a missing, malformed or oversized body", async () => {
    for (const body of [{}, { gclid: "bad value" }, { gclid: 42 }, "not json", "null", JSON.stringify({ gclid: GCLID, pad: "x".repeat(3000) })]) {
      const response = await post(body);
      expect(response.status, String(body).slice(0, 30)).toBe(204);
    }
    expect(written).toHaveLength(0);
  });

  it("is refused cross-site, and when neither Sec-Fetch-Site nor a matching Origin is present", async () => {
    for (const headers of [{ "sec-fetch-site": "cross-site" }, { "sec-fetch-site": "same-site" }, { "sec-fetch-site": "none" }]) {
      expect((await post({ gclid: GCLID }, headers)).status, JSON.stringify(headers)).toBe(403);
    }
    const bare = (headers: Record<string, string>) => POST(new Request("https://mathnexa.com/api/ad-click", {
      method: "POST", headers: { "x-vercel-ip-country": "US", ...headers }, body: JSON.stringify({ gclid: GCLID })
    }));
    expect((await bare({})).status).toBe(403);
    expect((await bare({ origin: "https://evil.example", host: "mathnexa.com" })).status).toBe(403);
    expect((await bare({ origin: "https://mathnexa.com", host: "mathnexa.com" })).status).toBe(204);
    expect(written).toHaveLength(1);
  });

  it("stores nothing outside the United States, or without a country on a hosted deployment", async () => {
    for (const country of ["GB", "DE", "FR", "CA", "IN"]) await post({ gclid: GCLID }, { "x-vercel-ip-country": country });
    const noCountry = await POST(new Request("https://mathnexa.com/api/ad-click", {
      method: "POST", headers: { "sec-fetch-site": "same-origin" }, body: JSON.stringify({ gclid: GCLID })
    }));
    expect(noCountry.status).toBe(204);
    expect(written).toHaveLength(0);
  });

  it("stores nothing, and clears an earlier click, for Global Privacy Control or an opt-out", async () => {
    await post({ gclid: GCLID });
    expect(jar.has("mathnexa-ad-click")).toBe(true);
    await post({ gclid: GCLID }, { "sec-gpc": "1" });
    expect(jar.has("mathnexa-ad-click")).toBe(false);
    await post({ gclid: GCLID });
    jar.set("mathnexa-ad-choice", "opt-out");
    await post({ gclid: GCLID });
    expect(jar.has("mathnexa-ad-click")).toBe(false);
  });

  it("is concealed outside the production platform", async () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    expect((await post({ gclid: GCLID })).status).toBe(404);
    expect((await DELETE(new Request("https://mathnexa.com/api/ad-click", { method: "DELETE", headers: { "sec-fetch-site": "same-origin" } }))).status).toBe(404);
  });
});

describe("turning ad measurement off", () => {
  const remove = (headers: Record<string, string> = { "sec-fetch-site": "same-origin" }) =>
    DELETE(new Request("https://mathnexa.com/api/ad-click", { method: "DELETE", headers }));

  it("clears the browser's click and, when signed in, the account's", async () => {
    await post({ gclid: GCLID });
    getUser.mockResolvedValue({ data: { user: { id: USER_ID } } });
    expect((await remove()).status).toBe(204);
    expect(jar.has("mathnexa-ad-click")).toBe(false);
    expect(rpc).toHaveBeenCalledWith("erase_ad_click_attribution", { p_user_id: USER_ID });
  });

  it("touches no account when nobody is signed in, and is refused cross-site", async () => {
    expect((await remove()).status).toBe(204);
    expect(rpc).not.toHaveBeenCalled();
    expect((await remove({ "sec-fetch-site": "cross-site" })).status).toBe(403);
  });
});

describe("keeping the click with the account", () => {
  beforeEach(async () => { await post({ gclid: GCLID }); written.length = 0; });

  it("stores the click for the new account and clears the browser copy", async () => {
    await rememberAdClickForAccount(USER_ID, "sign-up");
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("store_ad_click_attribution", expect.objectContaining({
      p_user_id: USER_ID, p_gclid: GCLID, p_gbraid: null, p_wbraid: null, p_capture_point: "sign-up"
    }));
    expect(Object.keys(rpc.mock.calls[0]![1]).sort()).toEqual(["p_capture_point", "p_clicked_at", "p_gbraid", "p_gclid", "p_user_id", "p_wbraid"]);
    expect(jar.has("mathnexa-ad-click")).toBe(false);
  });

  it("keeps the browser copy when the database does not know the user (an address that already has an account)", async () => {
    rpc.mockResolvedValue({ data: "ineligible", error: null });
    await rememberAdClickForAccount(USER_ID, "sign-up");
    expect(jar.has("mathnexa-ad-click")).toBe(true);
  });

  it("stores nothing when consent is withdrawn before sign-up, and clears the browser copy", async () => {
    requestHeaders = new Headers({ "x-vercel-ip-country": "US", "sec-gpc": "1" });
    await rememberAdClickForAccount(USER_ID, "sign-up");
    expect(rpc).not.toHaveBeenCalled();
    expect(jar.has("mathnexa-ad-click")).toBe(false);
  });

  it("does nothing without a user or without a click", async () => {
    await rememberAdClickForAccount(null, "sign-up");
    await rememberAdClickForAccount(undefined, "checkout");
    jar.delete("mathnexa-ad-click");
    await rememberAdClickForAccount(USER_ID, "checkout");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("never throws into sign-up or Checkout, whatever fails", async () => {
    rpc.mockRejectedValue(new Error("database down"));
    await expect(rememberAdClickForAccount(USER_ID, "sign-up")).resolves.toBeUndefined();
    rpc.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(rememberAdClickForAccount(USER_ID, "checkout")).resolves.toBeUndefined();
    expect(jar.has("mathnexa-ad-click")).toBe(true);
  });
});
