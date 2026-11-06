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

const LINES_THROUGH = Object.freeze(Array.from({ length: CELL_COUNT }, (_, cell) =>
  Object.freeze(LINES.map((item, index) => (item.cells.includes(cell) ? index : -1)).filter(index => index >= 0))));

/**
 * Place the values so that no line (any row, column or diagonal) holds more
 * copies of one answer class than `lineLimit` allows. Randomized depth-first
 * search from the card's own seed, so the result is deterministic. Returns
 * null only if no such card exists (the caller then keeps a plain shuffle).
 */
function arrangeByLines(values, random, { freeSpace, classOf, lineLimit }) {
  const cells = [];
  for (let cell = 0; cell < CELL_COUNT; cell += 1) if (!(freeSpace && cell === CENTER)) cells.push(cell);
  const groups = new Map();
  for (const value of random.shuffle(values)) {
    const key = classOf(value);
    if (!groups.has(key)) groups.set(key, { limit: lineLimit(value), values: [] });
    groups.get(key).values.push(value);
  }
  const counts = LINES.map(() => new Map());
  const placed = new Array(CELL_COUNT).fill(null);
  let steps = 0;
  const place = index => {
    if (index === cells.length) return true;
    if ((steps += 1) > 50_000) return false;
    const cell = cells[index];
    // Answers with the most copies left are the hardest to place: try them first.
    const options = random.shuffle([...groups.keys()].filter(key => groups.get(key).values.length > 0))
      .sort((a, b) => groups.get(b).values.length - groups.get(a).values.length);
    for (const key of options) {
      const group = groups.get(key);
      if (LINES_THROUGH[cell].some(line => (counts[line].get(key) ?? 0) >= group.limit)) continue;
      const value = group.values.pop();
      placed[cell] = value;
      for (const line of LINES_THROUGH[cell]) counts[line].set(key, (counts[line].get(key) ?? 0) + 1);
      if (place(index + 1)) return true;
      for (const line of LINES_THROUGH[cell]) counts[line].set(key, counts[line].get(key) - 1);
      placed[cell] = null;
      group.values.push(value);
    }
    return false;
  };
  if (!place(0)) return null;
  return cells.map(cell => placed[cell]);
}

/**
 * Deal one player's card. Same pool for everyone; the order (and, in
 * Fraction Bingo, each model's shape) comes from the game seed plus the
 * player's id, so a reload deals exactly the same card again. With
 * `classOf` and `lineLimit` (Fraction Bingo, see dealRules in questions.js),
 * no line holds more copies of a fraction than can ever be called.
 */
export function dealCard({ pool, seed, participantId, freeSpace, fractions, classOf = null, lineLimit = null }) {
  const expected = freeSpace ? CELL_COUNT - 1 : CELL_COUNT;
  if (!Array.isArray(pool) || pool.length !== expected) throw new Error("Pool does not fit the card.");
  const random = createRandom(`${seed}:card:${participantId}`);
  const order = (classOf && lineLimit && arrangeByLines(pool, random, { freeSpace, classOf, lineLimit })) || random.shuffle(pool);
  const values = order.map(value => fractions
    ? Object.freeze({ n: value.n, d: value.d, shape: random.pick(allowedShapes(value.d)) })
    : Object.freeze({ n: value.n, d: value.d }));
  if (freeSpace) values.splice(CENTER, 0, Object.freeze({ free: true }));
  return Object.freeze(values);
}

/** The most copies of one answer class in any single line of a card. */
export function maxCopiesInLine(card, classOf) {
  let most = 0;
  for (const item of LINES) {
    const seen = new Map();
    for (const cell of item.cells) {
      if (card[cell]?.free) continue;
      const key = classOf(card[cell]);
      seen.set(key, (seen.get(key) ?? 0) + 1);
      most = Math.max(most, seen.get(key));
    }
  }
  return most;
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
