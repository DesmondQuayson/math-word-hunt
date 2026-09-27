export type TugSkillId = "addition" | "subtraction" | "multiplication" | "integers" | "opposite" | "absolute";

export type TugSkill = Readonly<{ id: TugSkillId; title: string; shortTitle: string; signed: boolean }>;

export type TugQuestion = Readonly<{
  skill: TugSkillId;
  key: string;
  kind: "expression" | "sentence";
  operands: readonly number[];
  operator: "+" | "-" | "*" | "opposite" | "absolute";
  text: string;
  spoken: string;
  answer: number;
  index?: number;
}>;

export const MINUS: string;
export const TIMES: string;
export const SKILLS: readonly TugSkill[];
export const SKILL_IDS: readonly TugSkillId[];
export const RANGES: Readonly<{ whole: Readonly<{ min: number; max: number }>; integer: Readonly<{ min: number; max: number }> }>;
export const RECENT_HISTORY: number;

export function getSkill(skillId: string): TugSkill | null;
export function isSkillId(value: unknown): value is TugSkillId;
export function formatInteger(value: number): string;
export function drawQuestion(skill: TugSkillId, random: import("./random.js").TugRandom, recentKeys?: readonly string[]): TugQuestion;
export function createQuestionStream(skill: TugSkillId, seed: number | string): Readonly<{
  skill: TugSkillId;
  next(): TugQuestion & { index: number };
  readonly index: number;
}>;
export function questionAt(skill: TugSkillId, seed: number | string, index: number): TugQuestion & { index: number };
export function validateQuestion(question: TugQuestion): string[];
