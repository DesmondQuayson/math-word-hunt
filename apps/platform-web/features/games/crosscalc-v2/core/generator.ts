import { evaluateExpression } from "./arithmetic";
import { SeededRandom } from "./random";
import { solvePuzzle } from "./solver";
import {
  OPERATIONS,
  coordinateKey,
  operationSymbol,
  type BoardToken,
  type CrossCalcPuzzle,
  type Difficulty,
  type GameMode,
  type NumberCell,
  type NumberTile,
  type Operation,
  type Orientation,
  type PuzzleEquation,
  type PuzzleMetrics
} from "./types";

type Config = Readonly<{ equations: number; multi: number; blanks: number }>;
const CONFIG: Record<Difficulty, Config> = {
  beginner: { equations: 4, multi: 0, blanks: 4 },
  easy: { equations: 6, multi: 0, blanks: 6 },
  medium: { equations: 5, multi: 5, blanks: 10 },
  hard: { equations: 7, multi: 7, blanks: 14 },
  expert: { equations: 9, multi: 9, blanks: 18 }
};
type MutableCell = { id: string; row: number; col: number; solution: number; equationIds: string[] };
type Direction = "right" | "left" | "down";
function operationsFor(mode: GameMode, count: number, offset: number): Operation[] {
  if (mode !== "mixed") {
    if (count === 1) return [mode];
    const inverse: Record<Exclude<GameMode, "mixed">, Operation> = { addition: "subtraction", subtraction: "addition", multiplication: "division", division: "multiplication" };
    return [mode, inverse[mode]];
  }
  return Array.from({ length: count }, (_, index) => OPERATIONS[(offset + index) % OPERATIONS.length]!);
}

function initialValue(mode: GameMode, random: SeededRandom): number {
  if (mode === "subtraction") return random.integer(180, 260);
  if (mode === "division") return 65_536;
  if (mode === "multiplication") return 1;
  return random.integer(8, 24);
}

function createExpression(start: number, operations: readonly Operation[], random: SeededRandom): { operands: number[]; result: number } | null {
  for (let attempt = 0; attempt < 180; attempt += 1) {
    const operands = [start];
    for (const operation of operations) {
      if (operation === "multiplication") operands.push(random.next() < 0.55 ? 1 : random.integer(2, 4));
      else if (operation === "division") operands.push(random.next() < 0.45 ? 1 : random.integer(2, 8));
      else if (operation === "subtraction") operands.push(random.integer(1, Math.max(2, Math.min(18, Math.floor(start / (operations.length + 1))))));
      else operands.push(random.integer(2, 18));
    }
    const result = evaluateExpression(operands, operations);
    if (result !== null && result > 0 && result <= 1_000_000) return { operands, result };
  }
  return null;
}

function offset(direction: Direction, distance: number): { row: number; col: number } {
  if (direction === "down") return { row: distance, col: 0 };
  return { row: 0, col: direction === "right" ? distance : -distance };
}

function buildCompleted(mode: GameMode, difficulty: Difficulty, seed: string, attempt: number) {
  const config = CONFIG[difficulty];
  const random = new SeededRandom(`${seed}:${mode}:${difficulty}:solution-${attempt}`);
  const cells = new Map<string, MutableCell>();
  const tokens: BoardToken[] = [];
  const equations: PuzzleEquation[] = [];
  let nextCell = 1;
  let cursor = { row: 0, col: 0 };
  let sharedId = "n1";
  let sharedValue = initialValue(mode, random);
  cells.set(sharedId, { id: sharedId, ...cursor, solution: sharedValue, equationIds: [] });
  const multiStart = config.equations - config.multi;

  for (let equationIndex = 0; equationIndex < config.equations; equationIndex += 1) {
    const isMulti = equationIndex >= multiStart;
    const operationCount = isMulti ? 2 : 1;
    const operations = operationsFor(mode, operationCount, equationIndex);
    const expression = createExpression(sharedValue, operations, random);
    if (!expression) return null;
    const direction: Direction = equationIndex % 2 === 0 ? (Math.floor(equationIndex / 2) % 2 === 0 ? "right" : "left") : "down";
    const orientation: Orientation = direction === "down" ? "down" : "across";
    const equationId = `eq-${equationIndex + 1}`;
    const operandCellIds = [sharedId];
    const equationTokenKeys: string[] = [];
    const pathLength = operationCount * 2 + 2;
    const positions = Array.from({ length: pathLength + 1 }, (_, index) => {
      const delta = offset(direction, index);
      return { row: cursor.row + delta.row, col: cursor.col + delta.col };
    });

    const addNumberToken = (pathIndex: number, cellId: string) => {
      const position = positions[pathIndex]!;
      const key = coordinateKey(position);
      tokens.push({ key, ...position, kind: "number", cellId, equationId });
      equationTokenKeys.push(key);
    };
    addNumberToken(0, sharedId);
    cells.get(sharedId)!.equationIds.push(equationId);
    for (let operationIndex = 0; operationIndex < operationCount; operationIndex += 1) {
      const symbolPosition = positions[operationIndex * 2 + 1]!;
      const symbolKey = coordinateKey(symbolPosition);
      tokens.push({ key: symbolKey, ...symbolPosition, kind: "operator", symbol: operationSymbol(operations[operationIndex]!), equationId });
      equationTokenKeys.push(symbolKey);
      nextCell += 1;
      const id = `n${nextCell}`;
      const numberPosition = positions[operationIndex * 2 + 2]!;
      cells.set(id, { id, ...numberPosition, solution: expression.operands[operationIndex + 1]!, equationIds: [equationId] });
      addNumberToken(operationIndex * 2 + 2, id);
      operandCellIds.push(id);
    }
    const equalsPosition = positions[pathLength - 1]!;
    const equalsKey = coordinateKey(equalsPosition);
    tokens.push({ key: equalsKey, ...equalsPosition, kind: "equals", symbol: "=", equationId });
    equationTokenKeys.push(equalsKey);
    nextCell += 1;
    const resultId = `n${nextCell}`;
    const resultPosition = positions[pathLength]!;
    cells.set(resultId, { id: resultId, ...resultPosition, solution: expression.result, equationIds: [equationId] });
    addNumberToken(pathLength, resultId);
    equations.push(Object.freeze({ id: equationId, orientation, operandCellIds: Object.freeze(operandCellIds), operators: Object.freeze([...operations]), resultCellId: resultId, tokenKeys: Object.freeze(equationTokenKeys) }));
    cursor = resultPosition;
    sharedId = resultId;
    sharedValue = expression.result;
  }
  return { cells: [...cells.values()], tokens, equations, random };
}

