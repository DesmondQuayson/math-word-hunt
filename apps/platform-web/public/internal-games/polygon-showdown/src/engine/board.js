// Polygon Showdown board rules: pure functions over a flat array of shape
// indexes (row by row, top left first). No DOM, no clock, no Math.random: the
// same inputs always give the same outputs, in the browser and on the server.

import { createRandom } from "../../../math-bingo-live/src/engine/random.js";

export const EMPTY = -1;
export const MIN_MATCH = 3;

export const cellOf = (row, col, cols) => row * cols + col;
export const rowOf = (cell, cols) => Math.floor(cell / cols);
export const colOf = (cell, cols) => cell % cols;

export function areAdjacent(a, b, cols) {
  const dr = Math.abs(rowOf(a, cols) - rowOf(b, cols));
  const dc = Math.abs(colOf(a, cols) - colOf(b, cols));
  return dr + dc === 1;
}

/** Runs of MIN_MATCH or more identical shapes, in both directions. */
function findRuns(board, cols, rows) {
  const runs = [];
  for (let row = 0; row < rows; row += 1) {
    let col = 0;
    while (col < cols) {
      const kind = board[cellOf(row, col, cols)];
      let length = 1;
      while (col + length < cols && board[cellOf(row, col + length, cols)] === kind) length += 1;
      if (kind !== EMPTY && length >= MIN_MATCH) {
        runs.push({ kind, axis: "h", cells: Array.from({ length }, (_, offset) => cellOf(row, col + offset, cols)) });
      }
      col += length;
    }
  }
  for (let col = 0; col < cols; col += 1) {
    let row = 0;
    while (row < rows) {
      const kind = board[cellOf(row, col, cols)];
      let length = 1;
      while (row + length < rows && board[cellOf(row + length, col, cols)] === kind) length += 1;
      if (kind !== EMPTY && length >= MIN_MATCH) {
        runs.push({ kind, axis: "v", cells: Array.from({ length }, (_, offset) => cellOf(row + offset, col, cols)) });
      }
      row += length;
    }
  }
  return runs;
}

/**
 * Every match on the board. Runs that share a cell (an L, T or + shape) are one
 * match; two separate lines side by side are two matches. Ordered by first
 * cell, so the result never depends on how it was found.
 */
export function findMatches(board, cols, rows) {
  const runs = findRuns(board, cols, rows);
  if (runs.length === 0) return [];
  const parent = runs.map((_, index) => index);
  const find = (index) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    while (parent[index] !== root) [parent[index], index] = [root, parent[index]];
    return root;
  };
  const owner = new Map();
  runs.forEach((run, index) => {
    for (const cell of run.cells) {
      if (owner.has(cell)) parent[find(index)] = find(owner.get(cell));
      else owner.set(cell, index);
    }
  });
  const merged = new Map();
  runs.forEach((run, index) => {
    const root = find(index);
    const group = merged.get(root) ?? { kind: run.kind, cellSet: new Set(), horizontal: false, vertical: false };
    run.cells.forEach((cell) => group.cellSet.add(cell));
    if (run.axis === "h") group.horizontal = true;
    else group.vertical = true;
    merged.set(root, group);
  });
  return [...merged.values()]
    .map((group) => {
      const cells = [...group.cellSet].sort((a, b) => a - b);
      return { kind: group.kind, cells, size: cells.length, horizontal: group.horizontal, vertical: group.vertical };
    })
    .sort((a, b) => a.cells[0] - b.cells[0]);
}

/** Would placing `kind` at this cell complete a line of three through it? */
function completesLine(board, cell, kind, cols, rows) {
  const row = rowOf(cell, cols);
  const col = colOf(cell, cols);
  const same = (r, c) => r >= 0 && r < rows && c >= 0 && c < cols && board[cellOf(r, c, cols)] === kind;
  let across = 1;
  for (let c = col - 1; same(row, c); c -= 1) across += 1;
  for (let c = col + 1; same(row, c); c += 1) across += 1;
  if (across >= MIN_MATCH) return true;
  let down = 1;
  for (let r = row - 1; same(r, col); r -= 1) down += 1;
  for (let r = row + 1; same(r, col); r += 1) down += 1;
  return down >= MIN_MATCH;
}

/**
 * The shape that actually enters a cell. With only four shapes, refills that
 * land in a ready-made line would cascade endlessly, so an entering shape that
 * would complete a line steps on to the next shape in the registry order. Real
 * cascades still happen when falling shapes line up. Deterministic: it depends
 * only on the board and the drawn shape.
 */
