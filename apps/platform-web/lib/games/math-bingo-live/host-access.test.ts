// @vitest-environment node

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The host API's sign-in check: read-only polls ("state") reuse a check made
 * in the last 15 s by the same session cookies; every command checks in full;
 * no session cookie, or a refused session, is always refused.
 */

const mocks = vi.hoisted(() => ({
  getGameAccessView: vi.fn(),
  canPlayGame: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.getGameAccessView }));
vi.mock("@/lib/access/server", () => ({ canPlayGame: mocks.canPlayGame }));
vi.mock("@/lib/auth/rate-limit", () => ({ resolveLimiterSecret: () => "test-secret" }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => ({ rpc: mocks.rpc }) }));

import { POST } from "@/app/api/games/math-bingo-live/host/route";

const HOST_TOKEN = "A".repeat(43);
let cookieCounter = 0;

function hostRequest(action: string, cookie: string | null, extra: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "x-mathnexa-game": "math-bingo-live",
    "sec-fetch-site": "same-origin"
  };
  if (cookie) headers.cookie = cookie;
  return new Request("https://mathnexa.test/api/games/math-bingo-live/host", {
    method: "POST", headers, body: JSON.stringify({ action, hostToken: HOST_TOKEN, ...extra })
  });
}

function freshCookie() {
  cookieCounter += 1;
  return `sb-test-auth-token=session-${cookieCounter}; theme=dark`;
}

describe("Math Bingo Live host sign-in check", () => {
  beforeEach(() => {
    mocks.getGameAccessView.mockReset().mockResolvedValue({ principal: { kind: "consumer", id: "user-1" } });
    mocks.canPlayGame.mockReset().mockReturnValue(true);
    mocks.rpc.mockReset().mockResolvedValue({ data: { result: "unchanged", version: 3, progress: 7, serverNow: 1, players: [] }, error: null });
  });
  afterEach(() => vi.useRealTimers());

  it("a second read-only poll from the same session reuses the check", async () => {
    const cookie = freshCookie();
    expect((await POST(hostRequest("state", cookie))).status).toBe(200);
    expect((await POST(hostRequest("state", cookie))).status).toBe(200);
    expect(mocks.getGameAccessView).toHaveBeenCalledTimes(1);
    const reply = await (await POST(hostRequest("state", cookie))).json();
    expect(reply).toMatchObject({ result: "unchanged", version: 3, progress: 7 });
  });

  it("every command checks the session in full", async () => {
    const cookie = freshCookie();
    await POST(hostRequest("state", cookie));
    mocks.rpc.mockResolvedValue({ data: { result: "stale" }, error: null });
    await POST(hostRequest("pause", cookie));
    await POST(hostRequest("next", cookie, { phase: "QUESTION_ACTIVE", question: 1 }));
    expect(mocks.getGameAccessView).toHaveBeenCalledTimes(3);
  });

  it("another session never shares the check", async () => {
    await POST(hostRequest("state", freshCookie()));
    await POST(hostRequest("state", freshCookie()));
    expect(mocks.getGameAccessView).toHaveBeenCalledTimes(2);
  });

  it("without a session cookie the host is refused before any check", async () => {
    const response = await POST(hostRequest("state", "theme=dark"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "host-sign-in-required" });
    expect(mocks.getGameAccessView).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("a refused session is refused, and is not remembered as allowed", async () => {
    const cookie = freshCookie();
    await POST(hostRequest("state", cookie));
    mocks.canPlayGame.mockReturnValue(false);
    expect((await POST(hostRequest("pause", cookie))).status).toBe(401);
    expect((await POST(hostRequest("state", cookie))).status).toBe(401);
    expect(mocks.getGameAccessView).toHaveBeenCalledTimes(3);
  });

  it("the reuse window is 15 seconds", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
    const cookie = freshCookie();
    await POST(hostRequest("state", cookie));
    vi.setSystemTime(new Date("2026-11-06T10:00:14Z"));
    await POST(hostRequest("state", cookie));
    expect(mocks.getGameAccessView).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date("2026-11-06T10:00:16Z"));
    await POST(hostRequest("state", cookie));
    expect(mocks.getGameAccessView).toHaveBeenCalledTimes(2);
  });

  it("replies carry Server-Timing durations only", async () => {
    const response = await POST(hostRequest("state", freshCookie()));
    expect(response.headers.get("server-timing")).toMatch(/^db;dur=[0-9.]+;desc="1", access;dur=[0-9.]+, app;dur=[0-9.]+$/);
  });
});
