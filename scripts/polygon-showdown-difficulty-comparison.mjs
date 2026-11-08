/**
 * Polygon Showdown difficulty comparison, through the real engine, for three
 * kinds of player: the four-shape game before the Pentagon, the all-five-shapes
 * build it replaced, and the progressive Pentagon that shipped. Reports what the
 * player experiences (legal swaps to choose from, time between successful
 * swaps, matches, cascades, reshuffles, coins per minute, how many Pentagons
 * are about) and what a session earns at 5, 10, 30 and 60 minutes.
 *
 * Thinking time grows as legal swaps get scarcer: that is the assumption that
 * turns "fewer obvious matches" into time, and it is applied to every rule set.
 *
 *   node scripts/polygon-showdown-difficulty-comparison.mjs [--runs 30] [--json]
 */
import { createRandom } from "../apps/platform-web/public/internal-games/math-bingo-live/src/engine/random.js";
import { ACTIVE_SHAPES, PENTAGON } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/shapes.js";
import { allLegalMoves, applySwap, CONFIG, createRefillStream, decodeBoard, encodeBoard, newGameState, SCHEDULES, startingBoard } from "../apps/platform-web/public/internal-games/polygon-showdown/src/engine/game.js";

const args = process.argv.slice(2);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 ? Number(args[index + 1]) : fallback;
};
const RUNS = option("runs", 30);
const JSON_OUTPUT = args.includes("--json");
const CHECKPOINTS = [5, 10, 30, 60];
const SHOWDOWN_LENGTHS = [5, 10, 30];
const SWAP_ANIMATION_MS = 180;
const STEP_ANIMATION_MS = 470;

const PRE_PENTAGON = Object.freeze({ config: Object.freeze({ rules: 1, cols: 8, rows: 8, kinds: ACTIVE_SHAPES, boardTarget: null }), schedule: null, label: "pre-Pentagon" });
const ALL_FIVE = Object.freeze({ config: Object.freeze({ ...CONFIG, boardTarget: Object.freeze({ min: 9, max: 15, attempts: 40 }) }), schedule: Object.freeze({ unit: "moves", warmup: 20, always: true }), label: "all five shapes" });
const PROGRESSIVE = Object.freeze({ config: CONFIG, schedule: SCHEDULES.solo, label: "progressive Pentagon" });
const SHOWDOWN_STANDARD = Object.freeze({ config: CONFIG, schedule: SCHEDULES.standard, label: "Standard Showdown" });

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

function playSession(profile, rules, seedText, checkpoints) {
  const { config, schedule } = rules;
  const random = createRandom(`difficulty:${seedText}`);
  const stream = createRefillStream(seedText, config);
  let state = newGameState(encodeBoard(startingBoard(seedText, config)), config, schedule);
  let clock = 0;
  const totals = { legal: 0, decisions: 0, onBoard: 0, spawned: 0, pentagonsSpawned: 0, pentagonMatches: 0 };
  let firstPentagon = null;
  const samples = new Map();
  let nextCheckpoint = 0;
  const horizon = checkpoints[checkpoints.length - 1] * 60_000;
  while (clock < horizon) {
    const board = decodeBoard(state.board);
    const moves = allLegalMoves(board, config.cols, config.rows);
    totals.legal += moves.length;
    totals.decisions += 1;
    totals.onBoard += board.filter((value) => value === PENTAGON).length;
    if (firstPentagon === null && board.includes(PENTAGON)) firstPentagon = { seconds: clock / 1000, swaps: state.moves };
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
    for (const step of result.steps) {
      totals.spawned += step.spawns.length;
      totals.pentagonsSpawned += step.spawns.filter((spawn) => spawn.kind === PENTAGON).length;
      totals.pentagonMatches += step.groups.filter((group) => group.kind === PENTAGON).length;
    }
    clock += SWAP_ANIMATION_MS + result.chain * STEP_ANIMATION_MS;
    while (nextCheckpoint < checkpoints.length && clock >= checkpoints[nextCheckpoint] * 60_000) {
      samples.set(checkpoints[nextCheckpoint], { coins: state.coins, moves: state.moves, cascades: state.cascades, matches: state.matches, reshuffles: state.reshuffles, bestCombo: state.bestCombo, ...totals });
      nextCheckpoint += 1;
    }
  }
  return { samples, firstPentagon };
}

const mean = (values) => values.reduce((sum, value) => sum + value, 0) / values.length;
const round = (value, places = 2) => Number(value.toFixed(places));

