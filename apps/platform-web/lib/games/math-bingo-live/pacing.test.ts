import { describe, expect, it } from "vitest";

import { CENTER, LINES, enabledLines } from "@/public/internal-games/math-bingo-live/src/engine/board.js";
import {
  COVERAGE_TARGETS,
  PACING,
  buildUniverse,
  cellClass,
  classesFromCallable,
  dealPacedBoard,
  firstGateWindow,
  isValidPacedBoard,
  pacingPlan,
  universeClasses
} from "@/public/internal-games/math-bingo-live/src/engine/pacing.js";
import { DEFAULT_SETTINGS, MAX_WINNERS, MIN_WINNERS, MODES, normalizeSettings, type BingoSettings } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";

import { buildPacedGame, dealFor, dealPacedBoards, pacingPayload, toHostState, toPlayerState } from "./server";

function settingsFor(mode: string, level: string, extra: Partial<BingoSettings> = {}): BingoSettings {
  const result = normalizeSettings({ ...DEFAULT_SETTINGS, mode, level, ...extra });
  if (!result.ok) throw new Error(result.error);
  return result.settings;
}
const LEVELS = MODES.flatMap(mode => mode.levels.map(level => ({ mode: mode.id, level: level.id })));
const SEED = "0123456789abcdef0123456789abcdef";
const ids = Array.from({ length: 50 }, (_, index) => `${String(index).padStart(8, "0")}-0000-4000-8000-000000000000`);

describe("the pacing contract", () => {
  it("draws the first gate from 14-17 (database) and gaps of 8-11; small levels get a window that still fits", () => {
    expect(PACING.firstGateCalls).toEqual([14, 15, 16, 17]);
    expect(PACING.winnerGapCalls).toEqual([8, 9, 10, 11]);
    // Must match private.bingo_first_gate_bounds (checked by pgTAP 41).
    expect(firstGateWindow(600)).toEqual([14, 17]);
    expect(firstGateWindow(22)).toEqual([14, 17]);
    expect(firstGateWindow(20)).toEqual([14, 17]);
    expect(firstGateWindow(19)).toEqual([13, 16]);
    expect(firstGateWindow(15)).toEqual([9, 12]);
    expect(firstGateWindow(10)).toEqual([4, 7]);
    expect(Object.values(COVERAGE_TARGETS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("keeps enough early questions for the latest first gate of every level, and no winner cap anywhere", () => {
    for (const { mode, level } of LEVELS) {
      const settings = settingsFor(mode, level);
      const universe = buildUniverse(settings, SEED);
      const plan = pacingPlan(settings, universe, SEED);
      const early = new Set(plan.early.concat(plan.reserve));
      const earlyQuestions = universe.filter(question => early.has(question.class)).length;
      expect(earlyQuestions, `${mode}/${level}`).toBeGreaterThanOrEqual(plan.firstGateWindow[1] - 1);
      expect(plan.late.length).toBeGreaterThanOrEqual(1);
      expect(Object.keys(plan)).not.toContain("maxWinners");
      expect(plan.scaled).toBe(plan.firstGateWindow[0] < 14);
    }
    expect(pacingPlan(settingsFor("fractions", "to-fifths"), buildUniverse(settingsFor("fractions", "to-fifths"), SEED), SEED).scaled).toBe(true);
    expect(pacingPlan(settingsFor("fractions", "to-eighths"), buildUniverse(settingsFor("fractions", "to-eighths"), SEED), SEED).scaled).toBe(false);
  });
});

describe("the winner target", () => {
  it("is any whole number from 1 to 60, checked on the server (no presets)", () => {
    for (const winners of [1, 2, 4, 7, 12, 18, 25, 40, 59, 60]) {
      expect(normalizeSettings({ ...DEFAULT_SETTINGS, winners }).ok, String(winners)).toBe(true);
    }
    for (const winners of [0, -1, 1.5, 61, 100, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "5", "", null, undefined, [3], { n: 3 }, true]) {
      const result = normalizeSettings({ ...DEFAULT_SETTINGS, winners });
      expect(result.ok, String(winners)).toBe(false);
      if (!result.ok) expect(result.error).toBe("invalid-winners");
    }
    expect(MIN_WINNERS).toBe(1);
    expect(MAX_WINNERS).toBe(60);
  });

  it("reads a room stored before winner targets ('everyone' = 0) only when asked to", () => {
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, winners: 0 }).ok).toBe(false);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, winners: 0 }, { legacyWinners: true }).ok).toBe(true);
    expect(normalizeSettings({ ...DEFAULT_SETTINGS, winners: -1 }, { legacyWinners: true }).ok).toBe(false);
  });
});

