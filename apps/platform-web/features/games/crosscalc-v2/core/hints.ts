import { operationSymbol, type CrossCalcPuzzle } from "./types";
import { valueMap, type SessionState } from "./session";
export type Hint = Readonly<{ tier: 1 | 2 | 3 | 4; cellId: string; equationId: string; message: string; candidates?: readonly number[] }>;
export function nextHint(puzzle: CrossCalcPuzzle, state: SessionState, tier: 1 | 2 | 3 | 4): Hint {
  const values = valueMap(state, puzzle);
  const target = puzzle.cells.find((cell) => !cell.given && values.get(cell.id) !== cell.solution) ?? puzzle.cells.find((cell) => !cell.given)!;
  const equation = puzzle.equations.find((item) => target.equationIds.includes(item.id))!;
  const available = puzzle.tiles.filter((tile) => !Object.values(state.placements).includes(tile.id)).map((tile) => tile.value);
  const candidates = [...new Set([target.solution, ...available.filter((value) => value !== target.solution).slice(0, 1)])].sort((a, b) => a - b);
  if (tier === 1) return { tier, cellId: target.id, equationId: equation.id, message: `Focus on the ${equation.orientation} equation glowing on the board.` };
  if (tier === 2) return { tier, cellId: target.id, equationId: equation.id, message: `Use ${equation.operators.map(operationSymbol).join(" then ")} and the shared number to narrow this cell.` };
  if (tier === 3) return { tier, cellId: target.id, equationId: equation.id, candidates, message: `Only ${candidates.join(" or ")} fits the connected constraints.` };
  return { tier, cellId: target.id, equationId: equation.id, message: `Place ${target.solution} in the highlighted cell.` };
}
