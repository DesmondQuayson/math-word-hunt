/**
 * Math Bingo Live — pacing simulation (LOCAL Supabase only).
 *
 * Plays complete paced matches through the REAL database functions: rooms and
 * students are created with the public functions, every card is dealt by the
 * engine exactly as the host route deals it, and supabase/sim/
 * math_bingo_live_pacing_sim.sql (loaded here, test only) plays each match
 * inside the database with seeded, imperfect students. Then it judges the
 * pacing contract across modes, class sizes, winner targets and student models:
 *
 *   A no Bingo before the game's first gate (drawn 14-17)   B an opportunity at/after it
 *   C every NEW winner event waits the gap drawn after the previous one (8-11)
 *   D same-call winners share the placement; the count may pass the target
 *   E the target, or everyone, or the questions end the game; no invented winner
 *   F one win per player, no question repeats
 *   distributions of the first gate and of the gaps; fairness by seat
 *
 *   node scripts/math-bingo-live-pacing-simulation.mjs [--matches 40] [--players 10,20,30,40,50]
 *        [--modes addition,subtraction,...] [--winners 1,2,3,5] [--sequence 14,8,11,9,10]
 *        [--out qa-artifacts/math-bingo-live/pacing-simulation]
 *
 * --sequence: every match uses a game seed whose draws are exactly that first
 * gate and those gaps (searched with the database's own md5 rule).
 *
 * Needs SUPABASE_TEST_URL (loopback) and SUPABASE_TEST_SECRET_KEY.
 */
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const engine = "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/";
const { DEFAULT_SETTINGS, MODES, normalizeSettings } = await import(`${engine}settings.js`);
const { buildUniverse, universeClasses, pacingPlan, dealPacedBoard, isValidPacedBoard, firstGateWindow } = await import(`${engine}pacing.js`);

const argument = (name, fallback) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
};
const MATCHES = Number(argument("matches", 40));
const PLAYER_COUNTS = argument("players", "10,20,30,40,50").split(",").map(Number);
const MODE_FILTER = argument("modes", "").split(",").filter(Boolean);
const WINNERS = argument("winners", "1,2,3,5").split(",").map(Number);
const OUT = resolve(argument("out", "qa-artifacts/math-bingo-live/pacing-simulation"));
const PARALLEL = Number(argument("parallel", 6));
const SEED_TEXT = argument("seed", "mathnexa-bingo-winner-targets-2026-11-11");
const SEQUENCE = argument("sequence", "").split(",").filter(Boolean).map(Number);

const url = process.env.SUPABASE_TEST_URL ?? "";
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)) throw new Error("Local Supabase only (SUPABASE_TEST_URL).");
const admin = createClient(url, process.env.SUPABASE_TEST_SECRET_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });

