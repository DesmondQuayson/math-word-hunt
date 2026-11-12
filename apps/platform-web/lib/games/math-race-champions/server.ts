import "server-only";

import { createHash, createHmac, randomBytes } from "node:crypto";

import { PRODUCTION_PUBLIC_CANONICAL_HOST, PRODUCTION_PUBLIC_WWW_HOST } from "@/lib/environment/production-public";
import { isStagingAccessRequired } from "@/lib/staging-access/server";
import { createServiceSupabaseClient } from "@/lib/supabase/service";
import {
  createQuestionStream,
  normalizeSettings,
  publicQuestion,
  questionAt,
  type RacePublicQuestion,
  type RaceQuestion,
  type RaceSettings
} from "@/public/internal-games/math-race-champions/src/engine/questions.js";
import {
  ACHIEVEMENTS,
  ACHIEVEMENT_REWARD,
  CARS,
  COUNTDOWN_MS,
  MIN_CORRECT,
  ONLINE_CAR,
  ONLINE_LENGTH_KM,
  RACER_COLOURS,
  STAGES,
  advance,
  applyAnswer,
  cpuTimeline,
  evaluateRun,
  getCar,
  getStage,
  isRacerState,
  newRacerState,
  raceSpec,
  type RaceSpec,
  type RacerState,
  type RunEvaluation
} from "@/public/internal-games/math-race-champions/src/engine/race.js";

/**
 * Math Race Champions — server authority.
 *
 * Classroom Competition runs entirely on the Smart Board and needs nothing
 * here. Computer Race and Online Race are server-checked: the database owns
 * identity, Race Dollars and the clock; this module owns the race. A browser
 * sends "left" or "right" for a question number. The question is rebuilt here
 * from a seed the browser never receives, the verdict is decided here, and the
 * racing model (engine/race.js) is run here, on the database's clock. A
 * browser's own idea of its speed, distance or score is never read. Database
 * records become browser payloads FIELD BY FIELD, so seeds and token hashes
 * stay on the server.
 */

export const GAME_KEY = "math-race-champions";
export const PLAY_ROUTE = "/games/math-race-champions/play";
export const JOIN_ROUTE = "/join";
export const PREVIEW_FLAG = "MVH_MATH_RACE_CHAMPIONS_PREVIEW";
export const PREVIEW_VALUE = "local-owner-review";
export const STAGING_PREVIEW_VALUE = "staging-owner-review";
/** The isolated staging Supabase project; production never points here. */
const STAGING_SUPABASE_HOST = "gcmuhzxkwvfireyrearl.supabase.co";
/** Start lights for an Online Race, ms. */
export const ROOM_COUNTDOWN_MS = 6000;
/** After an Online Race ends, answers already in flight are still let in for this long. */
export const ROOM_GRACE_MS = 2500;

export type Json = Record<string, unknown>;

// ------------------------------------------------------------ identifiers

/** Domain-separated, so a racer token can never stand in for a host token, or for another game's. */
export function hashToken(kind: "host" | "player", token: string): string {
  return createHash("sha256").update(`math-race-champions\n${kind}\n${token}`).digest("hex");
}

export function newSeed(): string {
  return randomBytes(16).toString("hex");
}

/** Keyed hash of the creator's access principal; the room stores nothing else about them. */
export function ownerHash(secret: string | null, principal: Readonly<{ kind: string; id: string }>): string {
  const material = `math-race-champions\nowner\n${principal.kind}:${principal.id}`;
  return secret ? createHmac("sha256", secret).update(material).digest("hex") : createHash("sha256").update(material).digest("hex");
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value);
}

