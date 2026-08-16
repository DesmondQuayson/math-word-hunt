import { equationIsValid } from "./arithmetic";
import type { CrossCalcPuzzle, PuzzleEquation } from "./types";

export type PlacementMap = Readonly<Record<string, string>>;
export type SessionMetrics = Readonly<{ moves: number; swaps: number; checks: number; incorrectChecks: number; hintsUsed: number; maxHintTier: number; undos: number; restarts: number; elapsedSeconds: number }>;
export type SessionState = Readonly<{ schemaVersion: 2; puzzleId: string; placements: PlacementMap; history: readonly PlacementMap[]; future: readonly PlacementMap[]; metrics: SessionMetrics; startedAt: number; completedAt: number | null }>;
export type EquationState = "incomplete" | "valid" | "invalid";
const EMPTY_METRICS: SessionMetrics = { moves: 0, swaps: 0, checks: 0, incorrectChecks: 0, hintsUsed: 0, maxHintTier: 0, undos: 0, restarts: 0, elapsedSeconds: 0 };

export function createSession(puzzle: CrossCalcPuzzle, now = Date.now()): SessionState { return Object.freeze({ schemaVersion: 2, puzzleId: puzzle.id, placements: Object.freeze({}), history: Object.freeze([]), future: Object.freeze([]), metrics: Object.freeze({ ...EMPTY_METRICS }), startedAt: now, completedAt: null }); }
function push(state: SessionState, placements: PlacementMap, metricPatch: Partial<SessionMetrics>): SessionState { return Object.freeze({ ...state, placements: Object.freeze(placements), history: Object.freeze([...state.history, state.placements]), future: Object.freeze([]), metrics: Object.freeze({ ...state.metrics, ...metricPatch }) }); }

export function placeTile(state: SessionState, puzzle: CrossCalcPuzzle, cellId: string, tileId: string): SessionState {
  const cell = puzzle.cells.find((item) => item.id === cellId); const tile = puzzle.tiles.find((item) => item.id === tileId);
  if (!cell || cell.given || !tile || state.completedAt) return state;
  const next = { ...state.placements };
  const sourceCell = Object.keys(next).find((id) => next[id] === tileId);
  const displaced = next[cellId];
  if (sourceCell) delete next[sourceCell];
  if (displaced && sourceCell) next[sourceCell] = displaced;
  else if (displaced) delete next[cellId];
  next[cellId] = tileId;
  return push(state, next, { moves: state.metrics.moves + 1, swaps: state.metrics.swaps + (displaced ? 1 : 0) });
}
export function removeTile(state: SessionState, cellId: string): SessionState { if (!state.placements[cellId] || state.completedAt) return state; const next = { ...state.placements }; delete next[cellId]; return push(state, next, { moves: state.metrics.moves + 1 }); }
export function undo(state: SessionState): SessionState { const previous = state.history.at(-1); if (!previous || state.completedAt) return state; return Object.freeze({ ...state, placements: previous, history: Object.freeze(state.history.slice(0, -1)), future: Object.freeze([state.placements, ...state.future]), metrics: Object.freeze({ ...state.metrics, undos: state.metrics.undos + 1 }) }); }
export function redo(state: SessionState): SessionState { const next = state.future[0]; if (!next || state.completedAt) return state; return Object.freeze({ ...state, placements: next, history: Object.freeze([...state.history, state.placements]), future: Object.freeze(state.future.slice(1)) }); }
export function restart(state: SessionState, now = Date.now()): SessionState { return Object.freeze({ ...createSession({ id: state.puzzleId } as CrossCalcPuzzle, now), metrics: Object.freeze({ ...state.metrics, restarts: state.metrics.restarts + 1 }), startedAt: state.startedAt }); }
export function valueMap(state: SessionState, puzzle: CrossCalcPuzzle): Map<string, number> { const values = new Map<string, number>(); for (const cell of puzzle.cells) if (cell.given) values.set(cell.id, cell.solution); for (const [cellId, tileId] of Object.entries(state.placements)) { const tile = puzzle.tiles.find((item) => item.id === tileId); if (tile) values.set(cellId, tile.value); } return values; }
export function equationState(equation: PuzzleEquation, values: ReadonlyMap<string, number>): EquationState { const operands = equation.operandCellIds.map((id) => values.get(id)); const result = values.get(equation.resultCellId); if (result === undefined || operands.some((value) => value === undefined)) return "incomplete"; return equationIsValid(operands as number[], equation.operators, result) ? "valid" : "invalid"; }
export function isComplete(state: SessionState, puzzle: CrossCalcPuzzle): boolean { const values = valueMap(state, puzzle); return puzzle.cells.every((cell) => values.get(cell.id) === cell.solution) && puzzle.equations.every((equation) => equationState(equation, values) === "valid"); }
export function checkBoard(state: SessionState, puzzle: CrossCalcPuzzle, now = Date.now()): SessionState { const values = valueMap(state, puzzle); const solved = isComplete(state, puzzle); const hasFailure = puzzle.equations.some((equation) => equationState(equation, values) === "invalid") || (Object.keys(state.placements).length === puzzle.tiles.length && !solved); return Object.freeze({ ...state, completedAt: solved ? now : null, metrics: Object.freeze({ ...state.metrics, checks: state.metrics.checks + 1, incorrectChecks: state.metrics.incorrectChecks + (hasFailure ? 1 : 0), elapsedSeconds: Math.max(state.metrics.elapsedSeconds, Math.floor((now - state.startedAt) / 1000)) }) }); }
export function revealCell(state: SessionState, puzzle: CrossCalcPuzzle, cellId: string, tier = 4): SessionState { const cell = puzzle.cells.find((item) => item.id === cellId); if (!cell || cell.given) return state; const tile = puzzle.tiles.find((item) => item.value === cell.solution && !Object.values(state.placements).includes(item.id)); if (!tile) return state; const next = placeTile(state, puzzle, cellId, tile.id); return Object.freeze({ ...next, metrics: Object.freeze({ ...next.metrics, hintsUsed: state.metrics.hintsUsed + 1, maxHintTier: Math.max(state.metrics.maxHintTier, tier) }) }); }
export function recordHint(state: SessionState, tier: number): SessionState { return Object.freeze({ ...state, metrics: Object.freeze({ ...state.metrics, hintsUsed: state.metrics.hintsUsed + 1, maxHintTier: Math.max(state.metrics.maxHintTier, tier) }) }); }
