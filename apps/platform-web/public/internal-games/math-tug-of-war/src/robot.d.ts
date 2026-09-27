import type { TugQuestion, TugSkillId } from "./questions.js";

export type RobotTuning = Readonly<{
  baseDelayMs: Readonly<Record<TugSkillId, number>>;
  jitter: number;
  minDelayMs: number;
  accuracy: number;
  afterMistakeMs: number;
}>;

export const ROBOT_TUNING: RobotTuning;
export function planRobotAnswer(question: TugQuestion, random: () => number, tuning?: RobotTuning): Readonly<{ delayMs: number; correct: boolean; answer: number }>;
export function plausibleMistake(question: TugQuestion, random: () => number): number;
export function robotEntry(value: number): string;
