import "server-only";

import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

import { dealCard } from "@/public/internal-games/math-bingo-live/src/engine/board.js";
import { describeModel, fractionText } from "@/public/internal-games/math-bingo-live/src/engine/fractions.js";
import { isAllowedEmoji } from "@/public/internal-games/math-bingo-live/src/engine/emoji.js";
import {
  buildUniverse,
  classesFromCallable,
  dealPacedBoard,
  isValidPacedBoard,
  pacingPlan,
  universeClasses,
  type PacingPlan,
  type UniverseClass,
  type UniverseQuestion
} from "@/public/internal-games/math-bingo-live/src/engine/pacing.js";
import { buildAnswerPool, buildDeck, dealRules, modeLabel, revealText } from "@/public/internal-games/math-bingo-live/src/engine/questions.js";
import { ATTEMPTS_PER_QUESTION, normalizeSettings, type BingoSettings } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";
import { PRODUCTION_PUBLIC_CANONICAL_HOST, PRODUCTION_PUBLIC_WWW_HOST } from "@/lib/environment/production-public";
import { isStagingAccessRequired } from "@/lib/staging-access/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";

/**
 * Math Bingo Live — server authority.
 *
 * The database (supabase/migrations/20261103100000_math_bingo_live.sql) owns
 * the room state machine, the clock, mark validation and winner placement.
 * This module does the three things SQL is poor at, and shapes every reply:
 *   * builds each game (answer pool + question deck) from a fresh secret seed;
 *   * deals each player's card from that seed (the database re-checks that a
 *     card is exactly the room's pool before storing it);
 *   * turns database records into browser payloads FIELD BY FIELD, so the
 *     seed, the pool, the deck, future questions, the current answer before
 *     its reveal and every token hash stay on the server.
 */

export const GAME_KEY = "math-bingo-live";
export const HOST_ROUTE = "/games/math-bingo-live/host";
export const JOIN_ROUTE = "/join";
const CODE_PATTERN = /^[1-9][0-9]{5}$/;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const PREVIEW_FLAG = "MVH_MATH_BINGO_LIVE_PREVIEW";
export const PREVIEW_VALUE = "local-owner-review";
export const STAGING_PREVIEW_VALUE = "staging-owner-review";
/** The isolated staging Supabase project; production never points here. */
export const STAGING_SUPABASE_HOST = "gcmuhzxkwvfireyrearl.supabase.co";

type Json = Record<string, unknown>;
type Fraction = Readonly<{ n: number; d: number }>;
type Cell = Readonly<{ free: true }> | Readonly<{ n: number; d: number; shape?: string }>;

// ------------------------------------------------------------ identifiers

/** Six digits, never starting with 0 (easy to read aloud and to type). */
export function generateRoomCode(): string {
  return String(randomInt(100_000, 1_000_000));
}

export function normalizeRoomCode(raw: unknown): string | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const code = String(raw).replace(/[\s-]/g, "");
  return CODE_PATTERN.test(code) ? code : null;
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function isToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** Domain-separated, so a player token can never stand in for a host token. */
export function hashToken(kind: "host" | "player", token: string): string {
  return createHash("sha256").update(`math-bingo-live\n${kind}\n${token}`).digest("hex");
}

export function newGameSeed(): string {
  return randomBytes(16).toString("hex");
}

/** Keyed hash of the host's access principal; the principal id is not stored. */
export function ownerHash(secret: string | null, principal: Readonly<{ kind: string; id: string }>): string {
  const material = `math-bingo-live\nowner\n${principal.kind}:${principal.id}`;
  return secret ? createHmac("sha256", secret).update(material).digest("hex") : createHash("sha256").update(material).digest("hex");
}

/** Keyed hash of the caller's address, for the code-guessing limiter only. */
export function subjectHash(secret: string | null, address: string): string {
  const material = `math-bingo-live\njoin\n${address}`;
  return secret ? createHmac("sha256", secret).update(material).digest("hex") : createHash("sha256").update(material).digest("hex");
}

// ------------------------------------------------------------- availability

/**
 * The draft may be served only for a local owner review: the explicit flag,
 * a loopback application origin, and not on any Vercel deployment. A hosted
 * environment can therefore never expose the draft, whatever its variables.
 */
export function isLocalOwnerPreview(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (source[PREVIEW_FLAG]?.trim() !== PREVIEW_VALUE) return false;
  if (source.VERCEL || source.VERCEL_ENV || source.VERCEL_URL) return false;
  const origin = source.MVH_APPLICATION_ORIGIN?.trim() || source.APP_BASE_URL?.trim() || "";
  try {
    const url = new URL(origin);
    return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
  } catch {
    return false;
  }
}

