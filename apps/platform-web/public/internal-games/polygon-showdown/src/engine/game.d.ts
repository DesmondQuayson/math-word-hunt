export type Move = [number, number, number];

export type GameConfig = Readonly<{ rules: number; cols: number; rows: number; kinds: readonly number[]; advancedKinds?: readonly number[]; boardTarget?: Readonly<{ min: number; max: number; attempts: number }> | null }>;
export type GameSchedule = Readonly<{ afterMatches?: number; afterMs?: number }>;

export type GameState = {
  rules: number;
  schedule?: GameSchedule;
  board: string;
  cursors: number[];
  reshuffles: number;
  moves: number;
  coins: number;
  score: number;
  matches: number;
  cascades: number;
  largestClear: number;
  bestCombo: number;
  cleared: number;
};

export type MatchGroup = Readonly<{ kind: number; cells: readonly number[]; size: number; horizontal: boolean; vertical: boolean; coins: number; score: number }>;
export type ResolveStep = Readonly<{
  chain: number;
  groups: readonly MatchGroup[];
  cleared: readonly number[];
  coins: number;
  score: number;
  falls: readonly Readonly<{ from: number; to: number }>[];
  spawns: readonly Readonly<{ to: number; kind: number; drop: number }>[];
}>;
export type SwapResult =
  | Readonly<{ ok: false; reason: string }>
  | Readonly<{ ok: true; chain: number; coins: number; score: number; steps: readonly ResolveStep[]; reshuffled: string | null; state: GameState }>;

export type RefillAt = (col: number, index: number) => number;
export type RefillStream = Readonly<{ at: RefillAt }>;

export const CONFIG: GameConfig;
export const SCHEDULES: Readonly<{ solo: GameSchedule; standard: GameSchedule; challenge: GameSchedule }>;
export function pentagonIsActive(state: GameState, t?: number): boolean;
export const CELL_COUNT: number;
export const WINDOW_SIZE: number;
export function createRefillStream(seed: string, config?: GameConfig): RefillStream;
export function startingBoard(seed: string, config?: GameConfig, kinds?: readonly number[]): number[];
export function encodeBoard(board: readonly number[]): string;
export function decodeBoard(text: string): number[];
export function isBoardText(text: unknown, config?: GameConfig): boolean;
export function newGameState(boardText: string, config?: GameConfig, schedule?: GameSchedule | null): GameState;
export function isGameState(value: unknown, config?: GameConfig): value is GameState;
export function stateHash(state: GameState): number;
export function applySwap(state: GameState, a: number, b: number, refillAt: RefillAt, config?: GameConfig, t?: number): SwapResult;
export function replayMoves(
  state: GameState,
  moves: readonly Move[],
  refillAt: RefillAt,
  limits: Readonly<{ nextT: number; nowT: number; maxT?: number }>,
  config?: GameConfig
): Readonly<{ state: GameState; accepted: number; nextT: number; rejected: Readonly<{ index: number; reason: string }> | null }>;
export function refillWindow(stream: RefillStream, cursors: readonly number[], size?: number): string[];
export function createKnownRefills(config?: GameConfig): Readonly<{
  merge(cursors: readonly number[], windows: readonly string[]): void;
  at: RefillAt;
  trim(cursors: readonly number[]): void;
  remaining(cursors: readonly number[]): number;
}>;
export function findMatches(board: readonly number[], cols: number, rows: number): ReadonlyArray<Readonly<{ kind: number; cells: readonly number[]; size: number; horizontal: boolean; vertical: boolean }>>;
export function findLegalMove(board: number[], cols: number, rows: number): [number, number] | null;
export function allLegalMoves(board: number[], cols: number, rows: number): [number, number][];
export function columnOfCell(cell: number, config?: GameConfig): number;