function summarize(rules, profile, name, checkpoints) {
  const sessions = Array.from({ length: RUNS }, (_, run) => playSession(profile, rules, `${name}-${run}`, checkpoints));
  const at = (minutes, key) => mean(sessions.map((session) => session.samples.get(minutes)[key]));
  const last = checkpoints[checkpoints.length - 1];
  const moves = at(last, "moves");
  const decisions = at(last, "decisions");
  const firsts = sessions.map((session) => session.firstPentagon).filter(Boolean);
  return {
    coins: Object.fromEntries(checkpoints.map((minutes) => [minutes, Math.round(at(minutes, "coins"))])),
    legalMovesAverage: round(at(last, "legal") / decisions, 1),
    secondsPerSuccessfulSwap: round((last * 60) / moves, 2),
    movesPerMinute: round(moves / last, 1),
    matchesPerMinute: round(at(last, "matches") / last, 1),
    matchesPerSwap: round(at(last, "matches") / moves),
    cascadesPerSwap: round(at(last, "cascades") / moves),
    cascadesPerMinute: round(at(last, "cascades") / last, 1),
    reshufflesPer1000Swaps: round((at(last, "reshuffles") / moves) * 1000, 1),
    coinsPerMinute: round(at(last, "coins") / last, 1),
    coinsPerSwap: round(at(last, "coins") / moves),
    bestCombo: Math.max(...sessions.map((session) => session.samples.get(last).bestCombo)),
    pentagonsOnBoardAverage: round(at(last, "onBoard") / decisions, 1),
    pentagonShareOfNewShapesPercent: round((at(last, "pentagonsSpawned") / at(last, "spawned")) * 100, 1),
    pentagonMatchesPer100Swaps: round((at(last, "pentagonMatches") / moves) * 100, 1),
    firstPentagonAfterSwaps: firsts.length ? round(mean(firsts.map((first) => first.swaps)), 0) : null,
    firstPentagonAfterSeconds: firsts.length ? round(mean(firsts.map((first) => first.seconds)), 0) : null
  };
}

const openingLegal = (rules) => {
  const counts = Array.from({ length: 200 }, (_, index) => allLegalMoves(startingBoard(`opening-${index}`, rules.config), rules.config.cols, rules.config.rows).length);
  return { mean: round(mean(counts), 1), min: Math.min(...counts), max: Math.max(...counts) };
};

const report = {
  openingBoardLegalMoves: { preP: openingLegal(PRE_PENTAGON), allFive: openingLegal(ALL_FIVE), progressive: openingLegal(PROGRESSIVE) },
  players: {},
  showdown: {}
};
for (const [name, profile] of Object.entries(PLAYERS)) {
  report.players[name] = {
    preP: summarize(PRE_PENTAGON, profile, name, CHECKPOINTS),
    allFive: summarize(ALL_FIVE, profile, name, CHECKPOINTS),
    progressive: summarize(PROGRESSIVE, profile, name, CHECKPOINTS)
  };
  report.showdown[name] = {
    preP: summarize(PRE_PENTAGON, profile, `${name}-room`, SHOWDOWN_LENGTHS),
    standard: summarize(SHOWDOWN_STANDARD, profile, `${name}-room`, SHOWDOWN_LENGTHS)
  };
}

const reduction = (before, after) => `${round((1 - after / before) * 100, 1)}%`;

if (JSON_OUTPUT) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Runs per row: ${RUNS}. Opening board legal swaps: ${JSON.stringify(report.openingBoardLegalMoves)}`);
  for (const [name, row] of Object.entries(report.players)) {
    console.log(`\n${name.toUpperCase()}: Solo   pre-Pentagon -> all five -> progressive`);
    for (const key of Object.keys(row.preP)) {
      if (key === "coins") continue;
      console.log(`${key.padEnd(34)} ${String(row.preP[key]).padEnd(8)} ${String(row.allFive[key]).padEnd(8)} ${row.progressive[key]}`);
    }
    for (const minutes of CHECKPOINTS) {
      const before = row.preP.coins[minutes];
      console.log(`coins at ${String(minutes).padEnd(3)}min  pre ${String(before).padEnd(6)} all-five ${String(row.allFive.coins[minutes]).padEnd(6)} (-${reduction(before, row.allFive.coins[minutes])})  progressive ${String(row.progressive.coins[minutes]).padEnd(6)} (-${reduction(before, row.progressive.coins[minutes])})`);
    }
  }
  console.log("\nSTANDARD SHOWDOWN (coins at the end of a game of this length, against the same player before the Pentagon)");
  for (const [name, row] of Object.entries(report.showdown)) {
    console.log(`${name.padEnd(9)} ${SHOWDOWN_LENGTHS.map((minutes) => `${minutes} min: ${row.preP.coins[minutes]} -> ${row.standard.coins[minutes]} (-${reduction(row.preP.coins[minutes], row.standard.coins[minutes])})`).join("   ")}   legal ${row.standard.legalMovesAverage}  cascades/swap ${row.standard.cascadesPerSwap}`);
  }
}
