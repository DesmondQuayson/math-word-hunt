// @vitest-environment jsdom

import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { evaluateExpression } from "@/features/games/crosscalc-v2/core/arithmetic";
import { generatePuzzle } from "@/features/games/crosscalc-v2/core/generator";
import { createResultRecord, loadSession, recordResult, RESULTS_KEY, saveSession, SESSION_KEY } from "@/features/games/crosscalc-v2/core/progress";
import { calculateReasoningIndex } from "@/features/games/crosscalc-v2/core/reasoning";
import { checkBoard, createSession, placeTile, redo, removeTile, undo } from "@/features/games/crosscalc-v2/core/session";
import { solvePuzzle } from "@/features/games/crosscalc-v2/core/solver";
import { DIFFICULTIES, MODES } from "@/features/games/crosscalc-v2/core/types";
import { validatePuzzle } from "@/features/games/crosscalc-v2/core/validator";

const APPROVED_PARITY = Object.freeze({
  "matrix-mixed-beginner": "ac4b84e23077d053807f8b7fdb01f173df2d71ea7c8562a2c77e7a52b7be803a",
  "owner-medium-2026": "a20282dae041f180912576cd48d54e8f1d1f8d9751a7fe39242a624890038a17",
  "matrix-mixed-expert": "5a3439c47fdacab2c0897f46564cccfa9fd761ff8ce71f1e20c696cf45493a4d"
});

function parityDigest(seed: keyof typeof APPROVED_PARITY, difficulty: "beginner" | "medium" | "expert") {
  const puzzle = generatePuzzle("mixed", difficulty, seed);
  const stable = {
    width: puzzle.width,
    height: puzzle.height,
    cells: puzzle.cells,
    equations: puzzle.equations,
    tiles: puzzle.tiles,
    canonical: puzzle.cells.map((cell) => [cell.id, cell.solution]),
    solutionCount: solvePuzzle(puzzle).solutionCount,
    metrics: puzzle.metrics
  };
  return createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

describe("CrossCalc V2 approved native core", () => {
  it("matches the three approved deterministic parity fixtures exactly", () => {
    expect(parityDigest("matrix-mixed-beginner", "beginner")).toBe(APPROVED_PARITY["matrix-mixed-beginner"]);
    expect(parityDigest("owner-medium-2026", "medium")).toBe(APPROVED_PARITY["owner-medium-2026"]);
    expect(parityDigest("matrix-mixed-expert", "expert")).toBe(APPROVED_PARITY["matrix-mixed-expert"]);
  }, 60_000);

  it("independently validates 2,500 integrated puzzles across all 25 mode/difficulty combinations", () => {
    let verified = 0;
    for (const mode of MODES) {
      for (const difficulty of DIFFICULTIES) {
        for (let index = 0; index < 100; index += 1) {
          const seed = `native-rc-${mode}-${difficulty}-${index}`;
          const first = generatePuzzle(mode, difficulty, seed);
          const second = generatePuzzle(mode, difficulty, seed);
          expect(second).toEqual(first);
          expect(validatePuzzle(first)).toMatchObject({ valid: true, solutionCount: 1 });
          expect(solvePuzzle(first).solutionCount).toBe(1);
          expect(first.tiles).toHaveLength(first.metrics.blankCount);
          expect(first.cells.filter((cell) => !cell.given).map((cell) => cell.solution).sort((a, b) => a - b))
            .toEqual(first.tiles.map((tile) => tile.value).sort((a, b) => a - b));
          verified += 1;
        }
      }
    }
    expect(verified).toBe(2_500);
  }, 300_000);

  it("uses precedence, exact division, and distinct duplicate-value inventory instances", () => {
    expect(evaluateExpression([8, 4, 3], ["addition", "multiplication"])).toBe(20);
    expect(evaluateExpression([24, 6, 5], ["division", "addition"])).toBe(9);
    expect(evaluateExpression([18, 5, 2], ["subtraction", "multiplication"])).toBe(8);
    expect(evaluateExpression([10, 4], ["division"])).toBeNull();
    const puzzle = generatePuzzle("multiplication", "expert", "duplicate-inventory");
    const groups = new Map<number, string[]>();
    for (const tile of puzzle.tiles) groups.set(tile.value, [...(groups.get(tile.value) ?? []), tile.id]);
    expect([...groups.values()].some((ids) => ids.length > 1)).toBe(true);
    expect(new Set(puzzle.tiles.map((tile) => tile.id)).size).toBe(puzzle.tiles.length);
  });

  it("preserves discrete place/move/swap/return/undo/redo behavior and deduction-first checks", () => {
    const puzzle = generatePuzzle("mixed", "beginner", "native-session-actions");
    const [a, b] = puzzle.cells.filter((cell) => !cell.given);
    const [x, y] = puzzle.tiles;
    let state = createSession(puzzle, 0);
    state = placeTile(state, puzzle, a!.id, x!.id);
    state = placeTile(state, puzzle, b!.id, y!.id);
    state = placeTile(state, puzzle, a!.id, y!.id);
    expect(state.placements[a!.id]).toBe(y!.id);
    expect(state.placements[b!.id]).toBe(x!.id);
    state = undo(state);
    expect(state.placements[a!.id]).toBe(x!.id);
    state = redo(state);
    expect(state.placements[a!.id]).toBe(y!.id);
    state = removeTile(state, a!.id);
    expect(state.placements[a!.id]).toBeUndefined();

    const feedbackPuzzle = generatePuzzle("addition", "beginner", "native-check-feedback");
    const cell = feedbackPuzzle.cells.find((item) => !item.given)!;
    const wrong = feedbackPuzzle.tiles.find((tile) => tile.value !== cell.solution)!;
    const checked = checkBoard(placeTile(createSession(feedbackPuzzle, 0), feedbackPuzzle, cell.id, wrong.id), feedbackPuzzle, 1_000);
    expect(checked.metrics.checks).toBe(1);
    expect(checked.completedAt).toBeNull();
  });

  it("keeps V2 storage isolated and records the complete provenance/result contract once", () => {
    localStorage.clear();
    const puzzle = generatePuzzle("mixed", "beginner", "native-result-contract");
    const session = { ...createSession(puzzle, 10), completedAt: 1_000 };
    saveSession(localStorage, puzzle, session);
    expect(SESSION_KEY).toBe("mathnexa.crosscalc.v2.active");
    expect(RESULTS_KEY).toBe("mathnexa.crosscalc.v2.results");
    expect(loadSession(localStorage)?.session.puzzleId).toBe(puzzle.id);
    const score = calculateReasoningIndex(puzzle, session.metrics);
    const result = createResultRecord(puzzle, session, score);
    recordResult(localStorage, result);
    recordResult(localStorage, result);
    expect(JSON.parse(localStorage.getItem(RESULTS_KEY)!)).toHaveLength(1);
    expect(result).toMatchObject({
      schema: "crosscalc-result/2",
      game: "crosscalc",
      gameVersion: "0.2.0",
      mechanic: "number-placement",
      seed: puzzle.seed,
      mode: "mixed",
      difficulty: "beginner",
      completionValid: true,
      components: score,
      attemptEvidence: session.metrics
    });
  });
});
