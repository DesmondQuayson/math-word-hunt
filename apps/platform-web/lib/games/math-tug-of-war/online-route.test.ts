// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGameAccessView: vi.fn(),
  createServiceSupabaseClient: vi.fn(),
  rpc: vi.fn()
}));

vi.mock("@/lib/game-access/server", () => ({ getGameAccessView: mocks.getGameAccessView }));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: mocks.createServiceSupabaseClient }));

import { POST, GET } from "@/app/api/games/math-tug-of-war/online/route";
import { hashPlayerToken, questionFor, type TugRoomRecord } from "./online";

const ALLOWED = { allowed: true, capabilities: ["mathnexa_all_access"], reason: "active", nextAction: null };

function access(allowed = true) {
  return {
    context: { status: allowed ? "active" : "anonymous" },
    decision: allowed
      ? { ...ALLOWED, capabilityKeys: ["mathnexa-all-access"] }
      : { allowed: false, reason: "authentication-required", nextAction: "sign-in" },
    source: allowed ? "server-authoritative" : "default-deny",
    principal: allowed ? { kind: "consumer", id: "user-1" } : null
  };
}

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://mathnexa.test/api/games/math-tug-of-war/online", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-mathnexa-game": "math-tug-of-war",
      "sec-fetch-site": "same-origin",
      origin: "https://mathnexa.test",
      host: "mathnexa.test",
      ...headers
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

const TOKEN = "A".repeat(43);

function room(overrides: Partial<TugRoomRecord> = {}): TugRoomRecord {
  return {
    result: "ok", code: "AB7K2", skill: "multiplication", status: "playing", round: 1, position: 0, winner: null, version: 3,
    team: "turquoise", names: { turquoise: "Ava", pink: "Bo" }, pulls: { turquoise: 0, pink: 0 }, questionIndex: 2,
    presence: { turquoise: "connected", pink: "connected" }, rematch: { turquoise: false, pink: false }, closedBy: null,
    expiresAt: "2026-09-27T12:00:00Z", seed: "0123456789abcdef0123456789abcdef", ...overrides
  };
}

vi.mock("@math-vocabulary-hunt/platform-core", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, hasMathNexaModuleAccess: (decision: { allowed: boolean }) => decision.allowed };
});

beforeEach(() => {
  mocks.getGameAccessView.mockReset().mockResolvedValue(access());
  mocks.rpc.mockReset();
  mocks.createServiceSupabaseClient.mockReset().mockReturnValue({ rpc: mocks.rpc });
});

describe("POST /api/games/math-tug-of-war/online", () => {
  it("refuses cross-site, header-less and non-JSON requests before doing anything", async () => {
    expect((await POST(request({ action: "state" }, { "sec-fetch-site": "cross-site" }))).status).toBe(403);
    expect((await POST(request({ action: "state" }, { "x-mathnexa-game": "" }))).status).toBe(403);
    expect((await POST(request({ action: "state" }, { "sec-fetch-site": "", origin: "https://evil.test" }))).status).toBe(403);
    expect((await POST(request({ action: "state" }, { "content-type": "text/plain" }))).status).toBe(415);
    expect(mocks.getGameAccessView).not.toHaveBeenCalled();
    expect(GET().status).toBe(405);
  });

  it("requires the same Math Games access as the game itself", async () => {
    mocks.getGameAccessView.mockResolvedValue(access(false));
    const response = await POST(request({ action: "create", skill: "addition", name: "Ava" }));
    expect(response.status).toBe(401);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("reports Online Match unavailable when the server store is not configured", async () => {
    mocks.createServiceSupabaseClient.mockReturnValue(null);
    const response = await POST(request({ action: "create", skill: "addition", name: "Ava" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "online-unavailable" });
  });

  it("creates a room with a sanitised name and returns a one-time token, never the seed", async () => {
    mocks.rpc.mockImplementation(async (_fn: string, args: Record<string, unknown>) => ({ data: room({ result: "created", status: "waiting", code: String(args.p_code), questionIndex: 0 }), error: null }));
    const response = await POST(request({ action: "create", skill: "integers", name: "  <b>Ava</b>  " }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const payload = await response.json();
    const [fn, args] = mocks.rpc.mock.calls[0];
    expect(fn).toBe("tug_create_room");
    expect(args.p_host_name).toBe("bAva/b");
    expect(args.p_skill).toBe("integers");
    expect(args.p_seed).toMatch(/^[0-9a-f]{32}$/);
    expect(args.p_host_token_hash).toBe(hashPlayerToken(payload.token));
    expect(JSON.stringify(payload)).not.toContain(String(args.p_seed));
    expect(payload.state.question).toBeNull();
  });

  it("rejects unknown skills and malformed codes", async () => {
    expect((await POST(request({ action: "create", skill: "division" }))).status).toBe(400);
    expect((await POST(request({ action: "join", code: "AB1", name: "Bo" }))).status).toBe(400);
    expect((await POST(request({ action: "state", code: "AB7K2", token: "nope" }))).status).toBe(404);
    expect((await POST(request("{not json"))).status).toBe(400);
    expect((await POST(request({ action: "state", code: "AB7K2", token: TOKEN, pad: "x".repeat(4_000) }))).status).toBe(413);
  });

  it.each([["not-found", 404], ["expired", 410], ["full", 409], ["rate-limited", 429]])("maps a %s join to HTTP %d", async (result, status) => {
    mocks.rpc.mockResolvedValue({ data: { result }, error: null });
    const response = await POST(request({ action: "join", code: "AB7K2", name: "Bo" }));
    expect(response.status).toBe(status);
  });

  it("decides correctness on the server and ignores anything the browser claims", async () => {
    const current = room();
    const answer = questionFor(current).answer;
    mocks.rpc.mockImplementation(async (fn: string, args: Record<string, unknown>) => {
      if (fn === "tug_room_state") return { data: current, error: null };
      return { data: room({ result: args.p_correct ? "correct" : "incorrect", questionIndex: 3, position: args.p_correct ? -1 : 0 }), error: null };
    });
    const wrong = await POST(request({ action: "answer", code: "AB7K2", token: TOKEN, round: 1, questionIndex: 2, answer: String(answer + 1), correct: true, position: -5 }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("tug_submit_answer", expect.objectContaining({ p_correct: false, p_question_index: 2, p_round: 1, p_token_hash: hashPlayerToken(TOKEN) }));
    expect((await wrong.json()).state.position).toBe(0);
    const right = await POST(request({ action: "answer", code: "AB7K2", token: TOKEN, round: 1, questionIndex: 2, answer: String(answer) }));
    expect(mocks.rpc).toHaveBeenLastCalledWith("tug_submit_answer", expect.objectContaining({ p_correct: true }));
    const payload = await right.json();
    expect(payload.solved).toBe(answer);
    expect(payload.state.position).toBe(-1);
  });

  it("never submits a stale or malformed answer", async () => {
    mocks.rpc.mockResolvedValue({ data: room(), error: null });
    const stale = await POST(request({ action: "answer", code: "AB7K2", token: TOKEN, round: 1, questionIndex: 1, answer: "5" }));
    expect((await stale.json()).state.result).toBe("stale");
    const malformed = await POST(request({ action: "answer", code: "AB7K2", token: TOKEN, round: 1, questionIndex: 2, answer: "--5" }));
    expect((await malformed.json()).state.result).toBe("invalid");
    expect(mocks.rpc.mock.calls.every(([fn]) => fn === "tug_room_state")).toBe(true);
  });
});
