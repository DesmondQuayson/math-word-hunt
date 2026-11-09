import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

import { PRODUCTION_PUBLIC_CANONICAL_HOST, PRODUCTION_PUBLIC_WWW_HOST } from "@/lib/environment/production-public";
import { isStagingAccessRequired } from "@/lib/staging-access/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { achievementsFor, TIMING } from "@/public/internal-games/polygon-showdown/src/engine/economy.js";
import {
  CONFIG,
  createRefillStream,
  encodeBoard,
  isGameState,
  newGameState,
  refillWindow,
  replayMoves,
  SCHEDULES,
  startingBoard,
  stateHash,
  type GameState,
  type Move
} from "@/public/internal-games/polygon-showdown/src/engine/game.js";

/**
 * Polygon Showdown — server authority.
 *
 * The database owns identity, money and the clock. This module runs the game:
 * it replays the swaps a browser sent through the same engine the browser used,
 * and whatever comes out is what happened. A browser's own coin total is never
 * read. It also turns database records into browser payloads FIELD BY FIELD, so
 * the seed and the token hashes stay on the server.
 */

export const GAME_KEY = "polygon-showdown";
export const PLAY_ROUTE = "/games/polygon-showdown/play";
export const JOIN_ROUTE = "/join";
export const PREVIEW_FLAG = "MVH_POLYGON_SHOWDOWN_PREVIEW";
export const PREVIEW_VALUE = "local-owner-review";
export const STAGING_PREVIEW_VALUE = "staging-owner-review";
/** The isolated staging Supabase project; production never points here. */
const STAGING_SUPABASE_HOST = "gcmuhzxkwvfireyrearl.supabase.co";
export const DURATIONS_SECONDS = Object.freeze([300, 420, 600, 900, 1200, 1800]);

type Json = Record<string, unknown>;

// ------------------------------------------------------------ identifiers

/** Domain-separated, so a player token can never stand in for a host token. */
export function hashToken(kind: "host" | "player", token: string): string {
  return createHash("sha256").update(`polygon-showdown\n${kind}\n${token}`).digest("hex");
}

export function newSeed(): string {
  return randomBytes(16).toString("hex");
}

/** Keyed hash of the creator's access principal; the room stores nothing else about them. */
export function ownerHash(secret: string | null, principal: Readonly<{ kind: string; id: string }>): string {
  const material = `polygon-showdown\nowner\n${principal.kind}:${principal.id}`;
  return secret ? createHmac("sha256", secret).update(material).digest("hex") : createHash("sha256").update(material).digest("hex");
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

// ------------------------------------------------------------- availability

/**
 * The draft may be served only for a local owner review: the explicit flag, a
 * loopback application origin, and not on any Vercel deployment. A hosted
 * environment can therefore never expose it, whatever its variables.
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
export async function isPolygonShowdownAvailable(now = Date.now()): Promise<boolean> {
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

export type LiveRoomGame = "polygon_showdown" | "math_bingo_live" | null;

/** Which live game owns an open room code. Shared by /join and the join APIs. */
export async function liveRoomGameForCode(code: string): Promise<LiveRoomGame> {
  const client = createServiceSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.rpc("live_room_game_for_code", { p_code: code });
  if (error) return null;
  return data === "polygon_showdown" || data === "math_bingo_live" ? data : null;
}

// ------------------------------------------------------------------- games

/** A new Solo run: four shapes, then the Pentagon as the run progresses. */
export function soloOpeningState(seed: string): GameState {
  return newGameState(encodeBoard(startingBoard(seed)), CONFIG, SCHEDULES.solo);
}

export type ShowdownDifficulty = "standard" | "challenge";

/** A Showdown's opening: the same board and the same Pentagon schedule for every seat. */
export function showdownOpeningState(seed: string, difficulty: ShowdownDifficulty): GameState {
  const kinds = difficulty === "challenge" ? CONFIG.advancedKinds : CONFIG.kinds;
  return newGameState(encodeBoard(startingBoard(seed, CONFIG, kinds)), CONFIG, SCHEDULES[difficulty]);
}

/** A batch of swaps from a browser, or null if it is malformed. */
export function parseMoves(raw: unknown): Move[] | null {
  if (!Array.isArray(raw) || raw.length > TIMING.MAX_BATCH) return null;
  const moves: Move[] = [];
  for (const entry of raw) {
    if (!Array.isArray(entry) || entry.length !== 3) return null;
    const [a, b, t] = entry as unknown[];
    if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(t)) return null;
    if ((a as number) < 0 || (a as number) >= 64 || (b as number) < 0 || (b as number) >= 64 || (t as number) < 0 || (t as number) > 2_000_000_000) return null;
    moves.push([a as number, b as number, t as number]);
  }
  return moves;
}

export type BatchOutcome =
  | Readonly<{ kind: "gap" }>
  | Readonly<{ kind: "replayed"; state: GameState; accepted: number; nextT: number; rejected: Readonly<{ index: number; reason: string }> | null; mismatch: boolean }>;

/**
 * Applies a batch on the server's copy of the game. `from` is how many moves
 * the browser believes were already applied when the batch began: moves below
 * the server's count are a retry and are skipped (nothing is counted twice); a
 * `from` above it means the browser is ahead of anything it could have
 * reported and must take the server's state.
 */
