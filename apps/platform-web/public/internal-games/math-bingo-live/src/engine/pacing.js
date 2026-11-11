// Math Bingo Live — winner pacing contract (shared by every mode).
//
// A game does not call a deck fixed at Start. The room holds a QUESTION
// UNIVERSE (every unique question of the mode and level, each with its
// canonical identity and its ANSWER CLASS), the cards are dealt against that
// universe, and the database chooses every call as it is made, from the
// cards' current marks (20261108100000 + 20261111100000):
//
//   * FIRST WIN GATE: drawn by the database once per game, from the secret
//     game seed: one of calls 14, 15, 16 or 17 (a level with fewer than 20
//     questions: the four calls ending three before its last question). Every
//     answer class is EARLY or LATE for the game; every enabled line of every
//     card holds at least one LATE cell, and the calls before the gate use
//     only EARLY questions, so no line can finish before it whatever the
//     students do (Free Space included).
//   * WINNER GAPS: after every NEW winner event the database draws a fresh
//     gap of 8, 9, 10 or 11 calls; the next new winner cannot come sooner.
//     While that gate is closed the scheduler calls only questions that
//     cannot complete any player's line.
//   * When a gate is open the scheduler prefers a question that gives ONE
//     player a real chance (more, only when many winners are still wanted
//     and the questions left would not otherwise allow them); it never
//     awards a Bingo by itself. Players who complete a line on the same call
//     share the placement.
//   * Nothing here limits how many winners a host may ask for (1-60).
//
// Modes contribute only their unique questions and their answer-class rule
// (questions.js); everything here is mode-independent, so a future mode
// inherits the same pacing. The draws themselves live in the database
// (private.bingo_first_gate, private.bingo_winner_gap) and never reach a
// browser.

import { createRandom } from "./random.js";
import { answerClass, questionGroups, fractionQuestion, poolCandidates } from "./questions.js";
import { FRACTION_DENOMINATORS } from "./questions.js";
import { allowedShapes, properFractions } from "./fractions.js";
import { CELL_COUNT, CENTER, LINES, enabledLines } from "./board.js";

export const PACING = Object.freeze({
  /** The first winner gate is one of these calls, drawn per game by the database. */
  firstGateCalls: Object.freeze([14, 15, 16, 17]),
  /** After every new winner event, the next one waits one of these gaps (drawn by the database). */
  winnerGapCalls: Object.freeze([8, 9, 10, 11]),
  /** Questions kept per answer class in the room's universe (a game calls far fewer). */
  questionsPerClass: 6,
  /** Share of answer classes held back until a gate opens. */
  lateShare: 0.3,
  /** Share of answer classes that are on no card: always-safe calls. */
  reserveShare: 0.08,
  /** Late cells per card (of 24 or 25). */
  lateCells: 8,
  /** Copies of one answer class on a card. */
  maxCopies: 3
});

/** The mixture of calls the scheduler aims for while a gate is closed. */
export const COVERAGE_TARGETS = Object.freeze({ zero: 0.1, single: 0.15, limited: 0.35, broad: 0.4 });

const valueOf = key => {
  const [n, d] = key.split("/").map(Number);
  return Object.freeze({ n, d });
};

/**
 * Every unique question of the mode and level, with its canonical identity
 * (`id`, e.g. "addition:5:7") and its answer class (`class`: "12/1", or the
 * written fraction, or the reduced fraction with Equivalent Fractions on).
 * At most `questionsPerClass` questions are kept per class (the universe is
 * stored with the room), so the size is the same with or without a seed;
 * with a seed, WHICH questions are kept and which written form each identity
 * takes (5 + 7 or 7 + 5) are seeded choices.
 */