function normalize(cells: readonly MutableCell[], tokens: readonly BoardToken[]) {
  const minRow = Math.min(...tokens.map((token) => token.row));
  const minCol = Math.min(...tokens.map((token) => token.col));
  const shift = <T extends { row: number; col: number }>(item: T) => ({ ...item, row: item.row - minRow, col: item.col - minCol });
  const tokenMap = new Map<string, BoardToken>();
  for (const token of tokens) {
    const shifted = shift(token);
    const key = coordinateKey(shifted);
    if (!tokenMap.has(key)) tokenMap.set(key, Object.freeze({ ...shifted, key }));
  }
  const shiftedTokens = [...tokenMap.values()];
  const shiftedCells = cells.map((cell) => shift(cell));
  return {
    cells: shiftedCells,
    tokens: shiftedTokens,
    width: Math.max(...shiftedTokens.map((token) => token.col)) + 1,
    height: Math.max(...shiftedTokens.map((token) => token.row)) + 1
  };
}

function chooseGivens(cells: readonly MutableCell[], equations: readonly PuzzleEquation[], blankCount: number, random: SeededRandom, variant: number): Set<string> {
  const givenCount = cells.length - blankCount;
  const givens = new Set<string>();
  givens.add(cells[0]!.id);
  const equationOrder = equations;
  for (const equation of equationOrder) {
    if (givens.size >= givenCount) break;
    const anchors = equation.operandCellIds.slice(1);
    const ids = [...anchors, equation.resultCellId, equation.operandCellIds[0]!];
    const picked = ids[variant % Math.max(1, anchors.length)]!;
    givens.add(picked);
  }
  for (const cell of random.shuffle(cells)) { if (givens.size >= givenCount) break; givens.add(cell.id); }
  return givens;
}

export function generatePuzzle(mode: GameMode, difficulty: Difficulty, seed: string): CrossCalcPuzzle {
  let uniquenessRejections = 0;
  for (let generationAttempt = 0; generationAttempt < 40; generationAttempt += 1) {
    const completed = buildCompleted(mode, difficulty, seed, generationAttempt);
    if (!completed) continue;
    const normalized = normalize(completed.cells, completed.tokens);
    for (let variant = 0; variant < 18; variant += 1) {
      const givens = chooseGivens(normalized.cells, completed.equations, CONFIG[difficulty].blanks, completed.random, variant);
      const cells: NumberCell[] = normalized.cells.map((cell) => Object.freeze({ ...cell, equationIds: Object.freeze([...cell.equationIds]), given: givens.has(cell.id) }));
      const tiles: NumberTile[] = completed.random.shuffle(cells.filter((cell) => !cell.given).map((cell, index) => Object.freeze({ id: `tile-${index + 1}`, value: cell.solution })));
      const partial = { cells, equations: completed.equations, tiles };
      const solved = solvePuzzle(partial);
      if (solved.solutionCount !== 1) { uniquenessRejections += 1; continue; }
      const operationDistribution = Object.fromEntries(OPERATIONS.map((operation) => [operation, completed.equations.reduce((sum, equation) => sum + equation.operators.filter((item) => item === operation).length, 0)])) as Record<Operation, number>;
      const metrics: PuzzleMetrics = Object.freeze({
        ...solved.metrics,
        equationCount: completed.equations.length,
        numberCellCount: cells.length,
        blankCount: tiles.length,
        givenCount: givens.size,
        intersectionCount: cells.filter((cell) => cell.equationIds.length > 1).length,
        multiOperationCount: completed.equations.filter((equation) => equation.operators.length > 1).length,
        operationDistribution: Object.freeze(operationDistribution),
        solutionCount: 1,
        generationAttempts: generationAttempt + 1,
        uniquenessRejections
      });
      return Object.freeze({
        schemaVersion: 2,
        gameVersion: "0.2.0",
        id: `crosscalc-v2:${mode}:${difficulty}:${seed}`,
        seed,
        mode,
        difficulty,
        width: normalized.width,
        height: normalized.height,
        cells: Object.freeze(cells),
        tokens: Object.freeze(normalized.tokens),
        equations: Object.freeze(completed.equations),
        tiles: Object.freeze(tiles),
        metrics
      });
    }
  }
  throw new Error(`Unable to generate a unique V2 puzzle: mode=${mode} difficulty=${difficulty} seed=${seed}; uniquenessRejections=${uniquenessRejections}`);
}
