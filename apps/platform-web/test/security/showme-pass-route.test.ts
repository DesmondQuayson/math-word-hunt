// @vitest-environment node
/**
 * /map-prep/pass gives a browser the pass that opens ShowMe Math. It must give
 * one only after the access check MathNexa already makes (an account with a
 * trial or a subscription, or a school access code), must never send the pass
 * or the visitor anywhere but the two ShowMe sites, and must put nothing about
 * a person in the pass. Signing out and ending authorized access take it away.
 * These tests fail if any of that loosens.
 */
import { decideMathNexaAccess, MATHNEXA_ALL_ACCESS } from "@math-vocabulary-hunt/platform-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type CookieOptions = { httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string; maxAge?: number; domain?: string };
const jar = new Map<string, string>();
const written: Array<{ name: string; value: string; options: CookieOptions }> = [];
const cookieStore = {
  get: (name: string) => jar.has(name) ? { name, value: jar.get(name)! } : undefined,
  set: (name: string, value: string, options: CookieOptions) => {
    written.push({ name, value, options });
    if (options.maxAge === 0) jar.delete(name); else jar.set(name, value);
  },
  delete: (name: string) => { jar.delete(name); }
};
const mocks = vi.hoisted(() => ({
  getGameAccessView: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
  redirect: vi.fn((href: string) => {
    throw new Error(`NEXT_REDIRECT:${href}`);
  })
}));

vi.mock("next/headers", () => ({ cookies: async () => cookieStore, headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.getGameAccessView }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: async () => ({ auth: { signOut: mocks.signOut } }) }));

import { GET } from "@/app/map-prep/pass/route";
import { signOutAction } from "@/app/auth-actions";
import { exitSchoolAccessAction } from "@/app/school-access-actions";
import { decodeShowMeReturn, encodeShowMeReturn, verifyShowMePass } from "@/lib/showme-access/pass";

const SECRET = "showme-pass-route-test-secret-0123456789abcdef";
const now = new Date();
const later = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString();
const earlier = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
const trialEnd = new Date(Date.parse(earlier) + 24 * 60 * 60 * 1000).toISOString();
const originalEnvironment = { ...process.env };

function view(status: string, entitlement: unknown, options: { authenticated?: boolean; emailConfirmed?: boolean; source?: string; capability?: boolean } = {}) {
  const authenticated = options.authenticated ?? true;
  return {
    context: { status },
    source: options.source ?? (authenticated ? "server-authoritative" : "default-deny"),
    principal: null,
    decision: decideMathNexaAccess({
      authenticated,
      accountStatus: "active",
      emailConfirmed: options.emailConfirmed ?? authenticated,
      evidence: options.capability === false ? entitlement : { capabilityKey: MATHNEXA_ALL_ACCESS, entitlement },
      serverNow: now
    })
  };
}
const SUBSCRIBER = () => view("active", { state: "subscription-active", periodEndsAt: later });
const ANONYMOUS = () => view("anonymous", {}, { authenticated: false });

async function ask(query = "") {
  try {
    const response = await GET(new Request(`https://mathnexa.com/map-prep/pass${query}`));
    return { status: response.status, location: response.headers.get("location"), headers: response.headers, redirect: null as string | null };
  } catch (error) {
    return { status: 0, location: null, headers: new Headers(), redirect: (error as Error).message.replace("NEXT_REDIRECT:", "") };
  }
}
const passWritten = () => written.filter((entry) => entry.name === "mathnexa-showme-pass" && entry.options.maxAge !== 0);

beforeEach(() => {
  jar.clear();
  written.length = 0;
  vi.clearAllMocks();
  mocks.getGameAccessView.mockResolvedValue(SUBSCRIBER());
  process.env.MVH_APP_ENVIRONMENT = "production-platform";
  process.env.APP_BASE_URL = "https://mathnexa.com";
  process.env.MVH_SHOWME_ACCESS_SECRET = SECRET;
});
afterEach(() => { process.env = { ...originalEnvironment }; });

