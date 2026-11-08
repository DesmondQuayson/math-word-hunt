import { createHash } from "node:crypto";

import { canPlayGame } from "@/lib/access/server";
import { resolveLimiterSecret } from "@/lib/auth/rate-limit";
import { getGameAccessView } from "@/lib/game-access/server";
import { isInteger, readJsonBody, refused, reply, startTiming, timed, withServerTiming, type Json, type RequestTiming } from "@/lib/games/math-bingo-live/http";
import { generateRoomCode, isToken, newToken } from "@/lib/games/math-bingo-live/server";
import {
  DURATIONS_SECONDS,
  GAME_KEY,
  hashToken,
  isLocalOwnerPreview,
  isPolygonShowdownAvailable,
  isRoomRecord,
  isRunRecord,
  isUuid,
  newlyEarnedAchievements,
  newSeed,
  ownerHash,
  parseMoves,
  replayBatch,
  showdownOpeningState,
  soloOpeningState,
  toRoomPayload,
  toRunPayload,
  windowsFor
} from "@/lib/games/polygon-showdown/server";
import { SCHOOL_ACCESS_COOKIE } from "@/lib/school-access/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeEmoji } from "@/public/internal-games/math-bingo-live/src/engine/emoji.js";
import { sanitizeDisplayName } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";
import { normalizeAvatar } from "@/public/internal-games/polygon-showdown/src/engine/catalog.js";
import { BANK_EVERY_COINS, BANK_EVERY_MS } from "@/public/internal-games/polygon-showdown/src/engine/economy.js";
import type { GameState } from "@/public/internal-games/polygon-showdown/src/engine/game.js";

export const dynamic = "force-dynamic";

// Polygon Showdown account API. Everything here needs a MathNexa session.
// Permanent progress (Solo runs, wallet, shop, avatar) needs a real account: a
// school access session can open the game and create a room, but it has no
// user id, so nothing permanent can ever be written for it. Creator commands
// need BOTH the session (matched by a keyed owner hash) AND the room's current
// host token, so a room code, which players see, can never command a room.

const MAX_BODY_BYTES = 4_096;

const ROOM_ERRORS: Readonly<Record<string, [string, number]>> = Object.freeze({
  "not-found": ["room-not-found", 404],
  "rate-limited": ["rate-limited", 429],
  "invalid-request": ["invalid-request", 400],
  "invalid-name": ["name-invalid", 400],
  "invalid-emoji": ["emoji-invalid", 400]
});

const ACCESS_REUSE_MS = 15_000;
const ACCESS_CACHE_MAX = 1_000;
type Principal = Readonly<{ kind: string; id: string }>;
const accessCache = new Map<string, { at: number; principal: Principal }>();

function sessionKey(request: Request): string | null {
  const parts = (request.headers.get("cookie") ?? "").split(";").map((part) => part.trim())
    .filter((part) => part.startsWith("sb-") || part.startsWith(`${SCHOOL_ACCESS_COOKIE}=`));
  return parts.length ? createHash("sha256").update(parts.sort().join("\n")).digest("hex") : null;
}

// Saving a run happens every few seconds, so it may reuse a sign-in check made
// in the last 15 seconds by the same session cookies. Buying, saving an avatar
// and every creator command always check the session in full.
async function resolvePrincipal(request: Request, reusable: boolean, now = Date.now()): Promise<Principal | null> {
  const key = sessionKey(request);
  if (!key) return null;
  const cached = accessCache.get(key);
  if (reusable && cached && now - cached.at < ACCESS_REUSE_MS) return cached.principal;
  const access = await getGameAccessView();
  if (!canPlayGame(access, GAME_KEY) || !access.principal) {
    accessCache.delete(key);
    return null;
  }
  if (accessCache.size >= ACCESS_CACHE_MAX) accessCache.clear();
  accessCache.set(key, { at: now, principal: access.principal });
  return access.principal;
}

export async function POST(request: Request): Promise<Response> {
  const timing = startTiming();
  return withServerTiming(await handle(request, timing), timing);
}