export function replayBatch(
  state: GameState,
  seed: string,
  from: number,
  moves: readonly Move[],
  limits: Readonly<{ nextT: number; nowT: number; maxT?: number }>,
  expectedHash: number | null
): BatchOutcome {
  if (from > state.moves) return { kind: "gap" };
  const stream = createRefillStream(seed);
  const fresh = moves.slice(state.moves - from);
  const result = replayMoves(state, fresh, stream.at, limits);
  const mismatch = result.rejected === null && fresh.length > 0 && expectedHash !== null && stateHash(result.state) !== expectedHash;
  return { kind: "replayed", state: result.state, accepted: result.accepted, nextT: result.nextT, rejected: result.rejected, mismatch };
}

export function windowsFor(seed: string, cursors: readonly number[]): readonly string[] {
  return refillWindow(createRefillStream(seed), cursors);
}

// -------------------------------------------------------- what browsers see

/** A game state's public fields. The board and tallies; never the seed. */
export function publicGameState(state: GameState): GameState {
  return {
    rules: state.rules,
    ...(state.schedule ? { schedule: state.schedule } : {}),
    board: state.board,
    cursors: state.cursors,
    reshuffles: state.reshuffles,
    moves: state.moves,
    coins: state.coins,
    score: state.score,
    matches: state.matches,
    cascades: state.cascades,
    largestClear: state.largestClear,
    bestCombo: state.bestCombo,
    cleared: state.cleared
  };
}

export function isRunRecord(data: Json): boolean {
  return typeof data.id === "string" && typeof data.seed === "string" && isGameState(data.state);
}

export function isRoomRecord(data: Json): boolean {
  return typeof data.id === "string" && typeof data.code === "string" && typeof data.phase === "string" && typeof data.seed === "string";
}

export function toRunPayload(record: Json): Json {
  const state = record.state as GameState;
  const sessionStartMs = Number(record.sessionStartMs);
  return {
    id: record.id,
    epoch: record.epoch,
    version: record.version,
    nextT: record.nextT,
    nowT: Number(record.nowMs) - sessionStartMs,
    state: publicGameState(state),
    windows: windowsFor(record.seed as string, state.cursors),
    balance: record.balance
  };
}

export function newlyEarnedAchievements(totals: Json, before: GameState, after: GameState): string[] {
  const owned = (totals.achievements ?? {}) as Record<string, unknown>;
  const reached = achievementsFor({
    matches: Number(totals.matches ?? 0) + (after.matches - before.matches),
    bestCombo: Math.max(Number(totals.bestCombo ?? 0), after.bestCombo),
    largestClear: Math.max(Number(totals.largestClear ?? 0), after.largestClear),
    lifetimeCoins: Number(totals.lifetimeCoins ?? 0) + (after.coins - before.coins)
  });
  return reached.filter((key: string) => !(key in owned));
}

type StandingRow = Readonly<{ id: string; name: string; emoji: string | null; coins: number; score: number; combo: number; clear: number; moves: number; creator: boolean; rank: number }>;

const publicRow = (row: StandingRow): Json => ({ id: row.id, name: row.name, emoji: row.emoji, coins: row.coins, combo: row.combo, creator: row.creator, rank: row.rank });

const COMPACT_STANDINGS = 5;

/** The standings a screen needs: the leaders plus this player while the game runs, all of them around it. */
export function standingsView(rows: readonly StandingRow[], phase: string, meId: string | null): Json {
  const total = rows.length;
  const tie = (row: StandingRow) => rows.filter((other) => other.rank === row.rank).length > 1;
  const present = (row: StandingRow): Json => ({ ...publicRow(row), tied: tie(row) });
  if (phase !== "ACTIVE" && phase !== "COUNTDOWN") return { total, rows: rows.map(present), me: null };
  const leaders = rows.slice(0, COMPACT_STANDINGS).map(present);
  const mine = meId ? rows.find((row) => row.id === meId) ?? null : null;
  const meVisible = mine ? rows.slice(0, COMPACT_STANDINGS).some((row) => row.id === mine.id) : false;
  return { total, rows: leaders, me: mine && !meVisible ? present(mine) : null };
}

export function toRoomPayload(record: Json): Json {
  const me = (record.me ?? null) as Json | null;
  const standings = (Array.isArray(record.standings) ? record.standings : []) as StandingRow[];
  const phase = record.phase as string;
  return {
    code: record.code,
    phase,
    durationSeconds: record.durationSeconds,
    locked: record.locked,
    version: record.version,
    nowMs: record.nowMs,
    startsAtMs: record.startsAtMs,
    endsAtMs: record.endsAtMs,
    finalized: record.finalized,
    standings: standingsView(standings, phase, typeof me?.id === "string" ? me.id : null),
    me: me ? toSeatPayload(me, record.seed as string, record.startsAtMs as number | null, record.nowMs as number) : null
  };
}

export function toSeatPayload(me: Json, seed: string, startsAtMs: number | null, nowMs: number): Json {
  const state = me.state as GameState;
  return {
    id: me.id,
    name: me.name,
    emoji: me.emoji,
    isCreator: me.isCreator,
    signedIn: me.signedIn,
    version: me.version,
    nextT: me.nextT,
    nowT: startsAtMs === null ? null : nowMs - startsAtMs,
    reward: me.reward,
    state: publicGameState(state),
    windows: windowsFor(seed, state.cursors)
  };
}