export function buildUniverse(settings, seed = null) {
  const random = seed === null ? null : createRandom(`${seed}:universe`);
  const byClass = new Map();
  if (settings.mode === "fractions") {
    for (const value of properFractions(FRACTION_DENOMINATORS[settings.level])) {
      const question = fractionQuestion(value);
      const key = answerClass(settings, value);
      if (!byClass.has(key)) byClass.set(key, []);
      byClass.get(key).push(question);
    }
  } else {
    for (const candidate of poolCandidates(settings)) {
      const key = answerClass(settings, candidate.value);
      const groups = questionGroups(settings, candidate.value);
      byClass.set(key, groups.map(group => (random ? random.pick(group.forms) : group.forms[0])));
    }
  }
  const universe = [];
  for (const [key, questions] of byClass) {
    const list = random ? random.shuffle(questions) : questions.slice();
    for (const question of list.slice(0, PACING.questionsPerClass)) {
      universe.push(Object.freeze({ id: question.id, class: key, text: question.text, spoken: question.spoken, kind: question.kind, n: question.answer.n, d: question.answer.d }));
    }
  }
  universe.sort((a, b) => (a.class < b.class ? -1 : a.class > b.class ? 1 : a.id < b.id ? -1 : 1));
  return Object.freeze(universe);
}

/** Answer classes of a universe with how many questions each has. */
export function universeClasses(universe) {
  const classes = new Map();
  for (const question of universe) classes.set(question.class, (classes.get(question.class) ?? 0) + 1);
  return [...classes.entries()].map(([key, questions]) => Object.freeze({ key, value: valueOf(key), questions }));
}

/**
 * The calls the first winner gate can be drawn from for a universe of
 * `universeSize` questions: 14 to 17; a level with fewer than 20 questions
 * gets the four calls ending three calls before its last question (Fraction
 * Bingo halves to fifths: 4-7, to sixths: 9-12). Must match the database's
 * private.bingo_first_gate_bounds.
 */
export function firstGateWindow(universeSize) {
  if (universeSize >= 20) return Object.freeze([PACING.firstGateCalls[0], PACING.firstGateCalls[PACING.firstGateCalls.length - 1]]);
  const high = Math.max(1, universeSize - 3);
  return Object.freeze([Math.max(1, high - 3), high]);
}

/**
 * The game's pacing plan: which classes are LATE (held back until a gate
 * opens), which are the RESERVE (on no card), and the numbers. Seeded, so the
 * same seed gives the same plan.
 */
export function pacingPlan(settings, universe, seed) {
  const random = createRandom(`${seed}:pacing`);
  const classes = universeClasses(universe);
  const window = firstGateWindow(universe.length);
  const shuffled = random.shuffle(classes);
  let lateCount = Math.min(12, Math.max(2, Math.round(classes.length * PACING.lateShare)));
  lateCount = Math.min(lateCount, Math.max(1, classes.length - 3));
  // Enough EARLY questions for the calls before the latest first gate the database may draw.
  const late = [];
  const early = [];
  for (const item of shuffled) (late.length < lateCount ? late : early).push(item);
  while (late.length > 1 && early.reduce((sum, item) => sum + item.questions, 0) < window[1] - 1) early.push(late.pop());
  const reserveCount = classes.length >= 20 ? Math.max(1, Math.round(classes.length * PACING.reserveShare)) : 0;
  const reserve = [];
  for (const item of early) if (reserve.length < reserveCount && item.questions >= 2) reserve.push(item);
  const reserveKeys = new Set(reserve.map(item => item.key));
  return Object.freeze({
    firstGateWindow: window,
    scaled: window[0] < PACING.firstGateCalls[0],
    universe: universe.length,
    classes: classes.length,
    late: Object.freeze(late.map(item => item.key).sort()),
    reserve: Object.freeze(reserve.map(item => item.key).sort()),
    early: Object.freeze(early.filter(item => !reserveKeys.has(item.key)).map(item => item.key).sort())
  });
}

/** Answer class of a card cell under the game's rules (never the shape). */
export function cellClass(settings, cell) {
  return answerClass(settings, cell);
}

const LINES_THROUGH = Object.freeze(Array.from({ length: CELL_COUNT }, (_, cell) =>
  Object.freeze(LINES.map((item, index) => (item.cells.includes(cell) ? index : -1)).filter(index => index >= 0))));

/**
 * Choose the LATE cell positions of a card: every enabled line gets at least
 * one, and as few lines as possible get exactly one (those are the lines a
 * single late call can finish). Seeded search; returns the best layout found.
 */
