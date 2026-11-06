import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { reconcile } from "@/public/internal-games/math-bingo-live/src/api.js";
import { CENTER, LINES, dealCard, maxCopiesInLine } from "@/public/internal-games/math-bingo-live/src/engine/board.js";
import { EMOJI_CHOICES, emojiName, isAllowedEmoji, normalizeEmoji, withEmoji } from "@/public/internal-games/math-bingo-live/src/engine/emoji.js";
import { encodeQr, qrPath } from "@/public/internal-games/math-bingo-live/src/engine/qr.js";
import {
  answerClass,
  answerMatches,
  buildAnswerPool,
  buildDeck,
  dealRules,
  factsFor,
  poolCandidates,
  questionId,
  uniqueQuestionCount
} from "@/public/internal-games/math-bingo-live/src/engine/questions.js";
import { DECK_PASSES, DEFAULT_SETTINGS, MODES, normalizeSettings, type BingoSettings } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";
import { codeFromSearch, joinHostLabel, joinLink, joinOrigin } from "@/public/internal-games/math-bingo-live/src/join-link.js";

function settingsFor(mode: string, level: string, extra: Partial<BingoSettings> = {}): BingoSettings {
  const result = normalizeSettings({ ...DEFAULT_SETTINGS, mode, level, ...extra });
  if (!result.ok) throw new Error(result.error);
  return result.settings;
}

const LEVELS = MODES.flatMap(mode => mode.levels.map(level => ({ mode: mode.id, level: level.id })));
const SEEDS = Array.from({ length: 60 }, (_, index) => `unique-${index}`);

describe("question identity", () => {
  it("addition and multiplication ignore operand order; subtraction and division keep it", () => {
    expect(questionId("+", 7, 5)).toBe("addition:5:7");
    expect(questionId("+", 5, 7)).toBe("addition:5:7");
    expect(questionId("*", 8, 6)).toBe("multiplication:6:8");
    expect(questionId("*", 6, 8)).toBe(questionId("*", 8, 6));
    expect(questionId("-", 14, 6)).toBe("subtraction:14:6");
    expect(questionId("/", 36, 6)).toBe("division:36:6");
    expect(questionId("/", 36, 6)).not.toBe(questionId("/", 6, 36));
    expect(questionId("fraction", 2, 3)).toBe("fraction:2:3");
    expect(questionId("fraction", 2, 4)).not.toBe(questionId("fraction", 1, 2));
  });

  it("every fact carries its canonical identity", () => {
    for (const { mode, level } of LEVELS.filter(item => item.mode !== "fractions")) {
      for (const fact of factsFor(mode as Exclude<BingoSettings["mode"], "fractions">, level)) {
        expect(fact.id).toBe(questionId(fact.op, fact.operands[0], fact.operands[1]));
      }
    }
  });

  it("a value never gets more copies on a card than it has different questions", () => {
    for (const { mode, level } of LEVELS.filter(item => item.mode !== "fractions")) {
      const settings = settingsFor(mode, level);
      for (const candidate of poolCandidates(settings)) expect(candidate.maxCopies).toBeLessThanOrEqual(uniqueQuestionCount(settings, candidate.value));
    }
  });
});

