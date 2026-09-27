// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  ROOM_CODE_ALPHABET,
  checkSubmission,
  generateRoomCode,
  hashPlayerToken,
  isPlayerToken,
  newPlayerToken,
  newQuestionSeed,
  normalizeRoomCode,
  ownerHash,
  questionFor,
  sanitizeOnlineName,
  toClientState,
  type TugRoomRecord
} from "./online";
import { questionAt } from "@/public/internal-games/math-tug-of-war/src/questions.js";

function record(overrides: Partial<TugRoomRecord> = {}): TugRoomRecord {
  return {
    result: "ok",
    code: "AB7K2",
    skill: "integers",
    status: "playing",
    round: 1,
    position: -2,
    winner: null,
    version: 7,
    team: "pink",
    names: { turquoise: "Ava", pink: "Bo" },
    pulls: { turquoise: 3, pink: 1 },
    questionIndex: 4,
    presence: { turquoise: "connected", pink: "connected" },
    rematch: { turquoise: false, pink: false },
    closedBy: null,
    expiresAt: "2026-09-27T12:00:00Z",
    seed: "0123456789abcdef0123456789abcdef",
    ...overrides
  };
}

describe("Online Match server authority", () => {
  it("room codes are short, human-friendly and free of look-alike characters", () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[01ILO]/);
    const seen = new Set<string>();
    for (let index = 0; index < 2_000; index += 1) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(1_990);
    expect(normalizeRoomCode(" ab7k2 ")).toBe("AB7K2");
    expect(normalizeRoomCode("AB-7K2")).toBe("AB7K2");
    expect(normalizeRoomCode("AB0K2")).toBeNull();
    expect(normalizeRoomCode("AB7K")).toBeNull();
    expect(normalizeRoomCode("x')--")).toBeNull();
    expect(normalizeRoomCode(42)).toBeNull();
  });

  it("player tokens are 256-bit bearer secrets stored only as hashes", () => {
    const token = newPlayerToken();
    expect(isPlayerToken(token)).toBe(true);
    expect(isPlayerToken("short")).toBe(false);
    expect(hashPlayerToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashPlayerToken(token)).not.toContain(token);
    expect(newQuestionSeed()).toMatch(/^[0-9a-f]{32}$/);
    expect(ownerHash("secret-value-that-is-long-enough", { kind: "consumer", id: "u1" })).not.toBe(ownerHash("other-secret-value-long-enough", { kind: "consumer", id: "u1" }));
  });

  it("regenerates each player's question from the secret seed, round, team and index", () => {
    const room = record();
    const expected = questionAt("integers", `${room.seed}:1:pink`, 4);
    expect(questionFor(room).key).toBe(expected.key);
    expect(questionFor({ ...room, team: "turquoise" }).key).toBe(questionAt("integers", `${room.seed}:1:turquoise`, 4).key);
    expect(questionFor({ ...room, round: 2 }).key).toBe(questionAt("integers", `${room.seed}:2:pink`, 4).key);
  });

  it("judges answers on the server: right, wrong and malformed", () => {
    const room = record();
    const answer = questionFor(room).answer;
    const text = answer < 0 ? `-${-answer}` : String(answer);
    expect(checkSubmission(room, text)).toMatchObject({ valid: true, correct: true });
    expect(checkSubmission(room, String(answer + 1))).toMatchObject({ valid: true, correct: false });
    expect(checkSubmission(room, "--3")).toMatchObject({ valid: false, correct: false });
    expect(checkSubmission(room, 5 as unknown as string)).toMatchObject({ valid: false, correct: false });
  });

  it("the browser payload never carries the seed, answers or token hashes", () => {
    const state = toClientState(record());
    const serialized = JSON.stringify(state);
    expect(serialized).not.toContain("0123456789abcdef");
    expect(serialized).not.toMatch(/seed|answer|token|hash/i);
    expect(state.question).toMatchObject({ index: 4 });
    expect(Object.keys(state).sort()).toEqual([
      "closedBy", "code", "names", "position", "presence", "pulls", "question", "rematch", "result", "round", "skill", "status", "team", "version", "winner"
    ]);
    expect(toClientState(record({ status: "won", winner: "turquoise" })).question).toBeNull();
  });

  it("online names are trimmed, capped and defaulted", () => {
    expect(sanitizeOnlineName("  ", "turquoise")).toBe("Player 1");
    expect(sanitizeOnlineName(undefined, "pink")).toBe("Player 2");
    expect(sanitizeOnlineName("<b>Bo</b>", "pink")).toBe("bBo/b");
    expect(sanitizeOnlineName("x".repeat(80), "pink")).toHaveLength(20);
  });
});