async function handle(request: Request, timing: RequestTiming): Promise<Response> {
  const body = await readJsonBody(request, MAX_BODY_BYTES, GAME_KEY);
  if (body instanceof Response) return body;
  if (!(await isPolygonShowdownAvailable())) return refused("not-available", 404);

  const principal = await timed(timing, "access", () => resolvePrincipal(request, body.action === "solo-sync"));
  if (!principal) return refused("sign-in-required", 401);

  const client = createServiceSupabaseClient();
  if (!client) return refused("live-unavailable", 503);

  const call = async (fn: string, args: Json): Promise<Json | null> => {
    const { data, error } = await timed(timing, "db", () => client.rpc(fn, args));
    if (error || !data || typeof data !== "object") return null;
    return data as Json;
  };

  const action = body.action;
  const accountId = principal.kind === "consumer" ? principal.id : null;

  // ------------------------------------------------- rooms (any session)

  if (action === "create-room") {
    if (!DURATIONS_SECONDS.includes(body.durationSeconds as number)) return refused("invalid-request", 400);
    const difficulty = body.difficulty === "challenge" ? "challenge" : "standard";
    const name = sanitizeDisplayName(body.name);
    if (!name.ok) return refused(name.error, 400);
    const emoji = normalizeEmoji(body.emoji);
    if (!emoji.ok) return refused(emoji.error, 400);
    const owner = ownerHash(resolveLimiterSecret(), principal);
    const hostToken = newToken();
    const seatToken = newToken();
    const seed = newSeed();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const data = await call("polygon_create_room", {
        p_code: generateRoomCode(),
        p_owner_hash: owner,
        p_host_token_hash: hashToken("host", hostToken),
        p_player_token_hash: hashToken("player", seatToken),
        p_user: accountId,
        p_name: name.name,
        p_emoji: emoji.emoji,
        p_duration: body.durationSeconds,
        p_seed: seed,
        p_state: showdownOpeningState(seed, difficulty)
      });
      if (data?.result === "code-taken") continue;
      if (!data || !isRoomRecord(data)) {
        const mapped = ROOM_ERRORS[String(data?.result ?? "")];
        return mapped ? refused(mapped[0], mapped[1]) : refused("live-unavailable", 503);
      }
      return reply({ result: "created", hostToken, token: seatToken, room: toRoomPayload(data) });
    }
    return refused("live-unavailable", 503);
  }

  if (action === "resume-room") {
    const owner = ownerHash(resolveLimiterSecret(), principal);
    const hostToken = newToken();
    const seatToken = newToken();
    const data = await call("polygon_host_resume", { p_owner_hash: owner, p_new_host_hash: hashToken("host", hostToken), p_new_player_hash: hashToken("player", seatToken) });
    if (data?.result === "not-found") return refused("no-live-room", 404);
    if (!data || !isRoomRecord(data)) return refused("live-unavailable", 503);
    return reply({ result: "resumed", hostToken, token: seatToken, room: toRoomPayload(data) });
  }

  if (action === "host") {
    if (!isToken(body.hostToken) || typeof body.command !== "string") return refused("invalid-request", 400);
    const owner = ownerHash(resolveLimiterSecret(), principal);
    const data = await call("polygon_host_command", {
      p_owner_hash: owner,
      p_token_hash: hashToken("host", body.hostToken),
      p_command: body.command,
      p_args: isUuid(body.participant) ? { participant: body.participant } : {}
    });
    if (data?.result === "closed") return reply({ result: "closed" });
    if (!data || !isRoomRecord(data)) {
      const mapped = ROOM_ERRORS[String(data?.result ?? "")];
      return mapped ? refused(mapped[0], mapped[1]) : refused("live-unavailable", 503);
    }
    return reply({
      result: data.result as string,
      phase: data.phase,
      locked: data.locked,
      nowMs: data.nowMs,
      startsAtMs: data.startsAtMs,
      endsAtMs: data.endsAtMs,
      ...(Array.isArray(data.players) ? { players: data.players } : {})
    });
  }

  // ---------------------------------------- permanent progress (accounts only)

  if (action === "bootstrap") {
    if (!accountId) return reply({ result: "ok", guest: true, kind: principal.kind });
    const data = await call("polygon_bootstrap", { p_user: accountId });
    if (!data) return refused("live-unavailable", 503);
    return reply({ result: "ok", guest: false, wallet: data.wallet, profile: data.profile, inventory: data.inventory, activeRun: data.activeRun });
  }

  // The draft catalog card, for the local owner review only.
  if (action === "catalog-preview") {
    if (!isLocalOwnerPreview()) return refused("not-available", 404);
    const { data } = await timed(timing, "db", () => client.from("game_catalog_entries").select("title,description,status,recommended_grade_min,recommended_grade_max,publication_metadata").eq("stable_key", GAME_KEY).maybeSingle());
    const row = data as { title: string; description: string; status: string; recommended_grade_min: number; recommended_grade_max: number; publication_metadata: Json } | null;
    if (!row) return refused("not-available", 404);
    return reply({ result: "ok", entry: { title: row.title, description: row.description, status: row.status, category: row.publication_metadata.category, gradeMin: row.recommended_grade_min, gradeMax: row.recommended_grade_max } });
  }

  if (!accountId) return refused("account-required", 403);

  if (action === "solo-start") {
    const seed = newSeed();
    const data = await call("polygon_solo_start", { p_user: accountId, p_seed: seed, p_state: soloOpeningState(seed), p_replace: body.replace === true });
    if (data?.result === "run-active") return reply({ result: "run-active" });
    if (!data || !isRunRecord(data)) return refused("live-unavailable", 503);
    return reply({ result: "started", run: toRunPayload(data) });
  }

  if (action === "solo-open") {
    const data = await call("polygon_solo_open", { p_user: accountId });
    if (data?.result === "no-active-run") return refused("no-active-run", 404);
    if (!data || !isRunRecord(data)) return refused("live-unavailable", 503);
    return reply({ result: "opened", run: toRunPayload(data) });
  }

  if (action === "solo-sync") {
    if (!isUuid(body.run) || !isInteger(body.epoch, 1, 1_000_000) || !isInteger(body.from, 0, 100_000_000)) return refused("invalid-request", 400);
    const moves = parseMoves(body.moves);
    if (!moves) return refused("invalid-request", 400);
    const load = await call("polygon_solo_load", { p_user: accountId, p_run: body.run, p_epoch: body.epoch });
    if (load?.result === "superseded") return refused("run-moved", 409);
    if (load?.result === "not-found") return refused("run-not-found", 404);
    if (load?.result === "ended") return refused("run-ended", 410);
    if (!load || !isRunRecord(load)) return refused("live-unavailable", 503);

    const before = load.state as GameState;
    const seed = load.seed as string;
    const nowT = Number(load.nowMs) - Number(load.sessionStartMs);
    const expected = isInteger(body.h, 0, 4_294_967_295) ? body.h : null;
    const outcome = replayBatch(before, seed, body.from as number, moves, { nextT: Number(load.nextT), nowT }, expected);
    if (outcome.kind === "gap") return reply({ result: "resync", run: toRunPayload(load) });

    const after = outcome.state;
    const end = body.end === true;
    const dueByCoins = after.coins - Number(load.banked) >= BANK_EVERY_COINS;
    const dueByTime = Number(load.nowMs) - Number(load.lastBankMs) >= BANK_EVERY_MS;
    const checkpoint = body.checkpoint === true || dueByCoins || dueByTime || end;
    if (outcome.accepted === 0 && !checkpoint && !outcome.rejected) {
      return reply({ result: "ok", ack: after.moves, version: load.version, balance: load.balance, coins: after.coins, windows: windowsFor(seed, after.cursors), cursors: after.cursors });
    }
    const commit = await call("polygon_solo_commit", {
      p_user: accountId,
      p_run: body.run,
      p_epoch: body.epoch,
      p_version: load.version,
      p_state: after,
      p_next_t: outcome.nextT,
      p_bank: checkpoint,
      p_achievements: newlyEarnedAchievements((load.totals ?? {}) as Json, before, after),
      p_end: end
    });
    if (commit?.result === "conflict" || commit?.result === "superseded") return refused("run-moved", 409);
    if (commit?.result === "ended" && !end) return refused("run-ended", 410);
    if (!commit || (commit.result !== "ok" && commit.result !== "ended")) return refused("live-unavailable", 503);

    const needsResync = outcome.rejected !== null || outcome.mismatch;
    return reply({
      result: end ? "ended" : needsResync ? "resync" : "ok",
      ack: after.moves,
      version: commit.version,
      balance: commit.balance,
      banked: commit.banked,
      capped: commit.capped,
      achievements: commit.achievements,
      coins: after.coins,
      score: after.score,
      rejected: outcome.rejected?.reason ?? null,
      windows: windowsFor(seed, after.cursors),
      cursors: after.cursors,
      ...(needsResync ? { run: toRunPayload({ ...load, state: after, version: commit.version, nextT: outcome.nextT, balance: commit.balance }) } : {})
    });
  }

  if (action === "purchase") {
    if (typeof body.item !== "string" || typeof body.key !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(body.key)) return refused("invalid-request", 400);
    const data = await call("polygon_purchase", { p_user: accountId, p_item: body.item, p_key: body.key });
    if (!data) return refused("live-unavailable", 503);
    if (data.result === "item-not-found" || data.result === "free-item") return refused(data.result, 404);
    if (data.result === "invalid-request") return refused("invalid-request", 400);
    return reply({ result: data.result as string, balance: data.balance, item: data.item, price: data.price, idempotent: data.idempotent === true, achievements: data.achievements ?? [] });
  }

  if (action === "avatar-save") {
    const avatar = normalizeAvatar(body.avatar);
    if (!avatar.ok) return refused(avatar.error, 400);
    let name: string | null = null;
    if (body.name !== undefined && body.name !== null && body.name !== "") {
      const parsed = sanitizeDisplayName(body.name);
      if (!parsed.ok) return refused(parsed.error, 400);
      name = parsed.name;
    }
    const emoji = normalizeEmoji(body.emoji ?? null);
    if (!emoji.ok) return refused(emoji.error, 400);
    const data = await call("polygon_avatar_save", { p_user: accountId, p_avatar: avatar.avatar, p_display_name: name, p_emoji: emoji.emoji });
    if (!data) return refused("live-unavailable", 503);
    if (data.result !== "ok") return refused(String(data.result), data.result === "item-not-owned" ? 403 : 400);
    return reply({ result: "ok", avatar: avatar.avatar });
  }

  return refused("invalid-request", 400);
}

export function GET(): Response {
  return refused("method-not-allowed", 405);
}
