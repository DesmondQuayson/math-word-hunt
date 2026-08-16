export const OPERATIONS = ["addition", "subtraction", "multiplication", "division"] as const;
export const MODES = [...OPERATIONS, "mixed"] as const;
export const DIFFICULTIES = ["beginner", "easy", "medium", "hard", "expert"] as const;
export const FEEDBACK_MODES = ["guided", "challenge", "expert"] as const;

export type Operation = (typeof OPERATIONS)[number];
export type GameMode = (typeof MODES)[number];
export type Difficulty = (typeof DIFFICULTIES)[number];
export type FeedbackMode = (typeof FEEDBACK_MODES)[number];
export type Orientation = "across" | "down";
export type Coordinate = Readonly<{ row: number; col: number }>;
export type NumberCell = Readonly<{ id: string; row: number; col: number; given: boolean; solution: number; equationIds: readonly string[] }>;
export type NumberTile = Readonly<{ id: string; value: number }>;
export type BoardToken = Readonly<{ key: string; row: number; col: number; kind: "number" | "operator" | "equals"; cellId?: string; symbol?: string; equationId: string }>;
export type PuzzleEquation = Readonly<{ id: string; orientation: Orientation; operandCellIds: readonly string[]; operators: readonly Operation[]; resultCellId: string; tokenKeys: readonly string[] }>;
export type SolverMetrics = Readonly<{ nodesExplored: number; forcedDeductions: number; branchCount: number; maximumCandidateDomain: number; averageCandidateDomain: number; dependencyDepth: number }>;
export type PuzzleMetrics = SolverMetrics & Readonly<{ equationCount: number; numberCellCount: number; blankCount: number; givenCount: number; intersectionCount: number; multiOperationCount: number; operationDistribution: Readonly<Record<Operation, number>>; solutionCount: number; generationAttempts: number; uniquenessRejections: number }>;
export type CrossCalcPuzzle = Readonly<{ schemaVersion: 2; gameVersion: "0.2.0"; id: string; seed: string; mode: GameMode; difficulty: Difficulty; width: number; height: number; cells: readonly NumberCell[]; tokens: readonly BoardToken[]; equations: readonly PuzzleEquation[]; tiles: readonly NumberTile[]; metrics: PuzzleMetrics }>;

export function coordinateKey({ row, col }: Coordinate): string { return `${row}:${col}`; }
export function operationSymbol(operation: Operation): string { return ({ addition: "+", subtraction: "−", multiplication: "×", division: "÷" } as const)[operation]; }
export function equationText(equation: PuzzleEquation, values: ReadonlyMap<string, number | null>): string {
  const parts: string[] = [];
  equation.operandCellIds.forEach((id, index) => { parts.push(String(values.get(id) ?? "blank")); if (index < equation.operators.length) parts.push(operationSymbol(equation.operators[index]!)); });
  parts.push("=", String(values.get(equation.resultCellId) ?? "blank"));
  return parts.join(" ");
}
