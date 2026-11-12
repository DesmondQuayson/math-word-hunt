import type { RaceSettings } from "./questions.js";

export type RaceCar = Readonly<{
  key: string;
  name: string;
  price: number;
  topSpeed: number;
  boost: number;
  decay: number;
  recommended: readonly [number, number];
  blurb: string;
}>;

export type OnlineCar = Readonly<{ key: string; name: string; topSpeed: number; boost: number; decay: number }>;

export type RaceStage = Readonly<{
  stage: number;
  reward: number;
  interval: number;
  accuracy: number;
  lengthKm: number;
  suggested: "beginner" | "easy" | "medium" | "hard" | "expert";
}>;

export type RaceAchievement = Readonly<{ key: string; title: string; text: string }>;

export type RaceSpec = Readonly<{ topSpeed: number; boost: number; decay: number; lengthKm: number }>;

export type RacerState = {
  t: number;
  x: number;
  v: number;
  correct: number;
  wrong: number;
  answered: number;
  streak: number;
  bestStreak: number;
  maxSpeed: number;
  lockedUntil: number;
  finishMs: number | null;
};

export type RacerView = {
  progress: number;
  distanceKm: number;
  speed: number;
  correct: number;
  wrong: number;
  finished: boolean;
  finishMs: number | null;
  waiting: boolean;
};

export type CpuTimeline = Readonly<{ stage: number; events: readonly (readonly [number, 0 | 1])[]; finishMs: number | null; correct: number; wrong: number }>;

export type RunEvaluation = Readonly<{
  finished: boolean;
  won: boolean;
  timeMs: number | null;
  cpuTimeMs: number | null;
  correct: number;
  wrong: number;
  accuracy: number;
  maxSpeed: number;
  bestStreak: number;
  achievements: readonly string[];
}>;

export const MIN_CORRECT: number;
export const IDLE_SPEED: number;
export const WRONG_SPEED_KEPT: number;
export const CORRECT_LOCK_MS: number;
export const WRONG_LOCK_MS: number;
export const COUNTDOWN_MS: number;
export const MAX_RACE_MS: number;
export const CARS: readonly RaceCar[];
export const CAR_KEYS: readonly string[];
export const STARTER_CAR: RaceCar;
export const ONLINE_CAR: OnlineCar;
export const ONLINE_LENGTH_KM: number;
export const RACER_COLOURS: readonly string[];
export const ROOM_CAPACITY: number;
export const STAGES: readonly RaceStage[];
export const STAGE_COUNT: number;
export const ACHIEVEMENT_REWARD: number;
export const ACHIEVEMENTS: readonly RaceAchievement[];
export const ACHIEVEMENT_KEYS: readonly string[];
export const TOTAL_EARNABLE: number;

export function getCar(key: string): RaceCar | null;
export function getStage(number: number): RaceStage | null;
export function stageReward(number: number): number;
export function raceSpec(car: Readonly<{ topSpeed: number; boost: number; decay: number }>, lengthKm: number): RaceSpec;
export function newRacerState(): RacerState;
export function isRacerState(value: unknown): value is RacerState;
export function distanceAllowed(correct: number, lengthKm: number): number;
export function advance(state: RacerState, spec: RaceSpec, toMs: number): RacerState;
export function applyAnswer(
  state: RacerState,
  spec: RaceSpec,
  atMs: number,
  isCorrect: boolean
): { state: RacerState; accepted: boolean; reason: "not-started" | "locked" | "finished" | null };
export function progressOf(state: RacerState, spec: RaceSpec): number;
export function viewAt(state: RacerState, spec: RaceSpec, atMs: number): RacerView;
export function accuracyOf(state: RacerState): number;
export function cpuTimeline(stageNumber: number, seed: number | string): CpuTimeline;
export function cpuStateAt(timeline: CpuTimeline, atMs: number): { state: RacerState; spec: RaceSpec };
export function evaluateRun(run: Readonly<{ stage: number; carKey: string; settings: RaceSettings; state: RacerState; cpuFinishMs: number | null }>): RunEvaluation;
export function rankRacers<T extends { id: string; finishMs: number | null; x: number }>(racers: readonly T[]): (T & { place: number; tied: boolean })[];
