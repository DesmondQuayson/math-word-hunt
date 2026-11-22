import { describe, expect, it, vi } from "vitest";

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import { readEntry, rememberEntry, trackFunnelEvent, type StorageLike } from "./client";

function memoryStorage(initial: Record<string, string> = {}): StorageLike & { values: Record<string, string> } {
  const values = { ...initial };
  return { values, getItem: (key) => values[key] ?? null, setItem: (key, value) => { values[key] = value; } };
}

const at = (pathname: string, search = "", host = "mathnexa.com") => ({ pathname, search, host });

describe("visit entry", () => {
  it("remembers the first page and source class once per session, never the raw values", () => {
    const storage = memoryStorage();
    expect(rememberEntry(storage, at("/online-math-prep", "?gclid=Cj0KCQsecret&email=a@b.com"), "https://www.google.com/")).toEqual({ landing: "/online-math-prep", source: "google-ads" });
    expect(rememberEntry(storage, at("/pricing"), "https://www.facebook.com/")).toEqual({ landing: "/online-math-prep", source: "google-ads" });
    expect(Object.values(storage.values).join(" ")).not.toMatch(/Cj0KCQsecret|a@b\.com|google\.com/);
  });

  it("re-validates edited or broken storage", () => {
    expect(readEntry(memoryStorage({ "mathnexa.analytics.entry": JSON.stringify({ landing: "/x?token=1", source: "a@b.com" }) }))).toEqual({ landing: "other", source: "other" });
    expect(readEntry(memoryStorage({ "mathnexa.analytics.entry": "{not json" }))).toBeNull();
    expect(readEntry(null)).toBeNull();
  });

  it("survives storage that throws", () => {
    const broken: StorageLike = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
    expect(rememberEntry(broken, at("/"), "")).toEqual({ landing: "/", source: "direct" });
  });
});

describe("funnel event", () => {
  it("sends only the landing page and source class", () => {
    const send = vi.fn();
    trackFunnelEvent("sign_up_submitted", memoryStorage({ "mathnexa.analytics.entry": JSON.stringify({ landing: "/pricing", source: "tiktok" }) }), send);
    expect(send).toHaveBeenCalledWith("sign_up_submitted", { landing: "/pricing", source: "tiktok" });
    trackFunnelEvent("sign_up_submitted", null, send);
    expect(send).toHaveBeenLastCalledWith("sign_up_submitted", { landing: "other", source: "direct" });
  });

  it("never throws into the page", () => {
    expect(() => trackFunnelEvent("sign_up_submitted", null, () => { throw new Error("analytics down"); })).not.toThrow();
  });
});
