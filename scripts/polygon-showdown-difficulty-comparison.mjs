/**
 * Polygon Showdown difficulty comparison: the four-shape game against the
 * five-shape progression, through the real engine, for three kinds of player.
 * Reports what the player experiences (legal swaps to choose from, time between
 * successful swaps, matches, cascades, reshuffles, coins per minute) and what a
 * session earns at 5, 10, 30 and 60 minutes.
 *
 * Thinking time grows as legal swaps get scarcer: that is the assumption that
 * turns "fewer obvious matches" into time, and it is applied to both rule sets.
 *
 *   node scripts/polygon-showdown-difficulty-comparison.mjs [--runs 30] [--json]
 */
import { createRandom } from "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/random.js";
import { ACTIVE_SHAPES } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/shapes.js";
import { allLegalMoves, applySwap, CONFIG, createRefillStream, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const RUNS = option("runs", 30);
const JSON_OUTPUT = args.includes("--json");
const HORIZON_MS = 60 * 60_000;
const CHECKPOINTS = [5, 10, 30, 60];
const SWAP_ANIMATION_MS = 180;
const STEP_ANIMATION_MS = 470;

const OLD_CONFIG = Object.freeze({ rules: 1, cols: 8, rows: 8, kinds: ACTIVE_SHAPES, boardTarget: null });
const RULES = Object.freeze({
  old: { config: OLD_CONFIG, schedule: null, label: "before (4 shapes)" },
  new: { config: CONFIG, schedule: SCHEDULES.solo, label: "after (Pentagon joins)" }
});

const PLAYERS = Object.freeze({
  beginner: { thinkMs: 3600, jitter: 0.5, smart: 0, misses: 0.18 },
  average: { thinkMs: 2100, jitter: 0.4, smart: 0.7, misses: 0.06 },
  skilled: { thinkMs: 1100, jitter: 0.3, smart: 1, misses: 0.01 }
});

/** Fewer choices on the board take longer to spot. 20+ legal swaps cost nothing extra. */
const scanFactor = (legal) => 1 + 0.7 * Math.max(0, 20 - legal) / 20;

function moveQuality(board, [a, b], config) {
  const copy = board.slice();
  [copy[a], copy[b]] = [copy[b], copy[a]];
  const rowBias = (Math.max(a, b) / (config.cols * config.rows)) * 1.2;
  let best = 0;
  for (const cell of [a, b]) {
    const kind = copy[cell];
    let across = 1;
    const col = cell % config.cols;
    const row = Math.floor(cell / config.cols);
    for (let c = col - 1; c >= 0 && copy[row * config.cols + c] === kind; c -= 1) across += 1;
    for (let c = col + 1; c < config.cols && copy[row * config.cols + c] === kind; c += 1) across += 1;
    let down = 1;
    for (let r = row - 1; r >= 0 && copy[r * config.cols + col] === kind; r -= 1) down += 1;
    for (let r = row + 1; r < config.rows && copy[r * config.cols + col] === kind; r += 1) down += 1;
    best = Math.max(best, across >= 3 ? across : 0, down >= 3 ? down : 0, across >= 3 && down >= 3 ? across + down - 1 : 0);
  }
  return best + rowBias;
}

function playSession(profile, rules, seedText) {
  const { config, schedule } = rules;
  const random = createRandom(`difficulty:${seedText}`);
  const stream = createRefillStream(seedText, config);
  let state = newGameState(encodeBoard(startingBoard(seedText, config)), config, schedule);
  let clock = 0;
  let legalSum = 0;
  let decisions = 0;
  let pentagonAtMs = null;
  const samples = new Map();
  let nextCheckpoint = 0;
  while (clock < HORIZON_MS) {
    const board = decodeBoard(state.board);
    const moves = allLegalMoves(board, config.cols, config.rows);
    legalSum += moves.length;
    decisions += 1;
    clock += profile.thinkMs * scanFactor(moves.length) * (1 + (random.next() * 2 - 1) * profile.jitter);
    if (random.next() < profile.misses) clock += 1200;
    let choice = moves[random.int(0, moves.length - 1)];
    if (random.next() < profile.smart) {
      let bestScore = -1;
      for (const move of moves) {
        const quality = moveQuality(board, move, config);
        if (quality > bestScore) {
          bestScore = quality;
          choice = move;
        }
      }
    }
    const result = applySwap(state, choice[0], choice[1], stream.at, config, Math.round(clock));
    if (!result.ok) throw new Error(`Engine refused a legal swap: ${result.reason}`);
    state = result.state;
    if (pentagonAtMs === null && schedule && state.matches >= schedule.afterMatches) pentagonAtMs = clock;
    clock += SWAP_ANIMATION_MS + result.chain * STEP_ANIMATION_MS;
    while (nextCheckpoint < CHECKPOINTS.length && clock >= CHECKPOINTS[nextCheckpoint] * 60_000) {
      samples.set(CHECKPOINTS[nextCheckpoint], { coins: state.coins, moves: state.moves, cascades: state.cascades, matches: state.matches, reshuffles: state.reshuffles, bestCombo: state.bestCombo, legalAverage: legalSum / decisions });
      nextCheckpoint += 1;
    }
  }
  return { samples, pentagonAtMs };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value, places = 2) => Number(value.toFixed(places));

function summarize(rules, profile, name) {
  const sessions = Array.from({ length: RUNS }, (_, run) => playSession(profile, rules, `${name}-${run}`));
  const at = (minutes, key) => mean(sessions.map((session) => session.samples.get(minutes)[key]));
  const hour = 60;
  const moves = at(hour, "moves");
  const pentagon = sessions.map((session) => session.pentagonAtMs).filter((value) => value !== null);
  return {
    coins: Object.fromEntries(CHECKPOINTS.map((minutes) => [minutes, Math.round(at(minutes, "coins"))])),
    legalMovesAverage: round(at(hour, "legalAverage"), 1),
    secondsPerSuccessfulSwap: round(3600 / moves, 2),
    movesPerMinute: round(moves / 60, 1),
    matchesPerMinute: round(at(hour, "matches") / 60, 1),
    matchesPerSwap: round(at(hour, "matches") / moves),
    cascadesPerSwap: round(at(hour, "cascades") / moves),
    cascadesPerMinute: round(at(hour, "cascades") / 60, 1),
    reshufflesPer1000Swaps: round((at(hour, "reshuffles") / moves) * 1000, 1),
    coinsPerMinute: round(at(hour, "coins") / 60, 1),
    coinsPerSwap: round(at(hour, "coins") / moves),
    bestCombo: Math.max(...sessions.map((session) => session.samples.get(hour).bestCombo)),
    pentagonJoinsAfterSeconds: pentagon.length ? Math.round(mean(pentagon) / 1000) : null
  };
}

const openingLegal = (rules) => {
  const counts = Array.from({ length: 200 }, (_, index) => {
    const seed = `opening-${index}`;
    return allLegalMoves(startingBoard(seed, rules.config), rules.config.cols, rules.config.rows).length;
  });
  return { mean: round(mean(counts), 1), min: Math.min(...counts), max: Math.max(...counts) };
};

const report = { openingBoardLegalMoves: { old: openingLegal(RULES.old), new: openingLegal(RULES.new) }, players: {} };
for (const [name, profile] of Object.entries(PLAYERS)) {
  report.players[name] = { old: summarize(RULES.old, profile, name), new: summarize(RULES.new, profile, name) };
}

if (JSON_OUTPUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Opening board legal swaps: before ${JSON.stringify(report.openingBoardLegalMoves.old)}  after ${JSON.stringify(report.openingBoardLegalMoves.new)}`);
  for (const [name, row] of Object.entries(report.players)) {
    console.log(`\n${name.toUpperCase()}`);
    for (const key of Object.keys(row.old)) {
      if (key === "coins") continue;
      console.log(`${key.padEnd(28)} ${String(row.old[key]).padEnd(10)} -> ${row.new[key]}`);
    }
    console.log(`coins at 5/10/30/60 min      ${Object.values(row.old.coins).join(" / ")}  ->  ${Object.values(row.new.coins).join(" / ")}`);
  }
}