export function isColour(value: unknown): value is string {
  return typeof value === "string" && RACER_COLOURS.includes(value);
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
 * the staging flag (set per deployment, never as a project variable), both
 * Supabase URLs on the isolated staging project, an origin that is not
 * mathnexa.com, and a protected staging Preview. Production fails every one.
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
export async function isMathRaceChampionsAvailable(now = Date.now()): Promise<boolean> {
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

// ----------------------------------------------------------------- settings

/** Settings from a browser, or null. Only the seven categories and five difficulties exist. */
export function parseSettings(categories: unknown, difficulty: unknown): RaceSettings | null {
  try {
    if (categories !== "mixed" && !(Array.isArray(categories) && categories.length >= 1 && categories.length <= 7 && categories.every((item) => typeof item === "string"))) return null;
    if (typeof difficulty !== "string") return null;
    return normalizeSettings({ categories: categories as string[] | "mixed", difficulty });
  } catch {
    return null;
  }
}

function storedSettings(value: unknown): RaceSettings | null {
  const record = value as { categories?: unknown; difficulty?: unknown } | null;
  return record ? parseSettings(record.categories, record.difficulty) : null;
}

// ---------------------------------------------------------------- questions

/**
 * A racer's question number `index`. `streamSeed` decides the numbers and is
 * different for every racer; `orderSeed` decides the order of categories and is
 * shared, so opponents always face the same kind of question at the same point.
 */
// A racer's questions are a deterministic stream, and a stream can only be read
// from its start. Each racer's stream is kept for a while so that poll number
// 200 of a race does not rebuild 100 questions to show one. The cache holds
// nothing that is not derivable from the seed; losing it changes no answer.
type StreamEntry = { stream: ReturnType<typeof createQuestionStream>; questions: (RaceQuestion & { index: number })[]; usedAt: number };
const STREAM_CACHE_MAX = 600;
const streams = new Map<string, StreamEntry>();

export function questionFor(settings: RaceSettings, streamSeed: string, orderSeed: string, index: number): RaceQuestion & { index: number } {
  if (!Number.isInteger(index) || index < 0 || index > 100_000) return questionAt(settings, streamSeed, index, { orderSeed });
  const key = `${streamSeed}\n${orderSeed}\n${settings.difficulty}\n${settings.categories.join(",")}`;
  let entry = streams.get(key);
  if (!entry) {
    if (streams.size >= STREAM_CACHE_MAX) {
      // Drop the least recently used half; a dropped stream is simply rebuilt.
      const oldest = [...streams.entries()].sort((a, b) => a[1].usedAt - b[1].usedAt).slice(0, STREAM_CACHE_MAX / 2);
      for (const [stale] of oldest) streams.delete(stale);
    }
    entry = { stream: createQuestionStream(settings, streamSeed, { orderSeed }), questions: [], usedAt: 0 };
    streams.set(key, entry);
  }
  entry.usedAt = Date.now();
  while (entry.questions.length <= index) entry.questions.push(entry.stream.next());
  return entry.questions[index]!;
}

export function resetQuestionCacheForTests(): void {
  streams.clear();
}

const runStream = (seed: string) => `${seed}:player`;
const seatStream = (seed: string, participant: string) => `${seed}:${participant}`;

// ------------------------------------------------------------ Computer Race

export type RunRecord = Json & {
  id: string;
  stage: number;
  car: string;
  settings: RaceSettings;
  seed: string;
  cpuSeed: string;
  state: RacerState;
  version: number;
  status: string;
  startsAtMs: number;
  nowMs: number;
};

export function isRunRecord(data: Json | null): data is RunRecord {
  return Boolean(
    data &&
      isUuid(data.id) &&
      Number.isInteger(data.stage) &&
      typeof data.car === "string" &&
      typeof data.seed === "string" &&
      typeof data.cpuSeed === "string" &&
      isRacerState(data.state) &&
      Number.isInteger(data.version) &&
      typeof data.status === "string" &&
      Number.isFinite(data.startsAtMs) &&
      Number.isFinite(data.nowMs) &&
      storedSettings(data.settings) &&
      getStage(data.stage as number) &&
      getCar(data.car as string)
  );
}

export function runSpec(run: RunRecord): RaceSpec {
  return raceSpec(getCar(run.car)!, getStage(run.stage)!.lengthKm);
}

export function runQuestion(run: RunRecord, index: number): RaceQuestion & { index: number } {
  return questionFor(storedSettings(run.settings)!, runStream(run.seed), run.seed, index);
}

/** What the browser needs to draw a race: no seed, no answers. */
export function toRunPayload(run: RunRecord, state: RacerState = run.state, version: number = run.version): Json {
  const stage = getStage(run.stage)!;
  const car = getCar(run.car)!;
  const cpu = cpuTimeline(run.stage, run.cpuSeed);
  return {
    id: run.id,
    stage: run.stage,
    lengthKm: stage.lengthKm,
    car: { key: car.key, name: car.name, topSpeed: car.topSpeed, boost: car.boost, decay: car.decay },
    settings: { categories: run.settings.categories, difficulty: run.settings.difficulty },
    startsAtMs: run.startsAtMs,
    nowMs: run.nowMs,
    version,
    state: publicState(state),
    question: state.finishMs === null ? publicQuestion(runQuestion(run, state.answered)) : null,
    // The computer's whole race. It was fixed when the race was created and
    // nothing the browser does can change it; knowing it early helps nobody answer.
    cpu: { events: cpu.events, finishMs: cpu.finishMs }
  };
}

export function publicState(state: RacerState): Json {
  return {
    t: state.t,
    x: state.x,
    v: state.v,
    correct: state.correct,
    wrong: state.wrong,
    answered: state.answered,
    streak: state.streak,
    bestStreak: state.bestStreak,
    maxSpeed: state.maxSpeed,
    lockedUntil: state.lockedUntil,
    finishMs: state.finishMs
  };
}

export type AnswerOutcome =
  | { kind: "not-started" | "locked" | "stale"; state: RacerState }
  | { kind: "finished"; state: RacerState }
  | { kind: "answered"; state: RacerState; correct: boolean; answer: string; choiceIndex: 0 | 1 };

/**
 * One press, judged. `raceMs` is the database clock minus the start. A press
 * for any question other than the racer's current one changes nothing: an
 * answer cannot be sent twice, skipped ahead, or replayed.
 */
export function judgeAnswer(state: RacerState, spec: RaceSpec, raceMs: number, index: unknown, choice: unknown, question: (index: number) => RaceQuestion): AnswerOutcome {
  if (raceMs < 0) return { kind: "not-started", state };
  const now = advance(state, spec, raceMs);
  if (now.finishMs !== null) return { kind: "finished", state: now };
  if (index !== state.answered || (choice !== 0 && choice !== 1)) return { kind: "stale", state };
  const asked = question(state.answered);
  const isCorrect = choice === asked.correctIndex;
  const result = applyAnswer(state, spec, raceMs, isCorrect);
  if (!result.accepted) return { kind: result.reason === "finished" ? "finished" : "locked", state: result.state };
  return { kind: "answered", state: result.state, correct: isCorrect, answer: asked.answer, choiceIndex: choice };
}

export function evaluate(run: RunRecord, state: RacerState): RunEvaluation {
  return evaluateRun({ stage: run.stage, carKey: run.car, settings: storedSettings(run.settings)!, state, cpuFinishMs: cpuTimeline(run.stage, run.cpuSeed).finishMs });
}

/** The garage, stages and achievements as the game defines them (prices are re-read in the database on purchase). */
export function catalogPayload(): Json {
  return {
    cars: CARS.map((car) => ({ key: car.key, name: car.name, price: car.price, topSpeed: car.topSpeed, boost: car.boost, decay: car.decay, recommended: car.recommended, blurb: car.blurb })),
    stages: STAGES.map((stage) => ({ stage: stage.stage, reward: stage.reward, lengthKm: stage.lengthKm, suggested: stage.suggested })),
    achievements: ACHIEVEMENTS.map((item) => ({ key: item.key, title: item.title, text: item.text, reward: ACHIEVEMENT_REWARD })),
    minCorrect: MIN_CORRECT,
    countdownMs: COUNTDOWN_MS
  };
}

export { COUNTDOWN_MS, newRacerState };

// --------------------------------------------------------------- Online Race

export type LiveRoomGame = "math_race_champions" | "polygon_showdown" | "math_bingo_live" | null;

/** Which live game owns an open room code. Shared by /join and the join APIs. */
export async function liveRoomGameForCode(code: string): Promise<LiveRoomGame> {
  const client = createServiceSupabaseClient();
  if (!client) return null;
  const { data, error } = await client.rpc("live_room_game_for_code", { p_code: code });
  if (error) return null;
  return data === "math_race_champions" || data === "polygon_showdown" || data === "math_bingo_live" ? data : null;
}

export type RoomRecord = Json & {
  id: string;
  code: string;
  phase: "LOBBY" | "COUNTDOWN" | "ACTIVE" | "COMPLETE";
  settings: RaceSettings;
  locked: boolean;
  version: number;
  seed: string;
  nowMs: number;
  startsAtMs: number | null;
  endsAtMs: number | null;
  finalized: boolean;
  standings: Json[];
  me: Json & { id: string; state: RacerState; version: number };
};

export function isRoomRecord(data: Json | null): data is RoomRecord {
  const me = data?.me as Json | undefined;
  return Boolean(
    data &&
      isUuid(data.id) &&
      typeof data.code === "string" &&
      typeof data.phase === "string" &&
      typeof data.seed === "string" &&
      Number.isFinite(data.nowMs) &&
      Array.isArray(data.standings) &&
      storedSettings(data.settings) &&
      me &&
      isUuid(me.id) &&
      isRacerState(me.state) &&
      Number.isInteger(me.version)
  );
}

export const ONLINE_SPEC: RaceSpec = raceSpec(ONLINE_CAR, ONLINE_LENGTH_KM);

export function seatQuestion(room: RoomRecord, index: number): RaceQuestion & { index: number } {
  return questionFor(storedSettings(room.settings)!, seatStream(room.seed, room.me.id), room.seed, index);
}

function standingView(row: Json): Json {
  return {
    id: row.id,
    name: row.name,
    emoji: row.emoji ?? null,
    colour: row.colour,
    creator: row.creator === true,
    correct: row.correct,
    wrong: row.wrong,
    d: row.d,
    f: row.f ?? null,
    rank: row.rank,
    // Enough of the racer's last checked state to draw the car between polls.
    t: row.t,
    x: row.x,
    v: row.v,
    connected: row.connected === true
  };
}

/** The room as a browser may see it: no seed, no hashes, and only this racer's own question. */
export function toRoomPayload(room: RoomRecord, me: RacerState = room.me.state, version: number = room.me.version): Json {
  const racing = room.phase === "COUNTDOWN" || room.phase === "ACTIVE";
  let question: RacePublicQuestion | null = null;
  if (racing && me.finishMs === null) question = publicQuestion(seatQuestion(room, me.answered));
  return {
    id: room.id,
    code: room.code,
    phase: room.phase,
    settings: { categories: room.settings.categories, difficulty: room.settings.difficulty },
    locked: room.locked === true,
    version: room.version,
    nowMs: room.nowMs,
    startsAtMs: room.startsAtMs,
    endsAtMs: room.endsAtMs,
    finalized: room.finalized === true,
    lengthKm: ONLINE_LENGTH_KM,
    car: { name: ONLINE_CAR.name, topSpeed: ONLINE_CAR.topSpeed, boost: ONLINE_CAR.boost, decay: ONLINE_CAR.decay },
    minCorrect: MIN_CORRECT,
    standings: room.standings.map(standingView),
    me: {
      id: room.me.id,
      name: room.me.name,
      emoji: room.me.emoji ?? null,
      colour: room.me.colour,
      isCreator: room.me.isCreator === true,
      signedIn: room.me.signedIn === true,
      version,
      state: publicState(me)
    },
    question
  };
}