describe("no question repeats in a game", { timeout: 120_000 }, () => {
  for (const { mode, level } of LEVELS) {
    it(`${mode} / ${level}: count(question ids) === count(unique question ids), every seed and setting`, () => {
      for (const freeSpace of [true, false]) {
        for (const equivalentFractions of mode === "fractions" ? [false, true] : [false]) {
          const settings = settingsFor(mode, level, { freeSpace, equivalentFractions });
          for (const seed of SEEDS) {
            const pool = buildAnswerPool(settings, seed);
            const deck = buildDeck(settings, pool, seed);
            const ids = deck.map(question => question.id);
            expect(new Set(ids).size).toBe(ids.length);
            expect(deck.length).toBeGreaterThan(0);
            expect(deck.length).toBeLessThanOrEqual(pool.length * DECK_PASSES);
            // Commutative operations: 5 + 7 and 7 + 5 never both appear.
            const orderless = deck.filter(question => question.op === "+" || question.op === "*")
              .map(question => `${question.op}:${[...question.operands].sort((a, b) => a - b).join(":")}`);
            expect(new Set(orderless).size).toBe(orderless.length);
            // Every call can be marked on a card, and every card value is called.
            for (const question of deck) expect(pool.some(value => answerMatches(settings, question.answer, value))).toBe(true);
            for (const value of pool) expect(deck.some(question => answerMatches(settings, question.answer, value))).toBe(true);
            if (mode === "fractions") {
              // Each written fraction once: as many questions as different fractions on the card.
              expect(deck.map(question => `${question.answer.n}/${question.answer.d}`).every(text => deck.filter(other => `${other.answer.n}/${other.answer.d}` === text).length === 1)).toBe(true);
              if (!equivalentFractions) expect(deck.length).toBe(new Set(pool.map(value => `${value.n}/${value.d}`)).size);
            } else {
              // Arithmetic: the first pass still calls every card value once (a winner is always reachable).
              const remaining = pool.map(value => ({ ...value }));
              for (const question of deck.slice(0, pool.length)) {
                const match = remaining.findIndex(value => answerMatches(settings, question.answer, value));
                expect(match).toBeGreaterThanOrEqual(0);
                remaining.splice(match, 1);
              }
              expect(remaining).toHaveLength(0);
            }
          }
        }
      }
    });
  }

  it("the same answer comes from different questions (7 + 5 and 8 + 4 are both 12)", () => {
    let shared = 0;
    for (const seed of SEEDS) {
      const settings = settingsFor("addition", "facts-20");
      const deck = buildDeck(settings, buildAnswerPool(settings, seed), seed);
      const byAnswer = new Map<number, Set<string>>();
      for (const question of deck) {
        if (!byAnswer.has(question.answer.n)) byAnswer.set(question.answer.n, new Set());
        byAnswer.get(question.answer.n)!.add(question.id);
      }
      for (const ids of byAnswer.values()) if (ids.size >= 2) shared += 1;
    }
    expect(shared).toBeGreaterThan(SEEDS.length);
  });

  it("a second 12 on a card is used by a later, different question for 12", () => {
    let proved = 0;
    for (const seed of SEEDS) {
      const settings = settingsFor("addition", "within-50");
      const pool = buildAnswerPool(settings, seed);
      const deck = buildDeck(settings, pool, seed);
      const card = dealCard({ pool, seed, participantId: "ava", ...dealRules(settings) });
      const counts = new Map<number, number>();
      for (const value of pool) counts.set(value.n, (counts.get(value.n) ?? 0) + 1);
      const repeated = [...counts.entries()].find(([, count]) => count >= 2)?.[0];
      if (repeated === undefined) continue;
      // One mark per question: the first call for the value marks one cell, a later different call the other.
      const calls = deck.filter(question => question.answer.n === repeated);
      expect(new Set(calls.map(question => question.id)).size).toBe(calls.length);
      expect(calls.length).toBeGreaterThanOrEqual(2);
      const cells = card.map((cell, index) => (!("free" in cell && cell.free) && (cell as { n: number }).n === repeated ? index : -1)).filter(index => index >= 0);
      let marks = 0;
      for (const call of calls) {
        const open = cells.find(index => ((marks >>> index) & 1) === 0 && answerMatches(settings, call.answer, card[index] as never));
        if (open !== undefined) marks |= 1 << open;
      }
      expect(cells.every(index => ((marks >>> index) & 1) === 1)).toBe(true);
      proved += 1;
    }
    expect(proved).toBeGreaterThan(30);
  });

  it("Play Again builds a new game: questions may come back in the NEW game", () => {
    const settings = settingsFor("multiplication", "x0-10");
    const first = buildDeck(settings, buildAnswerPool(settings, "game-1"), "game-1").map(question => question.id);
    const second = buildDeck(settings, buildAnswerPool(settings, "game-2"), "game-2").map(question => question.id);
    expect(first.filter(id => second.includes(id)).length).toBeGreaterThan(0);
  });
});

