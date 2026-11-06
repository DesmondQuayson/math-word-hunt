// Math Bingo Live question generator.
//
// A game is built in two steps from one seed:
//   1. the ANSWER POOL: the 24 (or 25 without Free Space) values every card
//      in the room is dealt from, the same multiset for every player;
//   2. the DECK: for every pool value instance, one question whose answer is
//      that value, over up to DECK_PASSES shuffled passes so a player who
//      misses a question gets later chances at the same cell.
// Every fact is generated from whole-number operands, so subtraction is
// never negative, division is always exact and never by zero, and there is
// no order-of-operations ambiguity (one operation per question).
//
// No question is ever asked twice in one game. Every question has a
// canonical identity (questionId): "addition:5:7" for both 5 + 7 and 7 + 5
// (and likewise multiplication), "subtraction:14:6", "division:36:6",
// "fraction:2:3". The deck uses each identity at most once; when a value has
// no unused question left, later passes simply skip it, and a game whose deck
// runs out ends as it always has ("every question was called"). Different
// questions may share an answer (7 + 5 and 8 + 4 are both 12): that is what
// makes a second 12 on a card useful.

import { createRandom } from "./random.js";
import { DECK_PASSES, getLevel, getMode } from "./settings.js";
import { equalValue, equivalentsOf, fractionSpoken, fractionText, properFractions, sameFraction } from "./fractions.js";

export const MINUS = "−";
export const TIMES = "×";
export const DIVIDE = "÷";

const SPOKEN = Object.freeze({ "+": "plus", "-": "minus", "*": "times", "/": "divided by" });
const SYMBOL = Object.freeze({ "+": "+", "-": MINUS, "*": TIMES, "/": DIVIDE });
const MAX_COPIES = 3;
const OPERATION_NAMES = Object.freeze({ "+": "addition", "-": "subtraction", "*": "multiplication", "/": "division" });
const COMMUTATIVE = new Set(["+", "*"]);

/**
 * The canonical identity of a question. Addition and multiplication ignore
 * operand order (5 + 7 is 7 + 5); subtraction and division keep it; a
 * fraction question is its exact written fraction (2/4 is not 1/2).
 */
export function questionId(op, a, b) {
  if (op === "fraction") return `fraction:${a}:${b}`;
  const name = OPERATION_NAMES[op];
  if (!name) throw new Error(`Unknown operation ${op}.`);
  if (COMMUTATIVE.has(op) && a > b) return `${name}:${b}:${a}`;
  return `${name}:${a}:${b}`;
}

function fact(op, a, b, answer) {
  return Object.freeze({
    id: questionId(op, a, b),
    key: `${op}:${a}:${b}`,
    kind: "arithmetic",
    op,
    operands: Object.freeze([a, b]),
    text: `${a} ${SYMBOL[op]} ${b}`,
    spoken: `${a} ${SPOKEN[op]} ${b}`,
    answer: Object.freeze({ n: answer, d: 1 })
  });
}

function addFacts({ addendMin, addendMax, sumMin, sumMax }) {
  const list = [];
  for (let a = addendMin; a <= addendMax; a += 1) {
    for (let b = addendMin; b <= addendMax; b += 1) {
      const sum = a + b;
      if (sum >= sumMin && sum <= sumMax && !(a === 0 && b === 0)) list.push(fact("+", a, b, sum));
    }
  }
  return list;
}

function subtractFacts({ minuendMin, minuendMax, subtrahendMin, subtrahendMax, differenceMin }) {
  const list = [];
  for (let a = minuendMin; a <= minuendMax; a += 1) {
    for (let b = subtrahendMin; b <= Math.min(subtrahendMax, a); b += 1) {
      const difference = a - b;
      if (difference >= differenceMin) list.push(fact("-", a, b, difference));
    }
  }
  return list;
}

function multiplyFacts({ aMin, aMax, bMin, bMax }) {
  const list = [];
  for (let a = aMin; a <= aMax; a += 1) for (let b = bMin; b <= bMax; b += 1) list.push(fact("*", a, b, a * b));
  return list;
}

function divideFacts({ divisorMin, divisorMax, quotientMin, quotientMax }) {
  const list = [];
  for (let divisor = Math.max(1, divisorMin); divisor <= divisorMax; divisor += 1) {
    for (let quotient = quotientMin; quotient <= quotientMax; quotient += 1) list.push(fact("/", divisor * quotient, divisor, quotient));
  }
  return list;
}