function hostOf(value: string | undefined): string | null {
  try {
    return new URL(value?.trim() ?? "").hostname;
  } catch {
    return null;
  }
}

/**
 * The draft may also be served for the owner's STAGING review, and only there:
 *   * the flag says `staging-owner-review` (set per deployment with
 *     `vercel deploy --env`, never as a project variable);
 *   * both Supabase URLs are the isolated staging project, so no production
 *     data or account can ever reach the draft;
 *   * the application origin is not mathnexa.com;
 *   * the deployment is a staging Preview (behind Vercel Deployment
 *     Protection) or enforces the staging access gate.
 * Production fails every one of these, whatever its variables.
 */
export function isStagingOwnerPreview(source: Readonly<Record<string, string | undefined>> = process.env): boolean {
  if (source[PREVIEW_FLAG]?.trim() !== STAGING_PREVIEW_VALUE) return false;
  if (hostOf(source.SUPABASE_URL) !== STAGING_SUPABASE_HOST || hostOf(source.NEXT_PUBLIC_SUPABASE_URL) !== STAGING_SUPABASE_HOST) return false;
  const origin = hostOf(source.MVH_APPLICATION_ORIGIN);
  if (!origin || origin === PRODUCTION_PUBLIC_CANONICAL_HOST || origin === PRODUCTION_PUBLIC_WWW_HOST) return false;
  return source.VERCEL_ENV?.trim() === "preview" || isStagingAccessRequired(source);
}

let availabilityCache: { at: number; value: boolean } | null = null;

/** Published in the catalog, or a draft under the local or staging owner preview. */
export async function isMathBingoLiveAvailable(now = Date.now()): Promise<boolean> {
  if (availabilityCache && now - availabilityCache.at < 15_000) return availabilityCache.value;
  const client = createServiceSupabaseClient();
  if (!client) return false;
  const { data, error } = await client.from("game_catalog_entries").select("status").eq("stable_key", GAME_KEY).maybeSingle();
  const status = error ? null : (data as { status?: string } | null)?.status ?? null;
  const value = status === "published" || (status === "draft" && (isLocalOwnerPreview() || isStagingOwnerPreview()));
  availabilityCache = { at: now, value };
  return value;
}

export function resetAvailabilityCacheForTests(): void {
  availabilityCache = null;
}

// ------------------------------------------------------------------- games

/**
 * Deck entries as stored: the canonical question identity (q, unique within
 * the deck; the database refuses a deck that repeats one), text, spoken text,
 * kind and the answer.
 */
export type StoredQuestion = Readonly<{ q: string; t: string; s: string; k: "arithmetic" | "fraction"; n: number; d: number }>;

export function buildGame(settings: BingoSettings, seed: string): Readonly<{ pool: readonly Fraction[]; deck: readonly StoredQuestion[] }> {
  const pool = buildAnswerPool(settings, seed);
  const deck = buildDeck(settings, pool, seed).map((question) => Object.freeze({
    q: question.id, t: question.text, s: question.spoken, k: question.kind, n: question.answer.n, d: question.answer.d
  }));
  if (new Set(deck.map((question) => question.q)).size !== deck.length) throw new Error("A question would repeat in this game.");
  return Object.freeze({ pool, deck: Object.freeze(deck) });
}

/**
 * A paced game (winner pacing, 20261108100000 + 20261111100000): the room's
 * question universe (every unique question with its answer class) and the
 * early/late plan built from the game's secret seed. The database re-checks
 * both at Start and draws the gates itself; no winner target is capped here.
 */
export function buildPacedGame(settings: BingoSettings, seed: string): Readonly<{ universe: readonly UniverseQuestion[]; plan: PacingPlan; questions: readonly StoredUniverseQuestion[] }> {
  const universe = buildUniverse(settings, seed);
  const plan = pacingPlan(settings, universe, seed);
  const questions = universe.map((question) => Object.freeze({ q: question.id, c: question.class, t: question.text, s: question.spoken, k: question.kind, n: question.n, d: question.d }));
  if (new Set(questions.map((question) => question.q)).size !== questions.length) throw new Error("A question would repeat in this game.");
  return Object.freeze({ universe, plan, questions: Object.freeze(questions) });
}

/** Universe entries as sent to and stored by the database. */
export type StoredUniverseQuestion = Readonly<{ q: string; c: string; t: string; s: string; k: "arithmetic" | "fraction"; n: number; d: number }>;

