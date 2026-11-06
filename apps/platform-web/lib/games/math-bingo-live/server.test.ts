import { describe, expect, it } from "vitest";

import { dealCard } from "@/public/internal-games/math-bingo-live/src/engine/board.js";
import { DEFAULT_SETTINGS } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";

import {
  answerRevealed,
  buildGame,
  dealBoards,
  dealFor,
  generateRoomCode,
  hashToken,
  isLocalOwnerPreview,
  isStagingOwnerPreview,
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
    winners: [{ id: "11111111-1111-4111-8111-111111111111", name: "Zion", placement: 1, line: "row-1", lineType: "row", mask: 31, cells: board.slice(0, 5), question: 2 }],
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

describe("staging owner preview gate", () => {
  const staging = "https://gcmuhzxkwvfireyrearl.supabase.co";
  const preview = {
    MVH_MATH_BINGO_LIVE_PREVIEW: "staging-owner-review",
    SUPABASE_URL: staging,
    NEXT_PUBLIC_SUPABASE_URL: staging,
    MVH_APPLICATION_ORIGIN: "https://mathnexa-platform-staging.vercel.app",
    MVH_APP_ENVIRONMENT: "production-platform",
    VERCEL: "1",
    VERCEL_ENV: "preview"
  };
  const gatedAlias = { ...preview, VERCEL_ENV: "production", MVH_STAGING_ACCESS_TOKEN: "a".repeat(43) };
  it("serves the draft on a staging Preview or the gated staging alias", () => {
    expect(isStagingOwnerPreview(preview)).toBe(true);
    expect(isStagingOwnerPreview(gatedAlias)).toBe(true);
  });
  it("needs the exact staging flag, set per deployment", () => {
    expect(isStagingOwnerPreview({ ...preview, MVH_MATH_BINGO_LIVE_PREVIEW: undefined })).toBe(false);
    expect(isStagingOwnerPreview({ ...preview, MVH_MATH_BINGO_LIVE_PREVIEW: "local-owner-review" })).toBe(false);
    expect(isStagingOwnerPreview({ ...preview, MVH_MATH_BINGO_LIVE_PREVIEW: "true" })).toBe(false);
  });
  it("is never on with production data, the production origin, or an open non-preview deployment", () => {
    const production = "https://abcdefghijklmnopqrst.supabase.co";
    expect(isStagingOwnerPreview({ ...preview, SUPABASE_URL: production })).toBe(false);
    expect(isStagingOwnerPreview({ ...preview, NEXT_PUBLIC_SUPABASE_URL: production })).toBe(false);
    expect(isStagingOwnerPreview({ ...preview, SUPABASE_URL: "https://gcmuhzxkwvfireyrearl.supabase.co.evil.example" })).toBe(false);
    expect(isStagingOwnerPreview({ ...preview, MVH_APPLICATION_ORIGIN: "https://mathnexa.com" })).toBe(false);
    expect(isStagingOwnerPreview({ ...preview, MVH_APPLICATION_ORIGIN: "https://www.mathnexa.com" })).toBe(false);
    expect(isStagingOwnerPreview({ ...preview, MVH_APPLICATION_ORIGIN: undefined })).toBe(false);
    // A production-target deployment with no staging gate (production carries no staging token).
    expect(isStagingOwnerPreview({ ...preview, VERCEL_ENV: "production" })).toBe(false);
    // The staging alias opened deliberately (MVH_STAGING_ACCESS_REQUIRED=false) is not gated any more.
    expect(isStagingOwnerPreview({ ...gatedAlias, MVH_STAGING_ACCESS_REQUIRED: "false" })).toBe(false);
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

  it("a Bingo's winning cells (which include the open question's answer) are sent only after that question is revealed", () => {
    for (const toState of [toPlayerState, toHostState]) {
      expect(toState(record()).winners[0].cells).toHaveLength(0);
      expect(toState(record()).winners[0].mask).toBe(0);
      expect(toState(record({ phase: "ANSWER_REVEAL" })).winners[0].cells).toHaveLength(5);
      expect(toState(record({ questionNumber: 3, called: buildGame(DEFAULT_SETTINGS, SEED).deck.slice(0, 3) })).winners[0].cells).toHaveLength(5);
    }
  });

  it("Start deals every player exactly the card they would be dealt on their first poll", () => {
    const game = buildGame(DEFAULT_SETTINGS, SEED);
    const ids = ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"];
    const boards = dealBoards(DEFAULT_SETTINGS, game.pool, SEED, [...ids, "not-a-uuid", 7, null, ids[0]]);
    expect(Object.keys(boards)).toEqual(ids);
    for (const id of ids) {
      expect(boards[id]).toEqual(dealFor({ settings: DEFAULT_SETTINGS, seed: SEED, pool: game.pool }, id));
    }
    expect(boards[ids[0]]).not.toEqual(boards[ids[1]]);
    expect(dealBoards(DEFAULT_SETTINGS, game.pool, SEED, [])).toEqual({});
  });

  it("the host payload carries the progress number for its unchanged check; players never see it", () => {
    expect(toHostState(record({ progress: 57 })).progress).toBe(57);
    expect(toHostState(record({ progress: "57" })).progress).toBe(0);
    expect(toHostState(record()).progress).toBe(0);
    expect("progress" in toPlayerState(record({ progress: 57 }))).toBe(false);
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

  it("stores every question with its canonical identity, never twice in a game", () => {
    for (const mode of ["addition", "subtraction", "multiplication", "division", "mixed", "fractions"] as const) {
      const level = { addition: "facts-20", subtraction: "facts-20", multiplication: "x0-10", division: "facts-10", mixed: "core", fractions: "to-sixths" }[mode];
      const game = buildGame({ ...DEFAULT_SETTINGS, mode, level }, SEED);
      const ids = game.deck.map((question) => question.q);
      expect(ids.every((id) => /^(addition|subtraction|multiplication|division|fraction):\d+:\d+$/.test(id))).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
    }
    // The identity reaches the screens with the Called list (the answer still does not).
    const state = toPlayerState(record());
    expect(state.called[0].id).toMatch(/^addition:\d+:\d+$/);
    expect(state.question?.reveal).toBeNull();
  });

  it("passes an emoji only if it is one of the curated choices", () => {
    const withEmoji = record({
      leaderboard: [{ ...record().leaderboard[0], emoji: "\u{1F680}" }, { ...record().leaderboard[1], emoji: "<img src=x>" }],
      winners: [{ ...record().winners[0], emoji: "\u{1F680}" }],
      events: [{ ...record().events[0], emoji: "javascript:alert(1)" }],
      players: [{ id: "22222222-2222-4222-8222-222222222222", name: "Ava", emoji: "\u{1F981}", connected: true }],
      me: { ...record().me, emoji: "\u{1F981}" }
    });
    const player = toPlayerState(withEmoji);
    expect(player.me.emoji).toBe("\u{1F981}");
    expect(player.leaderboard[0].emoji).toBe("\u{1F680}");
    expect(player.leaderboard[1].emoji).toBeNull();
    expect(player.winners[0].emoji).toBe("\u{1F680}");
    expect(player.events[0].emoji).toBeNull();
    expect(toHostState(withEmoji).players[0].emoji).toBe("\u{1F981}");
    expect(JSON.stringify(player)).not.toMatch(/img src|javascript:/);
  });

  it("gives the page the raw facts behind markUsed / attemptsLeft", () => {
    const state = toPlayerState(record());
    expect(state.me).toMatchObject({ markQuestion: 2, attemptQuestion: 2, attempts: 1, markUsed: true, attemptsLeft: 1 });
  });
});
