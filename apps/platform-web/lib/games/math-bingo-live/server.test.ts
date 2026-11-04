import { describe, expect, it } from "vitest";

import { dealCard } from "@/public/internal-games/math-bingo-live/src/engine/board.js";
import { DEFAULT_SETTINGS } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";

import {
  answerRevealed,
  buildGame,
  dealFor,
  generateRoomCode,
  hashToken,
  isLocalOwnerPreview,
  isToken,
  newGameSeed,
  newToken,
  normalizeRoomCode,
  ownerHash,
  subjectHash,
  toHostState,
  toPlayerState
} from "./server";

const SEED = "0123456789abcdef0123456789abcdef";

function record(overrides: Record<string, unknown> = {}) {
  const game = buildGame(DEFAULT_SETTINGS, SEED);
  const board = dealCard({ pool: game.pool, seed: SEED, participantId: "me", freeSpace: true, fractions: false });
  return {
    result: "ok",
    code: "482391",
    status: "open",
    phase: "QUESTION_ACTIVE",
    pausedPhase: null,
    pausedRemainingMs: null,
    gameNumber: 1,
    settings: DEFAULT_SETTINGS,
    questionNumber: 2,
    deckLength: game.deck.length,
    questionStartedAt: 1_000,
    phaseStartedAt: 1_000,
    phaseDeadline: 16_000,
    winners: [{ id: "11111111-1111-4111-8111-111111111111", name: "Zion", placement: 1, line: "row-1", lineType: "row", mask: 31, cells: board.slice(0, 5) }],
    winnerCount: 1,
    events: [{ seq: 4, type: "bingo", name: "Zion", participant: "11111111-1111-4111-8111-111111111111", placement: 1, lineType: "row", cap: 3 }],
    eventSeq: 4,
    leaderboard: [
      { id: "11111111-1111-4111-8111-111111111111", name: "Zion", rank: 1, won: true, placement: 1, best: 5, type: "row", correct: 5 },
      { id: "22222222-2222-4222-8222-222222222222", name: "Ava", rank: 2, won: false, placement: null, best: 4, type: "column", correct: 4 }
    ],
    completedReason: null,
    joinLocked: false,
    version: 9,
    expiresAt: 99_000,
    serverNow: 5_000,
    playerCount: 2,
    called: game.deck.slice(0, 2),
    me: { id: "22222222-2222-4222-8222-222222222222", name: "Ava", status: "active", gameNumber: 1, board, marks: 1, freeUsed: false, markQuestion: 2, attemptQuestion: 2, attempts: 1, correct: 4, hasWon: false, placement: null, winLine: null, best: 4, bestType: "column", version: 3 },
    needsBoard: false,
    seed: SEED,
    pool: game.pool,
    players: [{ id: "22222222-2222-4222-8222-222222222222", name: "Ava", connected: true, hasWon: false, placement: null, best: 4, bestType: "column", correct: 4 }],
    ...overrides
  };
}

