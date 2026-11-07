import type { CardCell } from "./board.js";
import type { Fraction } from "./fractions.js";
import type { BingoSettings } from "./settings.js";

export type UniverseQuestion = Readonly<{ id: string; class: string; text: string; spoken: string; kind: "arithmetic" | "fraction"; n: number; d: number }>;
export type UniverseClass = Readonly<{ key: string; value: Fraction; questions: number }>;
export type PacingNumbers = Readonly<{ firstWinCall: number; spacing: number; buffer: number; maxWinnersByQuestions: number; scaled: boolean }>;
export type PacingPlan = PacingNumbers & Readonly<{ universe: number; classes: number; players: number | null; maxWinners: number; late: readonly string[]; reserve: readonly string[]; early: readonly string[] }>;
export type Capacity = PacingNumbers & Readonly<{ universe: number; classes: number; singles: number; players: number | null; maxWinners: number; maxWinnersAnyClass: number; playersForMultipleWinners: number | null }>;
export type WinnerBounds = Readonly<{ singles?: number; early?: number | null; late?: number | null; players?: number | null }>;

export const PACING: Readonly<{ firstWinCall: number; spacing: number; buffer: number; questionsPerClass: number; lateShare: number; reserveShare: number; lateCells: number; maxCopies: number }>;
export const COVERAGE_TARGETS: Readonly<{ zero: number; single: number; limited: number; broad: number }>;

export function buildUniverse(settings: BingoSettings, seed?: string | null): readonly UniverseQuestion[];
export function universeClasses(universe: readonly UniverseQuestion[]): UniverseClass[];
export function pacingNumbers(universeSize: number, singleQuestionClasses?: number): PacingNumbers;
export function oneAwayShare(earlyClasses: number): number;
export function nominalSplit(classCount: number): Readonly<{ late: number; reserve: number; early: number }>;
export function maxWinnersFor(universeSize: number, classCount: number, bounds?: WinnerBounds): number;
export function playersForMultipleWinners(classCount: number): number | null;
export function requiredCalls(numbers: PacingNumbers, winners: number): number;
export function capacityFor(settings: BingoSettings, players?: number | null): Capacity;
export function pacingPlan(settings: BingoSettings, universe: readonly UniverseQuestion[], seed: string, players?: number | null): PacingPlan;
export function cellClass(settings: Pick<BingoSettings, "mode" | "equivalentFractions">, cell: Fraction): string;
export function dealPacedBoard(input: Readonly<{ settings: BingoSettings; classes: readonly UniverseClass[]; late: readonly string[]; seed: string; participantId: string; usage?: Map<string, number> | null }>): readonly CardCell[] | null;
export function isValidPacedBoard(board: unknown, context: Readonly<{ settings: BingoSettings; late: readonly string[]; classes: readonly UniverseClass[] }>): boolean;
export function classesFromCallable(callable: readonly unknown[]): UniverseClass[];