export function settleKind(board, cell, drawn, kinds, cols, rows) {
  const start = kinds.indexOf(drawn);
  for (let offset = 0; offset < kinds.length; offset += 1) {
    const candidate = kinds[(start + offset) % kinds.length];
    if (!completesLine(board, cell, candidate, cols, rows)) return candidate;
  }
  return drawn;
}

/** Does swapping these two neighbours make a match? (The board is unchanged afterwards.) */
export function swapMakesMatch(board, a, b, cols, rows) {
  const first = board[a];
  const second = board[b];
  if (first === second || first === EMPTY || second === EMPTY) return false;
  board[a] = second;
  board[b] = first;
  const made = completesLine(board, a, second, cols, rows) || completesLine(board, b, first, cols, rows);
  board[a] = first;
  board[b] = second;
  return made;
}

/** The first legal swap reading the board top left to bottom right, or null. */
export function findLegalMove(board, cols, rows) {
  for (let cell = 0; cell < board.length; cell += 1) {
    if (colOf(cell, cols) + 1 < cols && swapMakesMatch(board, cell, cell + 1, cols, rows)) return [cell, cell + 1];
    if (rowOf(cell, cols) + 1 < rows && swapMakesMatch(board, cell, cell + cols, cols, rows)) return [cell, cell + cols];
  }
  return null;
}

export function allLegalMoves(board, cols, rows) {
  const moves = [];
  for (let cell = 0; cell < board.length; cell += 1) {
    if (colOf(cell, cols) + 1 < cols && swapMakesMatch(board, cell, cell + 1, cols, rows)) moves.push([cell, cell + 1]);
    if (rowOf(cell, cols) + 1 < rows && swapMakesMatch(board, cell, cell + cols, cols, rows)) moves.push([cell, cell + cols]);
  }
  return moves;
}

/** Empties the given cells, lets everything above fall, reports each move. */
export function collapse(board, cols, rows) {
  const falls = [];
  const emptyAbove = new Array(cols).fill(0);
  for (let col = 0; col < cols; col += 1) {
    let write = rows - 1;
    for (let row = rows - 1; row >= 0; row -= 1) {
      const from = cellOf(row, col, cols);
      if (board[from] === EMPTY) continue;
      if (row !== write) {
        const to = cellOf(write, col, cols);
        board[to] = board[from];
        board[from] = EMPTY;
        falls.push({ from, to });
      }
      write -= 1;
    }
    emptyAbove[col] = write + 1;
  }
  return { falls, emptyAbove };
}

function dealBoard(random, kinds, cols, rows) {
  const board = new Array(cols * rows).fill(EMPTY);
  for (let cell = 0; cell < board.length; cell += 1) {
    const allowed = kinds.filter((kind) => !completesLine(board, cell, kind, cols, rows));
    board[cell] = allowed[random.int(0, allowed.length - 1)];
  }
  return board;
}

/**
 * A board with no ready-made match and at least one legal swap. With `target`
 * ({ min, max, attempts }) it deals a few and keeps one in the range, so a new
 * board is playable without being solved for the player.
 */
export function generateBoard(random, kinds, cols, rows, target = null) {
  let best = null;
  let bestDistance = Infinity;
  const limit = target ? target.attempts : 200;
  for (let attempt = 0; attempt < limit || !best; attempt += 1) {
    if (attempt > 2000) throw new Error("Polygon Showdown could not generate a playable board.");
    const board = dealBoard(random, kinds, cols, rows);
    const count = allLegalMoves(board, cols, rows).length;
    if (count === 0) continue;
    if (!target) return board;
    const distance = count < target.min ? target.min - count : count > target.max ? count - target.max : 0;
    if (distance === 0) return board;
    if (distance < bestDistance) {
      best = board;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The next board when no swap is left: the same shapes rearranged, free of
 * charge, derived only from the board and how many reshuffles came before.
 * (It uses no secret, so the browser can show it without being told.)
 */
export function reshuffleBoard(board, count, kinds, cols, rows) {
  const random = createRandom(`polygon-showdown:reshuffle:${board.join("")}:${count}`);
  for (let attempt = 0; attempt < 400; attempt += 1) {
    const candidate = random.shuffle(board);
    if (findMatches(candidate, cols, rows).length === 0 && findLegalMove(candidate, cols, rows)) return candidate;
  }
  return generateBoard(random, kinds, cols, rows);
}
