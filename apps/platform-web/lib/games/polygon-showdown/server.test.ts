import { describe, expect, it, vi } from "vitest";

import { applySwap, createRefillStream, decodeBoard, findLegalMove, stateHash, type GameState, type Move } from "@/public/internal-games/polygon-showdown/src/engine/game.js";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/service", () => ({ createServiceSupabaseClient: () => null }));

const server = await import("./server");

const SEED = "0123456789abcdef0123456789abcdef";

function play(count: number, spacing = 1500): { moves: Move[]; states: GameState[] } {
  const stream = createRefillStream(SEED);
  let state = server.openingState(SEED);
  const moves: Move[] = [];
  const states = [state];
  for (let index = 0; index < count; index += 1) {
    const choice = findLegalMove(decodeBoard(state.board), 8, 8)!;
    const result = applySwap(state, choice[0], choice[1], stream.at);
    if (!result.ok) throw new Error(result.reason);
    state = result.state;
    states.push(state);
    moves.push([choice[0], choice[1], index * spacing]);
  }
  return { moves, states };
}

describe("identifiers", () => {
  it("separates host and player tokens, and from other games", () => {
    expect(server.hashToken("host", "t")).not.toBe(server.hashToken("player", "t"));
    expect(server.hashToken("player", "t")).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the owner's id out of the room", () => {
    const hash = server.ownerHash("secret", { kind: "consumer", id: "user-1" });
    expect(hash).not.toContain("user-1");
    expect(hash).not.toBe(server.ownerHash("other", { kind: "consumer", id: "user-1" }));
    expect(hash).not.toBe(server.ownerHash("secret", { kind: "school-access", id: "user-1" }));
  });

  it("makes 128-bit seeds", () => {
    expect(server.newSeed()).toMatch(/^[0-9a-f]{32}$/);
    expect(server.newSeed()).not.toBe(server.newSeed());
  });
});