const ADDITION = Object.freeze({
  "facts-10": { addendMin: 0, addendMax: 10, sumMin: 1, sumMax: 10 },
  "facts-20": { addendMin: 1, addendMax: 10, sumMin: 5, sumMax: 20 },
  "within-50": { addendMin: 2, addendMax: 48, sumMin: 10, sumMax: 50 },
  "within-100": { addendMin: 5, addendMax: 95, sumMin: 20, sumMax: 100 }
});

const SUBTRACTION = Object.freeze({
  "facts-10": { minuendMin: 1, minuendMax: 10, subtrahendMin: 1, subtrahendMax: 10, differenceMin: 0 },
  "facts-20": { minuendMin: 2, minuendMax: 20, subtrahendMin: 1, subtrahendMax: 10, differenceMin: 1 },
  "within-50": { minuendMin: 10, minuendMax: 50, subtrahendMin: 2, subtrahendMax: 49, differenceMin: 1 },
  "within-100": { minuendMin: 20, minuendMax: 100, subtrahendMin: 5, subtrahendMax: 99, differenceMin: 1 }
});

const MULTIPLICATION = Object.freeze({
  "x0-5": { aMin: 0, aMax: 5, bMin: 0, bMax: 10 },
  "x0-10": { aMin: 0, aMax: 10, bMin: 0, bMax: 10 },
  "x0-12": { aMin: 0, aMax: 12, bMin: 0, bMax: 12 },
  "mixed-facts": { aMin: 2, aMax: 12, bMin: 2, bMax: 12 }
});

const DIVISION = Object.freeze({
  "facts-5": { divisorMin: 2, divisorMax: 5, quotientMin: 1, quotientMax: 10 },
  "facts-10": { divisorMin: 2, divisorMax: 10, quotientMin: 1, quotientMax: 10 },
  "facts-12": { divisorMin: 2, divisorMax: 12, quotientMin: 1, quotientMax: 12 }
});

/** Mixed Operations: one operation per question, answers capped per level. */
const MIXED = Object.freeze({
  starter: Object.freeze({
    maxAnswer: 10,
    families: () => [
      addFacts(ADDITION["facts-10"]),
      subtractFacts({ ...SUBTRACTION["facts-10"], differenceMin: 1 }),
      multiplyFacts({ aMin: 1, aMax: 5, bMin: 1, bMax: 5 }),
      divideFacts({ divisorMin: 2, divisorMax: 5, quotientMin: 1, quotientMax: 5 })
    ]
  }),
  core: Object.freeze({
    maxAnswer: 30,
    families: () => [
      addFacts(ADDITION["facts-20"]),
      subtractFacts(SUBTRACTION["facts-20"]),
      multiplyFacts({ aMin: 1, aMax: 10, bMin: 1, bMax: 10 }),
      divideFacts(DIVISION["facts-10"])
    ]
  }),
  challenge: Object.freeze({
    maxAnswer: 100,
    families: () => [
      addFacts(ADDITION["within-100"]),
      subtractFacts(SUBTRACTION["within-100"]),
      multiplyFacts(MULTIPLICATION["mixed-facts"]),
      divideFacts(DIVISION["facts-12"])
    ]
  })
});

export const FRACTION_DENOMINATORS = Object.freeze({
  "to-fifths": Object.freeze([2, 3, 4, 5]),
  "to-sixths": Object.freeze([2, 3, 4, 5, 6]),
  "to-eighths": Object.freeze([2, 3, 4, 5, 6, 8])
});

const factCache = new Map();

/** Every arithmetic fact a mode/level may ask (cached; facts are immutable). */
export function factsFor(modeId, levelId) {
  const cacheKey = `${modeId}:${levelId}`;
  if (factCache.has(cacheKey)) return factCache.get(cacheKey);
  if (!getLevel(modeId, levelId) || modeId === "fractions") throw new Error(`No arithmetic facts for ${cacheKey}.`);
  let list;
  if (modeId === "addition") list = addFacts(ADDITION[levelId]);
  else if (modeId === "subtraction") list = subtractFacts(SUBTRACTION[levelId]);
  else if (modeId === "multiplication") list = multiplyFacts(MULTIPLICATION[levelId]);
  else if (modeId === "division") list = divideFacts(DIVISION[levelId]);
  else {
    const level = MIXED[levelId];
    list = level.families().flat().filter(item => item.answer.n >= 1 && item.answer.n <= level.maxAnswer);
  }
  const frozen = Object.freeze(list);
  factCache.set(cacheKey, frozen);
  return frozen;
}

