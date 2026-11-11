import type { CardCell } from "./board.js";
import type { Fraction } from "./fractions.js";
import type { BingoSettings } from "./settings.js";

export type UniverseQuestion = Readonly<{ id: string; class: string; text: string; spoken: string; kind: "arithmetic" | "fraction"; n: number; d: number }>;
export type UniverseClass = Readonly<{ key: string; value: Fraction; questions: number }>;
export type PacingPlan = Readonly<{ firstGateWindow: readonly [number, number]; scaled: boolean; universe: number; classes: number; late: readonly string[]; reserve: readonly string[]; early: readonly string[] }>;

export const PACING: Readonly<{ firstGateCalls: readonly number[]; winnerGapCalls: readonly number[]; questionsPerClass: number; lateShare: number; reserveShare: number; lateCells: number; maxCopies: number }>;
export const COVERAGE_TARGETS: Readonly<{ zero: number; single: number; limited: number; broad: number }>;

export function buildUniverse(settings: BingoSettings, seed?: string | null): readonly UniverseQuestion[];
export function universeClasses(universe: readonly UniverseQuestion[]): UniverseClass[];
export function firstGateWindow(universeSize: number): readonly [number, number];
export function pacingPlan(settings: BingoSettings, universe: readonly UniverseQuestion[], seed: string): PacingPlan;
export function cellClass(settings: Pick<BingoSettings, "mode" | "equivalentFractions">, cell: Fraction): string;
export function dealPacedBoard(input: Readonly<{ settings: BingoSettings; classes: readonly UniverseClass[]; late: readonly string[]; seed: string; participantId: string; usage?: Map<string, number> | null }>): readonly CardCell[] | null;
export function isValidPacedBoard(board: unknown, context: Readonly<{ settings: BingoSettings; late: readonly string[]; classes: readonly UniverseClass[] }>): boolean;
export function classesFromCallable(callable: readonly unknown[]): UniverseClass[];
