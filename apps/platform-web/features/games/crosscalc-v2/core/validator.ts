import { equationIsValid } from "./arithmetic";
import { solvePuzzle } from "./solver";
import type { CrossCalcPuzzle } from "./types";

export type PuzzleValidation = Readonly<{ valid: boolean; errors: readonly string[]; solutionCount: number }>;

export function validatePuzzle(puzzle: CrossCalcPuzzle): PuzzleValidation {
  const errors: string[] = [];
  if (puzzle.schemaVersion !== 2) errors.push("Unsupported schema version.");
  if (!puzzle.cells.length || !puzzle.equations.length) errors.push("Puzzle network is empty.");
  const cells = new Map(puzzle.cells.map((cell) => [cell.id, cell]));
  if (cells.size !== puzzle.cells.length) errors.push("Number cell identifiers are not unique.");
  const tileValues = puzzle.tiles.map((tile) => tile.value).sort((a, b) => a - b);
  const hiddenValues = puzzle.cells.filter((cell) => !cell.given).map((cell) => cell.solution).sort((a, b) => a - b);
  if (JSON.stringify(tileValues) !== JSON.stringify(hiddenValues)) errors.push("Tile multiset does not match hidden cells.");
  if (new Set(puzzle.tiles.map((tile) => tile.id)).size !== puzzle.tiles.length) errors.push("Tile instance identifiers are not unique.");
  for (const equation of puzzle.equations) {
    const operandCells = equation.operandCellIds.map((id) => cells.get(id));
    const resultCell = cells.get(equation.resultCellId);
    if (operandCells.some((cell) => !cell) || !resultCell) { errors.push(`${equation.id} references a missing number cell.`); continue; }
    if (!equationIsValid(operandCells.map((cell) => cell!.solution), equation.operators, resultCell.solution)) errors.push(`${equation.id} is mathematically invalid.`);
    if (equation.operators.length + 1 !== operandCells.length) errors.push(`${equation.id} has malformed expression structure.`);
    for (const cell of [...operandCells, resultCell]) if (!cell!.equationIds.includes(equation.id)) errors.push(`${equation.id} membership is inconsistent.`);
  }
  for (const cell of puzzle.cells) {
    if (!Number.isSafeInteger(cell.solution) || cell.solution < 0) errors.push(`${cell.id} is not a non-negative whole number.`);
    if (cell.row < 0 || cell.col < 0 || cell.row >= puzzle.height || cell.col >= puzzle.width) errors.push(`${cell.id} is outside the board.`);
    if (!cell.equationIds.length || cell.equationIds.length > 2) errors.push(`${cell.id} has invalid equation membership.`);
  }
  const solved = solvePuzzle(puzzle);
  if (solved.solutionCount !== 1) errors.push(`Independent solver found ${solved.solutionCount} solutions.`);
  if (solved.canonicalSolution) for (const cell of puzzle.cells.filter((item) => !item.given)) if (solved.canonicalSolution[cell.id] !== cell.solution) errors.push(`Independent solver disagrees at ${cell.id}.`);
  return Object.freeze({ valid: errors.length === 0, errors: Object.freeze(errors), solutionCount: solved.solutionCount });
}