export function fractionQuestion(value) {
  return Object.freeze({
    id: questionId("fraction", value.n, value.d),
    key: `fraction:${value.n}/${value.d}`,
    kind: "fraction",
    op: "fraction",
    operands: Object.freeze([value.n, value.d]),
    text: fractionText(value),
    spoken: fractionSpoken(value),
    answer: Object.freeze({ n: value.n, d: value.d })
  });
}

const valueKey = value => `${value.n}/${value.d}`;

/** Does a card value satisfy a question's answer under the game's rules? */
export function answerMatches(settings, answer, cellValue) {
  if (!cellValue || !Number.isInteger(cellValue.n) || !Number.isInteger(cellValue.d)) return false;
  if (settings.mode === "fractions") return settings.equivalentFractions ? equalValue(answer, cellValue) : sameFraction(answer, cellValue);
  return cellValue.d === 1 && answer.d === 1 && cellValue.n === answer.n;
}

/** Candidate questions for one pool value (every written form). */
function questionsForValue(settings, value) {
  if (settings.mode === "fractions") {
    const forms = settings.equivalentFractions ? equivalentsOf(value, FRACTION_DENOMINATORS[settings.level]) : [value];
    return forms.map(fractionQuestion);
  }
  return factsFor(settings.mode, settings.level).filter(item => item.answer.n === value.n);
}

/**
 * The distinct questions (by canonical identity) that answer a value, each
 * with the written forms it may be shown in (7 + 5 or 5 + 7), in a fixed order.
 */
export function questionGroups(settings, value) {
  const groups = new Map();
  for (const question of questionsForValue(settings, value)) {
    if (!groups.has(question.id)) groups.set(question.id, []);
    groups.get(question.id).push(question);
  }
  return [...groups.entries()].map(([id, forms]) => Object.freeze({ id, forms: Object.freeze(forms) }));
}

/** How many different questions can ever call this value in one game. */
export function uniqueQuestionCount(settings, value) {
  return questionGroups(settings, value).length;
}

export function poolSize(settings) {
  return settings.freeSpace ? 24 : 25;
}

/** Values a level may put on a card, each with how many copies it may have. */
export function poolCandidates(settings) {
  if (settings.mode === "fractions") {
    return properFractions(FRACTION_DENOMINATORS[settings.level]).map(value => ({ value, maxCopies: MAX_COPIES }));
  }
  // Copies of a value are capped by its DISTINCT questions (5 + 7 and 7 + 5
  // count once), so every copy on a card can be called by its own question.
  const byValue = new Map();
  for (const item of factsFor(settings.mode, settings.level)) {
    const key = item.answer.n;
    if (!byValue.has(key)) byValue.set(key, new Set());
    byValue.get(key).add(item.id);
  }
  return [...byValue.entries()]
    .sort((a, b) => a[0] - b[0])
    // Zero is allowed once at most: "times zero" facts are all alike.
    .map(([n, ids]) => ({ value: Object.freeze({ n, d: 1 }), maxCopies: n === 0 ? 1 : Math.min(MAX_COPIES, ids.size) }));
}

/**
 * The room's shared answer multiset. As many different values as the level
 * offers, plus a few deliberate repeats (an 18 twice) so choosing WHICH
 * matching cell to mark is a real strategic decision.
 */
export function buildAnswerPool(settings, seed) {
  const random = createRandom(`${seed}:pool`);
  const size = poolSize(settings);
  const candidates = random.shuffle(poolCandidates(settings));
  const capacity = candidates.reduce((total, item) => total + item.maxCopies, 0);
  if (capacity < size) throw new Error(`Level ${settings.mode}/${settings.level} cannot fill a card.`);
  const repeats = candidates.length >= size ? random.int(2, 4) : size - candidates.length;
  const distinct = Math.min(candidates.length, size - repeats);
  const chosen = candidates.slice(0, distinct).map(item => ({ ...item, copies: 1 }));
  let remaining = size - distinct;
  while (remaining > 0) {
    const open = chosen.filter(item => item.copies < item.maxCopies);
    if (open.length === 0) {
      // Only reachable for very small levels: widen with the next candidate.
      const next = candidates[chosen.length];
      if (!next) throw new Error("Answer pool exhausted.");
      chosen.push({ ...next, copies: 1 });
    } else {
      random.pick(open).copies += 1;
    }
    remaining -= 1;
  }
  const pool = [];
  for (const item of chosen) for (let copy = 0; copy < item.copies; copy += 1) pool.push(Object.freeze({ n: item.value.n, d: item.value.d }));
  pool.sort((a, b) => a.n * b.d - b.n * a.d || a.d - b.d);
  return Object.freeze(pool);
}