describe("who gets a ShowMe pass", () => {
  it("an account with access gets one and is sent to ShowMe", async () => {
    for (const [label, entitled] of [
      ["active trial", view("active", { state: "trial-active", trialRedeemedAt: earlier, startsAt: earlier, endsAt: trialEnd })],
      ["paid subscription", SUBSCRIBER()],
      ["renewal grace", view("active", { state: "subscription-grace-period", periodEndsAt: earlier, graceEndsAt: later })],
      ["scheduled cancellation", view("active", { state: "subscription-canceled-through-period-end", periodEndsAt: later })],
      ["school access code", view("anonymous", { state: "subscription-active", periodEndsAt: later }, { source: "school-access" })]
    ] as const) {
      written.length = 0;
      mocks.getGameAccessView.mockResolvedValue(entitled);
      const answer = await ask("?to=/grades/6");
      expect(answer.status, label).toBe(307);
      expect(answer.location, label).toBe("https://showme.mathnexa.com/grades/6");
      expect(passWritten(), label).toHaveLength(1);
      expect(verifyShowMePass(passWritten()[0]!.value, SECRET), label).toBe(true);
    }
    expect(mocks.redirect).not.toHaveBeenCalled();
  });

  it("a visitor who is not signed in is sent to the access page and gets no pass", async () => {
    mocks.getGameAccessView.mockResolvedValue(ANONYMOUS());
    const answer = await ask("?to=/grades/6");
    expect(answer.redirect).toBe("/access?next=/map-prep");
    expect(passWritten()).toEqual([]);
  });

  it("an unconfirmed account is sent to confirm its address and gets no pass", async () => {
    mocks.getGameAccessView.mockResolvedValue(view("unconfirmed", {}, { emailConfirmed: false }));
    expect((await ask("?to=/worksheets")).redirect).toBe("/confirmation-required?next=/map-prep");
    expect(passWritten()).toEqual([]);
  });

  it("a signed-in account without access is sent to subscribe and gets no pass", async () => {
    for (const entitlement of [
      { state: "no-entitlement", trialRedeemedAt: null },
      { state: "trial-expired", trialRedeemedAt: earlier, endedAt: earlier },
      { state: "subscription-past-due", periodEndsAt: null }
    ]) {
      mocks.getGameAccessView.mockResolvedValue(view("active", entitlement));
      expect((await ask("?to=/grades")).redirect).toBe("/subscription?next=/map-prep");
    }
    mocks.getGameAccessView.mockResolvedValue(view("active", { state: "subscription-active", periodEndsAt: later }, { capability: false }));
    expect((await ask()).redirect).toBe("/subscription?next=/map-prep");
    expect(passWritten()).toEqual([]);
  });
});

describe("the pass and its cookie", () => {
  it("is HttpOnly, Secure, SameSite=Lax, twelve hours, for mathnexa.com and its subdomains", async () => {
    await ask("?to=/");
    expect(passWritten()[0]!.options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 12 * 60 * 60, domain: "mathnexa.com" });
  });

  it("stays on the host that set it anywhere but the live site", async () => {
    process.env.APP_BASE_URL = "https://mathnexa-platform-staging.vercel.app";
    await ask("?to=/");
    expect(passWritten()[0]!.options.domain).toBeUndefined();
    expect(passWritten()[0]!.options.secure).toBe(true);
  });

  it("says nothing about the person it was given to", async () => {
    mocks.getGameAccessView.mockResolvedValue({ ...SUBSCRIBER(), principal: { kind: "consumer", id: "90000000-0000-4000-8000-000000000001" }, context: { status: "active", email: "someone@example.com" } });
    await ask("?to=/grades/6");
    const payload = JSON.parse(Buffer.from(passWritten()[0]!.value.split(".")[0]!, "base64url").toString("utf8"));
    expect(Object.keys(payload).sort()).toEqual(["exp", "iat", "v"]);
    expect(passWritten()[0]!.value).not.toMatch(/someone|90000000/);
  });

  it("answers no-store and noindex", async () => {
    const answer = await ask("?to=/grades");
    expect(answer.headers.get("cache-control")).toBe("no-store");
    expect(answer.headers.get("x-robots-tag")).toBe("noindex, nofollow");
  });
});