describe("the question universe", () => {
  it("holds every unique question once with its canonical identity and answer class, at most 6 per class when seeded", () => {
    for (const { mode, level } of LEVELS) {
      const settings = settingsFor(mode, level);
      const full = buildUniverse(settings);
      const stored = buildUniverse(settings, SEED);
      expect(new Set(full.map(q => q.id)).size).toBe(full.length);
      expect(new Set(stored.map(q => q.id)).size).toBe(stored.length);
      expect(stored.length).toBe(full.length);
      for (const question of stored) {
        expect(question.class).toBe(cellClass(settings, { n: question.n, d: question.d }));
        expect(question.id).toMatch(/^(addition|subtraction|multiplication|division|fraction):\d+:\d+$/);
      }
      const perClass = new Map<string, number>();
      for (const question of stored) perClass.set(question.class, (perClass.get(question.class) ?? 0) + 1);
      for (const count of perClass.values()) expect(count).toBeLessThanOrEqual(PACING.questionsPerClass);
      // Every class of the level is kept.
      expect(new Set(stored.map(q => q.class)).size).toBe(new Set(full.map(q => q.class)).size);
      expect(buildUniverse(settings, SEED)).toEqual(stored);
    }
  });

  it("uses the reduced fraction as the class with Equivalent Fractions on", () => {
    const exact = settingsFor("fractions", "to-eighths");
    const equivalent = settingsFor("fractions", "to-eighths", { equivalentFractions: true });
    expect(cellClass(exact, { n: 2, d: 4 })).toBe("2/4");
    expect(cellClass(equivalent, { n: 2, d: 4 })).toBe("1/2");
    expect(universeClasses(buildUniverse(exact)).length).toBe(22);
    expect(universeClasses(buildUniverse(equivalent)).length).toBe(15);
  });
});

