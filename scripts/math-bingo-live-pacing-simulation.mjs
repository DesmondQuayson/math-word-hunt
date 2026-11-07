/**
 * Math Bingo Live — pacing simulation (LOCAL Supabase only).
 *
 * Plays complete paced matches through the REAL database functions: rooms and
 * students are created with the public functions, every card is dealt by the
 * engine exactly as the host route deals it, and supabase/sim/
 * math_bingo_live_pacing_sim.sql (loaded here, test only) plays each match
 * inside the database with seeded, imperfect students. Then it judges the
 * pacing contract across modes, class sizes, winner counts and student models:
 *
 *   A no Bingo before the first gate     B an opportunity at/after it
 *   C ≥ spacing calls between winners     D the configured winners are reached
 *   E one win per player                  F no question repeats
 *   G/H/I zero-, single- and multi-player matches occur   J/K progress spreads
 *   L Free Space never breaks a gate      M only enabled lines count
 *   fairness: no seat (join order) wins systematically more often
 *
 *   node scripts/math-bingo-live-pacing-simulation.mjs [--matches 40] [--players 10,20,30,40,50]
 *        [--modes addition,subtraction,...] [--winners 1,2,3,5] [--out qa-artifacts/math-bingo-live/pacing-simulation]
 *
 * Needs SUPABASE_TEST_URL (loopback) and SUPABASE_TEST_SECRET_KEY.
 */
