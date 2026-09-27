import type { TugQuestion, TugSkillId } from "./questions.js";

export type TugTeam = "turquoise" | "pink";
export type TugState = Readonly<{ position: number; winner: TugTeam | null; pulls: Readonly<Record<TugTeam, number>> }>;
export type TugNames = Readonly<Record<TugTeam, string>>;

export const TUG_LIMIT: number;
export const TEAMS: readonly TugTeam[];
export const TEAM_DIRECTION: Readonly<Record<TugTeam, -1 | 1>>;
export const DEFAULT_TEAM_NAMES: TugNames;
export const NAME_MAX_LENGTH: number;

export function isTeam(value: unknown): value is TugTeam;
export function otherTeam(team: TugTeam): TugTeam;
export function sanitizeName(raw: unknown, fallback: string): string;
export function createTugState(): TugState;
export function winnerForPosition(position: number): TugTeam | null;
export function applyPull(tug: TugState, team: TugTeam): TugState;
export function progressFor(tug: TugState, team: TugTeam): number;
export function describePosition(position: number, names: TugNames): string;

export type LocalMatchSnapshot = Readonly<{
  skill: TugSkillId;
  round: number;
  status: "playing" | "won";
  tug: TugState;
  names: TugNames;
  questions: Readonly<Record<TugTeam, TugQuestion>>;
  stats: Readonly<Record<TugTeam, Readonly<{ answered: number; correct: number }>>>;
}>;

export type SubmitResult =
  | Readonly<{ type: "finished"; team: TugTeam; match: LocalMatchSnapshot }>
  | Readonly<{ type: "invalid"; team: TugTeam; reason: string; match: LocalMatchSnapshot }>
  | Readonly<{ type: "correct" | "incorrect"; team: TugTeam; question: TugQuestion; value: number; pulled: boolean; winner: TugTeam | null; match: LocalMatchSnapshot }>;

export function createLocalMatch(options: { skill: TugSkillId; names: TugNames; seed?: number | string }): Readonly<{
  snapshot(): LocalMatchSnapshot;
  submit(team: TugTeam, raw: string): SubmitResult;
  rematch(): LocalMatchSnapshot;
}>;