describe("paced cards", { timeout: 120_000 }, () => {
  it("every enabled line holds a late cell, every value is callable, lines never repeat a class beyond its questions, and cards differ", () => {
    for (const { mode, level } of LEVELS) {
      for (const freeSpace of [true, false]) {
        for (const patterns of [{ rows: true, columns: true, diagonals: true }, { rows: true, columns: false, diagonals: false }, { rows: false, columns: false, diagonals: true }]) {
          const settings = settingsFor(mode, level, { freeSpace, patterns });
          const universe = buildUniverse(settings, SEED);
          const plan = pacingPlan(settings, universe, SEED);
          const reserve = new Set(plan.reserve);
          const classes = universeClasses(universe).filter(item => !reserve.has(item.key));
          const usage = new Map<string, number>();
          const layouts = new Set<string>();
          const lateSet = new Set(plan.late);
          for (const id of ids.slice(0, 12)) {
            const board = dealPacedBoard({ settings, classes, late: plan.late, seed: SEED, participantId: id, usage });
            expect(board, `${mode}/${level} free=${freeSpace}`).not.toBeNull();
            expect(isValidPacedBoard(board, { settings, late: plan.late, classes })).toBe(true);
            if (freeSpace) expect(board![CENTER]).toEqual({ free: true });
            for (const line of enabledLines(patterns)) {
              expect(line.cells.some(cell => !("free" in board![cell]) && lateSet.has(cellClass(settings, board![cell] as { n: number; d: number })))).toBe(true);
            }
            for (const cell of board!) if (!("free" in cell)) usage.set(`${cell.n}/${cell.d}`, (usage.get(`${cell.n}/${cell.d}`) ?? 0) + 1);
            layouts.add(board!.map(cell => ("free" in cell ? "F" : `${cell.n}/${cell.d}`)).join(","));
            // Reload safety.
            expect(dealPacedBoard({ settings, classes, late: plan.late, seed: SEED, participantId: id })).toEqual(dealPacedBoard({ settings, classes, late: plan.late, seed: SEED, participantId: id }));
          }
          expect(layouts.size).toBe(12);
        }
      }
    }
  });

  it("spreads classes evenly across a class's cards (balanced opportunity)", () => {
    const settings = settingsFor("multiplication", "x0-10");
    const universe = buildUniverse(settings, SEED);
    const plan = pacingPlan(settings, universe, SEED);
    const classes = universeClasses(universe).filter(item => !plan.reserve.includes(item.key));
    const usage = new Map<string, number>();
    for (const id of ids) {
      const board = dealPacedBoard({ settings, classes, late: plan.late, seed: SEED, participantId: id, usage })!;
      for (const cell of board) if (!("free" in cell)) usage.set(`${cell.n}/${cell.d}`, (usage.get(`${cell.n}/${cell.d}`) ?? 0) + 1);
    }
    const counts = [...usage.values()];
    const average = counts.reduce((a, b) => a + b, 0) / counts.length;
    expect(Math.max(...counts)).toBeLessThanOrEqual(average * 1.6);
    expect(Math.min(...counts)).toBeGreaterThanOrEqual(average * 0.4);
    // Reserve classes are on no card.
    for (const key of plan.reserve) expect(usage.has(key)).toBe(false);
  });

  it("refuses cards that break the contract", () => {
    const settings = settingsFor("addition", "facts-20");
    const universe = buildUniverse(settings, SEED);
    const plan = pacingPlan(settings, universe, SEED);
    const classes = universeClasses(universe);
    const board = dealPacedBoard({ settings, classes, late: plan.late, seed: SEED, participantId: ids[0] })!;
    expect(isValidPacedBoard(board, { settings, late: plan.late, classes })).toBe(true);
    expect(isValidPacedBoard(board, { settings, late: [], classes })).toBe(false);
    expect(isValidPacedBoard(board.slice(0, 24), { settings, late: plan.late, classes })).toBe(false);
    expect(isValidPacedBoard(board, { settings, late: plan.late, classes: classes.filter(item => item.key !== cellClass(settings, board[0] as never)) })).toBe(false);
    // A line full of early cells.
    const early = classes.filter(item => !plan.late.includes(item.key));
    const broken = board.map((cell, index) => (LINES[0].cells.includes(index) ? { n: early[index % early.length].value.n, d: 1 } : cell));
    expect(isValidPacedBoard(broken, { settings, late: plan.late, classes })).toBe(false);
  });
});

