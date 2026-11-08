// Polygon Showdown game rules: SWAP, MATCH, BREAK, FALL, REFILL.
//
// The whole game is a pure function of (state, swap, refill stream). The
// browser runs it so a swap answers instantly; the server runs the same code
// over the same swaps to decide what actually happened. A browser only ever
// sends "swap these two cells at this time": coins, scores, matches and
// cascades are always worked out here, on the server's copy.

import { createRandom } from "../../../math-bingo-live/src/engine/random.js";
import { allLegalMoves, areAdjacent, collapse, cellOf, colOf, EMPTY, findLegalMove, findMatches, generateBoard, reshuffleBoard, settleKind, swapMakesMatch } from "./board.js";
import { coinsForMatch, minGapAfter, scoreForMatch, TIMING } from "./economy.js";
import { ACTIVE_SHAPES, ADVANCED_SHAPES, PENTAGON } from "./shapes.js";

export { allLegalMoves, findLegalMove, findMatches };

/**
 * `kinds` are dealt from the start; `advancedKinds` once a game's schedule says
 * so. `boardTarget` keeps a new board's legal swaps in a range that leaves the
 * player something to look for. Old runs and rooms keep their own stored state.
 */
export const CONFIG = Object.freeze({
  rules: 2,
  cols: 8,
  rows: 8,
  kinds: ACTIVE_SHAPES,
  advancedKinds: ADVANCED_SHAPES,
  boardTarget: Object.freeze({ min: 9, max: 15, attempts: 40 })
});

/**
 * When the Pentagon joins. Never based on how well someone is doing against
 * other players: in a Showdown it is the same moment on the room's clock for
 * everyone; in Solo it follows the run's own matches, because there is nobody
 * to be unfair to.
 */
export const SCHEDULES = Object.freeze({
  solo: Object.freeze({ afterMatches: 40 }),
  standard: Object.freeze({ afterMs: 60_000 }),
  challenge: Object.freeze({ afterMs: 0 })
});

export function pentagonIsActive(state, t) {
  const schedule = state.schedule;
  if (!schedule) return false;
  if (schedule.afterMatches !== undefined) return state.matches >= schedule.afterMatches;
  if (schedule.afterMs !== undefined) return Number.isInteger(t) && t >= schedule.afterMs;
  return false;
}

/** A drawn value at or above this is a Pentagon once active, otherwise value - PROMOTED. */
const PROMOTED = 10;
export const CELL_COUNT = CONFIG.cols * CONFIG.rows;

/** How many upcoming shapes per column a browser is told at a time. */
export const WINDOW_SIZE = 40;

const BLOCK_SIZE = 32;

/**
 * The shapes that will enter each column, one fixed endless sequence per
 * column for a seed. Everybody in a Showdown draws from the same sequences at
 * their own pace, so nobody's random numbers are easier than anyone else's.
 * Any position can be read directly (blocks are generated independently).
 */
export function createRefillStream(seed, config = CONFIG) {
  const blocks = new Map();
  const block = (col, number) => {
    const key = `${col}:${number}`;
    let values = blocks.get(key);
    if (!values) {
      const random = createRandom(`polygon-showdown:refill:${seed}:${col}:${number}`);
      const promotes = (config.advancedKinds?.length ?? 0) > config.kinds.length;
      values = Array.from({ length: BLOCK_SIZE }, () => {
        const kind = config.kinds[random.int(0, config.kinds.length - 1)];
        // One draw in five is the Pentagon's, so all five shapes are equally likely.
        return promotes && random.int(0, config.advancedKinds.length - 1) === 0 ? PROMOTED + kind : kind;
      });
      if (blocks.size >= 128) blocks.clear();
      blocks.set(key, values);
    }
    return values;
  };
  return Object.freeze({
    at(col, index) {
      return block(col, Math.floor(index / BLOCK_SIZE))[index % BLOCK_SIZE];
    }
  });
}

/** The same opening board for everyone given this seed. */
export function startingBoard(seed, config = CONFIG, kinds = config.kinds) {
  return generateBoard(createRandom(`polygon-showdown:board:${seed}`), kinds, config.cols, config.rows, config.boardTarget ?? null);
}

export function encodeBoard(board) {
  return board.join("");
}

export function decodeBoard(text) {
  return Array.from(text, (digit) => Number(digit));
}