/** The plan as the Start call sends it: which classes are late and which are kept off the cards. */
export function pacingPayload(plan: PacingPlan): Json {
  return { late: [...plan.late], reserve: [...plan.reserve] };
}

/**
 * Every listed player's paced card for a new game: classes spread evenly
 * across the class's cards, every enabled line holding a late cell.
 */
export function dealPacedBoards(settings: BingoSettings, game: ReturnType<typeof buildPacedGame>, seed: string, participantIds: readonly unknown[]): Record<string, readonly Cell[]> {
  const reserve = new Set(game.plan.reserve);
  const classes = universeClasses(game.universe).filter((item) => !reserve.has(item.key));
  const usage = new Map<string, number>();
  const boards: Record<string, readonly Cell[]> = {};
  for (const id of participantIds) {
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) || id in boards) continue;
    const board = dealPacedBoard({ settings, classes, late: game.plan.late, seed, participantId: id, usage });
    if (!board || !isValidPacedBoard(board, { settings, late: game.plan.late, classes })) continue;
    for (const cell of board) if (!("free" in cell)) usage.set(`${cell.n}/${cell.d}`, (usage.get(`${cell.n}/${cell.d}`) ?? 0) + 1);
    boards[id] = board;
  }
  return boards;
}

/**
 * A card for a player who needs one after Start (a late joiner, or a refused
 * card): in a paced game from the room's late classes and the classes that
 * still have an unasked question; in an older game from the shared pool.
 */
export function dealFor(record: Json, participantId: string): readonly Cell[] | null {
  const settings = normalizeSettings(record.settings);
  if (!settings.ok || typeof record.seed !== "string") return null;
  if (Array.isArray(record.late) && Array.isArray(record.callable)) {
    const late = (record.late as unknown[]).filter((item): item is string => typeof item === "string");
    const classes: UniverseClass[] = classesFromCallable(record.callable as unknown[]);
    const board = dealPacedBoard({ settings: settings.settings, classes, late, seed: record.seed, participantId });
    return board && isValidPacedBoard(board, { settings: settings.settings, late, classes }) ? board : null;
  }
  if (!Array.isArray(record.pool)) return null;
  return dealCard({ pool: record.pool as Fraction[], seed: record.seed, participantId, ...dealRules(settings.settings) });
}

/**
 * Every listed player's card for a new game, dealt exactly as dealFor would
 * deal it once the game has started (same seed, pool and participant id), so
 * Start can store all cards in one request. Ids that are not UUIDs are skipped.
 */
export function dealBoards(settings: BingoSettings, pool: readonly Fraction[], seed: string, participantIds: readonly unknown[]): Record<string, readonly Cell[]> {
  const boards: Record<string, readonly Cell[]> = {};
  const rules = dealRules(settings);
  for (const id of participantIds) {
    if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id) || id in boards) continue;
    boards[id] = dealCard({ pool: pool as Fraction[], seed, participantId: id, ...rules });
  }
  return boards;
}

// ---------------------------------------------------------------- payloads

const REVEALED_PHASES = new Set(["ANSWER_REVEAL", "LEADERBOARD_UPDATE", "WINNER_REVEAL", "GAME_COMPLETE"]);
const PHASES = new Set(["LOBBY", "COUNTDOWN", "QUESTION_ACTIVE", "ANSWER_REVEAL", "LEADERBOARD_UPDATE", "WINNER_REVEAL", "GAME_COMPLETE", "PAUSED"]);

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);
const int = (value: unknown, fallback = 0): number => (Number.isInteger(value) ? (value as number) : fallback);
const text = (value: unknown, fallback = ""): string => (typeof value === "string" ? value : fallback);
const list = (value: unknown): Json[] => (Array.isArray(value) ? value.filter((item): item is Json => Boolean(item) && typeof item === "object") : []);
/** A player's emoji, only if it is one of the curated choices (never free text). */
const emoji = (value: unknown): string | null => (isAllowedEmoji(value) ? value : null);

export function isRoomRecord(value: unknown): value is Json {
  if (!value || typeof value !== "object") return false;
  const record = value as Json;
  return typeof record.code === "string" && PHASES.has(record.phase as string) && Number.isInteger(record.version) && Number.isInteger(record.gameNumber);
}

/** Is the current question's answer public yet? */
export function answerRevealed(record: Json): boolean {
  const phase = record.phase as string;
  if (REVEALED_PHASES.has(phase)) return true;
  return phase === "PAUSED" && (record.pausedPhase === "ANSWER_REVEAL" || record.pausedPhase === "LEADERBOARD_UPDATE");
}