describe("room codes and tokens", () => {
  it("generates six-digit codes that never start with 0", () => {
    for (let index = 0; index < 2_000; index += 1) expect(generateRoomCode()).toMatch(/^[1-9]\d{5}$/);
    expect(normalizeRoomCode(" 482 391 ")).toBe("482391");
    expect(normalizeRoomCode("482-391")).toBe("482391");
    expect(normalizeRoomCode(482391)).toBe("482391");
    for (const bad of ["082391", "48239", "4823911", "ABCDEF", null, {}, "48 23 9a"]) expect(normalizeRoomCode(bad)).toBeNull();
  });

  it("tokens are 256-bit, stored only as domain-separated hashes", () => {
    const token = newToken();
    expect(isToken(token)).toBe(true);
    expect(isToken(`${token}x`)).toBe(false);
    expect(hashToken("player", token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("player", token)).not.toBe(hashToken("host", token));
    expect(newGameSeed()).toMatch(/^[0-9a-f]{32}$/);
    expect(ownerHash("s".repeat(32), { kind: "account", id: "u1" })).not.toBe(ownerHash("s".repeat(32), { kind: "account", id: "u2" }));
    expect(subjectHash("s".repeat(32), "203.0.113.7")).not.toContain("203.0.113.7");
  });
});

describe("local owner preview gate", () => {
  const base = { MVH_MATH_BINGO_LIVE_PREVIEW: "local-owner-review", MVH_APPLICATION_ORIGIN: "http://127.0.0.1:3100" };
  it("needs the exact flag and a loopback origin", () => {
    expect(isLocalOwnerPreview(base)).toBe(true);
    expect(isLocalOwnerPreview({ ...base, MVH_APPLICATION_ORIGIN: "http://localhost:3100" })).toBe(true);
    expect(isLocalOwnerPreview({ ...base, MVH_MATH_BINGO_LIVE_PREVIEW: "true" })).toBe(false);
    expect(isLocalOwnerPreview({ ...base, MVH_APPLICATION_ORIGIN: "https://mathnexa.com" })).toBe(false);
    expect(isLocalOwnerPreview({ ...base, MVH_APPLICATION_ORIGIN: "https://127.0.0.1:3100" })).toBe(false);
    expect(isLocalOwnerPreview({ MVH_MATH_BINGO_LIVE_PREVIEW: "local-owner-review" })).toBe(false);
  });
  it("is never on for a Vercel deployment, whatever the variables say", () => {
    expect(isLocalOwnerPreview({ ...base, VERCEL: "1" })).toBe(false);
    expect(isLocalOwnerPreview({ ...base, VERCEL_ENV: "preview" })).toBe(false);
    expect(isLocalOwnerPreview({ ...base, VERCEL_URL: "x.vercel.app" })).toBe(false);
  });
});

describe("browser payloads", () => {
  it("never carry the seed, the pool, the deck or the current answer before its reveal", () => {
    const raw = record();
    const player = JSON.stringify(toPlayerState(raw));
    const host = JSON.stringify(toHostState(raw));
    for (const text of [player, host]) {
      expect(text).not.toContain(SEED);
      expect(text).not.toContain("\"pool\"");
      expect(text).not.toContain("\"seed\"");
      expect(text).not.toContain("\"deck\"");
    }
    const state = toPlayerState(raw);
    expect(state.question?.number).toBe(2);
    expect(state.question?.reveal).toBeNull();
    expect(state.called[0].reveal).not.toBeNull();
    expect(state.called[1].reveal).toBeNull();
    expect(state.called).toHaveLength(2);
    // Future questions never leave the server: only 1..current are sent.
    expect(JSON.stringify(state)).not.toContain(buildGame(DEFAULT_SETTINGS, SEED).deck[2].t + "\"");
  });

  it("reveal the answer only once the room has revealed it", () => {
    for (const [phase, pausedPhase, revealed] of [
      ["QUESTION_ACTIVE", null, false], ["COUNTDOWN", null, false], ["PAUSED", "QUESTION_ACTIVE", false],
      ["ANSWER_REVEAL", null, true], ["LEADERBOARD_UPDATE", null, true], ["WINNER_REVEAL", null, true],
      ["GAME_COMPLETE", null, true], ["PAUSED", "ANSWER_REVEAL", true]
    ] as const) {
      expect(answerRevealed({ phase, pausedPhase }), `${phase}/${pausedPhase}`).toBe(revealed);
      expect(toPlayerState(record({ phase, pausedPhase })).question?.reveal !== null, phase).toBe(revealed);
    }
  });

  it("players see only their own card, the top of the leaderboard, and no other player ids", () => {
    const state = toPlayerState(record());
    const text = JSON.stringify(state);
    expect(text).not.toContain("11111111-1111-4111-8111-111111111111");
    expect(text).not.toContain("22222222-2222-4222-8222-222222222222");
    expect(state.me.board).toHaveLength(25);
    expect(state.me.rank).toBe(2);
    expect(state.me.markUsed).toBe(true);
    expect(state.me.attemptsLeft).toBe(1);
    expect(state.leaderboard.find(row => row.you)?.name).toBe("Ava");
    expect(state.events[0]).not.toHaveProperty("participant");
    expect(state.winners[0]).not.toHaveProperty("participant");
  });

  it("the host gets participant ids (to remove a player) but never tokens or the seed", () => {
    const state = toHostState(record());
    expect(state.players[0].id).toBe("22222222-2222-4222-8222-222222222222");
    expect(JSON.stringify(state)).not.toMatch(/token|seed/i);
  });

  it("drops unknown fields and malformed cells", () => {
    const state = toPlayerState(record({ me: { ...record().me, board: [{ n: "1", d: 1 }] }, extra: "<script>" }));
    expect(state.me.board).toBeNull();
    expect(JSON.stringify(state)).not.toContain("<script>");
  });

  it("deals the same card the engine deals", () => {
    const raw = record();
    expect(dealFor(raw, "me")).toEqual(raw.me.board);
  });
});
