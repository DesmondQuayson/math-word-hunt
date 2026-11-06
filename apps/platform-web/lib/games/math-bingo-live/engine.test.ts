import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  CELL_COUNT,
  CENTER,
  LINES,
  bestLine,
  cardSignature,
  completedLines,
  dealCard,
  enabledLines,
  isValidCard,
  popcount
} from "@/public/internal-games/math-bingo-live/src/engine/board.js";
import {
  allowedShapes,
  describeModel,
  equalValue,
  equivalentsOf,
  fractionSpoken,
  modelGeometry,
  partAreas,
  properFractions,
  sameFraction
} from "@/public/internal-games/math-bingo-live/src/engine/fractions.js";
import {
  FRACTION_DENOMINATORS,
  answerMatches,
  buildAnswerPool,
  buildDeck,
  factsFor,
  revealText
} from "@/public/internal-games/math-bingo-live/src/engine/questions.js";
import {
  ATTEMPTS_PER_QUESTION,
  COUNTDOWN_SECONDS,
  DECK_PASSES,
  DEFAULT_SETTINGS,
  LEADERBOARD_SECONDS,
  MAX_PARTICIPANTS,
  MODES,
  WINNER_REVEAL_SECONDS,
  normalizeSettings,
  sanitizeDisplayName,
  type BingoSettings
} from "@/public/internal-games/math-bingo-live/src/engine/settings.js";

const ALL_PATTERNS = { rows: true, columns: true, diagonals: true } as const;

function settingsFor(mode: string, level: string, extra: Partial<BingoSettings> = {}): BingoSettings {
  const result = normalizeSettings({ ...DEFAULT_SETTINGS, mode, level, ...extra });
  if (!result.ok) throw new Error(result.error);
  return result.settings;
}

const LEVELS = MODES.flatMap(mode => mode.levels.map(level => ({ mode: mode.id, level: level.id })));

/** Recompute an arithmetic question from its operands: never trust the label. */
function evaluate(op: string, a: number, b: number): number {
  if (op === "+") return a + b;
  if (op === "-") return a - b;
  if (op === "*") return a * b;
  if (op === "/") {
    if (b === 0) throw new Error("division by zero");
    return a / b;
  }
  throw new Error(op);
}

const RANGE_RULES: Record<string, (op: string, a: number, b: number, answer: number) => boolean> = {
  "addition:facts-10": (_op, a, b, s) => a >= 0 && b >= 0 && s <= 10 && s >= 1,
  "addition:facts-20": (_op, a, b, s) => a >= 1 && b >= 1 && a <= 10 && b <= 10 && s <= 20,
  "addition:within-50": (_op, a, b, s) => a >= 2 && b >= 2 && s <= 50,
  "addition:within-100": (_op, a, b, s) => a >= 5 && b >= 5 && s <= 100,
  "subtraction:facts-10": (_op, a, b, s) => a <= 10 && b >= 1 && s >= 0,
  "subtraction:facts-20": (_op, a, b, s) => a <= 20 && b >= 1 && b <= 10 && s >= 1,
  "subtraction:within-50": (_op, a, b, s) => a <= 50 && b >= 2 && s >= 1,
  "subtraction:within-100": (_op, a, b, s) => a <= 100 && b >= 5 && s >= 1,
  "multiplication:x0-5": (_op, a, b) => a >= 0 && a <= 5 && b >= 0 && b <= 10,
  "multiplication:x0-10": (_op, a, b) => a <= 10 && b <= 10,
  "multiplication:x0-12": (_op, a, b) => a <= 12 && b <= 12,
  "multiplication:mixed-facts": (_op, a, b) => a >= 2 && b >= 2 && a <= 12 && b <= 12,
  "division:facts-5": (_op, _a, b, q) => b >= 2 && b <= 5 && q >= 1 && q <= 10,
  "division:facts-10": (_op, _a, b, q) => b >= 2 && b <= 10 && q >= 1 && q <= 10,
  "division:facts-12": (_op, _a, b, q) => b >= 2 && b <= 12 && q >= 1 && q <= 12,
  "mixed:starter": (_op, _a, _b, s) => s >= 1 && s <= 10,
  "mixed:core": (_op, _a, _b, s) => s >= 1 && s <= 30,
  "mixed:challenge": (_op, _a, _b, s) => s >= 1 && s <= 100
};