function latePositions(random, { freeSpace, patterns, count }) {
  const cells = [];
  for (let index = 0; index < CELL_COUNT; index += 1) if (!(freeSpace && index === CENTER)) cells.push(index);
  const enabled = enabledLines(patterns).map(line => LINES.indexOf(line));
  let best = null;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const chosen = new Set(random.shuffle(cells).slice(0, count));
    let uncovered = 0;
    let single = 0;
    for (const line of enabled) {
      const hits = LINES[line].cells.filter(cell => chosen.has(cell)).length;
      if (hits === 0) uncovered += 1;
      else if (hits === 1) single += 1;
    }
    const score = uncovered * 100 + Math.abs(single - 1) * 3 + (single === 0 ? 20 : 0);
    if (!best || score < best.score) best = { score, chosen, uncovered, single };
    if (score === 0) break;
  }
  return best;
}

/** Can `count` late cells cover every enabled line at all? (5 cells cover rows+columns.) */
function layoutPossible(patterns, freeSpace, count) {
  void freeSpace;
  const lines = enabledLines(patterns);
  const rows = lines.some(line => line.type === "row");
  const columns = lines.some(line => line.type === "column");
  return count >= (rows && columns ? 5 : 1);
}

/**
 * Deal one player's card for a paced game. Seeded by the game seed and the
 * player id (a reload deals the same card). `usage` (class key → cards it is
 * already on) lets Start spread classes evenly across the class's cards.
 * Returns null only if no valid card exists for these classes.
 */
export function dealPacedBoard({ settings, classes, late, seed, participantId, usage = null }) {
  const random = createRandom(`${seed}:paced-card:${participantId}`);
  // A class may sit on a card more often than it has questions (a fraction
  // three times, one question) as long as no LINE repeats it more often than
  // its questions allow (placement below); a draw that cannot be placed is
  // simply drawn again from the same seeded stream.
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const board = dealOnce(random, { settings, classes, late, usage });
    if (board) return board;
  }
  return null;
}

function dealOnce(random, { settings, classes, late, usage }) {
  const freeSpace = settings.freeSpace;
  const fractions = settings.mode === "fractions";
  const cellCount = freeSpace ? CELL_COUNT - 1 : CELL_COUNT;
  const lateSet = new Set(late);
  const pool = classes.filter(item => item.questions > 0);
  const lateClasses = pool.filter(item => lateSet.has(item.key));
  const earlyClasses = pool.filter(item => !lateSet.has(item.key));
  if (!lateClasses.length || !earlyClasses.length) return null;
  const copiesOf = () => PACING.maxCopies;
  const lateCapacity = lateClasses.reduce((sum, item) => sum + copiesOf(item), 0);
  const earlyCapacity = earlyClasses.reduce((sum, item) => sum + copiesOf(item), 0);
  let lateCount = Math.min(PACING.lateCells, lateCapacity, cellCount - 1);
  if (cellCount - lateCount > earlyCapacity) lateCount = cellCount - earlyCapacity;
  if (lateCount < 1 || lateCount > lateCapacity) return null;
  if (!layoutPossible(settings.patterns, freeSpace, lateCount)) return null;

  // Spread classes across cards: the least-used classes first, seeded ties.
  const draw = (source, count) => {
    const picked = [];
    const used = new Map();
    const weight = item => (usage?.get(item.key) ?? 0) + (used.get(item.key) ?? 0) * 1.5 + random.next() * 0.9;
    while (picked.length < count) {
      const open = source.filter(item => (used.get(item.key) ?? 0) < copiesOf(item));
      if (!open.length) return null;
      const choice = open.map(item => ({ item, weight: weight(item) })).sort((a, b) => a.weight - b.weight)[0].item;
      used.set(choice.key, (used.get(choice.key) ?? 0) + 1);
      picked.push(choice);
    }
    return picked;
  };
  const lateDraw = draw(lateClasses, lateCount);
  const earlyDraw = draw(earlyClasses, cellCount - lateCount);
  if (!lateDraw || !earlyDraw) return null;

  const layout = latePositions(random, { freeSpace, patterns: settings.patterns, count: lateCount });
  if (!layout || layout.uncovered > 0) return null;
  const cells = new Array(CELL_COUNT).fill(null);
  if (freeSpace) cells[CENTER] = Object.freeze({ free: true });
  const placed = placeAll(random, cells, layout, lateDraw, earlyDraw, { freeSpace, fractions });
  return placed;
}

