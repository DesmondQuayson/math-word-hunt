import type { Fraction } from "./fractions.js";
import type { BingoModeId, BingoSettings } from "./settings.js";

export type BingoQuestion = Readonly<{
  /** Canonical identity: "addition:5:7" (both orders), "subtraction:14:6", "fraction:2:3". */
  id: string;
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

export type QuestionGroup = Readonly<{ id: string; forms: readonly BingoQuestion[] }>;
export type DealRules = Readonly<{
  fractions: boolean;
  freeSpace: boolean;
  classOf?: (value: Fraction) => string;
  lineLimit?: (value: Fraction) => number;
}>;

export function questionId(op: BingoQuestion["op"], a: number, b: number): string;
export function questionGroups(settings: BingoSettings, value: Fraction): readonly QuestionGroup[];
export function uniqueQuestionCount(settings: BingoSettings, value: Fraction): number;
export function answerClass(settings: Pick<BingoSettings, "mode" | "equivalentFractions">, value: Fraction): string;
export function dealRules(settings: BingoSettings): DealRules;
export function factsFor(modeId: Exclude<BingoModeId, "fractions">, levelId: string): readonly BingoQuestion[];
export function fractionQuestion(value: Fraction): BingoQuestion;
export function answerMatches(settings: Pick<BingoSettings, "mode" | "equivalentFractions">, answer: Fraction, cellValue: unknown): boolean;
export function poolSize(settings: Pick<BingoSettings, "freeSpace">): number;
export function poolCandidates(settings: BingoSettings): Array<{ value: Fraction; maxCopies: number }>;
export function buildAnswerPool(settings: BingoSettings, seed: string): readonly Fraction[];
export function buildDeck(settings: BingoSettings, pool: readonly Fraction[], seed: string): readonly DeckQuestion[];
export function revealText(question: Pick<BingoQuestion, "kind" | "text" | "answer">): string;
export function modeLabel(settings: Pick<BingoSettings, "mode" | "level">): string;
