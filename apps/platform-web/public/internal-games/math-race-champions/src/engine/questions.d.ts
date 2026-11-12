import type { RaceRandom } from "./random.js";

export type RaceCategoryId =
  | "missing-addend"
  | "missing-subtrahend"
  | "missing-multiplier"
  | "missing-divisor"
  | "percent-to-decimal"
  | "decimal-to-percent"
  | "powers";

export type RaceDifficultyId = "beginner" | "easy" | "medium" | "hard" | "expert";

export type RaceCategory = Readonly<{ id: RaceCategoryId; title: string; example: string }>;
export type RaceDifficulty = Readonly<{ id: RaceDifficultyId; title: string }>;

export type RaceSettings = Readonly<{ categories: readonly RaceCategoryId[]; difficulty: RaceDifficultyId }>;
export type RaceSettingsInput = Readonly<{ categories?: readonly string[] | "mixed" | null; difficulty?: string | null }>;

export type RaceQuestion = Readonly<{
  category: RaceCategoryId;
  difficulty: RaceDifficultyId;
  key: string;
  text: string;
  spoken: string;
  operands: readonly (number | string)[];
  choices: readonly [string, string];
  correctIndex: 0 | 1;
  answer: string;
  index?: number;
}>;

export type RacePublicQuestion = Readonly<{
  index: number;
  category: RaceCategoryId;
  text: string;
  spoken: string;
  choices: readonly [string, string];
}>;

export type ExactDecimal = Readonly<{ m: number; e: number }>;

export const MINUS: string;
export const TIMES: string;
export const DIVIDE: string;
export const SUPERSCRIPTS: readonly string[];
export const CATEGORIES: readonly RaceCategory[];
export const CATEGORY_IDS: readonly RaceCategoryId[];
export const DIFFICULTIES: readonly RaceDifficulty[];
export const DIFFICULTY_IDS: readonly RaceDifficultyId[];
export const MAX_EXPONENT: number;
export const RECENT_HISTORY: number;
export const MAX_SAME_SIDE_RUN: number;
export const RANGES: Readonly<Record<string, Readonly<Record<RaceDifficultyId, Readonly<Record<string, unknown>>>>>>;

export function conversionText(category: RaceCategoryId, shownPercent: string, shownDecimal: string): string;
export function parseConversion(text: string): Readonly<{ value: ExactDecimal; fromPercent: boolean }> | null;
export function conversionQuestion(category: RaceCategoryId, difficulty: RaceDifficultyId, percent: ExactDecimal, random: RaceRandom): RaceQuestion;
export function isCategoryId(value: unknown): value is RaceCategoryId;
export function isDifficultyId(value: unknown): value is RaceDifficultyId;
export function getCategory(categoryId: string): RaceCategory | null;
export function normalizeSettings(input?: RaceSettingsInput): RaceSettings;

export function decimal(mantissa: number, exponent?: number): ExactDecimal;
export function shiftDecimal(value: ExactDecimal, places: number): ExactDecimal;
export function formatDecimal(value: ExactDecimal): string;
export function formatPercent(value: ExactDecimal): string;
export function parseDecimal(text: string): ExactDecimal | null;
export function decimalsEqual(a: ExactDecimal, b: ExactDecimal): boolean;

export function drawQuestion(category: RaceCategoryId, difficulty: RaceDifficultyId, random: RaceRandom, recentKeys?: readonly string[]): RaceQuestion;
export function createQuestionStream(
  settings: RaceSettingsInput,
  seed: number | string,
  options?: Readonly<{ orderSeed?: number | string }>
): Readonly<{
  settings: RaceSettings;
  next(): RaceQuestion & { index: number };
  readonly index: number;
}>;
export function questionAt(
  settings: RaceSettingsInput,
  seed: number | string,
  index: number,
  options?: Readonly<{ orderSeed?: number | string }>
): RaceQuestion & { index: number };
export function publicQuestion(question: RaceQuestion & { index: number }): RacePublicQuestion;
export function isCorrectChoice(question: RaceQuestion, choiceIndex: number): boolean;
export function validateQuestion(question: RaceQuestion): string[];