describe("Math Bingo Live settings", () => {
  it("accepts the defaults and every mode/level", () => {
    expect(normalizeSettings(DEFAULT_SETTINGS)).toMatchObject({ ok: true });
    expect(DEFAULT_SETTINGS.questionSeconds).toBe(15);
    expect(DEFAULT_SETTINGS.revealSeconds).toBe(3);
    expect(DEFAULT_SETTINGS.music).toBe("host");
    expect(DEFAULT_SETTINGS.celebration).toBe("host");
    expect(DEFAULT_SETTINGS.equivalentFractions).toBe(false);
    for (const { mode, level } of LEVELS) expect(normalizeSettings({ ...DEFAULT_SETTINGS, mode, level }).ok).toBe(true);
  });

  it("refuses unknown or out-of-range values instead of replacing them", () => {
    const bad: unknown[] = [
      null, [], { ...DEFAULT_SETTINGS, mode: "algebra" }, { ...DEFAULT_SETTINGS, level: "within-1000" },
      { ...DEFAULT_SETTINGS, questionSeconds: 7 }, { ...DEFAULT_SETTINGS, revealSeconds: 4 },
      { ...DEFAULT_SETTINGS, patterns: { rows: false, columns: false, diagonals: false } },
      { ...DEFAULT_SETTINGS, patterns: { rows: "yes", columns: true, diagonals: true } },
      { ...DEFAULT_SETTINGS, winners: -1 }, { ...DEFAULT_SETTINGS, winners: 61 }, { ...DEFAULT_SETTINGS, winners: 2.5 },
      { ...DEFAULT_SETTINGS, freeSpace: "on" }, { ...DEFAULT_SETTINGS, music: "everyone" }
    ];
    for (const value of bad) expect(normalizeSettings(value).ok).toBe(false);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, patterns: { rows: false, columns: false, diagonals: false } })).toEqual({ ok: false, error: "pattern-required" });
  });

  it("only keeps Equivalent Fractions in Fraction Bingo", () => {
    expect(settingsFor("addition", "facts-10", { equivalentFractions: true }).equivalentFractions).toBe(false);
    expect(settingsFor("fractions", "to-sixths", { equivalentFractions: true }).equivalentFractions).toBe(true);
  });

  it("matches the database timing constants", () => {
    const sql = readFileSync(resolve(__dirname, "../../../../../supabase/migrations/20261103100000_math_bingo_live.sql"), "utf8");
    expect(sql).toContain(`interval '${COUNTDOWN_SECONDS} seconds'`);
    expect(sql).toContain(`interval '${LEADERBOARD_SECONDS} seconds'`);
    expect(sql).toContain(`interval '${WINNER_REVEAL_SECONDS} seconds'`);
    expect(sql).toContain(`>= ${ATTEMPTS_PER_QUESTION}`);
    expect(sql).toContain(`>= ${MAX_PARTICIPANTS}`);
  });
});

describe("seeded generator", () => {
  it("has a 128-bit state: seeds that collide in a 32-bit hash still give different games", async () => {
    const { createRandom, hash128, hashSeed } = await import("@/public/internal-games/math-bingo-live/src/engine/random.js");
    const words = new Set<string>();
    for (let index = 0; index < 5_000; index += 1) words.add(hash128(`seed-${index}`).join(","));
    expect(words.size).toBe(5_000);
    // Find two inputs with the same 32-bit FNV hash; the 128-bit streams must still differ.
    const seen = new Map<number, string>();
    let pair: [string, string] | null = null;
    for (let index = 0; index < 200_000 && !pair; index += 1) {
      const text = `collide-${index}`;
      const key = hashSeed(text) & 0xffff;
      if (seen.has(key)) pair = [seen.get(key)!, text];
      else seen.set(key, text);
    }
    expect(pair).not.toBeNull();
    const [a, b] = [createRandom(pair![0]), createRandom(pair![1])];
    expect(Array.from({ length: 8 }, () => a.next())).not.toEqual(Array.from({ length: 8 }, () => b.next()));
    // Output is well spread.
    const random = createRandom("spread");
    const buckets = new Array(10).fill(0);
    for (let index = 0; index < 100_000; index += 1) buckets[Math.floor(random.next() * 10)] += 1;
    for (const count of buckets) expect(Math.abs(count - 10_000)).toBeLessThan(500);
  });
});

