import { hasMathNexaModuleAccess } from "@math-vocabulary-hunt/platform-core";

import { isSameOriginAdminRequest } from "@/lib/admin/security";
import { resolveLimiterSecret } from "@/lib/auth/rate-limit";
import { getGameAccessView } from "@/lib/game-access/server";
import {
  checkSubmission,
  generateRoomCode,
  hashPlayerToken,
  isPlayerToken,
  isTugRoomRecord,
  newPlayerToken,
  newQuestionSeed,
  normalizeRoomCode,
  ownerHash,
  sanitizeOnlineName,
  toClientState,
  type TugRoomRecord
} from "@/lib/games/math-tug-of-war/online";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { isSkillId } from "@/public/internal-games/math-tug-of-war/src/questions.js";

export const dynamic = "force-dynamic";

// Online Match API for Math Tug of War. One same-origin JSON endpoint so the
// game document keeps `connect-src 'self'`. Every action requires the same
// Math Games access as the game itself (all-access subscription or a school
// access session). Outcomes are decided here and in the database, never in
// the browser.

const MAX_BODY_BYTES = 2_048;
const NO_STORE = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" } as const;

type Json = Record<string, unknown>;

function reply(body: Json, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function refused(error: string, status: number): Response {
  return reply({ error }, status);
}

function isSameOriginGameRequest(request: Request): boolean {
  if (request.headers.get("x-mathnexa-game") !== "math-tug-of-war") return false;
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return false;
  return site === "same-origin" || isSameOriginAdminRequest(request.headers);
}

const ROOM_ERRORS: Readonly<Record<string, [string, number]>> = Object.freeze({
  "not-found": ["room-not-found", 404],
  "expired": ["room-expired", 410],
  "full": ["room-full", 409],
  "already-host": ["already-in-room", 409],
  "rate-limited": ["rate-limited", 429]
});

export async function POST(request: Request): Promise<Response> {
  if (!isSameOriginGameRequest(request)) return refused("forbidden", 403);
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) return refused("unsupported-media-type", 415);

  const access = await getGameAccessView();
  if (!hasMathNexaModuleAccess(access.decision, "games") || !access.principal) return refused("game-access-required", 401);

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return refused("payload-too-large", 413);
  let body: Json;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return refused("invalid-request", 400);
    body = parsed as Json;
  } catch {
    return refused("invalid-request", 400);
  }

  const client = createServiceSupabaseClient();
  if (!client) return refused("online-unavailable", 503);

  const call = async (fn: string, args: Json): Promise<Json | null> => {
    const { data, error } = await client.rpc(fn, args);
    if (error || !data || typeof data !== "object") return null;
    return data as Json;
  };
  const roomReply = (data: Json | null, extra: Json = {}): Response => {
    if (!data) return refused("online-unavailable", 503);
    const result = typeof data.result === "string" ? data.result : "";
    if (!isTugRoomRecord(data)) {
      const mapped = ROOM_ERRORS[result];
      return mapped ? refused(mapped[0], mapped[1]) : refused("online-unavailable", 503);
    }
    return reply({ state: toClientState(data as TugRoomRecord), ...extra });
  };

  const action = body.action;
  const owner = ownerHash(resolveLimiterSecret(), access.principal);

  if (action === "create") {
    if (!isSkillId(body.skill)) return refused("invalid-skill", 400);
    const token = newPlayerToken();
    const name = sanitizeOnlineName(body.name, "turquoise");
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const data = await call("tug_create_room", {
        p_code: generateRoomCode(),
        p_skill: body.skill,
        p_seed: newQuestionSeed(),
        p_host_name: name,
        p_host_token_hash: hashPlayerToken(token),
        p_owner_hash: owner
      });
      if (data?.result === "code-taken") continue;
      if (data && isTugRoomRecord(data)) return reply({ state: toClientState(data as TugRoomRecord), token });
      return roomReply(data);
    }
    return refused("online-unavailable", 503);
  }

  if (action === "join") {
    const code = normalizeRoomCode(body.code);
    if (!code) return refused("invalid-code", 400);
    const token = newPlayerToken();
    const data = await call("tug_join_room", {
      p_code: code,
      p_guest_name: sanitizeOnlineName(body.name, "pink"),
      p_guest_token_hash: hashPlayerToken(token),
      p_owner_hash: owner
    });
    if (data && isTugRoomRecord(data)) return reply({ state: toClientState(data as TugRoomRecord), token });
    return roomReply(data);
  }

  // Every other action acts on an existing seat.
  const code = normalizeRoomCode(body.code);
  if (!code || !isPlayerToken(body.token)) return refused("room-not-found", 404);
  const seat = { p_code: code, p_token_hash: hashPlayerToken(body.token) };

  if (action === "state") return roomReply(await call("tug_room_state", seat));

  if (action === "answer") {
    const round = body.round;
    const questionIndex = body.questionIndex;
    if (!Number.isInteger(round) || !Number.isInteger(questionIndex) || typeof body.answer !== "string") {
      return refused("invalid-request", 400);
    }
    const current = await call("tug_room_state", seat);
    if (!current || !isTugRoomRecord(current)) return roomReply(current);
    const record = current as TugRoomRecord;
    if (record.status !== "playing" || record.round !== round || record.questionIndex !== questionIndex) {
      return reply({ state: toClientState(record, "stale") });
    }
    const verdict = checkSubmission(record, body.answer);
    if (!verdict.valid) return reply({ state: toClientState(record, "invalid") });
    const applied = await call("tug_submit_answer", { ...seat, p_round: round, p_question_index: questionIndex, p_correct: verdict.correct });
    // The solved answer is revealed only after this player has answered it.
    return roomReply(applied, applied?.result === "correct" || applied?.result === "incorrect" ? { solved: verdict.answer } : {});
  }

  if (action === "rematch") {
    if (!Number.isInteger(body.round)) return refused("invalid-request", 400);
    return roomReply(await call("tug_request_rematch", { ...seat, p_round: body.round }));
  }

  if (action === "leave") return roomReply(await call("tug_leave_room", seat));

  return refused("invalid-request", 400);
}

export function GET(): Response {
  return refused("method-not-allowed", 405);
}
