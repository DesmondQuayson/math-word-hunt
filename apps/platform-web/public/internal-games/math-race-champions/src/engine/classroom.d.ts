import type { RaceQuestion, RaceSettings, RaceSettingsInput } from "./questions.js";

export type ClassroomTeam = "turquoise" | "pink";

export type ClassroomTeamView = Readonly<{
  team: ClassroomTeam;
  name: string;
  position: number;
  remaining: number;
  correct: number;
  wrong: number;
  question: RaceQuestion & { index: number };
  finished: boolean;
  finishedAt: number | null;
}>;

export type ClassroomSubmit =
  | Readonly<{ accepted: false; reason: string }>
  | Readonly<{
      accepted: true;
      team: ClassroomTeam;
      correct: boolean;
      answered: RaceQuestion & { index: number };
      choiceIndex: 0 | 1;
      from: number;
      position: number;
      remaining: number;
      finished: boolean;
      lockMs: number;
    }>;

export type ClassroomOutcome = Readonly<{
  result: "win" | "tie";
  winner: ClassroomTeam | null;
  length: number;
  durationMs: number;
  teams: Readonly<
    Record<
      ClassroomTeam,
      Readonly<{ name: string; position: number; correct: number; wrong: number; accuracy: number; timeMs: number | null }>
    >
  >;
}>;

export type ClassroomMatch = Readonly<{
  settings: RaceSettings;
  length: number;
  readonly phase: "ready" | "playing" | "resolving" | "finished";
  readonly round: number;
  team(team: ClassroomTeam): ClassroomTeamView;
  start(atMs: number): boolean;
  submit(team: ClassroomTeam, choiceIndex: number, atMs: number): ClassroomSubmit;
  resolve(atMs: number): ClassroomOutcome | null;
  outcome(): ClassroomOutcome | null;
  restart(): void;
}>;

export const TEAMS: readonly ClassroomTeam[];
export const DEFAULT_TEAM_NAMES: Readonly<Record<ClassroomTeam, string>>;
export const TEAM_NAME_MAX: number;
export const CORRECT_LOCK_MS: number;
export const WRONG_LOCK_MS: number;
export const TIE_WINDOW_MS: number;

export function sanitizeTeamName(value: unknown, team: ClassroomTeam): string;
export function isTrackLength(value: unknown): boolean;
export function createClassroomMatch(options: Readonly<{
  settings: RaceSettingsInput;
  names?: Partial<Record<ClassroomTeam, string>>;
  seed: number | string;
  length?: number;
}>): ClassroomMatch;