/** Values that answer the same questions: equal value in equivalent mode. */
export function answerClass(settings, value) {
  if (settings.mode === "fractions" && settings.equivalentFractions) {
    const divisor = gcdOf(value.n, value.d);
    return `${value.n / divisor}/${value.d / divisor}`;
  }
  return valueKey(value);
}

function gcdOf(a, b) {
  return b === 0 ? a : gcdOf(b, a % b);
}

/**
 * One pass: every pool instance once, in a random order in which the same
 * answer never comes twice in a row (also across the join with the previous
 * pass). Greedy with a feasibility guard: whenever one answer would otherwise
 * run out of room to be spread out, it is placed now.
 */
function arrangePass(settings, pool, random, previousClass) {
  const groups = new Map();
  for (const value of random.shuffle(pool)) {
    const key = answerClass(settings, value);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(value);
  }
  const order = [];
  let previous = previousClass;
  let remaining = pool.length;
  while (remaining > 0) {
    const open = [...groups.entries()].filter(([key, values]) => values.length > 0 && key !== previous);
    const pickFrom = open.length > 0 ? open : [...groups.entries()].filter(([, values]) => values.length > 0);
    const largest = Math.max(...pickFrom.map(([, values]) => values.length));
    const urgent = pickFrom.filter(([, values]) => values.length === largest && values.length * 2 >= remaining);
    const [key, values] = urgent.length > 0 ? random.pick(urgent) : random.pick(pickFrom);
    order.push(values.pop());
    previous = key;
    remaining -= 1;
  }
  return order;
}

/**
 * The question deck: up to DECK_PASSES passes over the pool. Pass 1 calls
 * every pool instance once (two 18s get two different questions), so a
 * perfect player can fill the whole card in one pass and a winner is always
 * reachable; later passes give second chances with questions not asked yet.
 * Every question identity appears at most once in the deck: a value whose
 * questions are used up is not called again, and the deck is simply shorter.
 * The same answer is never asked twice in a row while another answer can go
 * between.
 */
export function buildDeck(settings, pool, seed) {
  const random = createRandom(`${seed}:deck`);
  const instances = new Map();
  const unused = new Map();
  for (const value of pool) {
    const key = answerClass(settings, value);
    if (!instances.has(key)) {
      const groups = questionGroups(settings, value);
      if (groups.length === 0) throw new Error(`No question can produce ${valueKey(value)}.`);
      instances.set(key, []);
      unused.set(key, random.shuffle(groups));
    }
    instances.get(key).push(value);
  }
  const deck = [];
  const asked = new Set();
  let previousClass = null;
  for (let pass = 0; pass < DECK_PASSES; pass += 1) {
    // This pass: one call per pool instance whose answer still has an unused question.
    const callable = [];
    for (const [key, values] of instances) callable.push(...values.slice(0, Math.min(values.length, unused.get(key).length)));
    if (callable.length === 0) break;
    for (const value of arrangePass(settings, callable, random, previousClass)) {
      const key = answerClass(settings, value);
      const group = unused.get(key).pop();
      const form = random.pick(group.forms);
      if (asked.has(group.id)) throw new Error(`Question ${group.id} would repeat.`);
      asked.add(group.id);
      deck.push(form);
      previousClass = key;
    }
  }
  return Object.freeze(deck.map((question, index) => Object.freeze({ ...question, number: index + 1 })));
}

/**
 * Card dealing rules for a game. In Fraction Bingo a fraction can be called
 * only as often as it has different questions (once, unless Equivalent
 * Fractions is on), so a card never puts more copies of one value in a line
 * than can ever be called: every line stays completable.
 */
export function dealRules(settings) {
  if (settings.mode !== "fractions") return Object.freeze({ fractions: false, freeSpace: settings.freeSpace });
  const limits = new Map();
  return Object.freeze({
    fractions: true,
    freeSpace: settings.freeSpace,
    classOf: value => answerClass(settings, value),
    lineLimit: value => {
      const key = answerClass(settings, value);
      if (!limits.has(key)) limits.set(key, uniqueQuestionCount(settings, value));
      return limits.get(key);
    }
  });
}

/** "9 + 9 = 18" for arithmetic; the fraction itself for Fraction Bingo. */
export function revealText(question) {
  if (question.kind === "fraction") return question.text;
  return `${question.text} = ${question.answer.n}`;
}

export function modeLabel(settings) {
  const mode = getMode(settings.mode);
  const level = getLevel(settings.mode, settings.level);
  return mode && level ? `${mode.label} · ${level.label}` : "";
}