export function isBoardText(text, config = CONFIG) {
  if (typeof text !== "string" || text.length !== config.cols * config.rows) return false;
  const kinds = new Set((config.advancedKinds ?? config.kinds).map(String));
  return Array.from(text).every((digit) => kinds.has(digit));
}

export function newGameState(boardText, config = CONFIG, schedule = null) {
  return {
    rules: config.rules,
    ...(schedule ? { schedule } : {}),
    board: boardText,
    cursors: new Array(config.cols).fill(0),
    reshuffles: 0,
    moves: 0,
    coins: 0,
    score: 0,
    matches: 0,
    cascades: 0,
    largestClear: 0,
    bestCombo: 0,
    cleared: 0
  };
}

function isSchedule(schedule) {
  if (!schedule || typeof schedule !== "object") return false;
  const keys = Object.keys(schedule);
  return keys.length === 1 && (keys[0] === "afterMatches" || keys[0] === "afterMs") && Number.isInteger(schedule[keys[0]]) && schedule[keys[0]] >= 0;
}

export function isGameState(value, config = CONFIG) {
  if (!value || typeof value !== "object") return false;
  if (!isBoardText(value.board, config)) return false;
  if (!Array.isArray(value.cursors) || value.cursors.length !== config.cols || !value.cursors.every((n) => Number.isInteger(n) && n >= 0)) return false;
  if (value.schedule !== undefined && !isSchedule(value.schedule)) return false;
  return ["reshuffles", "moves", "coins", "score", "matches", "cascades", "largestClear", "bestCombo", "cleared"].every((key) => Number.isInteger(value[key]) && value[key] >= 0);
}

