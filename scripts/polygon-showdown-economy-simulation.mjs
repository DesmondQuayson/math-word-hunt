/**
 * Polygon Showdown economy simulation.
 *
 * Plays complete timed sessions through the real game engine with three kinds
 * of simulated player, and reports what they earn after 5, 10, 30 and 60
 * minutes, how long the shop's price tiers take, and how fast cascades happen.
 * The pacing includes the real animation time of every move.
 *
 *   node scripts/polygon-showdown-economy-simulation.mjs [--runs 40] [--json]
 */
import { createRandom } from "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/random.js";
import { allLegalMoves, applySwap, CONFIG, createRefillStream, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";
import { showdownReward } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/economy.js";
import { catalogSummary } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/catalog.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const RUNS = option("runs", 40);
const JSON_OUTPUT = args.includes("--json");
const HORIZON_MS = 60 * 60_000;
const CHECKPOINTS = [5, 10, 30, 60];

// Real animation time (board-view.js): swap, then break + fall per cascade step.
const SWAP_ANIMATION_MS = 180;
const STEP_ANIMATION_MS = 470;

const PLAYERS = Object.freeze({
  // Slow, picks any legal swap it notices, and tries some swaps that fail.
  beginner: { thinkMs: 3600, jitter: 0.5, smart: 0, misses: 0.18 },
  // Steady, usually takes the bigger of the matches it can see.
  average: { thinkMs: 2100, jitter: 0.4, smart: 0.7, misses: 0.06 },
  // Fast, looks for the biggest match near the bottom (which cascades more).
  skilled: { thinkMs: 1100, jitter: 0.3, smart: 1, misses: 0.01 }
});

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

function playSession(profile, seedText) {
  const config = CONFIG;
  const random = createRandom(`sim:${seedText}`);
  const stream = createRefillStream(seedText);
  let state = newGameState(encodeBoard(startingBoard(seedText)), config, SCHEDULES.solo);
  let clock = 0;
  const samples = new Map();
  let nextCheckpoint = 0;
  while (clock < HORIZON_MS) {
    const think = profile.thinkMs * (1 + (random.next() * 2 - 1) * profile.jitter);
    clock += think;
    if (random.next() < profile.misses) clock += 1200; // a swap that bounces back
    const board = decodeBoard(state.board);
    const moves = allLegalMoves(board, config.cols, config.rows);
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
    const result = applySwap(state, choice[0], choice[1], stream.at.bind(stream), config, Math.round(clock));
    if (!result.ok) throw new Error(`Engine refused a legal swap: ${result.reason}`);
    state = result.state;
    clock += SWAP_ANIMATION_MS + result.chain * STEP_ANIMATION_MS;
    while (nextCheckpoint < CHECKPOINTS.length && clock >= CHECKPOINTS[nextCheckpoint] * 60_000) {
      samples.set(CHECKPOINTS[nextCheckpoint], { coins: state.coins, moves: state.moves, cascades: state.cascades, matches: state.matches, bestCombo: state.bestCombo, largestClear: state.largestClear, score: state.score, reshuffles: state.reshuffles });
      nextCheckpoint += 1;
    }
  }
  return samples;
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const percentile = (values, fraction) => {
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
};

const report = {};
for (const [name, profile] of Object.entries(PLAYERS)) {
  const sessions = Array.from({ length: RUNS }, (_, run) => playSession(profile, `${name}-${run}`));
  report[name] = {};
  for (const minutes of CHECKPOINTS) {
    const coins = sessions.map((session) => session.get(minutes).coins);
    const moves = sessions.map((session) => session.get(minutes).moves);
    const cascades = sessions.map((session) => session.get(minutes).cascades);
    report[name][minutes] = {
      coinsMean: Math.round(mean(coins)),
      coinsP10: percentile(coins, 0.1),
      coinsP90: percentile(coins, 0.9),
      moves: Math.round(mean(moves)),
      coinsPerMove: Number((mean(coins) / mean(moves)).toFixed(2)),
      cascadesPerMove: Number((mean(cascades) / mean(moves)).toFixed(2)),
      bestCombo: Math.max(...sessions.map((session) => session.get(minutes).bestCombo)),
      largestClear: Math.max(...sessions.map((session) => session.get(minutes).largestClear))
    };
  }
}

const hourly = Object.fromEntries(Object.entries(report).map(([name, rows]) => [name, rows[60].coinsMean]));
const summary = catalogSummary();
const tiers = summary.tiers.map((tier) => ({
  ...tier,
  minutes: Object.fromEntries(Object.entries(hourly).map(([name, perHour]) => [name, Math.round((tier.typicalPrice / perHour) * 60)]))
}));
const showdown5 = Object.fromEntries(Object.entries(report).map(([name, rows]) => [name, { coins: rows[5].coinsMean, permanentReward: showdownReward(rows[5].coinsMean, 300) }]));
const fullCatalogHours = Object.fromEntries(Object.entries(hourly).map(([name, perHour]) => [name, Math.round((summary.totalPrice / perHour) * 10) / 10]));

if (JSON_OUTPUT) {
  console.log(JSON.stringify({ report, tiers, showdown5, fullCatalogHours, catalogTotal: summary.totalPrice, items: summary.count }, null, 2));
} else {
  for (const [name, rows] of Object.entries(report)) {
    console.log(`\n${name.toUpperCase()}`);
    console.log("minutes  coins(mean)  p10-p90       moves  coins/move  cascades/move  bestCombo  largestClear");
    for (const minutes of CHECKPOINTS) {
      const row = rows[minutes];
      console.log(`${String(minutes).padEnd(8)} ${String(row.coinsMean).padEnd(12)} ${`${row.coinsP10}-${row.coinsP90}`.padEnd(13)} ${String(row.moves).padEnd(6)} ${String(row.coinsPerMove).padEnd(11)} ${String(row.cascadesPerMove).padEnd(14)} ${String(row.bestCombo).padEnd(10)} ${row.largestClear}`);
    }
  }
  console.log("\nSHOP TIERS (typical price, minutes of Solo play to earn it)");
  for (const tier of tiers) console.log(`${tier.tier.padEnd(11)} ${String(tier.typicalPrice).padEnd(7)} items ${String(tier.count).padEnd(4)} beginner ${String(tier.minutes.beginner).padEnd(6)} average ${String(tier.minutes.average).padEnd(6)} skilled ${tier.minutes.skilled}`);
  console.log(`\nWhole catalog ${summary.totalPrice} coins (${summary.count} items): hours of play ${JSON.stringify(fullCatalogHours)}`);
  console.log(`5-minute Showdown: ${JSON.stringify(showdown5)}`);
}
