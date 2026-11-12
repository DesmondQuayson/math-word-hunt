import { clientAddress, resolveLimiterSecret } from "@/lib/auth/rate-limit";
import { getGameAccessView } from "@/lib/game-access/server";
import { isInteger, readJsonBody, refused, reply, startTiming, timed, withServerTiming, type Json, type RequestTiming } from "@/lib/games/math-bingo-live/http";
import { isToken, newToken, normalizeRoomCode, subjectHash } from "@/lib/games/math-bingo-live/server";
import {
  GAME_KEY,
  ONLINE_SPEC,
  hashToken,
  isColour,
  isMathRaceChampionsAvailable,
  isRoomRecord,
  judgeAnswer,
  liveRoomGameForCode,
  newRacerState,
  seatQuestion,
  toRoomPayload,
  type RoomRecord
} from "@/lib/games/math-race-champions/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeEmoji } from "@/public/internal-games/math-bingo-live/src/engine/emoji.js";
import { sanitizeDisplayName } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";
import { advance, type RacerState } from "@/public/internal-games/math-race-champions/src/engine/race.js";

export const dynamic = "force-dynamic";

// Math Race Champions racer API: everyone in an Online Race, the creator
// included, races through this. A join needs only a room code and a display
// name, and returns a random seat token that works for that one room and
// nothing else: it is not a session, sets no cookie, and creates no account,
// wallet or car. Every racer drives the same car (ONLINE_SPEC): there is no
// field in any request that could select another.

const MAX_BODY_BYTES = 2_048;

const ERRORS: Readonly<Record<string, [string, number]>> = Object.freeze({
  "not-found": ["room-not-found", 404],
  "expired": ["room-expired", 410],
  "closed": ["room-closed", 410],
  "finished": ["room-finished", 410],
  "started": ["room-started", 409],
  "removed": ["removed", 410],
  "locked": ["room-locked", 423],
  "full": ["room-full", 409],
  "rate-limited": ["rate-limited", 429],
  "invalid-name": ["name-invalid", 400],
  "invalid-emoji": ["emoji-invalid", 400],
  "invalid-request": ["invalid-request", 400]
});

export async function POST(request: Request): Promise<Response> {
  const timing = startTiming();
  return withServerTiming(await handle(request, timing), timing);
}

/** The signed-in account behind this request, if any. Never required to race. */
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

  const failure = (data: Json | null): Response => {
    const mapped = ERRORS[typeof data?.result === "string" ? data.result : ""];
    return mapped ? refused(mapped[0], mapped[1]) : refused("live-unavailable", 503);
  };

  const action = body.action;

  if (action === "join") {
    if (!(await isMathRaceChampionsAvailable())) return refused("not-available", 404);
    const code = normalizeRoomCode(body.code);
    if (!code) return refused("invalid-code", 400);
    // A code that belongs to another live game is not a failed guess here.
    const owner = await liveRoomGameForCode(code);
    if (owner && owner !== "math_race_champions") return reply({ result: "other-game", game: owner, href: `/join?code=${code}` });
    const name = sanitizeDisplayName(body.name);
    if (!name.ok) return refused(name.error, 400);
    const emoji = normalizeEmoji(body.emoji);
    if (!emoji.ok) return refused(emoji.error, 400);
    const colour = isColour(body.colour) ? body.colour : "turquoise";
    const token = newToken();
    const account = await signedInAccount(request, timing);
    const data = await call("race_join_room", {
      p_code: code,
      p_name: name.name,
      p_emoji: emoji.emoji,
      p_colour: colour,
      p_token_hash: hashToken("player", token),
      p_subject_hash: subjectHash(resolveLimiterSecret(), clientAddress(request.headers)),
      p_user: account,
      p_state: newRacerState()
    });
    if (!data || !isRoomRecord(data)) return failure(data);
    return reply({ result: "joined", token, room: toRoomPayload(data) });
  }

  if (!isToken(body.token)) return refused("seat-not-found", 404);
  const tokenHash = hashToken("player", body.token);

  if (action === "leave") {
    await call("race_leave", { p_token_hash: tokenHash });
    return reply({ result: "left" });
  }

  if (action !== "state" && action !== "answer") return refused("invalid-request", 400);

  const load = await call("race_player_load", { p_token_hash: tokenHash });
  if (load?.result === "not-found") return refused("seat-not-found", 404);
  if (!load || !isRoomRecord(load)) return failure(load);

  const room: RoomRecord = load;
  const mine = room.me.state;
  const raceMs = room.startsAtMs === null ? -1 : room.nowMs - room.startsAtMs;
  const endMs = room.endsAtMs === null || room.startsAtMs === null ? null : room.endsAtMs - room.startsAtMs;

  const save = async (state: RacerState): Promise<number | null> => {
    const commit = await call("race_player_commit", { p_token_hash: tokenHash, p_version: room.me.version, p_state: state });
    return commit?.result === "ok" && Number.isInteger(commit.version) ? (commit.version as number) : null;
  };

  if (action === "state") {
    // A quiet lobby answers in a few bytes.
    if (room.phase === "LOBBY" && isInteger(body.since, 0, Number.MAX_SAFE_INTEGER) && body.since === room.version) {
      return reply({ result: "unchanged", nowMs: room.nowMs });
    }
    if (mine.finishMs === null && !room.finalized) {
      // The clock alone can carry a car over the line, or to where it stood when
      // the race ended; either is recorded the next time this racer checks in.
      const until = room.phase === "ACTIVE" ? raceMs : room.phase === "COMPLETE" && endMs !== null ? endMs : null;
      if (until !== null && until > mine.t) {
        const now = advance(mine, ONLINE_SPEC, until);
        if (now.finishMs !== null || room.phase === "COMPLETE") {
          const version = await save(now);
          if (version !== null) return reply({ result: "ok", room: toRoomPayload(room, now, version) });
        }
      }
    }
    return reply({ result: "ok", room: toRoomPayload(room) });
  }

  // action === "answer"
  if (room.phase !== "ACTIVE" || room.finalized) {
    return reply({ result: room.phase === "COUNTDOWN" || room.phase === "LOBBY" ? "not-started" : "race-over", room: toRoomPayload(room) });
  }
  const judged = judgeAnswer(mine, ONLINE_SPEC, raceMs, body.index, body.choice, (index) => seatQuestion(room, index));
  if (judged.kind === "finished") {
    const version = await save(judged.state);
    return reply({ result: "finished", room: toRoomPayload(room, version === null ? mine : judged.state, version ?? room.me.version) });
  }
  if (judged.kind !== "answered") return reply({ result: judged.kind, room: toRoomPayload(room) });
  // If the race ended while this was in flight, the database refuses it.
  const version = await save(judged.state);
  if (version === null) return reply({ result: "stale", room: toRoomPayload(room) });
  return reply({ result: "ok", correct: judged.correct, answer: judged.answer, choice: judged.choiceIndex, room: toRoomPayload(room, judged.state, version) });
}

export function GET(): Response {
  return refused("method-not-allowed", 405);
}