import { execFile, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { createClient } from "@supabase/supabase-js";

process.chdir(fileURLToPath(new URL("..", import.meta.url)));
const engine = "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/";
const { DEFAULT_SETTINGS, MODES, normalizeSettings } = await import(`${engine}settings.js`);
const { buildUniverse, universeClasses, pacingPlan, dealPacedBoard, isValidPacedBoard } = await import(`${engine}pacing.js`);

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
const SEED_TEXT = argument("seed", "mathnexa-bingo-pacing-2026-11-07");

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
    const plan = pacingPlan(settings, universe, gameSeed, roster.length);
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
      p_boards: boards, p_pacing: { firstWinCall: plan.firstWinCall, spacing: plan.spacing, buffer: plan.buffer, maxWinners: plan.maxWinners, scaled: plan.scaled, players: plan.players, late: plan.late, reserve: plan.reserve }
    });
    if (started.result !== "started") return { skipped: started.result, maxWinners: started.maxWinners ?? plan.maxWinners, plan };
    const result = await simPlay({ owner, hostToken, players: roster.map(({ index, token, accuracy, attention, free }) => ({ index, token, accuracy, attention, free })), seed: matchSeed, maxCalls: 160 });
    if (result.error) throw new Error(result.error);
    return { ...result, plan, dealt: Number(started.dealt), winnersWanted: winners };
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
        for (let match = 0; match < MATCHES; match += 1) jobs.push({ mode: mode.id, level, count, winners, match });
      }
    }
  }
}
console.log(`${jobs.length} matches queued (${PARALLEL} at a time)`);
const results = [];
let cursor = 0;
let done = 0;
const startedAt = Date.now();
async function worker() {
  while (cursor < jobs.length) {
    const job = jobs[cursor++];
    const settingsResult = normalizeSettings({ ...DEFAULT_SETTINGS, mode: job.mode, level: job.level, winners: job.winners, questionSeconds: 0, revealSeconds: 0, music: "off", celebration: "off" });
    if (!settingsResult.ok) throw new Error(settingsResult.error);
    const matchSeed = `${SEED_TEXT}:${job.mode}:${job.level}:${job.count}:${job.winners}:${job.match}`;
    const gameSeed = hash(matchSeed).slice(0, 32);
    try {
      const played = await playMatch({ settings: settingsResult.settings, players: studentsFor(job.count, matchSeed), winners: job.winners, matchSeed, gameSeed });
      results.push({ ...job, ...played });
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
  const key = `${result.mode}/${result.level} · ${result.count} players · ${result.winners} winners`;
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(result);
}
const report = { seed: SEED_TEXT, matches: results.length, startedAt: new Date(startedAt).toISOString(), seconds: Math.round((Date.now() - startedAt) / 1000), groups: [], failures: [] };
let violationsTotal = 0;
for (const [key, list] of groups) {
  const played = list.filter(item => !item.skipped && !item.failed);
  const skipped = list.filter(item => item.skipped);
  const failed = list.filter(item => item.failed);
  for (const item of failed) report.failures.push({ group: key, match: item.match, error: item.failed });
  const violations = played.flatMap(item => item.violations.map(v => ({ match: item.match, ...v })));
  violationsTotal += violations.length;
  const winnerCalls = played.flatMap(item => item.winnerCalls);
  const gaps = played.flatMap(item => item.winnerCalls.slice(1).map((call, index) => call - item.winnerCalls[index]));
  const reached = played.filter(item => item.winners >= item.winnersWanted).length;
  const coverage = { zero: 0, single: 0, limited: 0, broad: 0 };
  for (const item of played) for (const kind of Object.keys(coverage)) coverage[kind] += item.coverage?.[kind] ?? 0;
  const calls = played.reduce((sum, item) => sum + item.calls, 0);
  const fourAt10 = played.map(item => item.timeline.find(t => t.n === 10)).filter(Boolean).map(t => t.four);
  const fourAt14 = played.map(item => item.timeline.find(t => t.n === Math.min(14, item.plan.firstWinCall - 1))).filter(Boolean).map(t => t.four);
  const threeAt14 = played.map(item => item.timeline.find(t => t.n === Math.min(14, item.plan.firstWinCall - 1))).filter(Boolean).map(t => t.three);
  const twoAt8 = played.map(item => item.timeline.find(t => t.n === 8)).filter(Boolean).map(t => t.two + t.three + t.four);
  const seatWins = {};
  for (const item of played) for (const [seat, wins] of Object.entries(item.seatWins ?? {})) seatWins[seat] = (seatWins[seat] ?? 0) + wins;
  const seatValues = Object.values(seatWins);
  const expectedPerSeat = winnerCalls.length / Math.max(1, list[0].count);
  const seatMax = Math.max(0, ...seatValues);
  report.groups.push({
    group: key, matches: list.length, played: played.length, skipped: skipped.length, skippedReason: skipped[0]?.skipped ?? null, maxWinners: list[0]?.maxWinners ?? played[0]?.plan?.maxWinners ?? null,
    firstWinCall: played[0]?.plan?.firstWinCall ?? null,
    violations: violations.length, violationSample: violations.slice(0, 3),
    reachedConfiguredWinners: `${reached}/${played.length}`,
    completedReason: Object.fromEntries(["winners", "deck", "host", "everyone", null].map(reason => [String(reason), played.filter(item => item.completedReason === reason).length]).filter(([, n]) => n)),
    earliestBingo: Math.min(...winnerCalls, Infinity) === Infinity ? null : Math.min(...winnerCalls),
    firstWinnerCall: { mean: mean(played.map(item => item.winnerCalls[0]).filter(Number.isFinite)), p50: percentile(played.map(item => item.winnerCalls[0]).filter(Number.isFinite), 0.5), max: Math.max(...played.map(item => item.winnerCalls[0] ?? 0)) },
    winnerGaps: { min: gaps.length ? Math.min(...gaps) : null, mean: mean(gaps), max: gaps.length ? Math.max(...gaps) : null },
    averageWinnerCalls: mean(winnerCalls),
    firstOpportunityCall: { mean: mean(played.map(item => item.firstOpportunityCall).filter(Number.isFinite)), max: Math.max(...played.map(item => item.firstOpportunityCall ?? 0)) },
    pendingLines: played.reduce((sum, item) => sum + item.pending, 0),
    stuckCalls: played.reduce((sum, item) => sum + item.stuck, 0),
    callsPerMatch: mean(played.map(item => item.calls)),
    coverageShare: Object.fromEntries(Object.entries(coverage).map(([kind, n]) => [kind, calls ? Math.round((n / calls) * 1000) / 10 : 0])),
    longestZeroMatchStreak: Math.max(0, ...played.map(item => item.longestZeroMatchStreak)),
    fourOfFiveAt10: { mean: mean(fourAt10), max: Math.max(0, ...fourAt10) },
    fourOfFiveBeforeGate: { mean: mean(fourAt14), max: Math.max(0, ...fourAt14) },
    threeOfFiveBeforeGate: { mean: mean(threeAt14) },
    anyProgressAt8: { mean: mean(twoAt8) },
    uniqueQuestions: played.every(item => item.uniqueQuestions === item.calledQuestions),
    seatFairness: { expectedWinsPerSeat: Math.round(expectedPerSeat * 100) / 100, mostWinsAnySeat: seatMax, seatsThatWon: seatValues.length }
  });
}
report.violationsTotal = violationsTotal;
mkdirSync(OUT, { recursive: true });
writeFileSync(resolve(OUT, "report.json"), JSON.stringify(report, null, 2));
writeFileSync(resolve(OUT, "matches.json"), JSON.stringify(results.map(item => {
  const { timeline, ...rest } = item;
  delete rest.callLog;
  return { ...rest, timelineLength: timeline?.length };
}), null, 1));
for (const group of report.groups) {
  console.log(`${group.group.padEnd(52)} played ${String(group.played).padStart(3)}/${group.matches} viol ${group.violations} win1 ${group.firstWinnerCall.p50 ?? "-"} (max ${group.firstWinnerCall.max}) gap min ${group.winnerGaps.min ?? "-"} reached ${group.reachedConfiguredWinners} pend ${group.pendingLines} stuck ${group.stuckCalls} cov z${group.coverageShare.zero} s${group.coverageShare.single} l${group.coverageShare.limited} b${group.coverageShare.broad} 4/5@gate ${group.fourOfFiveBeforeGate.mean?.toFixed(1)} seatMax ${group.seatFairness.mostWinsAnySeat}/${group.seatFairness.expectedWinsPerSeat}${group.skipped ? ` skipped ${group.skipped} (${group.skippedReason})` : ""}`);
}
console.log(`\n${results.length} matches in ${report.seconds} s; violations: ${violationsTotal}; failures: ${report.failures.length}`);
if (report.failures.length) console.log(report.failures.slice(0, 5));
process.exit(violationsTotal === 0 && report.failures.length === 0 ? 0 : 1);
