export type BingoModeId = "addition" | "subtraction" | "multiplication" | "division" | "mixed" | "fractions";
export type AudioTarget = "host" | "all" | "off";

export type BingoLevel = Readonly<{ id: string; label: string; hint?: string }>;
export type BingoMode = Readonly<{ id: BingoModeId; label: string; symbol: string; levels: readonly BingoLevel[] }>;

export type BingoPatterns = Readonly<{ rows: boolean; columns: boolean; diagonals: boolean }>;

export type BingoSettings = Readonly<{
  mode: BingoModeId;
  level: string;
  questionSeconds: number;
  revealSeconds: number;
  patterns: BingoPatterns;
  winners: number;
  freeSpace: boolean;
  music: AudioTarget;
  celebration: AudioTarget;
  equivalentFractions: boolean;
}>;

export const MODES: readonly BingoMode[];
export const QUESTION_SECONDS: readonly number[];
export const REVEAL_SECONDS: readonly number[];
export const AUDIO_TARGETS: readonly AudioTarget[];
export const MAX_PARTICIPANTS: number;
export const MIN_WINNERS: number;
export const MAX_WINNERS: number;
export const NAME_MIN: number;
export const NAME_MAX: number;
export const ATTEMPTS_PER_QUESTION: number;
export const COUNTDOWN_SECONDS: number;
export const LEADERBOARD_SECONDS: number;
export const WINNER_REVEAL_SECONDS: number;
export const DECK_PASSES: number;
export const DEFAULT_SETTINGS: BingoSettings;

export function getMode(modeId: unknown): BingoMode | null;
export function getLevel(modeId: unknown, levelId: unknown): BingoLevel | null;
export function normalizeSettings(raw: unknown, options?: { legacyWinners?: boolean }): { ok: true; settings: BingoSettings } | { ok: false; error: string };
export function sanitizeDisplayName(raw: unknown): { ok: true; name: string } | { ok: false; error: string };