function cleanCell(raw: unknown): Cell | null {
  if (!raw || typeof raw !== "object") return null;
  const cell = raw as Json;
  if (cell.free === true) return Object.freeze({ free: true });
  if (!Number.isInteger(cell.n) || !Number.isInteger(cell.d)) return null;
  const shape = typeof cell.shape === "string" && ["circle", "bar", "rect", "grid"].includes(cell.shape) ? cell.shape : undefined;
  return Object.freeze(shape ? { n: cell.n as number, d: cell.d as number, shape } : { n: cell.n as number, d: cell.d as number });
}

function cleanSettings(raw: unknown): BingoSettings | null {
  const result = normalizeSettings(raw);
  return result.ok ? result.settings : null;
}

function questionView(entry: Json, number: number, revealed: boolean) {
  const kind = entry.k === "fraction" ? "fraction" : "arithmetic";
  const answer = { n: int(entry.n), d: int(entry.d, 1) };
  return Object.freeze({
    number,
    /** Canonical identity ("addition:5:7"); never repeats within a game. */
    id: text(entry.q),
    text: text(entry.t),
    spoken: text(entry.s),
    kind,
    // The answer leaves the server only once the room has revealed it.
    reveal: revealed
      ? Object.freeze({
          text: revealText({ kind, text: text(entry.t), answer }),
          answer: Object.freeze(answer),
          description: kind === "fraction" ? describeModel(answer).replace(/^Fraction model: /, "").replace(/\.$/, "") : null
        })
      : null
  });
}

function common(record: Json) {
  const settings = cleanSettings(record.settings);
  const called = list(record.called);
  const questionNumber = int(record.questionNumber);
  const revealedNow = answerRevealed(record);
  const history = called.map((entry, index) => questionView(entry, index + 1, index + 1 < questionNumber || revealedNow));
  const current = questionNumber > 0 && record.phase !== "LOBBY" ? history[questionNumber - 1] ?? null : null;
  const cap = settings?.winners ?? 0;
  return {
    code: text(record.code),
    status: text(record.status),
    phase: record.phase as string,
    pausedPhase: typeof record.pausedPhase === "string" ? record.pausedPhase : null,
    gameNumber: int(record.gameNumber),
    settings,
    modeLabel: settings ? modeLabel(settings) : "",
    questionNumber,
    deckLength: int(record.deckLength),
    question: current,
    called: Object.freeze(history),
    timing: Object.freeze({
      serverNow: num(record.serverNow),
      phaseStartedAt: num(record.phaseStartedAt),
      phaseDeadline: num(record.phaseDeadline),
      questionStartedAt: num(record.questionStartedAt),
      pausedRemainingMs: num(record.pausedRemainingMs)
    }),
    winnerCount: int(record.winnerCount),
    winnerCap: cap,
    completedReason: typeof record.completedReason === "string" ? record.completedReason : null,
    joinLocked: record.joinLocked === true,
    version: int(record.version),
    eventSeq: int(record.eventSeq),
    playerCount: int(record.playerCount),
    // The winner gates (first gate, gaps, next gate) stay in the database:
    // no screen is told when the next Bingo becomes possible.
    events: Object.freeze(list(record.events).map((event) => Object.freeze({
      seq: int(event.seq),
      type: text(event.type),
      name: text(event.name),
      emoji: emoji(event.emoji),
      placement: Number.isInteger(event.placement) ? (event.placement as number) : null,
      /** Winners so far, this one included (events before 20261111100000 carry none). */
      count: Number.isInteger(event.count) ? (event.count as number) : null,
      /** Won on the same call as the winner event in progress: shares its placement. */
      tie: event.tie === true,
      lineType: typeof event.lineType === "string" ? event.lineType : null,
      cap: Number.isInteger(event.cap) ? (event.cap as number) : null,
      participant: text(event.participant)
    }))),
    winners: Object.freeze(list(record.winners).map((winner) => {
      // The five winning cells include the answer to the question the Bingo
      // happened on, so they are sent only once that question is revealed.
      const shown = int(winner.question) < questionNumber || revealedNow;
      return Object.freeze({
        participant: text(winner.id),
        name: text(winner.name),
        emoji: emoji(winner.emoji),
        placement: int(winner.placement),
        tie: winner.tie === true,
        line: text(winner.line),
        lineType: text(winner.lineType),
        // The call the Bingo was confirmed on (a line completed while a gate
        // was closed is confirmed when the next gate opens).
        question: int(winner.question),
        mask: shown ? int(winner.mask) : 0,
        cells: shown ? Object.freeze(list(winner.cells).map(cleanCell).filter((cell): cell is Cell => cell !== null)) : Object.freeze([])
      });
    })),
    leaderboard: Object.freeze(list(record.leaderboard).map((row) => Object.freeze({
      participant: text(row.id),
      rank: int(row.rank),
      tied: row.tied === true,
      name: text(row.name),
      emoji: emoji(row.emoji),
      won: row.won === true,
      pending: row.pending === true,
      bestLines: int(row.bestLines),
      placement: Number.isInteger(row.placement) ? (row.placement as number) : null,
      best: int(row.best),
      type: typeof row.type === "string" ? row.type : null,
      correct: int(row.correct)
    })))
  };
}