describe("display names", () => {
  it("trims, collapses spaces and enforces 2-20 characters", () => {
    expect(sanitizeDisplayName("  Ava   Lee ")).toEqual({ ok: true, name: "Ava Lee" });
    expect(sanitizeDisplayName("Zoë")).toEqual({ ok: true, name: "Zoë" });
    expect(sanitizeDisplayName("O'Brien-Smith")).toEqual({ ok: true, name: "O'Brien-Smith" });
    expect(sanitizeDisplayName("   ")).toEqual({ ok: false, error: "name-required" });
    expect(sanitizeDisplayName("A")).toEqual({ ok: false, error: "name-too-short" });
    expect(sanitizeDisplayName("A".repeat(21))).toEqual({ ok: false, error: "name-too-long" });
    expect(sanitizeDisplayName(42)).toEqual({ ok: false, error: "name-required" });
  });

  it("refuses markup and symbols rather than rendering them", () => {
    for (const raw of ["<b>Ava</b>", "Ava<script>", "\"Zion\"", "Omar&co", "Ava‮evil", "a{b}", "😀😀"]) {
      const result = sanitizeDisplayName(raw);
      if (result.ok) expect(result.name).not.toMatch(/[<>"&{}‮]/);
    }
    expect(sanitizeDisplayName("<b>Ava</b>").ok).toBe(false);
    expect(sanitizeDisplayName("😀😀").ok).toBe(false);
  });
});

describe("arithmetic facts", () => {
  for (const { mode, level } of LEVELS.filter(item => item.mode !== "fractions")) {
    it(`${mode} / ${level}: every fact is correct, in range, exact and non-negative`, () => {
      const facts = factsFor(mode as Exclude<BingoSettings["mode"], "fractions">, level);
      expect(facts.length).toBeGreaterThan(10);
      const rule = RANGE_RULES[`${mode}:${level}`];
      const keys = new Set<string>();
      for (const item of facts) {
        const [a, b] = item.operands;
        expect(Number.isInteger(a) && Number.isInteger(b)).toBe(true);
        const value = evaluate(item.op, a, b);
        expect(Number.isInteger(value)).toBe(true);
        expect(value).toBe(item.answer.n);
        expect(item.answer.d).toBe(1);
        expect(value).toBeGreaterThanOrEqual(0);
        if (item.op === "/") expect(b).toBeGreaterThan(0);
        if (mode !== "mixed") expect(item.op).toBe(({ addition: "+", subtraction: "-", multiplication: "*", division: "/" } as Record<string, string>)[mode]);
        expect(rule(item.op, a, b, value)).toBe(true);
        expect(item.text).toMatch(/^\d+ [+−×÷] \d+$/);
        keys.add(item.key);
      }
      expect(keys.size).toBe(facts.length);
    });
  }

  it("Mixed Operations uses all four operations at every level", () => {
    for (const level of ["starter", "core", "challenge"]) {
      expect(new Set(factsFor("mixed", level).map(item => item.op))).toEqual(new Set(["+", "-", "*", "/"]));
    }
  });
});

describe("answer pools and decks (thousands of deterministic games)", { timeout: 60_000 }, () => {
  const SEEDS = Array.from({ length: 60 }, (_, index) => `audit-seed-${index}`);

  for (const { mode, level } of LEVELS) {
    for (const freeSpace of [true, false]) {
      it(`${mode} / ${level} / free space ${freeSpace ? "on" : "off"}`, () => {
        for (const equivalentFractions of mode === "fractions" ? [false, true] : [false]) {
          const settings = settingsFor(mode, level, { freeSpace, equivalentFractions });
          for (const seed of SEEDS) {
            const pool = buildAnswerPool(settings, seed);
            expect(pool).toHaveLength(freeSpace ? 24 : 25);
            const counts = new Map<string, number>();
            for (const value of pool) counts.set(`${value.n}/${value.d}`, (counts.get(`${value.n}/${value.d}`) ?? 0) + 1);
            for (const count of counts.values()) expect(count).toBeLessThanOrEqual(3);
            if (mode === "fractions") {
              for (const value of pool) {
                expect(FRACTION_DENOMINATORS[level]).toContain(value.d);
                expect(value.n).toBeGreaterThanOrEqual(1);
                expect(value.n).toBeLessThan(value.d);
              }
            }
            // Determinism: same seed, same game.
            expect(buildAnswerPool(settings, seed)).toEqual(pool);

            const deck = buildDeck(settings, pool, seed);
            // At most DECK_PASSES passes, and never the same question twice
            // (final-gameplay.test.ts covers identities in depth).
            expect(deck.length).toBeLessThanOrEqual(pool.length * DECK_PASSES);
            expect(new Set(deck.map(question => question.id)).size).toBe(deck.length);
            for (let index = 0; index < deck.length; index += 1) {
              const question = deck[index];
              expect(question.number).toBe(index + 1);
              if (index > 0) expect(question.key).not.toBe(deck[index - 1].key);
              if (question.kind === "arithmetic") {
                expect(evaluate(question.op, question.operands[0], question.operands[1])).toBe(question.answer.n);
              } else {
                expect(question.text).toBe(`${question.answer.n}/${question.answer.d}`);
                expect(question.answer.n).toBeLessThan(question.answer.d);
              }
            }
            if (mode !== "fractions") {
              // The first pass calls each pool instance once: a perfect player
              // can always fill the whole card in one pass, so a winner is reachable.
              const remaining = pool.map(value => ({ ...value }));
              for (const question of deck.slice(0, pool.length)) {
                const match = remaining.findIndex(value => answerMatches(settings, question.answer, value));
                expect(match).toBeGreaterThanOrEqual(0);
                remaining.splice(match, 1);
              }
              expect(remaining).toHaveLength(0);
            } else {
              // Fraction Bingo calls each fraction once; every fraction on the card is called.
              for (const value of pool) expect(deck.some(question => answerMatches(settings, question.answer, value))).toBe(true);
            }
          }
        }
      });
    }
  }

  it("large ranges deliberately repeat a few answers; repeated values get different questions", () => {
    let repeated = 0;
    let differentQuestions = 0;
    for (const seed of SEEDS) {
      const settings = settingsFor("addition", "within-100");
      const pool = buildAnswerPool(settings, seed);
      const values = pool.map(value => value.n);
      const duplicates = values.filter((value, index) => values.indexOf(value) !== index);
      expect(duplicates.length).toBeGreaterThanOrEqual(2);
      expect(duplicates.length).toBeLessThanOrEqual(4);
      repeated += duplicates.length;
      const deck = buildDeck(settings, pool, seed).slice(0, pool.length);
      for (const value of new Set(duplicates)) {
        const texts = new Set(deck.filter(question => question.answer.n === value).map(question => question.text));
        if (texts.size > 1) differentQuestions += 1;
      }
    }
    expect(repeated).toBeGreaterThan(0);
    expect(differentQuestions).toBeGreaterThan(SEEDS.length);
  });

  it("generates thousands of questions across modes, each identity once per game", () => {
    let total = 0;
    const identities = new Set<string>();
    for (const { mode, level } of LEVELS) {
      const settings = settingsFor(mode, level);
      for (const seed of SEEDS.slice(0, 20)) {
        const deck = buildDeck(settings, buildAnswerPool(settings, seed), seed);
        total += deck.length;
        for (const question of deck) identities.add(question.id);
      }
    }
    expect(total).toBeGreaterThan(15_000);
    expect(identities.size).toBeGreaterThan(1_500);
  });
});

describe("fraction models", { timeout: 60_000 }, () => {
  const denominators = [...new Set(Object.values(FRACTION_DENOMINATORS).flat())];

  it("every model has exactly d equal parts with exactly n shaded, for every shape", () => {
    let models = 0;
    for (const value of properFractions(denominators)) {
      for (const shape of allowedShapes(value.d)) {
        const geometry = modelGeometry({ ...value, shape });
        expect(geometry.parts).toHaveLength(value.d);
        expect(geometry.parts.filter(part => part.shaded)).toHaveLength(value.n);
        // The shaded parts are the first n: one connected run.
        expect(geometry.parts.slice(0, value.n).every(part => part.shaded)).toBe(true);
        const areas = partAreas(geometry);
        const first = areas[0];
        for (const area of areas) expect(Math.abs(area - first) / first).toBeLessThan(0.002);
        if (geometry.parts[0].kind === "sector") {
          const sectors = geometry.parts as unknown as Array<{ start: number; end: number }>;
          for (const sector of sectors) expect(Math.abs(sector.end - sector.start - (2 * Math.PI) / value.d)).toBeLessThan(1e-9);
          const total = sectors.reduce((sum, sector) => sum + (sector.end - sector.start), 0);
          expect(Math.abs(total - 2 * Math.PI)).toBeLessThan(1e-9);
        }
        models += 1;
      }
    }
    expect(models).toBeGreaterThan(60);
  });

  it("thousands of dealt fraction cards carry only valid, described models", () => {
    let cells = 0;
    for (const level of Object.keys(FRACTION_DENOMINATORS)) {
      for (const equivalentFractions of [false, true]) {
        const settings = settingsFor("fractions", level, { equivalentFractions });
        for (let game = 0; game < 25; game += 1) {
          const seed = `fraction-game-${level}-${game}`;
          const pool = buildAnswerPool(settings, seed);
          for (let player = 0; player < 8; player += 1) {
            const card = dealCard({ pool, seed, participantId: `p${player}`, freeSpace: true, fractions: true });
            for (const cell of card) {
              if (cell.free) continue;
              expect(allowedShapes(cell.d)).toContain(cell.shape);
              const geometry = modelGeometry(cell as { n: number; d: number; shape: "circle" });
              expect(geometry.parts.filter(part => part.shaded)).toHaveLength(cell.n);
              expect(describeModel(cell)).toBe(`Fraction model: ${cell.n} of ${cell.d} equal parts shaded.`);
              cells += 1;
            }
          }
        }
      }
    }
    expect(cells).toBeGreaterThan(10_000);
  });

  it("exact match is the default; equivalence uses rational arithmetic", () => {
    const exact = settingsFor("fractions", "to-eighths");
    const equivalent = settingsFor("fractions", "to-eighths", { equivalentFractions: true });
    const half = { n: 1, d: 2 };
    expect(answerMatches(exact, half, { n: 1, d: 2, shape: "circle" })).toBe(true);
    expect(answerMatches(exact, half, { n: 2, d: 4, shape: "circle" })).toBe(false);
    expect(answerMatches(exact, half, { n: 3, d: 6, shape: "bar" })).toBe(false);
    for (const cell of [{ n: 1, d: 2 }, { n: 2, d: 4 }, { n: 3, d: 6 }, { n: 4, d: 8 }]) {
      expect(answerMatches(equivalent, half, cell)).toBe(true);
    }
    expect(answerMatches(equivalent, half, { n: 2, d: 3 })).toBe(false);
    expect(answerMatches(equivalent, { n: 2, d: 3 }, { n: 4, d: 6 })).toBe(true);
    // Exhaustive: equality is cross-multiplication, never floating point.
    const all = properFractions([2, 3, 4, 5, 6, 8, 10, 12]);
    for (const a of all) {
      for (const b of all) {
        expect(equalValue(a, b)).toBe(a.n * b.d === b.n * a.d);
        expect(sameFraction(a, b)).toBe(a.n === b.n && a.d === b.d);
      }
    }
    expect(equivalentsOf(half, [2, 4, 6, 8])).toEqual([{ n: 1, d: 2 }, { n: 2, d: 4 }, { n: 3, d: 6 }, { n: 4, d: 8 }]);
  });

  it("validation never depends on the shape", () => {
    const settings = settingsFor("fractions", "to-sixths");
    for (const shape of ["circle", "bar", "rect", "grid", "anything"]) {
      expect(answerMatches(settings, { n: 2, d: 3 }, { n: 2, d: 3, shape })).toBe(true);
    }
  });

  it("speaks fractions plainly", () => {
    expect(fractionSpoken({ n: 1, d: 2 })).toBe("one half");
    expect(fractionSpoken({ n: 2, d: 3 })).toBe("two thirds");
    expect(fractionSpoken({ n: 3, d: 4 })).toBe("three fourths");
    expect(fractionSpoken({ n: 7, d: 8 })).toBe("seven eighths");
  });
});

describe("cards", { timeout: 60_000 }, () => {
  it("25 cells, Free Space in the centre, 24 pool values, same multiset, different order", () => {
    for (const { mode, level } of LEVELS) {
      const settings = settingsFor(mode, level);
      for (let game = 0; game < 10; game += 1) {
        const seed = `card-${mode}-${level}-${game}`;
        const pool = buildAnswerPool(settings, seed);
        const signatures = new Set<string>();
        const layouts = new Set<string>();
        for (let player = 0; player < MAX_PARTICIPANTS; player += 1) {
          const card = dealCard({ pool, seed, participantId: `player-${player}`, freeSpace: true, fractions: mode === "fractions" });
          expect(card).toHaveLength(CELL_COUNT);
          expect(card[CENTER]).toEqual({ free: true });
          expect(card.filter(cell => cell.free)).toHaveLength(1);
          expect(isValidCard(card, true)).toBe(true);
          signatures.add(cardSignature(card));
          layouts.add(card.map(cell => cell.free ? "F" : `${cell.n}/${cell.d}`).join(","));
          // Reload safety: dealing again gives the same card.
          expect(dealCard({ pool, seed, participantId: `player-${player}`, freeSpace: true, fractions: mode === "fractions" })).toEqual(card);
        }
        expect(signatures.size).toBe(1);
        expect(layouts.size).toBe(MAX_PARTICIPANTS);
      }
    }
  });

  it("without Free Space all 25 cells are values", () => {
    const settings = settingsFor("multiplication", "x0-10", { freeSpace: false });
    const pool = buildAnswerPool(settings, "no-free");
    const card = dealCard({ pool, seed: "no-free", participantId: "p", freeSpace: false, fractions: false });
    expect(card.some(cell => cell.free)).toBe(false);
    expect(isValidCard(card, false)).toBe(true);
    expect(() => dealCard({ pool, seed: "no-free", participantId: "p", freeSpace: true, fractions: false })).toThrow();
  });

  it("duplicate values are independent cells", () => {
    const settings = settingsFor("addition", "facts-10");
    const pool = buildAnswerPool(settings, "dupes");
    const card = dealCard({ pool, seed: "dupes", participantId: "ava", freeSpace: true, fractions: false });
    const firstDuplicate = card.findIndex((cell, index) => !cell.free && card.findIndex(other => !other.free && other.n === cell.n) !== index);
    expect(firstDuplicate).toBeGreaterThan(-1);
    const value = card[firstDuplicate] as { n: number };
    const matching = card.map((cell, index) => (!cell.free && cell.n === value.n ? index : -1)).filter(index => index >= 0);
    expect(matching.length).toBeGreaterThanOrEqual(2);
  });
});

describe("winning lines", () => {
  const ROWS = { rows: true, columns: false, diagonals: false };
  const COLUMNS = { rows: false, columns: true, diagonals: false };
  const DIAGONALS = { rows: false, columns: false, diagonals: true };
  const ROWS_COLUMNS = { rows: true, columns: true, diagonals: false };
  const lineMask = (id: string) => LINES.find(item => item.id === id)!.mask;

  it("has 5 rows, 5 columns and 2 diagonals through the centre", () => {
    expect(LINES).toHaveLength(12);
    for (const item of LINES) expect(popcount(item.mask)).toBe(5);
    expect(LINES.filter(item => item.type === "diagonal").every(item => item.cells.includes(CENTER))).toBe(true);
    expect(enabledLines(ALL_PATTERNS)).toHaveLength(12);
    expect(enabledLines(ROWS)).toHaveLength(5);
  });

  it("disabled patterns never win", () => {
    for (const item of LINES) {
      for (const patterns of [ROWS, COLUMNS, DIAGONALS, ROWS_COLUMNS, ALL_PATTERNS]) {
        const wins = completedLines(item.mask, patterns).map(line => line.id);
        const enabled = (item.type === "row" && patterns.rows) || (item.type === "column" && patterns.columns) || (item.type === "diagonal" && patterns.diagonals);
        expect(wins.includes(item.id)).toBe(enabled);
      }
    }
  });

  it("a mask wins exactly when it covers an enabled line (50k sampled masks, 5 pattern sets)", () => {
    let state = 7;
    const nextMask = () => {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      return state & 0x1ffffff;
    };
    const patternSets = [ROWS, COLUMNS, DIAGONALS, ROWS_COLUMNS, ALL_PATTERNS];
    const linesBySet = patternSets.map(patterns => enabledLines(patterns).map(item => item.mask));
    let mismatches = 0;
    for (let index = 0; index < 50_000; index += 1) {
      const mask = nextMask();
      patternSets.forEach((patterns, set) => {
        const expected = linesBySet[set].some(lineBits => (mask & lineBits) === lineBits);
        if ((completedLines(mask, patterns).length > 0) !== expected) mismatches += 1;
      });
    }
    expect(mismatches).toBe(0);
  }, 60_000);

  it("best line progress counts the Free Space bit and labels the type", () => {
    const mask = (1 << 10) | (1 << 11) | (1 << CENTER) | (1 << 13);
    expect(bestLine(mask, ROWS)).toEqual({ id: "row-3", type: "row", count: 4 });
    expect(bestLine(mask, COLUMNS)?.count).toBe(1);
    expect(bestLine(lineMask("diagonal-2") & ~(1 << 4), DIAGONALS)).toEqual({ id: "diagonal-2", type: "diagonal", count: 4 });
  });

  it("formats reveals", () => {
    expect(revealText({ kind: "arithmetic", text: "9 + 9", answer: { n: 18, d: 1 } })).toBe("9 + 9 = 18");
    expect(revealText({ kind: "fraction", text: "2/3", answer: { n: 2, d: 3 } })).toBe("2/3");
  });
});
