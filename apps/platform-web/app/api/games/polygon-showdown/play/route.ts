import { clientAddress, resolveLimiterSecret } from "@/lib/auth/rate-limit";
import { getGameAccessView } from "@/lib/game-access/server";
import { isInteger, readJsonBody, refused, reply, startTiming, timed, withServerTiming, type Json, type RequestTiming } from "@/lib/games/math-bingo-live/http";
import { isToken, newToken, normalizeRoomCode, subjectHash } from "@/lib/games/math-bingo-live/server";
import { GAME_KEY, hashToken, isPolygonShowdownAvailable, isRoomRecord, parseMoves, replayBatch, toRoomPayload } from "@/lib/games/polygon-showdown/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeEmoji } from "@/public/internal-games/math-bingo-live/src/engine/emoji.js";
import { sanitizeDisplayName } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";
import { TIMING } from "@/public/internal-games/polygon-showdown/src/engine/economy.js";
import type { GameState } from "@/public/internal-games/polygon-showdown/src/engine/game.js";

export const dynamic = "force-dynamic";

// Polygon Showdown player API: everyone in a room, the creator included, plays
// through this. A join needs only a room code and a display name, and returns a
// random seat token that works for that one room and nothing else: it is not a
// session, sets no cookie, and creates no account, wallet or inventory. A
// player who happens to be signed in is noted for a validated reward, and
// plays by exactly the same rules.

const MAX_BODY_BYTES = 4_096;

const ERRORS: Readonly<Record<string, [string, number]>> = Object.freeze({
  "not-found": ["room-not-found", 404],
  "expired": ["room-expired", 410],
  "closed": ["room-closed", 410],
  "finished": ["room-finished", 410],
  "removed": ["removed", 410],
  "locked": ["room-locked", 423],
  "full": ["room-full", 409],
  "rate-limited": ["rate-limited", 429],
  "invalid-name": ["name-invalid", 400],
  "invalid-emoji": ["emoji-invalid", 400]
});

export async function POST(request: Request): Promise<Response> {
  const timing = startTiming();
  return withServerTiming(await handle(request, timing), timing);
}

/** The signed-in account behind this request, if any. Never required to play. */
async function signedInAccount(request: Request, timing: RequestTiming): Promise<string | null> {
  if (!(request.headers.get("cookie") ?? "").includes("sb-")) return null;
  const access = await timed(timing, "access", () => getGameAccessView());
  return access.principal?.kind === "consumer" ? access.principal.id : null;
}

async function handle(request: Request, timing: RequestTiming): Promise<Response> {
  const body = await readJsonBody(request, MAX_BODY_BYTES, GAME_KEY);
  if (body instanceof Response) return body;

  const client = createServiceSupabaseClient();
  if (!client) return refused("live-unavailable", 503);

  const call = async (fn: string, args: Json): Promise<Json | null> => {
    const { data, error } = await timed(timing, "db", () => client.rpc(fn, args));
    if (error || !data || typeof data !== "object") return null;
    return data as Json;
  };

  const roomReply = (data: Json | null, extra: Json = {}): Response => {
    if (!data) return refused("live-unavailable", 503);
    const result = typeof data.result === "string" ? data.result : "";
    if (!isRoomRecord(data)) {
      const mapped = ERRORS[result];
      return mapped ? refused(mapped[0], mapped[1]) : refused("live-unavailable", 503);
    }
    return reply({ result, room: toRoomPayload(data), ...extra });
  };

  const action = body.action;

  if (action === "join") {
    if (!(await isPolygonShowdownAvailable())) return refused("not-available", 404);
    const code = normalizeRoomCode(body.code);
    if (!code) return refused("invalid-code", 400);
    const name = sanitizeDisplayName(body.name);
    if (!name.ok) return refused(name.error, 400);
    const emoji = normalizeEmoji(body.emoji);
    if (!emoji.ok) return refused(emoji.error, 400);
    const token = newToken();
    const account = await signedInAccount(request, timing);
    const data = await call("polygon_join_room", {
      p_code: code,
      p_name: name.name,
      p_emoji: emoji.emoji,
      p_token_hash: hashToken("player", token),
      p_subject_hash: subjectHash(resolveLimiterSecret(), clientAddress(request.headers)),
      p_user: account
    });
    return roomReply(data, { token });
  }

  if (!isToken(body.token)) return refused("seat-not-found", 404);
  const tokenHash = hashToken("player", body.token);

  if (action === "state") {
    const load = await call("polygon_player_load", { p_token_hash: tokenHash });
    if (load?.result === "not-found") return refused("seat-not-found", 404);
    if (!load || !isRoomRecord(load)) return roomReply(load);

    // A quiet lobby answers in a few bytes.
    if (load.phase === "LOBBY" && isInteger(body.since, 0, Number.MAX_SAFE_INTEGER) && body.since === load.version) {
      return reply({ result: "unchanged", nowMs: load.nowMs });
    }

    const moves = body.moves === undefined ? [] : parseMoves(body.moves);
    if (!moves) return refused("invalid-request", 400);
    if (moves.length === 0) return roomReply(load);

    if (!isInteger(body.from, 0, 100_000_000)) return refused("invalid-request", 400);
    const me = load.me as Json;
    const before = me.state as GameState;
    const startsAtMs = Number(load.startsAtMs);
    const nowMs = Number(load.nowMs);
    const durationMs = Number(load.durationSeconds) * 1000;
    const graceEnd = Number(load.endsAtMs) + TIMING.SHOWDOWN_GRACE_MS;
    if ((load.phase !== "ACTIVE" && load.phase !== "COMPLETE") || nowMs > graceEnd || load.finalized === true) {
      return roomReply(load, { ack: before.moves, rejected: "not-running" });
    }
    const maxT = Math.min(durationMs, Number(load.endsAtMs) - startsAtMs);
    const expected = isInteger(body.h, 0, 4_294_967_295) ? body.h : null;
    const outcome = replayBatch(before, load.seed as string, body.from as number, moves, { nextT: Number(me.nextT), nowT: nowMs - startsAtMs, maxT }, expected);
    if (outcome.kind === "gap") return roomReply(load, { ack: before.moves, resync: true });
    if (outcome.accepted === 0) {
      return roomReply(load, { ack: before.moves, resync: outcome.rejected !== null, rejected: outcome.rejected?.reason ?? null });
    }
    const commit = await call("polygon_player_commit", { p_token_hash: tokenHash, p_version: me.version, p_state: outcome.state, p_next_t: outcome.nextT });
    if (commit?.result !== "ok") return roomReply(load, { ack: before.moves, resync: true });
    return roomReply(
      { ...load, me: { ...me, state: outcome.state, version: commit.version, nextT: outcome.nextT } },
      { ack: outcome.state.moves, resync: outcome.rejected !== null || outcome.mismatch, rejected: outcome.rejected?.reason ?? null }
    );
  }

  if (action === "leave") {
    await call("polygon_leave", { p_token_hash: tokenHash });
    return reply({ result: "left" });
  }

  return refused("invalid-request", 400);
}

export function GET(): Response {
  return refused("method-not-allowed", 405);
}