describe("the draft can only be seen on a local review", () => {
  const base = { MVH_POLYGON_SHOWDOWN_PREVIEW: "local-owner-review", MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3102" };

  it("needs the flag and a loopback origin", () => {
    expect(server.isLocalOwnerPreview(base)).toBe(true);
    expect(server.isLocalOwnerPreview({ MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3102" })).toBe(false);
    expect(server.isLocalOwnerPreview({ ...base, MVH_POLYGON_SHOWDOWN_PREVIEW: "staging-owner-review" })).toBe(false);
    expect(server.isLocalOwnerPreview({ ...base, MVH_APPLICATION_ORIGIN: "https://mathnexa.com" })).toBe(false);
  });

  it("is off on any Vercel deployment whatever the variables say", () => {
    expect(server.isLocalOwnerPreview({ ...base, VERCEL: "1" })).toBe(false);
    expect(server.isLocalOwnerPreview({ ...base, VERCEL_ENV: "preview" })).toBe(false);
    expect(server.isLocalOwnerPreview({ ...base, VERCEL_URL: "x.vercel.app" })).toBe(false);
  });
});

describe("parsing a batch", () => {
  it("accepts well-formed swaps", () => {
    expect(server.parseMoves([[0, 1, 5]])).toEqual([[0, 1, 5]]);
    expect(server.parseMoves([])).toEqual([]);
  });

  it("refuses anything else", () => {
    for (const bad of [null, "x", [[0, 1]], [[0, 1, "5"]], [[0, 64, 5]], [[-1, 1, 5]], [[0, 1, -5]], [[0.5, 1, 5]], Array.from({ length: 41 }, () => [0, 1, 5])]) {
      expect(server.parseMoves(bad), JSON.stringify(bad)).toBeNull();
    }
  });
});

describe("replaying a batch", () => {
  const limits = { nextT: 0, nowT: 20_000 };

  it("applies new swaps", () => {
    const { moves, states } = play(5);
    const outcome = server.replayBatch(states[0], SEED, 0, moves, limits, stateHash(states[5]));
    expect(outcome.kind).toBe("replayed");
    if (outcome.kind !== "replayed") return;
    expect(outcome.accepted).toBe(5);
    expect(outcome.state).toEqual(states[5]);
    expect(outcome.mismatch).toBe(false);
  });

  it("a retried batch counts nothing twice", () => {
    const { moves, states } = play(5);
    const outcome = server.replayBatch(states[5], SEED, 0, moves, limits, null);
    expect(outcome.kind).toBe("replayed");
    if (outcome.kind !== "replayed") return;
    expect(outcome.accepted).toBe(0);
    expect(outcome.state.coins).toBe(states[5].coins);
    expect(outcome.state.moves).toBe(5);
  });

  it("a batch overlapping what was saved applies only the new part", () => {
    const { moves, states } = play(6);
    const outcome = server.replayBatch(states[3], SEED, 0, moves, { nextT: moves[2][2] + 400, nowT: 20_000 }, null);
    expect(outcome.kind).toBe("replayed");
    if (outcome.kind !== "replayed") return;
    expect(outcome.accepted).toBe(3);
    expect(outcome.state).toEqual(states[6]);
  });

  it("a browser ahead of the server is told to catch up", () => {
    const { moves, states } = play(3);
    expect(server.replayBatch(states[0], SEED, 2, moves, limits, null).kind).toBe("gap");
  });

  it("notices a browser that worked out something different", () => {
    const { moves, states } = play(3);
    const outcome = server.replayBatch(states[0], SEED, 0, moves, limits, 12345);
    expect(outcome.kind).toBe("replayed");
    if (outcome.kind === "replayed") expect(outcome.mismatch).toBe(true);
  });
});

describe("what a browser is sent", () => {
  const state = server.openingState(SEED);
  const standings = Array.from({ length: 12 }, (_, index) => ({ id: `p${index}`, name: `P${index}`, emoji: null, coins: 100 - index, score: 1000 - index, combo: 1, clear: 3, moves: 5, creator: index === 0, rank: index + 1 }));
  const record = {
    result: "ok",
    id: "room-id",
    code: "482391",
    phase: "ACTIVE",
    durationSeconds: 300,
    locked: false,
    version: 4,
    seed: SEED,
    startState: state,
    nowMs: 2000,
    startsAtMs: 1000,
    endsAtMs: 301000,
    finalized: false,
    standings,
    me: { id: "p9", name: "P9", emoji: null, isCreator: false, signedIn: false, state, version: 3, nextT: 0, reward: null }
  };

  it("never contains the seed", () => {
    const payload = JSON.stringify(server.toRoomPayload(record));
    expect(payload).not.toContain(SEED);
    expect(payload).not.toContain("startState");
    expect(payload).not.toContain('"seed"');
  });

  it("a run payload never contains the seed either", () => {
    const payload = JSON.stringify(server.toRunPayload({ id: "r", seed: SEED, state, version: 1, epoch: 1, nextT: 0, nowMs: 5, sessionStartMs: 1, balance: 0 }));
    expect(payload).not.toContain(SEED);
    expect(payload).not.toContain('"seed"');
  });

  it("during play sends only the leaders plus this player", () => {
    const view = server.toRoomPayload(record).standings as { total: number; rows: Array<{ id: string }>; me: { id: string } | null };
    expect(view.total).toBe(12);
    expect(view.rows.map((row) => row.id)).toEqual(["p0", "p1", "p2", "p3", "p4"]);
    expect(view.me?.id).toBe("p9");
  });

  it("does not repeat a player already among the leaders", () => {
    const view = server.toRoomPayload({ ...record, me: { ...record.me, id: "p1" } }).standings as { me: unknown };
    expect(view.me).toBeNull();
  });

  it("the final standings include everyone", () => {
    const view = server.toRoomPayload({ ...record, phase: "COMPLETE" }).standings as { rows: unknown[] };
    expect(view.rows).toHaveLength(12);
  });

  it("marks a shared place", () => {
    const tied = [{ ...standings[0], rank: 1 }, { ...standings[1], rank: 1 }];
    const view = server.standingsView(tied, "COMPLETE", null) as { rows: Array<{ tied: boolean }> };
    expect(view.rows.every((row) => row.tied)).toBe(true);
  });

  it("gives the browser the next shapes but not the seed", () => {
    const seat = server.toSeatPayload(record.me, SEED, 1000, 2000) as { windows: string[]; nowT: number };
    expect(seat.windows).toHaveLength(8);
    expect(seat.windows.every((text) => /^[0-3]{40}$/.test(text))).toBe(true);
    expect(seat.nowT).toBe(1000);
  });
});

describe("achievements earned by a commit", () => {
  const before = server.openingState(SEED);

  it("counts what this batch added", () => {
    const after = { ...before, matches: 1 };
    expect(server.newlyEarnedAchievements({ matches: 0, bestCombo: 0, largestClear: 0, lifetimeCoins: 0, achievements: {} }, before, after)).toEqual(["first-match"]);
  });

  it("never repeats one already held", () => {
    const after = { ...before, matches: 1 };
    expect(server.newlyEarnedAchievements({ matches: 5, achievements: { "first-match": "x" } }, before, after)).toEqual([]);
  });
});