// Load the harness into the local database (test only).
try {
  execFileSync("docker", ["cp", resolve("supabase/sim/math_bingo_live_pacing_sim.sql"), "supabase_db_math-vocabulary-hunt:/tmp/bingo_sim.sql"], { stdio: "ignore" });
  execFileSync("docker", ["exec", "supabase_db_math-vocabulary-hunt", "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-q", "-f", "/tmp/bingo_sim.sql"], { stdio: "pipe", env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
} catch (error) {
  throw new Error(`could not load the simulation harness: ${error.stderr ?? error.message}`);
}

const hash = value => createHash("sha256").update(value).digest("hex");
const md5 = value => createHash("md5").update(value).digest("hex");
// The database's draws, replayed (private.bingo_first_gate / bingo_winner_gap).
const firstGateOf = (seed, universeSize) => {
  const [low, high] = firstGateWindow(universeSize);
  return low + (parseInt(md5(`${seed}:first-winner-gate`).slice(0, 8), 16) % (high - low + 1));
};
const gapOf = (seed, event) => 8 + (parseInt(md5(`${seed}:winner-gap:${event}`).slice(0, 8), 16) % 4);
const drawsMatch = (seed, universeSize, sequence) => firstGateOf(seed, universeSize) === sequence[0]
  && sequence.slice(1).every((gap, index) => gapOf(seed, index + 1) === gap);
const rpc = async (fn, args) => {
  const { data, error } = await admin.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data;
};
// A whole match is one database call, longer than the API role's 8 s statement
// timeout for a class of fifty, so it runs through psql in the database container.
const execFileAsync = promisify(execFile);
const DB_CONTAINER = process.env.SIM_DB_CONTAINER ?? "supabase_db_math-vocabulary-hunt";
const literal = value => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  if (text.includes("$sim$")) throw new Error("unexpected dollar quote in a simulation argument");
  return `$sim$${text}$sim$`;
};
async function simPlay({ owner, hostToken, players, seed, maxCalls }) {
  const sql = `select public.bingo_sim_play(${literal(owner)}, ${literal(hostToken)}, ${literal(players)}::jsonb, ${literal(seed)}, ${maxCalls})::text`;
  const { stdout } = await execFileAsync("docker", ["exec", DB_CONTAINER, "psql", "-U", "postgres", "-d", "postgres", "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
    { maxBuffer: 256 * 1024 * 1024, env: { ...process.env, MSYS_NO_PATHCONV: "1" } });
  return JSON.parse(stdout.trim());
}

/** One level per mode is the pacing workhorse; the owner's request names every mode. */
const LEVELS = {
  addition: ["facts-20", "within-50"],
  subtraction: ["facts-20", "within-50"],
  multiplication: ["x0-10", "x0-12"],
  division: ["facts-10"],
  mixed: ["core", "challenge"],
  fractions: ["to-eighths", "to-tenths", "to-twelfths"]
};

const STUDENT_MODELS = [
  { name: "perfect", accuracy: 1, attention: 1, free: "late" },
  { name: "strong", accuracy: 0.8, attention: 0.95, free: "early" },
  { name: "mixed", accuracy: 0.6, attention: 0.9, free: "never" }
];

/** Seeded, deterministic student mix for a match: a third of each model, rotated by the match seed. */
function studentsFor(count, matchSeed) {
  const rotate = parseInt(hash(matchSeed).slice(0, 4), 16) % STUDENT_MODELS.length;
  return Array.from({ length: count }, (_, index) => ({ index, ...STUDENT_MODELS[(index + rotate) % STUDENT_MODELS.length] }));
}

async function playMatch({ settings, players, winners, matchSeed, gameSeed }) {
  const owner = hash(`sim-owner-${matchSeed}`);
  const hostToken = hash(`sim-host-${matchSeed}`);
  // Six-digit codes collide now and then across thousands of matches: try a few.
  let code = null;
  for (let attempt = 0; attempt < 6 && code === null; attempt += 1) {
    const candidate = String(100000 + (parseInt(hash(`${matchSeed}:code:${attempt}`).slice(0, 8), 16) % 900000));
    const created = await rpc("bingo_create_room", { p_code: candidate, p_owner_hash: owner, p_host_token_hash: hostToken, p_settings: settings });
    if (created.result === "created") code = candidate;
    else if (created.result !== "code-taken") throw new Error(`create: ${created.result}`);
  }
  if (code === null) throw new Error("create: code-taken");
  try {
    const roster = [];
    for (const student of players) {
      const token = hash(`sim-player-${matchSeed}-${student.index}`);
      const joined = await rpc("bingo_join_room", { p_code: code, p_name: `Sim ${student.index + 1}`, p_token_hash: token, p_subject_hash: hash(`sim-subject-${matchSeed}`), p_emoji: null });
      if (joined.result !== "joined") throw new Error(`join: ${joined.result}`);
      roster.push({ ...student, token, id: joined.me.id });
    }
    const universe = buildUniverse(settings, gameSeed);
    const plan = pacingPlan(settings, universe, gameSeed);
    const classes = universeClasses(universe).filter(item => !plan.reserve.includes(item.key));
    const usage = new Map();
    const boards = {};
    for (const student of roster) {
      const board = dealPacedBoard({ settings, classes, late: plan.late, seed: gameSeed, participantId: student.id, usage });
      if (!board || !isValidPacedBoard(board, { settings, late: plan.late, classes })) throw new Error("engine dealt an invalid card");
      for (const cell of board) if (!cell.free) { const key = `${cell.n}/${cell.d}`; usage.set(key, (usage.get(key) ?? 0) + 1); }
      boards[student.id] = board;
    }
    const started = await rpc("bingo_host_start_paced", {
      p_owner_hash: owner, p_token_hash: hostToken, p_kind: "start", p_settings: settings, p_seed: gameSeed,
      p_questions: universe.map(question => ({ q: question.id, c: question.class, t: question.text, s: question.spoken, k: question.kind, n: question.n, d: question.d })),
      p_boards: boards, p_pacing: { late: plan.late, reserve: plan.reserve }
    });
    if (started.result !== "started") return { skipped: started.result, plan };
    const playStarted = Date.now();
    const result = await simPlay({ owner, hostToken, players: roster.map(({ index, token, accuracy, attention, free }) => ({ index, token, accuracy, attention, free })), seed: matchSeed, maxCalls: 400 });
    if (result.error) throw new Error(result.error);
    // The database's draws must be the ones its md5 rule gives (replayed here).
    const replayed = firstGateOf(gameSeed, universe.length) === result.firstWinCall
      && result.gaps.every((gap, index) => gap === gapOf(gameSeed, index + 1));
    if (!replayed) result.violations.push({ call: 0, kind: "draws-differ-from-the-md5-rule" });
    return { ...result, plan, universe: universe.length, dealt: Number(started.dealt), winnersWanted: winners, players: roster.length, ms: Date.now() - playStarted };
  } finally {
    await rpc("bingo_host_command", { p_owner_hash: owner, p_token_hash: hostToken, p_command: "close", p_args: {} }).catch(() => {});
    await admin.from("bingo_rooms").delete().eq("host_token_hash", hostToken);
  }
}

const percentile = (list, p) => {
  if (!list.length) return null;
  const sorted = list.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
};
const mean = list => (list.length ? list.reduce((a, b) => a + b, 0) / list.length : null);

const jobs = [];
for (const mode of MODES) {
  if (MODE_FILTER.length && !MODE_FILTER.includes(mode.id)) continue;
  for (const level of LEVELS[mode.id] ?? []) {
    for (const count of PLAYER_COUNTS) {
      for (const winners of WINNERS) {
        for (let match = 0; match < MATCHES; match += 1) jobs.push({ mode: mode.id, level, count, winners, wanted: winners, match });
      }
    }
  }
}
// Resumable: every finished game is appended to matches.jsonl; a re-run with the same
// --out skips the games already there (a session break loses nothing).
mkdirSync(OUT, { recursive: true });
const LOG = resolve(OUT, "matches.jsonl");
const jobKey = job => `${job.mode}/${job.level}/${job.count}/${job.wanted}/${job.match}`;
const results = existsSync(LOG) ? readFileSync(LOG, "utf8").split(String.fromCharCode(10)).filter(Boolean).map(line => JSON.parse(line)) : [];
const finished = new Set(results.filter(item => !item.failed).map(jobKey));
for (let index = results.length - 1; index >= 0; index -= 1) if (results[index].failed) results.splice(index, 1);
const pending = jobs.filter(job => !finished.has(jobKey(job)));
jobs.length = 0;
jobs.push(...pending);
console.log(`${jobs.length} matches queued (${PARALLEL} at a time; ${results.length} already in ${LOG})`);
let cursor = 0;
let done = 0;
const startedAt = Date.now();
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const settingsResult = normalizeSettings({ ...DEFAULT_SETTINGS, mode: job.mode, level: job.level, winners: job.winners, questionSeconds: 0, revealSeconds: 0, music: "off", celebration: "off" });
    if (!settingsResult.ok) throw new Error(settingsResult.error);
    const matchSeed = `${SEED_TEXT}:${job.mode}:${job.level}:${job.count}:${job.winners}:${job.match}`;
    let gameSeed = hash(matchSeed).slice(0, 32);
    if (SEQUENCE.length) {
      const universeSize = buildUniverse(settingsResult.settings).length;
      for (let attempt = 0; !drawsMatch(gameSeed, universeSize, SEQUENCE); attempt += 1) gameSeed = hash(`${matchSeed}:sequence:${attempt}`).slice(0, 32);
    }
    try {
      const played = await playMatch({ settings: settingsResult.settings, players: studentsFor(job.count, matchSeed), winners: job.winners, matchSeed, gameSeed });
      const record = { ...job, ...played };
      delete record.callLog;
      results.push(record);
      appendFileSync(LOG, JSON.stringify(record) + String.fromCharCode(10));
    } catch (error) {
      results.push({ ...job, failed: String(error.message ?? error) });
    }
    done += 1;
    if (done % 50 === 0) console.log(`${done}/${jobs.length} matches, ${Math.round((Date.now() - startedAt) / 1000)} s`);
  }
}
await Promise.all(Array.from({ length: PARALLEL }, worker));

