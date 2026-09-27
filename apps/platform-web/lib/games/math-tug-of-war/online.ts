import "server-only";

import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

import { parseAnswer } from "@/public/internal-games/math-tug-of-war/src/answer.js";
import { isSkillId, questionAt, type TugSkillId } from "@/public/internal-games/math-tug-of-war/src/questions.js";
import { isTeam, sanitizeName, type TugTeam } from "@/public/internal-games/math-tug-of-war/src/tug.js";

/**
 * Math Tug of War Online Match — server authority.
 *
 * The browser never decides whether an answer is right. The room's question
 * seed lives only in the database and on this server; each player's question
 * N is regenerated here from (seed, round, team, N). The browser submits the
 * text it typed for question N; this module checks it and asks the database
 * to apply the result under a row lock (see supabase migration
 * 20260927100000_math_tug_of_war.sql). Players are identified by a random
 * bearer token issued at create/join and stored only as a SHA-256 hash.
 */

export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 5;
const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const DEFAULT_ONLINE_NAMES = Object.freeze({ turquoise: "Player 1", pink: "Player 2" });

export type TugPresence = "waiting" | "connected" | "reconnecting" | "disconnected";

/** Shape returned by every tug_* database function (service_role only). */
export type TugRoomRecord = Readonly<{
  result: string;
  code: string;
  skill: TugSkillId;
  status: "waiting" | "playing" | "won" | "closed" | "expired";
  round: number;
  position: number;
  winner: TugTeam | null;
  version: number;
  team: TugTeam;
  names: Readonly<{ turquoise: string; pink: string | null }>;
  pulls: Readonly<{ turquoise: number; pink: number }>;
  questionIndex: number;
  presence: Readonly<{ turquoise: TugPresence; pink: TugPresence }>;
  rematch: Readonly<{ turquoise: boolean; pink: boolean }>;
  closedBy: TugTeam | "expired" | null;
  expiresAt: string;
  seed: string;
}>;

/** What a browser is allowed to see. Built field by field, never spread. */
export type TugClientState = Readonly<{
  result: string;
  code: string;
  skill: TugSkillId;
  status: TugRoomRecord["status"];
  round: number;
  position: number;
  winner: TugTeam | null;
  version: number;
  team: TugTeam;
  names: Readonly<{ turquoise: string; pink: string | null }>;
  pulls: Readonly<{ turquoise: number; pink: number }>;
  presence: Readonly<{ turquoise: TugPresence; pink: TugPresence }>;
  rematch: Readonly<{ turquoise: boolean; pink: boolean }>;
  closedBy: TugTeam | "expired" | null;
  question: Readonly<{ index: number; text: string; spoken: string; kind: "expression" | "sentence" }> | null;
}>;

export function generateRoomCode(): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  return code;
}

/** Normalise what a person typed: case, spaces, and common look-alikes. */
export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.toUpperCase().replace(/[\s-]/g, "");
  return ROOM_CODE_PATTERN.test(code) ? code : null;
}

export function newPlayerToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isPlayerToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

export function hashPlayerToken(token: string): string {
  return createHash("sha256").update(`math-tug-of-war\nplayer\n${token}`).digest("hex");
}

export function newQuestionSeed(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Keyed hash of the access principal, used only for per-player abuse limits
 * (room creation and code guessing). The principal id itself is not stored.
 */
export function ownerHash(secret: string | null, principal: Readonly<{ kind: string; id: string }>): string {
  const material = `math-tug-of-war\nowner\n${principal.kind}:${principal.id}`;
  return secret
    ? createHmac("sha256", secret).update(material).digest("hex")
    : createHash("sha256").update(material).digest("hex");
}

export function teamStreamSeed(seed: string, round: number, team: TugTeam): string {
  return `${seed}:${round}:${team}`;
}

export function questionFor(record: Pick<TugRoomRecord, "seed" | "skill" | "round" | "team" | "questionIndex">) {
  return questionAt(record.skill, teamStreamSeed(record.seed, record.round, record.team), record.questionIndex);
}

/** Server-side correctness: the browser's opinion is never consulted. */
export function checkSubmission(record: TugRoomRecord, rawAnswer: unknown): Readonly<{ valid: boolean; correct: boolean; answer: number }> {
  const question = questionFor(record);
  const parsed = parseAnswer(rawAnswer);
  return Object.freeze({ valid: parsed.ok, correct: parsed.ok && parsed.value === question.answer, answer: question.answer });
}

export function sanitizeOnlineName(raw: unknown, team: TugTeam): string {
  return sanitizeName(raw, DEFAULT_ONLINE_NAMES[team]);
}

export function isTugRoomRecord(value: unknown): value is TugRoomRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "string" && isSkillId(record.skill) && isTeam(record.team)
    && typeof record.seed === "string" && Number.isInteger(record.round) && Number.isInteger(record.questionIndex);
}

/** The ONLY way room data reaches a browser. */
export function toClientState(record: TugRoomRecord, result = record.result): TugClientState {
  const live = record.status === "playing";
  const question = live ? questionFor(record) : null;
  return Object.freeze({
    result,
    code: record.code,
    skill: record.skill,
    status: record.status,
    round: record.round,
    position: record.position,
    winner: record.winner,
    version: record.version,
    team: record.team,
    names: Object.freeze({ turquoise: record.names.turquoise, pink: record.names.pink }),
    pulls: Object.freeze({ turquoise: record.pulls.turquoise, pink: record.pulls.pink }),
    presence: Object.freeze({ turquoise: record.presence.turquoise, pink: record.presence.pink }),
    rematch: Object.freeze({ turquoise: record.rematch.turquoise, pink: record.rematch.pink }),
    closedBy: record.closedBy,
    question: question
      ? Object.freeze({ index: record.questionIndex, text: question.text, spoken: question.spoken, kind: question.kind })
      : null
  });
}
