import { canPlayGame } from "@/lib/access/server";
import { resolveLimiterSecret } from "@/lib/auth/rate-limit";
import { getGameAccessView } from "@/lib/game-access/server";
import { isInteger, readJsonBody, refused, reply, type Json } from "@/lib/games/math-bingo-live/http";
import {
  GAME_KEY,
  buildGame,
  generateRoomCode,
  hashToken,
  isMathBingoLiveAvailable,
  isRoomRecord,
  isToken,
  newGameSeed,
  newToken,
  ownerHash,
  toHostState
} from "@/lib/games/math-bingo-live/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeSettings } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";

export const dynamic = "force-dynamic";

// Math Bingo Live host API. The host is a signed-in MathNexa account (any
// confirmed account or a school access session: lib/games/access-policy.ts
// classifies the game "authenticated-free"). Every command needs BOTH that
// session (matched by a keyed owner hash) AND the room's current host token,
// so a room code — which students see — can never command a room.

const MAX_BODY_BYTES = 4_096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const ERRORS: Readonly<Record<string, [string, number]>> = Object.freeze({
  "not-found": ["room-not-found", 404],
  "rate-limited": ["rate-limited", 429],
  "invalid-settings": ["invalid-settings", 400],
  "invalid-request": ["invalid-request", 400]
});

const COMMANDS = new Set(["pause", "resume", "next", "end", "change-settings", "close", "lock", "unlock", "remove", "settings", "audio", "code"]);

export async function POST(request: Request): Promise<Response> {
  const body = await readJsonBody(request, MAX_BODY_BYTES);
  if (body instanceof Response) return body;

  const access = await getGameAccessView();
  if (!canPlayGame(access, GAME_KEY) || !access.principal) return refused("host-sign-in-required", 401);

  const client = createServiceSupabaseClient();
  if (!client) return refused("live-unavailable", 503);
  const owner = ownerHash(resolveLimiterSecret(), access.principal);

  const call = async (fn: string, args: Json): Promise<Json | null> => {
    const { data, error } = await client.rpc(fn, args);
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
    return reply({ result, state: toHostState(data), ...extra });
  };

  const action = body.action;

  if (action === "create" || action === "resume") {
    if (!(await isMathBingoLiveAvailable())) return refused("not-available", 404);
    const hostToken = newToken();
    if (action === "resume") {
      const data = await call("bingo_host_resume", { p_owner_hash: owner, p_new_token_hash: hashToken("host", hostToken) });
      if (data?.result === "not-found") return refused("no-live-room", 404);
      return roomReply(data, { hostToken });
    }
    const settings = normalizeSettings(body.settings);
    if (!settings.ok) return refused(settings.error, 400);
    // Collisions are retried with a fresh code; the database refuses a code
    // that is still live, so two open rooms can never share one.
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const data = await call("bingo_create_room", {
        p_code: generateRoomCode(),
        p_owner_hash: owner,
        p_host_token_hash: hashToken("host", hostToken),
        p_settings: settings.settings
      });
      if (data?.result === "code-taken") continue;
      return roomReply(data, { hostToken });
    }
    return refused("live-unavailable", 503);
  }

  if (!isToken(body.hostToken)) return refused("room-not-found", 404);
  const seat = { p_owner_hash: owner, p_token_hash: hashToken("host", body.hostToken) };

  if (action === "state") {
    const since = isInteger(body.since, 0, Number.MAX_SAFE_INTEGER) ? body.since : null;
    const data = await call("bingo_host_state", { ...seat, p_since_version: since });
    if (data?.result === "unchanged") {
      return reply({ result: "unchanged", version: data.version, serverNow: data.serverNow, presence: Array.isArray(data.players) ? data.players : [] });
    }
    return roomReply(data);
  }

  if (action === "start" || action === "again") {
    const current = await call("bingo_host_state", { ...seat, p_since_version: null });
    if (!current || !isRoomRecord(current)) return roomReply(current);
    const settings = normalizeSettings(current.settings);
    if (!settings.ok) return refused("invalid-settings", 400);
    const seed = newGameSeed();
    const game = buildGame(settings.settings, seed);
    const data = await call("bingo_host_start", {
      ...seat,
      p_kind: action,
      p_settings: settings.settings,
      p_seed: seed,
      p_pool: game.pool,
      p_deck: game.deck
    });
    return roomReply(data);
  }

  if (typeof action !== "string" || !COMMANDS.has(action)) return refused("invalid-request", 400);
  let args: Json = {};
  if (action === "next") {
    if (typeof body.phase !== "string" || !isInteger(body.question, 0, 1000)) return refused("invalid-request", 400);
    args = { phase: body.phase, question: body.question };
  } else if (action === "remove") {
    if (typeof body.participant !== "string" || !UUID_PATTERN.test(body.participant)) return refused("invalid-request", 400);
    args = { participant: body.participant };
  } else if (action === "settings") {
    const settings = normalizeSettings(body.settings);
    if (!settings.ok) return refused(settings.error, 400);
    args = { settings: settings.settings };
  } else if (action === "audio") {
    const allowed = ["host", "all", "off"];
    if (!allowed.includes(body.music as string) || !allowed.includes(body.celebration as string)) return refused("invalid-settings", 400);
    args = { music: body.music, celebration: body.celebration };
  } else if (action === "code") {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const data = await call("bingo_host_command", { ...seat, p_command: "code", p_args: { code: generateRoomCode() } });
      if (data?.result === "code-taken") continue;
      return roomReply(data);
    }
    return refused("live-unavailable", 503);
  }
  return roomReply(await call("bingo_host_command", { ...seat, p_command: action, p_args: args }));
}

export function GET(): Response {
  return refused("method-not-allowed", 405);
}
