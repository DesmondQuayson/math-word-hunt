import { describe, expect, it } from "vitest";

import { CENTER, LINES, enabledLines } from "@/public/internal-games/math-bingo-live/src/engine/board.js";
import {
  COVERAGE_TARGETS,
  PACING,
  buildUniverse,
  capacityFor,
  cellClass,
  classesFromCallable,
  dealPacedBoard,
  isValidPacedBoard,
  maxWinnersFor,
  oneAwayShare,
  pacingNumbers,
  pacingPlan,
  requiredCalls,
  universeClasses
} from "@/public/internal-games/math-bingo-live/src/engine/pacing.js";
import { DEFAULT_SETTINGS, MODES, normalizeSettings, type BingoSettings } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";

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
  it("is 15 / 10 for every mode with enough questions, scaled down (never repeated) for small universes", () => {
    expect(PACING.firstWinCall).toBe(15);
    expect(PACING.spacing).toBe(10);
    expect(pacingNumbers(500)).toMatchObject({ firstWinCall: 15, spacing: 10, buffer: 10, scaled: false });
    expect(pacingNumbers(35)).toMatchObject({ firstWinCall: 15, buffer: 5, scaled: false });
    expect(pacingNumbers(22)).toMatchObject({ firstWinCall: 15, spacing: 10, scaled: false });
    expect(pacingNumbers(15)).toMatchObject({ firstWinCall: 10, scaled: true });
    expect(pacingNumbers(10)).toMatchObject({ firstWinCall: 7, scaled: true });
    expect(requiredCalls(pacingNumbers(500), 1)).toBe(25);
    expect(requiredCalls(pacingNumbers(500), 3)).toBe(45);
    expect(requiredCalls(pacingNumbers(500), 5)).toBe(65);
    expect(requiredCalls(pacingNumbers(500), 10)).toBe(115);
    expect(Object.values(COVERAGE_TARGETS).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("caps winners by unique questions and, for levels with few answers, by answer classes", () => {
    expect(maxWinnersFor(500, 81)).toBe(48);
    expect(maxWinnersFor(35, 10)).toBe(1);
    expect(maxWinnersFor(51, 16)).toBe(2);
    expect(maxWinnersFor(66, 43)).toBe(5);
    expect(maxWinnersFor(10, 10)).toBe(1);
    for (const { mode, level } of LEVELS) {
      const capacity = capacityFor(settingsFor(mode, level));
      expect(capacity.maxWinners, `${mode}/${level}`).toBeGreaterThanOrEqual(1);
      expect(capacity.universe).toBeGreaterThanOrEqual(capacity.firstWinCall);
    }
    expect(capacityFor(settingsFor("fractions", "to-fifths"))).toMatchObject({ universe: 10, firstWinCall: 7, maxWinners: 1, scaled: true });
    expect(capacityFor(settingsFor("fractions", "to-eighths"))).toMatchObject({ universe: 22, firstWinCall: 15, maxWinners: 1 });
    // Single-question classes (every fraction is one question) cannot be re-called: 28 % are kept out of the winner count.
    expect(capacityFor(settingsFor("fractions", "to-tenths")).maxWinners).toBe(2);
    expect(capacityFor(settingsFor("fractions", "to-twelfths")).maxWinners).toBe(3);
    // The class size: a level whose 14 early calls cover every early class has nearly everyone one away at
    // the first gate, so beyond a small class one call would finish several lines at once (single winner).
    expect(capacityFor(settingsFor("addition", "facts-20"), 10).maxWinners).toBe(2);
    expect(capacityFor(settingsFor("addition", "facts-20"), 20).maxWinners).toBe(1);
    expect(capacityFor(settingsFor("addition", "facts-20")).playersForMultipleWinners).toBeGreaterThanOrEqual(10);
    expect(capacityFor(settingsFor("addition", "facts-20")).playersForMultipleWinners).toBeLessThan(20);
    expect(capacityFor(settingsFor("addition", "within-50"), 50).maxWinners).toBeGreaterThanOrEqual(5);
    expect(capacityFor(settingsFor("fractions", "to-twelfths"), 50).maxWinners).toBe(3);
    expect(capacityFor(settingsFor("mixed", "core"), 40).maxWinners).toBe(3);
    expect(capacityFor(settingsFor("addition", "within-50")).playersForMultipleWinners).toBeNull();
    expect(oneAwayShare(11)).toBeCloseTo(0.6, 5);
    expect(oneAwayShare(30)).toBeLessThan(0.25);
    expect(capacityFor(settingsFor("addition", "facts-20")).maxWinners).toBe(2);
    expect(capacityFor(settingsFor("multiplication", "x0-12")).maxWinners).toBe(5);
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
    expect(pacingPayload(game.plan)).toMatchObject({ firstWinCall: 15, spacing: 10, maxWinners: 2 });
    const boards = dealPacedBoards(settings, game, SEED, [...ids.slice(0, 5), "not-a-uuid", ids[0]]);
    expect(Object.keys(boards)).toEqual(ids.slice(0, 5));
    const callable = universeClasses(game.universe).map(item => ({ c: item.key, n: item.questions }));
    const late = dealFor({ settings, seed: SEED, late: [...game.plan.late], callable }, ids[7]);
    expect(late).not.toBeNull();
    expect(isValidPacedBoard(late, { settings, late: game.plan.late, classes: classesFromCallable(callable) })).toBe(true);
    // Without the context (an older room) the pool deal still works; with neither, nothing.
    expect(dealFor({ settings, seed: SEED }, ids[7])).toBeNull();
  });

  it("passes pacing, ties and pending lines to the screens, never the late classes", () => {
    const record = {
      result: "ok", code: "482391", status: "open", phase: "QUESTION_ACTIVE", gameNumber: 1, settings: DEFAULT_SETTINGS, questionNumber: 11, deckLength: 60,
      serverNow: 1, phaseStartedAt: 1, phaseDeadline: null, questionStartedAt: 1, winners: [], winnerCount: 0, events: [], eventSeq: 0, completedReason: null, joinLocked: false, version: 3, expiresAt: 9, playerCount: 3, called: [],
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
    expect(host.pacing).toEqual({ firstWinCall: 15, spacing: 10, nextEligibleCall: 15, lastWinnerCall: null, maxWinners: 3, scaled: false, callsUntilOpportunity: 4, gateOpen: false });
    expect(host.leaderboard[0]).toMatchObject({ rank: 1, tied: true, bestLines: 1 });
    expect(host.leaderboard[2]).toMatchObject({ rank: 3, pending: true, bestLines: 2 });
    expect(host.players[0]).toMatchObject({ bestLines: 1, pending: false });
    expect(JSON.stringify(host)).not.toContain("late");
    const player = toPlayerState(record);
    expect(player.me).toMatchObject({ pendingLine: "column-2", bestLines: 2, rank: 3, tied: false });
    expect(player.pacing?.callsUntilOpportunity).toBe(4);
    expect(toHostState({ ...record, questionNumber: 15 }).pacing).toMatchObject({ gateOpen: true, callsUntilOpportunity: 0 });
    expect(toHostState({ ...record, questionNumber: 15, winnerCount: 3 }).pacing?.callsUntilOpportunity).toBeNull();
    expect(toHostState({ ...record, pacing: null }).pacing).toBeNull();
  });
});
