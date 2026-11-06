import type { FractionShape } from "./fractions.js";
import type { BingoPatterns } from "./settings.js";

export type LineType = "row" | "column" | "diagonal";
export type BingoLine = Readonly<{ id: string; type: LineType; label: string; cells: readonly number[]; mask: number }>;
export type CardCell = Readonly<{ free: true }> | Readonly<{ n: number; d: number; shape?: FractionShape; free?: undefined }>;

export const SIZE: number;
export const CELL_COUNT: number;
export const CENTER: number;
export const HEADER: readonly string[];
export const LINES: readonly BingoLine[];
export const LINE_TYPE_OF_PATTERN: Readonly<Record<keyof BingoPatterns, LineType>>;

export function enabledLines(patterns: BingoPatterns): BingoLine[];
export function popcount(mask: number): number;
export function completedLines(mask: number, patterns: BingoPatterns): BingoLine[];
export function bestLine(mask: number, patterns: BingoPatterns): Readonly<{ id: string; type: LineType; count: number }> | null;
export function dealCard(input: Readonly<{
  pool: readonly Readonly<{ n: number; d: number }>[];
  seed: string;
  participantId: string;
  freeSpace: boolean;
  fractions: boolean;
  classOf?: ((value: Readonly<{ n: number; d: number }>) => string) | null;
  lineLimit?: ((value: Readonly<{ n: number; d: number }>) => number) | null;
}>): readonly CardCell[];
export function maxCopiesInLine(card: readonly CardCell[], classOf: (value: Readonly<{ n: number; d: number }>) => string): number;
export function cardSignature(card: readonly CardCell[]): string;
export function isValidCard(card: unknown, freeSpace: boolean): boolean;