function placeAll(random, cells, layout, lateDraw, earlyDraw, { freeSpace, fractions }) {
  // Place classes so a line repeats a class only when that class has enough
  // different questions (one mark per question): depth-first with backtracking
  // over the late positions first, then the early ones; seeded order.
  const latePositionsList = random.shuffle([...layout.chosen]);
  const earlyPositionsList = random.shuffle(Array.from({ length: CELL_COUNT }, (_, index) => index).filter(index => !layout.chosen.has(index) && !(freeSpace && index === CENTER)));
  const positions = [...latePositionsList, ...earlyPositionsList];
  const groups = [...random.shuffle(lateDraw).map(item => ({ item, late: true })), ...random.shuffle(earlyDraw).map(item => ({ item, late: false }))];
  const lateCount = latePositionsList.length;
  const inLine = (position, key) => {
    let count = 0;
    for (const line of LINES_THROUGH[position]) {
      for (const cell of LINES[line].cells) if (cells[cell] && !cells[cell].free && cells[cell].key === key) count += 1;
    }
    return count;
  };
  let steps = 0;
  const used = new Set();
  const place = index => {
    if (index === positions.length) return true;
    if ((steps += 1) > 40000) return false;
    const position = positions[index];
    const wantLate = index < lateCount;
    const tried = new Set();
    for (let candidate = 0; candidate < groups.length; candidate += 1) {
      const group = groups[candidate];
      if (used.has(candidate) || group.late !== wantLate || tried.has(group.item.key)) continue;
      tried.add(group.item.key);
      // Lines through this cell count copies of the class across their 2–3 shared cells.
      let allowed = true;
      for (const line of LINES_THROUGH[position]) {
        let count = 1;
        for (const cell of LINES[line].cells) if (cells[cell] && !cells[cell].free && cells[cell].key === group.item.key) count += 1;
        if (count > group.item.questions) { allowed = false; break; }
      }
      if (!allowed) continue;
      used.add(candidate);
      cells[position] = { key: group.item.key, value: group.item.value };
      if (place(index + 1)) return true;
      used.delete(candidate);
      cells[position] = null;
    }
    return false;
  };
  void inLine;
  if (!place(0)) return null;
  return cells.map(cell => {
    if (cell.free) return cell;
    const value = cell.value;
    if (fractions) return Object.freeze({ n: value.n, d: value.d, shape: random.pick(allowedShapes(value.d)) });
    return Object.freeze({ n: value.n, d: value.d });
  });
}

/**
 * Is this card valid for a paced game? Twenty-five cells, the Free Space
 * where the settings say, every value callable, every enabled line with at
 * least one late cell, and no line repeating a class more often than that
 * class has questions.
 */
export function isValidPacedBoard(board, { settings, late, classes }) {
  if (!Array.isArray(board) || board.length !== CELL_COUNT) return false;
  const questionsOf = new Map(classes.map(item => [item.key, item.questions]));
  const lateSet = new Set(late);
  const classOf = index => {
    const cell = board[index];
    if (!cell || cell.free) return null;
    return cellClass(settings, cell);
  };
  for (let index = 0; index < CELL_COUNT; index += 1) {
    const cell = board[index];
    if (settings.freeSpace && index === CENTER) {
      if (cell?.free !== true) return false;
      continue;
    }
    if (!cell || cell.free === true || !Number.isInteger(cell.n) || !Number.isInteger(cell.d) || cell.d < 1 || cell.n < 0) return false;
    if (!questionsOf.has(classOf(index))) return false;
  }
  for (const line of enabledLines(settings.patterns)) {
    const counts = new Map();
    let lateCells = 0;
    for (const cell of line.cells) {
      const key = classOf(cell);
      if (key === null) continue;
      if (lateSet.has(key)) lateCells += 1;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    if (lateCells === 0) return false;
    for (const [key, count] of counts) if (count > (questionsOf.get(key) ?? 0)) return false;
  }
  return true;
}

/**
 * The classes a late joiner's card may use: the universe classes that still
 * have an unasked question, as the room reports them ({ c, n }).
 */
export function classesFromCallable(callable) {
  return callable
    .filter(item => item && typeof item.c === "string" && Number.isInteger(item.n) && item.n > 0 && /^\d+\/\d+$/.test(item.c))
    .map(item => Object.freeze({ key: item.c, value: valueOf(item.c), questions: item.n }));
}
