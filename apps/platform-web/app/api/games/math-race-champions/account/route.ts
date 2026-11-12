import { createHash } from "node:crypto";

import { canPlayGame } from "@/lib/access/server";
import { resolveLimiterSecret } from "@/lib/auth/rate-limit";
import { getGameAccessView } from "@/lib/game-access/server";
import { isInteger, readJsonBody, refused, reply, startTiming, timed, withServerTiming, type Json, type RequestTiming } from "@/lib/games/math-bingo-live/http";
import { generateRoomCode, isToken, newToken } from "@/lib/games/math-bingo-live/server";
import {
  COUNTDOWN_MS,
  GAME_KEY,
  ROOM_COUNTDOWN_MS,
  catalogPayload,
  evaluate,
  hashToken,
  isColour,
  isLocalOwnerPreview,
  isMathRaceChampionsAvailable,
  isRoomRecord,
  isRunRecord,
  isUuid,
  judgeAnswer,
  newRacerState,
  newSeed,
  ownerHash,
  parseSettings,
  publicState,
  runQuestion,
  runSpec,
  toRoomPayload,
  toRunPayload,
  type RunRecord
} from "@/lib/games/math-race-champions/server";
import { SCHOOL_ACCESS_COOKIE } from "@/lib/school-access/session";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import { normalizeEmoji } from "@/public/internal-games/math-bingo-live/src/engine/emoji.js";
import { sanitizeDisplayName } from "@/public/internal-games/math-bingo-live/src/engine/settings.js";
import { publicQuestion } from "@/public/internal-games/math-race-champions/src/engine/questions.js";
import { advance, isRacerState, type RacerState } from "@/public/internal-games/math-race-champions/src/engine/race.js";

export const dynamic = "force-dynamic";

// Math Race Champions account API. Everything here needs a MathNexa session.
// Permanent progress (Race Dollars, cars, stages, a race against the computer)
// needs a real account: a school access session can open the game and create an
// Online Race room, but it has no user id, so nothing permanent can ever be
// written for it. Creator commands need BOTH the session (matched by a keyed
// owner hash) AND the room's current host token, so a room code, which racers
// see, can never command a room.

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

