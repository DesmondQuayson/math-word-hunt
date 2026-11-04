// Math Bingo Live cards and winning lines.
//
// A card is 25 cells in reading order (index = row * 5 + column). With Free
// Space on, the centre (index 12) is the Free Space and the other 24 cells
// are the room's answer pool in this player's own shuffled order; with it
// off, all 25 cells are pool values. Marks are a 25-bit mask (bit i = cell
// i), exactly as the database stores them, so the same line masks decide a
// Bingo here, in the tests and in SQL.

import { createRandom } from "./random.js";
import { allowedShapes } from "./fractions.js";

export const SIZE = 5;
export const CELL_COUNT = 25;
export const CENTER = 12;
export const HEADER = Object.freeze(["B", "I", "N", "G", "O"]);

function maskOf(cells) {
  return cells.reduce((mask, cell) => mask | (1 << cell), 0);
}

function line(id, type, label, cells) {
  return Object.freeze({ id, type, label, cells: Object.freeze(cells), mask: maskOf(cells) });
}

export const LINES = Object.freeze([
  ...[0, 1, 2, 3, 4].map(row => line(`row-${row + 1}`, "row", `Row ${row + 1}`, [0, 1, 2, 3, 4].map(column => row * SIZE + column))),
  ...[0, 1, 2, 3, 4].map(column => line(`column-${column + 1}`, "column", `Column ${column + 1}`, [0, 1, 2, 3, 4].map(row => row * SIZE + column))),
  line("diagonal-1", "diagonal", "Diagonal", [0, 6, 12, 18, 24]),
  line("diagonal-2", "diagonal", "Diagonal", [4, 8, 12, 16, 20])
]);

export const LINE_TYPE_OF_PATTERN = Object.freeze({ rows: "row", columns: "column", diagonals: "diagonal" });

export function enabledLines(patterns) {
  return LINES.filter(item => (item.type === "row" && patterns.rows) || (item.type === "column" && patterns.columns) || (item.type === "diagonal" && patterns.diagonals));
}

export function popcount(mask) {
  let value = mask >>> 0;
  let count = 0;
  while (value) {
    value &= value - 1;
    count += 1;
  }
  return count;
}

/** Completed enabled lines, in the fixed order rows, columns, diagonals. */
export function completedLines(mask, patterns) {
  return enabledLines(patterns).filter(item => (mask & item.mask) === item.mask);
}

/** The best enabled line: most marked cells; ties keep the fixed order. */
export function bestLine(mask, patterns) {
  let best = null;
  for (const item of enabledLines(patterns)) {
    const count = popcount(mask & item.mask);
    if (!best || count > best.count) best = { line: item, count };
  }
  return best ? Object.freeze({ id: best.line.id, type: best.line.type, count: best.count }) : null;
}

/**
 * Deal one player's card. Same pool for everyone; the order (and, in
 * Fraction Bingo, each model's shape) comes from the game seed plus the
 * player's id, so a reload deals exactly the same card again.
 */
export function dealCard({ pool, seed, participantId, freeSpace, fractions }) {
  const expected = freeSpace ? CELL_COUNT - 1 : CELL_COUNT;
  if (!Array.isArray(pool) || pool.length !== expected) throw new Error("Pool does not fit the card.");
  const random = createRandom(`${seed}:card:${participantId}`);
  const values = random.shuffle(pool).map(value => fractions
    ? Object.freeze({ n: value.n, d: value.d, shape: random.pick(allowedShapes(value.d)) })
    : Object.freeze({ n: value.n, d: value.d }));
  if (freeSpace) values.splice(CENTER, 0, Object.freeze({ free: true }));
  return Object.freeze(values);
}

/** The card's values (Free Space excluded), sorted: equal for every player. */
export function cardSignature(card) {
  return card.filter(cell => !cell.free).map(cell => `${cell.n}/${cell.d}`).sort().join(",");
}

export function isValidCard(card, freeSpace) {
  if (!Array.isArray(card) || card.length !== CELL_COUNT) return false;
  return card.every((cell, index) => {
    if (freeSpace && index === CENTER) return cell?.free === true;
    return cell && cell.free !== true && Number.isInteger(cell.n) && Number.isInteger(cell.d) && cell.d > 0 && cell.n >= 0;
  });
}