describe("Fraction Bingo cards", { timeout: 60_000 }, () => {
  it("never put more copies of a fraction in a line than can ever be called", () => {
    for (const level of ["to-fifths", "to-sixths", "to-eighths"]) {
      for (const equivalentFractions of [false, true]) {
        for (const freeSpace of [true, false]) {
          const settings = settingsFor("fractions", level, { equivalentFractions, freeSpace });
          const rules = dealRules(settings);
          for (const seed of SEEDS.slice(0, 20)) {
            const pool = buildAnswerPool(settings, seed);
            for (let player = 0; player < 12; player += 1) {
              const card = dealCard({ pool, seed, participantId: `p${player}`, ...rules });
              // Same multiset as the pool (the database check), Free Space in the centre.
              expect(card.filter(cell => !("free" in cell && cell.free)).map(cell => `${(cell as { n: number }).n}/${(cell as { d: number }).d}`).sort())
                .toEqual(pool.map(value => `${value.n}/${value.d}`).sort());
              if (freeSpace) expect(card[CENTER]).toEqual({ free: true });
              for (const line of LINES) {
                const seen = new Map<string, number>();
                for (const index of line.cells) {
                  const cell = card[index] as { n: number; d: number; free?: true };
                  if (cell.free) continue;
                  const key = answerClass(settings, cell);
                  seen.set(key, (seen.get(key) ?? 0) + 1);
                  expect(seen.get(key)!).toBeLessThanOrEqual(rules.lineLimit!(cell));
                }
              }
              if (!equivalentFractions) expect(maxCopiesInLine(card, rules.classOf!)).toBe(1);
              // Reload safety: the same player gets the same card.
              expect(dealCard({ pool, seed, participantId: `p${player}`, ...rules })).toEqual(card);
            }
          }
        }
      }
    }
  });
});