// An answer arrives every few seconds, so it may reuse a sign-in check made in
// the last 15 seconds by the same session cookies. Starting a race, buying,
// equipping and every creator command always check the session in full.
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
  if (!(await isMathRaceChampionsAvailable())) return refused("not-available", 404);

  const action = body.action;
  const principal = await timed(timing, "access", () => resolvePrincipal(request, action === "race-answer" || action === "race-sync"));
  if (!principal) return refused("sign-in-required", 401);

  const client = createServiceSupabaseClient();
  if (!client) return refused("live-unavailable", 503);

  const call = async (fn: string, args: Json): Promise<Json | null> => {
    const { data, error } = await timed(timing, "db", () => client.rpc(fn, args));
    if (error || !data || typeof data !== "object") return null;
    return data as Json;
  };

  const accountId = principal.kind === "consumer" ? principal.id : null;

  // ------------------------------------------------- rooms (any session)

  if (action === "create-room") {
    const settings = parseSettings(body.categories, body.difficulty);
    if (!settings) return refused("invalid-request", 400);
    const name = sanitizeDisplayName(body.name);
    if (!name.ok) return refused(name.error, 400);
    const emoji = normalizeEmoji(body.emoji);
    if (!emoji.ok) return refused(emoji.error, 400);
    if (!isColour(body.colour)) return refused("invalid-request", 400);
    const owner = ownerHash(resolveLimiterSecret(), principal);
    const hostToken = newToken();
    const seatToken = newToken();
    const seed = newSeed();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const data = await call("race_create_room", {
        p_code: generateRoomCode(),
        p_owner_hash: owner,
        p_host_token_hash: hashToken("host", hostToken),
        p_player_token_hash: hashToken("player", seatToken),
        p_user: accountId,
        p_name: name.name,
        p_emoji: emoji.emoji,
        p_colour: body.colour,
        p_settings: settings,
        p_seed: seed,
        p_state: newRacerState()
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
    const data = await call("race_host_resume", { p_owner_hash: owner, p_new_host_hash: hashToken("host", hostToken), p_new_player_hash: hashToken("player", seatToken) });
    if (data?.result === "not-found") return refused("no-live-room", 404);
    if (!data || !isRoomRecord(data)) return refused("live-unavailable", 503);
    return reply({ result: "resumed", hostToken, token: seatToken, room: toRoomPayload(data) });
  }

  if (action === "host") {
    if (!isToken(body.hostToken) || typeof body.command !== "string") return refused("invalid-request", 400);
    const owner = ownerHash(resolveLimiterSecret(), principal);
    const data = await call("race_host_command", {
      p_owner_hash: owner,
      p_token_hash: hashToken("host", body.hostToken),
      p_command: body.command,
      p_args: body.command === "start" ? { countdownMs: ROOM_COUNTDOWN_MS } : isUuid(body.participant) ? { participant: body.participant } : {}
    });
    if (data?.result === "closed") return reply({ result: "closed" });
    if (!data || typeof data.phase !== "string") {
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
    if (!accountId) return reply({ result: "ok", guest: true, kind: principal.kind, catalog: catalogPayload() });
    const data = await call("race_bootstrap", { p_user: accountId });
    if (!data) return refused("live-unavailable", 503);
    return reply({
      result: "ok",
      guest: false,
      catalog: catalogPayload(),
      balance: data.balance,
      lifetimeEarned: data.lifetimeEarned,
      equipped: data.equipped,
      owned: data.owned,
      stages: data.stages,
      unlocked: data.unlocked,
      achievements: data.achievements,
      stats: data.stats,
      activeRun: data.activeRun
    });
  }

  // The draft catalog card, for the local owner review only.
  if (action === "catalog-preview") {
    if (!isLocalOwnerPreview()) return refused("not-available", 404);
    const { data } = await timed(timing, "db", () => client.from("game_catalog_entries").select("title,description,status,tags,recommended_grade_min,recommended_grade_max,publication_metadata").eq("stable_key", GAME_KEY).maybeSingle());
    const row = data as { title: string; description: string; status: string; tags: string[]; recommended_grade_min: number; recommended_grade_max: number; publication_metadata: Json } | null;
    if (!row) return refused("not-available", 404);
    return reply({ result: "ok", entry: { title: row.title, description: row.description, status: row.status, tags: row.tags, category: row.publication_metadata.category, gradeMin: row.recommended_grade_min, gradeMax: row.recommended_grade_max } });
  }

  if (!accountId) return refused("account-required", 403);

  if (action === "race-start") {
    if (!isInteger(body.stage, 1, 10)) return refused("invalid-request", 400);
    const settings = parseSettings(body.categories, body.difficulty);
    if (!settings) return refused("invalid-request", 400);
    const data = await call("race_run_start", {
      p_user: accountId,
      p_stage: body.stage,
      p_settings: settings,
      p_seed: newSeed(),
      p_cpu_seed: newSeed(),
      p_state: newRacerState(),
      p_countdown_ms: COUNTDOWN_MS
    });
    if (data?.result === "stage-locked") return refused("stage-locked", 403);
    if (!data || !isRunRecord(data)) return refused(data?.result === "invalid-request" ? "invalid-request" : "live-unavailable", data?.result === "invalid-request" ? 400 : 503);
    return reply({ result: "started", run: toRunPayload(data) });
  }

  // Closes the race in the database and pays whatever it earned, once.
  const finish = async (run: RunRecord, state: RacerState): Promise<Response> => {
    const outcome = evaluate(run, state);
    const data = await call("race_run_finish", {
      p_user: accountId,
      p_run: run.id,
      p_version: run.version,
      p_state: state,
      p_won: outcome.won,
      p_time_ms: outcome.timeMs === null ? null : Math.max(1, Math.round(outcome.timeMs)),
      p_accuracy: outcome.accuracy,
      p_achievements: [...outcome.achievements],
      p_outcome: { ...outcome, achievements: [...outcome.achievements], stage: run.stage, car: run.car }
    });
    if (!data) return refused("live-unavailable", 503);
    if (data.result === "conflict") return refused("run-moved", 409);
    if (data.result === "already-finished") {
      // Closed already (two requests crossing, a retry, a reload): the same
      // answer as the first time, read back from the race itself.
      const stored = data.outcome as (Json & { rewards?: Json }) | null;
      if (!stored) return reply({ result: "ended", status: data.status, state: publicState(state) });
      const { rewards, ...first } = stored;
      return reply({
        result: "finished",
        repeated: true,
        outcome: first,
        state: publicState(isRacerState(data.state) ? data.state : state),
        rewards: rewards ?? { stageReward: 0, firstWin: false, achievements: [], achievementReward: 0 },
        balance: data.balance,
        unlocked: data.unlocked
      });
    }
    if (data.result !== "finished") return refused("live-unavailable", 503);
    return reply({
      result: "finished",
      outcome: { ...outcome, stage: run.stage, car: run.car },
      state: publicState(state),
      rewards: { stageReward: data.stageReward, firstWin: data.firstWin === true, achievements: data.achievements, achievementReward: data.achievementReward },
      balance: data.balance,
      unlocked: data.unlocked
    });
  };

  if (action === "race-answer" || action === "race-sync" || action === "race-quit") {
    if (!isUuid(body.run)) return refused("invalid-request", 400);
    const load = await call("race_run_load", { p_user: accountId, p_run: body.run });
    if (load?.result === "not-found") return refused("run-not-found", 404);
    if (!load || !isRunRecord(load)) return refused("live-unavailable", 503);
    if (load.status !== "active") return finish(load, load.state);
    const spec = runSpec(load);
    const raceMs = load.nowMs - load.startsAtMs;

    if (action === "race-quit") return finish(load, raceMs > 0 ? advance(load.state, spec, raceMs) : load.state);

    if (action === "race-sync") {
      const now = raceMs > 0 ? advance(load.state, spec, raceMs) : load.state;
      if (now.finishMs !== null) return finish(load, now);
      return reply({ result: "ok", run: toRunPayload(load) });
    }

    const judged = judgeAnswer(load.state, spec, raceMs, body.index, body.choice, (index) => runQuestion(load, index));
    if (judged.kind === "finished") return finish(load, judged.state);
    if (judged.kind !== "answered") {
      // Nothing changed: send back where the race really is.
      return reply({ result: judged.kind, version: load.version, nowMs: load.nowMs, state: publicState(load.state), question: publicQuestion(runQuestion(load, load.state.answered)) });
    }
    const commit = await call("race_run_commit", { p_user: accountId, p_run: load.id, p_version: load.version, p_state: judged.state });
    if (commit?.result === "conflict") return refused("run-moved", 409);
    if (commit?.result !== "ok") return refused("live-unavailable", 503);
    return reply({
      result: "ok",
      correct: judged.correct,
      // Shown only now, after the answer was judged.
      answer: judged.answer,
      choice: judged.choiceIndex,
      version: commit.version,
      nowMs: load.nowMs,
      state: publicState(judged.state),
      question: publicQuestion(runQuestion(load, judged.state.answered))
    });
  }

  if (action === "purchase") {
    if (typeof body.car !== "string" || typeof body.key !== "string" || !/^[A-Za-z0-9_-]{8,64}$/.test(body.key)) return refused("invalid-request", 400);
    // The price is read in the database. Nothing in this request is a price.
    const data = await call("race_purchase", { p_user: accountId, p_car: body.car, p_key: body.key });
    if (!data) return refused("live-unavailable", 503);
    if (data.result === "car-not-found" || data.result === "free-car") return refused(data.result, 404);
    if (data.result === "invalid-request") return refused("invalid-request", 400);
    return reply({ result: data.result as string, balance: data.balance, car: data.car, price: data.price, idempotent: data.idempotent === true });
  }

  if (action === "equip") {
    if (typeof body.car !== "string") return refused("invalid-request", 400);
    const data = await call("race_equip", { p_user: accountId, p_car: body.car });
    if (!data) return refused("live-unavailable", 503);
    if (data.result === "car-not-found") return refused("car-not-found", 404);
    if (data.result === "car-not-owned") return refused("car-not-owned", 403);
    return reply({ result: "ok", equipped: data.equipped });
  }

  return refused("invalid-request", 400);
}

export function GET(): Response {
  return refused("method-not-allowed", 405);
}