// ---------------------------------------------------------------- judge
const groups = new Map();
for (const result of results) {
  const key = `${result.mode}/${result.level} · ${result.count} players · ${result.wanted} winners`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(result);
}
const tally = (values, keys) => Object.fromEntries(keys.map(key => [key, values.filter(value => value === key).length]));
const report = {
  seed: SEED_TEXT, sequence: SEQUENCE.length ? SEQUENCE : null, matches: results.length,
  startedAt: new Date(startedAt).toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000), groups: [], failures: []
};
let violationsTotal = 0;
const allPlayed = results.filter(item => !item.skipped && !item.failed);
for (const [key, list] of groups) {
  const played = list.filter(item => !item.skipped && !item.failed);
  const failed = list.filter(item => item.failed);
  for (const item of failed) report.failures.push({ group: key, match: item.match, error: item.failed });
  const violations = played.flatMap(item => item.violations.map(v => ({ match: item.match, ...v })));
  violationsTotal += violations.length;
  const eventCalls = played.map(item => item.winnerEvents.map(event => event.n));
  const actualGaps = eventCalls.flatMap(calls => calls.slice(1).map((call, index) => call - calls[index]));
  const slack = played.flatMap(item => item.winnerEvents.slice(1).map((event, index) => event.n - item.winnerEvents[index].n - item.gaps[index]));
  const effective = item => Math.min(item.target, item.players);
  const reached = played.filter(item => item.winners >= effective(item)).length;
  const coverage = { zero: 0, single: 0, limited: 0, broad: 0 };
  for (const item of played) for (const kind of Object.keys(coverage)) coverage[kind] += item.coverage?.[kind] ?? 0;
  const calls = played.reduce((sum, item) => sum + item.calls, 0);
  const firstWinners = played.map(item => item.winnerCalls[0]).filter(Number.isFinite);
  const fourAtGate = played.map(item => item.timeline.find(step => step.n === item.firstWinCall - 1)).filter(Boolean).map(step => step.four);
  report.groups.push({
    group: key, matches: list.length, played: played.length, failed: failed.length,
    violations: violations.length, violationSample: violations.slice(0, 3),
    firstGates: tally(played.map(item => item.firstWinCall), [...new Set(played.map(item => item.firstWinCall))].sort((a, b) => a - b)),
    gapsDrawn: tally(played.flatMap(item => item.gaps), [8, 9, 10, 11]),
    firstWinnerCall: { mean: mean(firstWinners), p50: percentile(firstWinners, 0.5), max: firstWinners.length ? Math.max(...firstWinners) : null, minMinusGate: played.length ? Math.min(...played.filter(item => item.winnerCalls.length).map(item => item.winnerCalls[0] - item.firstWinCall)) : null },
    eventGaps: { min: actualGaps.length ? Math.min(...actualGaps) : null, mean: mean(actualGaps), max: actualGaps.length ? Math.max(...actualGaps) : null, minSlackOverDrawn: slack.length ? Math.min(...slack) : null },
    winners: { mean: mean(played.map(item => item.winners)), max: Math.max(0, ...played.map(item => item.winners)) },
    reachedTargetOrEveryone: `${reached}/${played.length}`,
    completedReason: Object.fromEntries(["winners", "everyone", "deck", "host", null].map(reason => [String(reason), played.filter(item => item.completedReason === reason).length]).filter(([, n]) => n)),
    tiedWinners: played.reduce((sum, item) => sum + item.ties, 0),
    eventsWithTies: played.reduce((sum, item) => sum + item.winnerEvents.filter(event => event.winners > 1).length, 0),
    events: played.reduce((sum, item) => sum + item.winnerEvents.length, 0),
    overTarget: played.reduce((sum, item) => sum + Math.max(0, item.winners - item.target), 0),
    pendingLines: played.reduce((sum, item) => sum + item.pending, 0),
    stuckCalls: played.reduce((sum, item) => sum + item.stuck, 0),
    callsPerMatch: { mean: mean(played.map(item => item.calls)), max: Math.max(0, ...played.map(item => item.calls)) },
    msPerMatch: { mean: mean(played.map(item => item.ms)), max: Math.max(0, ...played.map(item => item.ms)) },
    coverageShare: Object.fromEntries(Object.entries(coverage).map(([kind, n]) => [kind, calls ? Math.round((n / calls) * 1000) / 10 : 0])),
    longestZeroMatchStreak: Math.max(0, ...played.map(item => item.longestZeroMatchStreak)),
    fourOfFiveBeforeGate: { mean: mean(fourAtGate), max: Math.max(0, ...fourAtGate) },
    uniqueQuestions: played.every(item => item.uniqueQuestions === item.calledQuestions)
  });
}
// Across every played match: the draws, the explicit sequences, seat fairness.
const sequences = allPlayed.map(item => [item.firstWinCall, ...item.gaps]);
const startsWith = prefix => sequences.filter(sequence => prefix.every((value, index) => sequence[index] === value)).length;
const seatWins = { firstHalf: 0, secondHalf: 0 };
for (const item of allPlayed) for (const [seat, wins] of Object.entries(item.seatWins ?? {})) {
  if (Number(seat) < item.players / 2) seatWins.firstHalf += wins; else seatWins.secondHalf += wins;
}
report.summary = {
  played: allPlayed.length,
  violations: violationsTotal,
  firstGates: tally(allPlayed.map(item => item.firstWinCall), [...new Set(allPlayed.map(item => item.firstWinCall))].sort((a, b) => a - b)),
  gapsDrawn: tally(allPlayed.flatMap(item => item.gaps), [8, 9, 10, 11]),
  earliestBingoMinusGate: allPlayed.filter(item => item.winnerCalls.length).length ? Math.min(...allPlayed.filter(item => item.winnerCalls.length).map(item => item.winnerCalls[0] - item.firstWinCall)) : null,
  smallestEventGapMinusDrawn: (() => { const values = allPlayed.flatMap(item => item.winnerEvents.slice(1).map((event, index) => event.n - item.winnerEvents[index].n - item.gaps[index])); return values.length ? Math.min(...values) : null; })(),
  sequences: { "14,8,11,9,10": startsWith([14, 8, 11, 9, 10]), "17,11,8": startsWith([17, 11, 8]) },
  tiedWinners: allPlayed.reduce((sum, item) => sum + item.ties, 0),
  overTarget: allPlayed.reduce((sum, item) => sum + Math.max(0, item.winners - item.target), 0),
  reachedTargetOrEveryone: `${allPlayed.filter(item => item.winners >= Math.min(item.target, item.players)).length}/${allPlayed.length}`,
  seatWins
};
report.violationsTotal = violationsTotal;
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, "matches.json"), JSON.stringify(results.map(item => {
  const { timeline, ...rest } = item;
  delete rest.callLog;
  return { ...rest, timelineLength: timeline?.length };
}), null, 1));
for (const group of report.groups) {
  console.log(`${group.group.padEnd(52)} played ${String(group.played).padStart(3)}/${group.matches} viol ${group.violations} first ${group.firstWinnerCall.mean?.toFixed(1)} (max ${group.firstWinnerCall.max}) gaps ${group.eventGaps.min}-${group.eventGaps.max} reached ${group.reachedTargetOrEveryone} ties ${group.tiedWinners} over ${group.overTarget} ${JSON.stringify(group.completedReason)} calls ${group.callsPerMatch.mean?.toFixed(0)} ms ${group.msPerMatch.mean?.toFixed(0)}`);
}
console.log(JSON.stringify(report.summary));
console.log(`\n${results.length} matches in ${report.seconds} s; violations: ${violationsTotal}; failures: ${report.failures.length}`);
process.exit(violationsTotal === 0 && report.failures.length === 0 ? 0 : 1);