/** Host screen payload. Participant ids are included so the host can remove a player. */
export function toHostState(record: Json) {
  const base = common(record);
  return Object.freeze({
    ...base,
    /** Sum of the players' row versions: with `version`, the host's unchanged check. */
    progress: int(record.progress),
    players: Object.freeze(list(record.players).map((player) => Object.freeze({
      id: text(player.id),
      name: text(player.name),
      emoji: emoji(player.emoji),
      connected: player.connected === true,
      hasWon: player.hasWon === true,
      placement: Number.isInteger(player.placement) ? (player.placement as number) : null,
      best: int(player.best),
      bestType: typeof player.bestType === "string" ? player.bestType : null,
      bestLines: int(player.bestLines),
      pending: player.pending === true,
      correct: int(player.correct)
    })))
  });
}

/**
 * Player payload: the shared room view, this player's own card, and only the
 * top of the leaderboard plus their own row. Other players' ids are dropped.
 */
export function toPlayerState(record: Json) {
  const base = common(record);
  const me = (record.me && typeof record.me === "object" ? record.me : {}) as Json;
  const myId = text(me.id);
  const rows = base.leaderboard;
  const mine = rows.find((row) => row.participant === myId) ?? null;
  const top = rows.slice(0, 5);
  const strip = <T extends { participant: string }>(row: T) => {
    const { participant, ...rest } = row;
    return Object.freeze({ ...rest, you: participant === myId });
  };
  const board = Array.isArray(me.board) ? (me.board as unknown[]).map(cleanCell) : null;
  const questionNumber = base.questionNumber;
  const attemptsUsed = int(me.attemptQuestion) === questionNumber ? int(me.attempts) : 0;
  return Object.freeze({
    ...base,
    events: Object.freeze(base.events.map((event) => {
      const { participant, ...rest } = event;
      return Object.freeze({ ...rest, you: participant === myId });
    })),
    winners: Object.freeze(base.winners.map(strip)),
    leaderboard: Object.freeze(top.map(strip)),
    me: Object.freeze({
      name: text(me.name),
      emoji: emoji(me.emoji),
      version: int(me.version),
      board: board && board.every((cell) => cell !== null) ? Object.freeze(board as Cell[]) : null,
      marks: int(me.marks),
      freeUsed: me.freeUsed === true,
      markUsed: int(me.markQuestion) === questionNumber && questionNumber > 0,
      attemptsLeft: Math.max(0, ATTEMPTS_PER_QUESTION - attemptsUsed),
      // The raw facts behind markUsed / attemptsLeft, so the page can keep its
      // own newest seat state against a newer room state (see api.js reconcile).
      markQuestion: int(me.markQuestion),
      attemptQuestion: int(me.attemptQuestion),
      attempts: int(me.attempts),
      hasWon: me.hasWon === true,
      placement: Number.isInteger(me.placement) ? (me.placement as number) : null,
      winLine: typeof me.winLine === "string" ? me.winLine : null,
      best: int(me.best),
      bestType: typeof me.bestType === "string" ? me.bestType : null,
      bestLines: int(me.bestLines),
      /** A completed enabled line waiting for the next winner gate (not a Bingo yet). */
      pendingLine: typeof me.pendingLine === "string" ? me.pendingLine : null,
      correct: int(me.correct),
      rank: mine?.rank ?? null,
      tied: mine?.tied ?? false
    })
  });
}

export type HostState = ReturnType<typeof toHostState>;
export type PlayerState = ReturnType<typeof toPlayerState>;

/** Human-readable fraction for feedback ("That shows 2/4"). */
export function cellLabel(cell: Cell | null): string {
  if (!cell || "free" in cell) return "";
  return cell.d === 1 ? String(cell.n) : fractionText(cell);
}
