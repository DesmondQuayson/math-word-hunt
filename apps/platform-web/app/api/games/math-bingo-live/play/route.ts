import { clientAddress, resolveLimiterSecret } from "@/lib/auth/rate-limit";
import { isInteger, readJsonBody, refused, reply, startTiming, timed, withServerTiming, type Json, type RequestTiming } from "@/lib/games/math-bingo-live/http";
import {
  cellLabel,
  dealFor,
  hashToken,
  isMathBingoLiveAvailable,
  isRoomRecord,
  isToken,
  newToken,
  normalizeRoomCode,
  subjectHash,
  toPlayerState
} from "@/lib/games/math-bingo-live/server";
import { isPolygonShowdownAvailable, liveRoomGameForCode } from "@/lib/games/polygon-showdown/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeEmoji } from "@/public/internal-games/math-bingo-live/src/engine/emoji.js";
import { sanitizeDisplayName } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";

export const dynamic = "force-dynamic";

// Math Bingo Live player API. Students have no MathNexa account: a join
// needs only a game code and a display name, and returns a random seat token
// that works for that one room and nothing else (it is not a session, sets no
// cookie, and is checked only by these room functions). The server — never
// the browser — decides whether a mark is right, on time and allowed.

const MAX_BODY_BYTES = 1_024;

const ERRORS: Readonly<Record<string, [string, number]>> = Object.freeze({
  "not-found": ["room-not-found", 404],
  "expired": ["room-expired", 410],
  "closed": ["room-closed", 410],
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

async function handle(request: Request, timing: RequestTiming): Promise<Response> {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (body instanceof Response) return body;

  const client = createServiceSupabaseClient();
  if (!client) return refused("live-unavailable", 503);

  const call = async (fn: string, args: Json): Promise<Json | null> => {
    const { data, error } = await timed(timing, "db", () => client.rpc(fn, args));
    if (error || !data || typeof data !== "object") return null;
    return data as Json;
  };

  // A joined player whose game has started gets their card dealt from the
  // game's secret seed; the database stores it only if it is the room's pool.
  const withCard = async (data: Json | null, tokenHash: string): Promise<Json | null> => {
    if (!data || data.needsBoard !== true || !data.me || typeof data.me !== "object") return data;
    const participantId = (data.me as Json).id;
    if (typeof participantId !== "string") return data;
    const card = dealFor(data, participantId);
    if (!card) return data;
    const stored = await call("bingo_set_board", { p_token_hash: tokenHash, p_game: data.gameNumber, p_board: card });
    return stored && isRoomRecord(stored) ? stored : data;
  };

  const roomReply = (data: Json | null, extra: Json = {}): Response => {
    if (!data) return refused("live-unavailable", 503);
    const result = typeof data.result === "string" ? data.result : "";
    if (!isRoomRecord(data)) {
      const mapped = ERRORS[result];
      return mapped ? refused(mapped[0], mapped[1]) : refused("live-unavailable", 503);
    }
    return reply({ result, state: toPlayerState(data), ...extra });
  };

  const action = body.action;

  if (action === "join") {
    if (!(await isMathBingoLiveAvailable())) return refused("not-available", 404);
    const code = normalizeRoomCode(body.code);
    if (!code) return refused("invalid-code", 400);
    const name = sanitizeDisplayName(body.name);
    if (!name.ok) return refused(name.error, 400);
    // Optional and decorative: one of the curated choices exactly, or none.
    const emoji = normalizeEmoji(body.emoji);
    if (!emoji.ok) return refused(emoji.error, 400);
    // One join page serves every live game: a code owned by a Polygon Showdown
    // room goes there, before it can count as a failed Bingo code.
    if ((await liveRoomGameForCode(code)) === "polygon_showdown" && (await isPolygonShowdownAvailable())) {
      return reply({ result: "other-game", game: "polygon_showdown", href: `/join?code=${code}` });
    }
    const token = newToken();
    const tokenHash = hashToken("player", token);
    const data = await call("bingo_join_room", {
      p_code: code,
      p_name: name.name,
      p_token_hash: tokenHash,
      p_subject_hash: subjectHash(resolveLimiterSecret(), clientAddress(request.headers)),
      p_emoji: emoji.emoji
    });
    if (!data || !isRoomRecord(data)) return roomReply(data);
    return roomReply(await withCard(data, tokenHash), { token });
  }

  if (!isToken(body.token)) return refused("seat-not-found", 404);
  const tokenHash = hashToken("player", body.token);

  if (action === "state") {
    const since = isInteger(body.since, 0, Number.MAX_SAFE_INTEGER) ? body.since : null;
    const sinceMe = isInteger(body.sinceMe, 0, Number.MAX_SAFE_INTEGER) ? body.sinceMe : null;
    const data = await call("bingo_player_state", { p_token_hash: tokenHash, p_since_version: since, p_since_me: sinceMe });
    if (data?.result === "unchanged") return reply({ result: "unchanged", version: data.version, meVersion: data.meVersion, serverNow: data.serverNow });
    if (data?.result === "not-found") return refused("seat-not-found", 404);
    return roomReply(await withCard(data, tokenHash));
  }

  if (action === "mark") {
    if (!isInteger(body.game, 1, 1_000_000) || !isInteger(body.question, 1, 1000) || !isInteger(body.cell, 0, 24)) return refused("invalid-request", 400);
    const data = await call("bingo_mark", { p_token_hash: tokenHash, p_game: body.game, p_question: body.question, p_cell: body.cell });
    if (data?.result === "not-found") return refused("seat-not-found", 404);
    // Private feedback for a wrong tap names what the tapped cell shows,
    // never which cell would have been right.
    let tapped: string | null = null;
    if (data?.result === "incorrect" && data.me && typeof data.me === "object") {
      const board = (data.me as Json).board;
      tapped = Array.isArray(board) ? cellLabel(board[body.cell as number] as never) || null : null;
    }
    return roomReply(data, tapped ? { tapped } : {});
  }

  if (action === "free") {
    if (!isInteger(body.game, 1, 1_000_000) || !isInteger(body.question, 1, 1000)) return refused("invalid-request", 400);
    const data = await call("bingo_free_space", { p_token_hash: tokenHash, p_game: body.game, p_question: body.question });
    if (data?.result === "not-found") return refused("seat-not-found", 404);
    return roomReply(data);
  }

  if (action === "leave") {
    await call("bingo_leave", { p_token_hash: tokenHash });
    return reply({ result: "left" });
  }

  return refused("invalid-request", 400);
}

export function GET(): Response {
  return refused("method-not-allowed", 405);
}