describe("player emoji", () => {
  it("is a curated list of distinct, named choices", () => {
    expect(EMOJI_CHOICES.length).toBeGreaterThanOrEqual(30);
    expect(EMOJI_CHOICES.length).toBeLessThanOrEqual(50);
    expect(new Set(EMOJI_CHOICES.map(choice => choice.emoji)).size).toBe(EMOJI_CHOICES.length);
    for (const choice of EMOJI_CHOICES) {
      expect(isAllowedEmoji(choice.emoji)).toBe(true);
      expect(emojiName(choice.emoji)).toBe(choice.name);
      expect(choice.emoji).not.toMatch(/[<>&"'`\s]/);
    }
  });

  it("is optional and refuses anything off the list", () => {
    for (const none of [null, undefined, ""]) expect(normalizeEmoji(none)).toEqual({ ok: true, emoji: null });
    expect(normalizeEmoji("\u{1F981}")).toEqual({ ok: true, emoji: "\u{1F981}" });
    for (const bad of ["<b>", "\u{1F981}\u{1F981}", "\u{1F981} ", "x", "\u{1F600}", 42, {}, ["\u{1F981}"], "<img src=x onerror=alert(1)>"]) {
      expect(normalizeEmoji(bad)).toEqual({ ok: false, error: "emoji-invalid" });
    }
    expect(withEmoji("Ava", "\u{1F981}")).toBe("\u{1F981} Ava");
    expect(withEmoji("Ava", null)).toBe("Ava");
    expect(withEmoji("Ava", "<b>")).toBe("Ava");
  });

  it("the database allowlist is exactly the same list", () => {
    const sql = readFileSync(resolve(__dirname, "../../../../../supabase/migrations/20261107100000_math_bingo_live_final_gameplay.sql"), "utf8");
    const match = /select p is null or p = any \(array\[([^\]]+)\]::text\[\]\)/.exec(sql);
    expect(match).not.toBeNull();
    const listed = [...match![1].matchAll(/'([^']+)'/g)].map(item => item[1]);
    expect(listed).toEqual(EMOJI_CHOICES.map(choice => choice.emoji));
  });
});

describe("join link (the QR code's destination)", () => {
  it("is always this screen's own environment; production is https://mathnexa.com", () => {
    expect(joinLink("537636", { host: "mathnexa.com", origin: "https://mathnexa.com" })).toBe("https://mathnexa.com/join?code=537636");
    expect(joinLink("537636", { host: "www.mathnexa.com", origin: "https://www.mathnexa.com" })).toBe("https://mathnexa.com/join?code=537636");
    const staging = "https://mathnexa-platform-staging-abc123def-bright-path-ed-tech.vercel.app";
    expect(joinLink("537636", { host: new URL(staging).host, origin: staging })).toBe(`${staging}/join?code=537636`);
    expect(joinLink("482391", { host: "127.0.0.1:3101", origin: "http://127.0.0.1:3101" })).toBe("http://127.0.0.1:3101/join?code=482391");
    // A hosted screen can never produce a loopback link: the link is its own origin.
    expect(joinLink("537636", { host: new URL(staging).host, origin: staging })).not.toMatch(/localhost|127\.0\.0\.1/);
    expect(joinOrigin({ host: "evil", origin: "javascript:alert(1)" })).toBeNull();
    expect(joinLink("012345", { host: "mathnexa.com", origin: "https://mathnexa.com" })).toBeNull();
    expect(joinLink("53763", { host: "mathnexa.com", origin: "https://mathnexa.com" })).toBeNull();
    expect(joinHostLabel({ host: "www.mathnexa.com" })).toBe("mathnexa.com");
    expect(joinHostLabel({ host: "127.0.0.1:3101" })).toBe("127.0.0.1:3101");
  });

  it("the join page reads the room from the link", () => {
    expect(codeFromSearch("?code=537636")).toBe("537636");
    expect(codeFromSearch("?code=053763")).toBe("");
    expect(codeFromSearch("?code=<script>")).toBe("");
    expect(codeFromSearch("")).toBe("");
  });
});

// ------------------------------------------------------------------ QR reader
// An independent reader written from the specification's tables (not from
// the encoder): function-module map, zigzag order, block structure, a
// Reed–Solomon syndrome check and byte-mode parsing. (The symbols were also
// decoded with the separate jsQR library during development.)

const ALIGNMENT: Record<number, number[]> = { 2: [6, 18], 3: [6, 22], 4: [6, 26], 5: [6, 30], 6: [6, 34], 7: [6, 22, 38], 8: [6, 24, 42], 9: [6, 26, 46], 10: [6, 28, 50] };
// Level M: [ecc codewords per block, [data codewords per block...]].
const BLOCKS_M: Record<number, [number, number[]]> = {
  1: [10, [16]], 2: [16, [28]], 3: [26, [44]], 4: [18, [32, 32]], 5: [24, [43, 43]], 6: [16, [27, 27, 27, 27]],
  7: [18, [31, 31, 31, 31]], 8: [22, [38, 38, 39, 39]], 9: [22, [36, 36, 36, 37, 37]], 10: [26, [43, 43, 43, 43, 44]]
};
const FORMAT_M = ["101010000010010", "101000100100101", "101111001111100", "101101101001011", "100010111111001", "100000011001110", "100111110010111", "100101010100000"];
const VERSION_INFO: Record<number, number> = { 7: 0x07c94, 8: 0x085bc, 9: 0x09a99, 10: 0x0a4d3 };

function isFunctionModule(x: number, y: number, version: number): boolean {
  const size = version * 4 + 17;
  if ((x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8)) return true;
  if (x === 6 || y === 6) return true;
  if (version >= 7 && ((x >= size - 11 && y < 6) || (y >= size - 11 && x < 6))) return true;
  const positions = ALIGNMENT[version] ?? [];
  for (const cx of positions) for (const cy of positions) {
    if ((cx === 6 && cy === 6) || (cx === 6 && cy === positions[positions.length - 1]) || (cx === positions[positions.length - 1] && cy === 6)) continue;
    if (Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) return true;
  }
  return false;
}

function gfMul(a: number, b: number): number {
  let result = 0;
  while (b) {
    if (b & 1) result ^= a;
    a <<= 1;
    if (a & 0x100) a ^= 0x11d;
    b >>= 1;
  }
  return result;
}

function readQr(modules: readonly (readonly boolean[])[]): string {
  const size = modules.length;
  const version = (size - 17) / 4;
  const bit = (x: number, y: number) => (modules[y][x] ? "1" : "0");
  // Format, first copy: (8,0..5),(8,7),(8,8),(7,8),(5..0,8) — bit 0 first.
  const formatCells: Array<[number, number]> = [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]];
  const format = formatCells.map(([x, y]) => bit(x, y)).reverse().join("");
  const second = [...Array.from({ length: 8 }, (_, i) => bit(size - 1 - i, 8)), ...Array.from({ length: 7 }, (_, i) => bit(8, size - 7 + i))].reverse().join("");
  expect(second).toBe(format);
  const mask = FORMAT_M.indexOf(format);
  expect(mask).toBeGreaterThanOrEqual(0);
  expect(modules[size - 8][8]).toBe(true);
  if (version >= 7) {
    let info = 0;
    for (let i = 17; i >= 0; i -= 1) info = (info << 1) | (modules[Math.floor(i / 3)][size - 11 + (i % 3)] ? 1 : 0);
    expect(info).toBe(VERSION_INFO[version]);
  }
  const masked = (x: number, y: number) => [
    (x + y) % 2 === 0, y % 2 === 0, x % 3 === 0, (x + y) % 3 === 0,
    (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, ((x * y) % 2) + ((x * y) % 3) === 0,
    (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
  ][mask];
  const bits: number[] = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((size - 1 - right) >> 1) % 2 === 0;
    for (let step = 0; step < size; step += 1) {
      const y = upward ? size - 1 - step : step;
      for (const x of [right, right - 1]) {
        if (isFunctionModule(x, y, version)) continue;
        bits.push((modules[y][x] !== masked(x, y)) ? 1 : 0);
      }
    }
  }
  const [ecc, dataLengths] = BLOCKS_M[version];
  const total = dataLengths.reduce((sum, length) => sum + length + ecc, 0);
  const codewords = Array.from({ length: total }, (_, i) => bits.slice(i * 8, i * 8 + 8).reduce((value, b) => (value << 1) | b, 0));
  const blocks = dataLengths.map(length => ({ data: [] as number[], ecc: [] as number[], length }));
  let index = 0;
  for (let i = 0; i < Math.max(...dataLengths); i += 1) for (const block of blocks) if (i < block.length) block.data.push(codewords[index++]);
  for (let i = 0; i < ecc; i += 1) for (const block of blocks) block.ecc.push(codewords[index++]);
  const data: number[] = [];
  for (const block of blocks) {
    // Syndromes S_i = c(α^i) must all be zero for an error-free block.
    const word = [...block.data, ...block.ecc];
    let alpha = 1;
    for (let i = 0; i < ecc; i += 1) {
      let value = 0;
      for (const coefficient of word) value = gfMul(value, alpha) ^ coefficient;
      expect(value).toBe(0);
      alpha = gfMul(alpha, 2);
    }
    data.push(...block.data);
  }
  const stream = data.flatMap(byte => Array.from({ length: 8 }, (_, i) => (byte >> (7 - i)) & 1));
  const take = (count: number) => stream.splice(0, count).reduce((value, b) => (value << 1) | b, 0);
  expect(take(4)).toBe(0b0100);
  const length = take(version <= 9 ? 8 : 16);
  return new TextDecoder().decode(Uint8Array.from(Array.from({ length }, () => take(8))));
}

describe("QR code encoder", () => {
  const TEXTS = [
    "https://mathnexa.com/join?code=537636",
    "http://127.0.0.1:3101/join?code=482391",
    "https://mathnexa-platform-staging-apx635wo3-bright-path-ed-tech.vercel.app/join?code=537636",
    "A", "x".repeat(130), "q".repeat(213), "Zoë \u{1F981}"
  ];

  it("reads back exactly, with valid format, version and error correction, for every mask", () => {
    for (const text of TEXTS) {
      for (let mask = 0; mask < 8; mask += 1) {
        const code = encodeQr(text, { mask });
        expect(code.mask).toBe(mask);
        expect(code.size).toBe(code.version * 4 + 17);
        expect(readQr(code.modules)).toBe(text);
      }
      // The automatic choice is deterministic.
      expect(encodeQr(text)).toEqual(encodeQr(text));
    }
  });

  it("picks the smallest version (bigger modules are easier to scan across a room)", () => {
    expect(encodeQr("https://mathnexa.com/join?code=537636").version).toBe(3);
    expect(encodeQr("x".repeat(14)).version).toBe(1);
    expect(encodeQr("x".repeat(15)).version).toBe(2);
    expect(() => encodeQr("x".repeat(214))).toThrow();
  });

  it("draws finder patterns and a quiet zone in the SVG path", () => {
    const code = encodeQr("https://mathnexa.com/join?code=537636");
    for (const [cx, cy] of [[3, 3], [code.size - 4, 3], [3, code.size - 4]]) {
      expect(code.modules[cy][cx]).toBe(true);
      expect(code.modules[cy - 2][cx]).toBe(false);
      expect(code.modules[cy - 3][cx]).toBe(true);
    }
    const path = qrPath(code, 4);
    expect(path).toMatch(/^M\d+ \d+h\d+v1h-\d+z/);
    const xs = [...path.matchAll(/M(\d+) (\d+)/g)].map(match => [Number(match[1]), Number(match[2])]);
    expect(Math.min(...xs.map(([x]) => x))).toBe(4);
    expect(Math.min(...xs.map(([, y]) => y))).toBe(4);
  });
});

// ------------------------------------------------------- answer independence (client)

type Seat = { version: number; marks: number; markQuestion: number; attemptQuestion: number; attempts: number; markUsed: boolean; attemptsLeft: number };
type View = { gameNumber: number; version: number; questionNumber: number; phase: string; events: string[]; me: Seat };

const seat = (version: number, marks: number, markQuestion: number, questionNumber: number): Seat =>
  ({ version, marks, markQuestion, attemptQuestion: 0, attempts: 0, markUsed: markQuestion === questionNumber, attemptsLeft: 2 });

describe("a student's own newest seat is never replaced by an older reply", () => {
  it("Zion's mark survives a poll that left before his tap but came back after Ava's broadcast", () => {
    // Zion has just marked cell 7 on question 4 (his seat version 6, room version 10).
    const afterTap: View = { gameNumber: 1, version: 10, questionNumber: 4, phase: "QUESTION_ACTIVE", events: [], me: seat(6, 1 << 7, 4, 4) };
    // A poll built before his tap committed, but after Ava's "one away" bumped the room.
    const stalePoll: View = { gameNumber: 1, version: 11, questionNumber: 4, phase: "QUESTION_ACTIVE", events: ["ava-one-away"], me: seat(5, 0, 3, 4) };
    const merged = reconcile(afterTap, stalePoll)!;
    expect(merged.version).toBe(11);
    expect(merged.events).toEqual(["ava-one-away"]);
    expect(merged.me.version).toBe(6);
    expect((merged.me.marks >>> 7) & 1).toBe(1);
    expect(merged.me.markUsed).toBe(true);
    // The old merge took the whole stale reply: the mark vanished and the card reopened.
    expect(stalePoll.me.marks).toBe(0);
  });

  it("an older room reply never rolls the room back, but its newer seat is kept", () => {
    const polled: View = { gameNumber: 1, version: 12, questionNumber: 5, phase: "ANSWER_REVEAL", events: ["x"], me: seat(7, 1, 4, 5) };
    const tapReply: View = { gameNumber: 1, version: 11, questionNumber: 5, phase: "QUESTION_ACTIVE", events: [], me: seat(8, 3, 5, 5) };
    const merged = reconcile(polled, tapReply)!;
    expect(merged.phase).toBe("ANSWER_REVEAL");
    expect(merged.me.version).toBe(8);
    expect(merged.me.markUsed).toBe(true);
  });

  it("a newer question re-derives 'mark used' from the seat's own facts", () => {
    const seatFromQ5: View = { gameNumber: 1, version: 12, questionNumber: 5, phase: "QUESTION_ACTIVE", events: [], me: seat(8, 3, 5, 5) };
    const roomAtQ6: View = { gameNumber: 1, version: 14, questionNumber: 6, phase: "QUESTION_ACTIVE", events: [], me: seat(7, 1, 4, 6) };
    const merged = reconcile(seatFromQ5, roomAtQ6)!;
    expect(merged.questionNumber).toBe(6);
    expect(merged.me.version).toBe(8);
    expect(merged.me.markUsed).toBe(false);
    expect(merged.me.attemptsLeft).toBe(2);
  });

  it("a new game replaces everything; a late reply from the previous game is ignored", () => {
    const previousGame: View = { gameNumber: 1, version: 30, questionNumber: 9, phase: "GAME_COMPLETE", events: [], me: seat(20, 5, 9, 9) };
    const newGame: View = { gameNumber: 2, version: 31, questionNumber: 0, phase: "COUNTDOWN", events: [], me: seat(21, 0, 0, 0) };
    expect(reconcile(previousGame, newGame)).toBe(newGame);
    expect(reconcile(newGame, previousGame)).toBe(newGame);
  });

  it("the host's view follows room version, then progress", () => {
    const host = { gameNumber: 1, version: 5, progress: 40, questionNumber: 2 };
    expect(reconcile(host, { ...host, progress: 41 })).toEqual({ ...host, progress: 41 });
    expect(reconcile({ ...host, progress: 41 }, host)).toEqual({ ...host, progress: 41 });
  });
});