/** A short fingerprint of a state, to notice a browser and the server disagreeing. */
export function stateHash(state) {
  const text = `${state.board}|${state.cursors.join(",")}|${state.reshuffles}|${state.moves}|${state.coins}|${state.score}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * One swap, resolved completely. Returns `{ ok: false, reason }` and leaves
 * the state alone when the swap cannot happen:
 *   not-adjacent  the two cells are not neighbours
 *   no-match      the swap makes no match (the shapes go back)
 *   need-refill   the browser has not been told the next shapes yet
 * Otherwise `{ ok: true, state, steps, reshuffled, chain, coins, score }`, with
 * one step per link of the cascade, for the board to animate.
 */
export function applySwap(state, a, b, refillAt, config = CONFIG, t = undefined) {
  const { cols, rows } = config;
  const count = cols * rows;
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0 || a >= count || b >= count || !areAdjacent(a, b, cols)) {
    return { ok: false, reason: "not-adjacent" };
  }
  const board = decodeBoard(state.board);
  if (!swapMakesMatch(board, a, b, cols, rows)) return { ok: false, reason: "no-match" };
  [board[a], board[b]] = [board[b], board[a]];

  const advanced = Boolean(config.advancedKinds) && pentagonIsActive(state, t);
  const kinds = advanced ? config.advancedKinds : config.kinds;
  const cursors = state.cursors.slice();
  const steps = [];
  let chain = 0;
  let coins = 0;
  let score = 0;
  let matches = 0;
  let largestClear = state.largestClear;
  let cleared = 0;

  for (;;) {
    const groups = findMatches(board, cols, rows);
    if (groups.length === 0) break;
    chain += 1;
    let stepCoins = 0;
    let stepScore = 0;
    const scored = groups.map((group, index) => {
      const value = coinsForMatch(group.size, chain, index === 0);
      const points = scoreForMatch(group.size, chain);
      stepCoins += value;
      stepScore += points;
      if (group.size > largestClear) largestClear = group.size;
      return { kind: group.kind, cells: group.cells, size: group.size, horizontal: group.horizontal, vertical: group.vertical, coins: value, score: points };
    });
    const clearedCells = [...new Set(groups.flatMap((group) => group.cells))].sort((x, y) => x - y);
    for (const cell of clearedCells) board[cell] = EMPTY;
    const { falls, emptyAbove } = collapse(board, cols, rows);
    const spawns = [];
    for (let col = 0; col < cols; col += 1) {
      for (let row = emptyAbove[col] - 1; row >= 0; row -= 1) {
        const raw = refillAt(col, cursors[col]);
        if (!Number.isInteger(raw) || raw < 0) return { ok: false, reason: "need-refill" };
        cursors[col] += 1;
        const cell = cellOf(row, col, cols);
        const drawn = raw >= PROMOTED ? (advanced ? PENTAGON : raw - PROMOTED) : raw;
        const kind = settleKind(board, cell, drawn, drawn === PENTAGON ? kinds : config.kinds, cols, rows);
        board[cell] = kind;
        spawns.push({ to: cell, kind, drop: emptyAbove[col] });
      }
    }
    coins += stepCoins;
    score += stepScore;
    matches += groups.length;
    cleared += clearedCells.length;
    steps.push({ chain, groups: scored, cleared: clearedCells, coins: stepCoins, score: stepScore, falls, spawns });
  }

  let reshuffles = state.reshuffles;
  let reshuffled = null;
  if (!findLegalMove(board, cols, rows)) {
    const next = reshuffleBoard(board, reshuffles, kinds, cols, rows);
    reshuffles += 1;
    reshuffled = encodeBoard(next);
    for (let cell = 0; cell < count; cell += 1) board[cell] = next[cell];
  }

  return {
    ok: true,
    chain,
    coins,
    score,
    steps,
    reshuffled,
    state: {
      ...state,
      board: encodeBoard(board),
      cursors,
      reshuffles,
      moves: state.moves + 1,
      coins: state.coins + coins,
      score: state.score + score,
      matches: state.matches + matches,
      cascades: state.cascades + (chain - 1),
      largestClear,
      bestCombo: Math.max(state.bestCombo, chain),
      cleared: state.cleared + cleared
    }
  };
}

/**
 * The server's replay of a batch of swaps `[a, b, t]`, t in milliseconds on
 * the server's timeline (since the Showdown began, or since this Solo session
 * opened). Stops at the first swap that breaks a rule; everything before it
 * stands. `limits`:
 *   nextT   the earliest the first swap may be (how the last one ended)
 *   nowT    the server's clock on the same timeline
 *   maxT    optional end of play (the Showdown's buzzer)
 */
export function replayMoves(state, moves, refillAt, limits, config = CONFIG) {
  let current = state;
  let nextT = limits.nextT;
  let accepted = 0;
  let rejected = null;
  const earliest = limits.nowT - TIMING.MAX_BACKDATE_MS;
  const latest = limits.nowT + TIMING.FUTURE_TOLERANCE_MS;

  for (const move of moves) {
    const [a, b, t] = Array.isArray(move) ? move : [];
    let reason = null;
    if (!Number.isInteger(t) || t < 0) reason = "bad-time";
    else if (t < nextT) reason = "too-fast";
    else if (t < earliest) reason = "too-old";
    else if (t > latest) reason = "from-the-future";
    else if (limits.maxT !== undefined && t > limits.maxT) reason = "after-buzzer";
    if (reason) {
      rejected = { index: accepted, reason };
      break;
    }
    const result = applySwap(current, a, b, refillAt, config, t);
    if (!result.ok) {
      rejected = { index: accepted, reason: result.reason };
      break;
    }
    current = result.state;
    nextT = t + minGapAfter(result.chain);
    accepted += 1;
  }
  return { state: current, accepted, nextT, rejected };
}

/** The upcoming draws per column from the given cursors, one hex digit per draw. */
export function refillWindow(stream, cursors, size = WINDOW_SIZE) {
  return cursors.map((start, col) => {
    let text = "";
    for (let offset = 0; offset < size; offset += 1) text += stream.at(col, start + offset).toString(16);
    return text;
  });
}

/**
 * The browser's view of the refill stream: only the shapes it has been told.
 * Anything further ahead answers -1, which applySwap reports as need-refill.
 */
export function createKnownRefills(config = CONFIG) {
  const known = Array.from({ length: config.cols }, () => new Map());
  return {
    merge(cursors, windows) {
      windows.forEach((text, col) => {
        for (let offset = 0; offset < text.length; offset += 1) known[col].set(cursors[col] + offset, parseInt(text[offset], 16));
      });
    },
    at(col, index) {
      return known[col].get(index) ?? -1;
    },
    /** Forget what has been used, so a long run does not grow without limit. */
    trim(cursors) {
      known.forEach((map, col) => {
        for (const index of map.keys()) if (index < cursors[col]) map.delete(index);
      });
    },
    remaining(cursors) {
      return Math.min(...known.map((map, col) => {
        let count = 0;
        while (map.has(cursors[col] + count)) count += 1;
        return count;
      }));
    }
  };
}

export const columnOfCell = (cell, config = CONFIG) => colOf(cell, config.cols);