describe("the server's paced game", () => {
  it("builds the universe, the plan and every card, and deals a late joiner from the room's context", () => {
    const settings = settingsFor("subtraction", "facts-20");
    const game = buildPacedGame(settings, SEED);
    expect(game.questions.length).toBe(game.universe.length);
    expect(new Set(game.questions.map(q => q.q)).size).toBe(game.questions.length);
    // The database draws the gates: the payload carries only the early/late plan.
    expect(pacingPayload(game.plan)).toEqual({ late: [...game.plan.late], reserve: [...game.plan.reserve] });
    const boards = dealPacedBoards(settings, game, SEED, [...ids.slice(0, 5), "not-a-uuid", ids[0]]);
    expect(Object.keys(boards)).toEqual(ids.slice(0, 5));
    const callable = universeClasses(game.universe).map(item => ({ c: item.key, n: item.questions }));
    const late = dealFor({ settings, seed: SEED, late: [...game.plan.late], callable }, ids[7]);
    expect(late).not.toBeNull();
    expect(isValidPacedBoard(late, { settings, late: game.plan.late, classes: classesFromCallable(callable) })).toBe(true);
    // Without the context (an older room) the pool deal still works; with neither, nothing.
    expect(dealFor({ settings, seed: SEED }, ids[7])).toBeNull();
  });

  it("passes ties and pending lines to the screens, never the pacing gates or the late classes", () => {
    const record = {
      result: "ok", code: "482391", status: "open", phase: "QUESTION_ACTIVE", gameNumber: 1, settings: DEFAULT_SETTINGS, questionNumber: 11, deckLength: 60,
      serverNow: 1, phaseStartedAt: 1, phaseDeadline: null, questionStartedAt: 1, winners: [{ id: "a", name: "Ava", placement: 1, tie: false, line: "row-1", lineType: "row", question: 15, mask: 31, cells: [] }, { id: "b", name: "Zion", placement: 1, tie: true, line: "row-1", lineType: "row", question: 15, mask: 31, cells: [] }],
      winnerCount: 2,
      events: [{ seq: 1, type: "bingo", name: "Ava", participant: "a", placement: 1, count: 1, tie: false, lineType: "row", cap: 3 }, { seq: 2, type: "bingo", name: "Zion", participant: "b", placement: 1, count: 2, tie: true, lineType: "row", cap: 3 }],
      eventSeq: 2, completedReason: null, joinLocked: false, version: 3, expiresAt: 9, playerCount: 3, called: [],
      pacing: { firstWinCall: 15, spacing: 10, nextEligibleCall: 15, lastWinnerCall: null, maxWinners: 3, scaled: false, late: ["1/1"], calls: [{ n: 1 }] },
      leaderboard: [
        { id: "a", name: "Ava", rank: 1, tied: true, won: false, placement: null, best: 4, type: "row", bestLines: 1, pending: false, correct: 4 },
        { id: "b", name: "Zion", rank: 1, tied: true, won: false, placement: null, best: 4, type: "row", bestLines: 1, pending: false, correct: 4 },
        { id: "c", name: "Omar", rank: 3, tied: false, won: false, placement: null, best: 3, type: "column", bestLines: 2, pending: true, correct: 3 }
      ],
      players: [{ id: "a", name: "Ava", connected: true, hasWon: false, placement: null, best: 4, bestType: "row", bestLines: 1, pending: false, correct: 4 }],
      me: { id: "c", name: "Omar", status: "active", gameNumber: 1, board: null, marks: 0, freeUsed: false, markQuestion: 0, attemptQuestion: 0, attempts: 0, correct: 3, hasWon: false, placement: null, winLine: null, pendingLine: "column-2", best: 3, bestType: "column", bestLines: 2, version: 2 }
    };
    const host = toHostState(record);
    expect(host).not.toHaveProperty("pacing");
    expect(JSON.stringify(host)).not.toMatch(/nextEligibleCall|firstWinCall|spacing|gaps/);
    expect(host.winners.map(winner => [winner.name, winner.placement, winner.tie])).toEqual([["Ava", 1, false], ["Zion", 1, true]]);
    expect(host.events.map(event => [event.name, event.placement, event.count, event.tie])).toEqual([["Ava", 1, 1, false], ["Zion", 1, 2, true]]);
    expect(host.leaderboard[0]).toMatchObject({ rank: 1, tied: true, bestLines: 1 });
    expect(host.leaderboard[2]).toMatchObject({ rank: 3, pending: true, bestLines: 2 });
    expect(host.players[0]).toMatchObject({ bestLines: 1, pending: false });
    expect(JSON.stringify(host)).not.toContain("late");
    const player = toPlayerState(record);
    expect(player.me).toMatchObject({ pendingLine: "column-2", bestLines: 2, rank: 3, tied: false });
    expect(player).not.toHaveProperty("pacing");
    expect(JSON.stringify(player)).not.toMatch(/nextEligibleCall|firstWinCall|gaps|"late"/);
  });
});
