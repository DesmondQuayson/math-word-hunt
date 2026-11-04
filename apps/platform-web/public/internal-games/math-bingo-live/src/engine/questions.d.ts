import type { Fraction } from "./fractions.js";
import type { BingoModeId, BingoSettings } from "./settings.js";

export type BingoQuestion = Readonly<{
  key: string;
  kind: "arithmetic" | "fraction";
  op: "+" | "-" | "*" | "/" | "fraction";
  operands: readonly number[];
  text: string;
  spoken: string;
  answer: Fraction;
}>;

export type DeckQuestion = BingoQuestion & Readonly<{ number: number }>;

export const MINUS: string;
export const TIMES: string;
export const DIVIDE: string;
export const FRACTION_DENOMINATORS: Readonly<Record<string, readonly number[]>>;

export function factsFor(modeId: Exclude<BingoModeId, "fractions">, levelId: string): readonly BingoQuestion[];
export function fractionQuestion(value: Fraction): BingoQuestion;
export function answerMatches(settings: Pick<BingoSettings, "mode" | "equivalentFractions">, answer: Fraction, cellValue: unknown): boolean;
export function poolSize(settings: Pick<BingoSettings, "freeSpace">): number;
export function poolCandidates(settings: BingoSettings): Array<{ value: Fraction; maxCopies: number }>;
export function buildAnswerPool(settings: BingoSettings, seed: string): readonly Fraction[];
export function buildDeck(settings: BingoSettings, pool: readonly Fraction[], seed: string): readonly DeckQuestion[];
export function revealText(question: Pick<BingoQuestion, "kind" | "text" | "answer">): string;
export function modeLabel(settings: Pick<BingoSettings, "mode" | "level">): string;