describe("where the visitor is sent", () => {
  it("to the page they asked for, with its query string", async () => {
    for (const path of ["/", "/grades", "/worksheets", "/assignment?a=AbC-123_x&x=1", "/teacher/groups/g-1"]) {
      expect((await ask(`?to=${encodeURIComponent(path)}`)).location).toBe(`https://showme.mathnexa.com${path}`);
    }
    expect((await ask()).location).toBe("https://showme.mathnexa.com/");
  });

  it("to the staging copy only when it is named", async () => {
    expect((await ask("?to=/grades&site=staging")).location).toBe("https://showme-staging.mathnexa.com/grades");
    for (const site of ["production", "Staging", "evil.example", "https://evil.example"]) {
      expect((await ask(`?to=/grades&site=${encodeURIComponent(site)}`)).location).toBe("https://showme.mathnexa.com/grades");
    }
  });

  it("never anywhere else, whatever the address says", async () => {
    for (const to of ["//evil.example", "https://evil.example", "/\\evil.example", "\\\\evil.example", "javascript:alert(1)", "/grades#x", "/grades\r\nSet-Cookie: a=b", "grades", "/%0d%0aLocation: https://evil.example"]) {
      const answer = await ask(`?to=${encodeURIComponent(to)}&next=https://evil.example&url=//evil.example`);
      expect(answer.status, to).toBe(307);
      expect(new URL(answer.location!).origin, to).toBe("https://showme.mathnexa.com");
      expect(answer.location, to).not.toMatch(/evil/);
    }
  });

  it("back to the page they first asked for after signing in or subscribing", async () => {
    mocks.getGameAccessView.mockResolvedValue(ANONYMOUS());
    await ask("?to=/assignment%3Fa%3DAbC-123");
    const remembered = written.find((entry) => entry.name === "mathnexa-showme-return")!;
    expect(remembered.options).toEqual({ httpOnly: true, secure: true, sameSite: "lax", path: "/map-prep", maxAge: 30 * 60 });
    expect(decodeShowMeReturn(remembered.value)).toEqual({ site: "production", path: "/assignment?a=AbC-123" });
    // They sign in; MathNexa's own entry sends them to the ShowMe home page, which sends them here.
    mocks.getGameAccessView.mockResolvedValue(SUBSCRIBER());
    written.length = 0;
    const answer = await ask("?to=/");
    expect(answer.location).toBe("https://showme.mathnexa.com/assignment?a=AbC-123");
    expect(written.find((entry) => entry.name === "mathnexa-showme-return")!.options.maxAge).toBe(0);
    expect(jar.has("mathnexa-showme-return")).toBe(false);
  });

  it("a remembered page never overrides the one asked for now, and a forged one is ignored", async () => {
    jar.set("mathnexa-showme-return", encodeShowMeReturn("production", "/grades/3"));
    expect((await ask("?to=/grades/8")).location).toBe("https://showme.mathnexa.com/grades/8");
    jar.set("mathnexa-showme-return", `p.${Buffer.from("//evil.example", "utf8").toString("base64url")}`);
    expect((await ask("?to=/")).location).toBe("https://showme.mathnexa.com/");
    jar.set("mathnexa-showme-return", "https://evil.example");
    expect((await ask()).location).toBe("https://showme.mathnexa.com/");
  });

  it("no page is remembered for the home page, and none for a visitor who already has access", async () => {
    mocks.getGameAccessView.mockResolvedValue(ANONYMOUS());
    await ask("?to=/");
    expect(written.filter((entry) => entry.name === "mathnexa-showme-return")).toEqual([]);
    mocks.getGameAccessView.mockResolvedValue(SUBSCRIBER());
    await ask("?to=/grades/6");
    expect(written.filter((entry) => entry.name === "mathnexa-showme-return")).toEqual([]);
  });
});

describe("when the pass route is closed", () => {
  it("does not exist outside the production platform", async () => {
    process.env.MVH_APP_ENVIRONMENT = "production-public";
    const answer = await ask("?to=/grades");
    expect(answer.status).toBe(404);
    expect(written).toEqual([]);
    expect(mocks.getGameAccessView).not.toHaveBeenCalled();
  });

  it("does not exist without the shared secret, however access stands", async () => {
    for (const value of [undefined, "", "too-short", "x".repeat(300)]) {
      if (value === undefined) delete process.env.MVH_SHOWME_ACCESS_SECRET; else process.env.MVH_SHOWME_ACCESS_SECRET = value;
      const answer = await ask("?to=/grades");
      expect(answer.status, String(value).slice(0, 12)).toBe(404);
    }
    expect(written).toEqual([]);
  });
});

describe("taking the pass away", () => {
  it("signing out clears it, for the same domain it was set for", async () => {
    jar.set("mathnexa-showme-pass", "a-pass");
    jar.set("mathnexa-showme-return", encodeShowMeReturn("production", "/grades"));
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/sign-in?signedOut=1");
    expect(mocks.signOut).toHaveBeenCalledTimes(1);
    expect(written.find((entry) => entry.name === "mathnexa-showme-pass")).toEqual({ name: "mathnexa-showme-pass", value: "", options: { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0, domain: "mathnexa.com" } });
    expect(jar.has("mathnexa-showme-pass")).toBe(false);
    expect(jar.has("mathnexa-showme-return")).toBe(false);
  });

  it("ending authorized access clears it", async () => {
    jar.set("mathnexa-showme-pass", "a-pass");
    await expect(exitSchoolAccessAction()).rejects.toThrow("NEXT_REDIRECT:/");
    expect(jar.has("mathnexa-showme-pass")).toBe(false);
  });

  it("signing out with no pass writes nothing for it", async () => {
    await expect(signOutAction()).rejects.toThrow("NEXT_REDIRECT:/sign-in?signedOut=1");
    expect(written.filter((entry) => entry.name.startsWith("mathnexa-showme"))).toEqual([]);
  });
});
