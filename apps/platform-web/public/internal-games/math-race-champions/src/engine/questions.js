// Question engine for Math Race Champions. Pure: no DOM, no timers, no storage.
//
// Exactly seven categories:
//   missing-addend       14 + ? = 23
//   missing-subtrahend   25 − ? = 17
//   missing-multiplier   7 × ? = 42
//   missing-divisor      48 ÷ ? = 8
//   percent-to-decimal   35% = ?
//   decimal-to-percent   0.72 = ?
//   powers               6² = ?      (exponents 0, 1, 2 and 3 only)
//
// Every question has exactly two choices, exactly one of them correct. All
// arithmetic is done on integers: a decimal is an integer mantissa with a
// decimal exponent, so 0.1 + 0.2 style floating-point slips cannot happen.

import { createRandom, hashSeed } from "./random.js";

export const MINUS = String.fromCharCode(0x2212);
export const TIMES = String.fromCharCode(0xd7);
export const DIVIDE = String.fromCharCode(0xf7);
export const SUPERSCRIPTS = Object.freeze(["⁰", "¹", "²", "³"]);

export const CATEGORIES = Object.freeze([
  Object.freeze({ id: "missing-addend", title: "Missing Addend", example: "14 + ? = 23" }),
  Object.freeze({ id: "missing-subtrahend", title: "Missing Subtrahend", example: `25 ${MINUS} ? = 17` }),
  Object.freeze({ id: "missing-multiplier", title: "Missing Multiplier", example: `7 ${TIMES} ? = 42` }),
  Object.freeze({ id: "missing-divisor", title: "Missing Divisor", example: `48 ${DIVIDE} ? = 8` }),
  Object.freeze({ id: "percent-to-decimal", title: "Percentage to Decimal", example: "35% = ?" }),
  Object.freeze({ id: "decimal-to-percent", title: "Decimal to Percentage", example: "0.72 = ?" }),
  Object.freeze({ id: "powers", title: "Evaluating Powers", example: `6${SUPERSCRIPTS[2]} = ?` })
]);

export const CATEGORY_IDS = Object.freeze(CATEGORIES.map(category => category.id));

export const DIFFICULTIES = Object.freeze([
  Object.freeze({ id: "beginner", title: "Beginner" }),
  Object.freeze({ id: "easy", title: "Easy" }),
  Object.freeze({ id: "medium", title: "Medium" }),
  Object.freeze({ id: "hard", title: "Hard" }),
  Object.freeze({ id: "expert", title: "Expert" })
]);

export const DIFFICULTY_IDS = Object.freeze(DIFFICULTIES.map(difficulty => difficulty.id));

/** Largest exponent the powers category may ever use. */
export const MAX_EXPONENT = 3;

/** How many recent question keys a stream refuses to repeat. */
export const RECENT_HISTORY = 6;
/** The correct answer never sits on the same side more than this many times running. */
export const MAX_SAME_SIDE_RUN = 3;
const MAX_REDRAWS = 60;

export function isCategoryId(value) {
  return typeof value === "string" && CATEGORY_IDS.includes(value);
}

export function isDifficultyId(value) {
  return typeof value === "string" && DIFFICULTY_IDS.includes(value);
}

export function getCategory(categoryId) {
  return CATEGORIES.find(category => category.id === categoryId) ?? null;
}

/**
 * Settings as the engine uses them: categories de-duplicated and put in
 * catalogue order, so two hosts who tick the same boxes in a different order
 * get the same game. "mixed" (or nothing) means all seven.
 */
export function normalizeSettings(input = {}) {
  const requested = input.categories === "mixed" || input.categories == null ? CATEGORY_IDS : input.categories;
  if (!Array.isArray(requested)) throw new RangeError("Categories must be a list or \"mixed\".");
  for (const id of requested) {
    if (!isCategoryId(id)) throw new RangeError(`Unknown Math Race Champions category: ${String(id)}`);
  }
  const categories = CATEGORY_IDS.filter(id => requested.includes(id));
  if (categories.length === 0) throw new RangeError("Choose at least one category.");
  const difficulty = input.difficulty ?? "easy";
  if (!isDifficultyId(difficulty)) throw new RangeError(`Unknown Math Race Champions difficulty: ${String(difficulty)}`);
  return Object.freeze({ categories: Object.freeze(categories), difficulty });
}

// ---------------------------------------------------------------------------
// Exact decimals: value = mantissa × 10^(−exponent), both non-negative integers.
// ---------------------------------------------------------------------------

/** Normalised exact decimal (no trailing zeros in the fraction). */
export function decimal(mantissa, exponent = 0) {
  if (!Number.isSafeInteger(mantissa) || mantissa < 0) throw new RangeError("Decimal mantissa must be a non-negative safe integer.");
  if (!Number.isInteger(exponent) || exponent < 0) throw new RangeError("Decimal exponent must be a non-negative integer.");
  let m = mantissa;
  let e = exponent;
  while (e > 0 && m % 10 === 0) {
    m /= 10;
    e -= 1;
  }
  return Object.freeze({ m, e });
}

/** Multiply by 10^places (places may be negative). Exact. */
export function shiftDecimal(value, places) {
  if (!Number.isInteger(places)) throw new RangeError("Shift must be a whole number of places.");
  let { m, e } = value;
  e -= places;
  while (e < 0) {
    m *= 10;
    e += 1;
  }
  return decimal(m, e);
}

/** "0.35", "3.5", "72": always a leading zero, never a trailing one. */
export function formatDecimal(value) {
  if (value.e === 0) return String(value.m);
  const digits = String(value.m).padStart(value.e + 1, "0");
  return `${digits.slice(0, digits.length - value.e)}.${digits.slice(digits.length - value.e)}`;
}

export function formatPercent(value) {
  return `${formatDecimal(value)}%`;
}

/** Parse "0.35", "72" or "7.2%" back into an exact decimal (the % is dropped). */
export function parseDecimal(text) {
  const match = /^(\d+)(?:\.(\d+))?%?$/.exec(String(text));
  if (!match) return null;
  const fraction = match[2] ?? "";
  return decimal(Number(match[1] + fraction), fraction.length);
}

export function decimalsEqual(a, b) {
  const exponent = Math.max(a.e, b.e);
  return a.m * 10 ** (exponent - a.e) === b.m * 10 ** (exponent - b.e);
}

// ---------------------------------------------------------------------------
// Ranges. Harder means bigger numbers and closer distractors, never wrong maths.
// ---------------------------------------------------------------------------

const span = (min, max) => Object.freeze({ min, max });

export const RANGES = Object.freeze({
  // a + x = c: `known` is a, `missing` is x.
  "missing-addend": Object.freeze({
    beginner: Object.freeze({ known: span(1, 9), missing: span(1, 9) }),
    easy: Object.freeze({ known: span(2, 20), missing: span(2, 15) }),
    medium: Object.freeze({ known: span(10, 60), missing: span(5, 40) }),
    hard: Object.freeze({ known: span(25, 200), missing: span(12, 150) }),
    expert: Object.freeze({ known: span(100, 900), missing: span(50, 600) })
  }),
  // a − x = c with c ≥ 1: `known` is c, `missing` is x, so a = c + x.
  "missing-subtrahend": Object.freeze({
    beginner: Object.freeze({ known: span(1, 9), missing: span(1, 9) }),
    easy: Object.freeze({ known: span(2, 20), missing: span(2, 15) }),
    medium: Object.freeze({ known: span(10, 60), missing: span(5, 40) }),
    hard: Object.freeze({ known: span(25, 200), missing: span(12, 150) }),
    expert: Object.freeze({ known: span(100, 900), missing: span(50, 600) })
  }),
  // a × x = c: `known` is a (never 0, or every x would fit), `missing` is x.
  "missing-multiplier": Object.freeze({
    beginner: Object.freeze({ known: span(2, 5), missing: span(1, 5) }),
    easy: Object.freeze({ known: span(2, 9), missing: span(2, 9) }),
    medium: Object.freeze({ known: span(2, 12), missing: span(2, 12) }),
    hard: Object.freeze({ known: span(6, 15), missing: span(6, 15) }),
    expert: Object.freeze({ known: span(11, 25), missing: span(7, 19) })
  }),
  // c ÷ x = q: `known` is q, `missing` is the divisor x (never 0), c = q × x.
  "missing-divisor": Object.freeze({
    beginner: Object.freeze({ known: span(1, 5), missing: span(2, 5) }),
    easy: Object.freeze({ known: span(2, 9), missing: span(2, 9) }),
    medium: Object.freeze({ known: span(2, 12), missing: span(2, 12) }),
    hard: Object.freeze({ known: span(6, 15), missing: span(6, 15) }),
    expert: Object.freeze({ known: span(11, 25), missing: span(7, 19) })
  }),
  // b^e: `base` for exponents 0 and 1, `square` for 2, `cube` for 3.
  powers: Object.freeze({
    beginner: Object.freeze({ exponents: Object.freeze([1, 2]), base: span(1, 9), square: span(1, 5), cube: span(1, 2) }),
    easy: Object.freeze({ exponents: Object.freeze([0, 1, 2]), base: span(1, 10), square: span(1, 10), cube: span(1, 3) }),
    medium: Object.freeze({ exponents: Object.freeze([0, 1, 2, 3]), base: span(2, 20), square: span(2, 12), cube: span(2, 5) }),
    hard: Object.freeze({ exponents: Object.freeze([0, 1, 2, 3]), base: span(2, 50), square: span(6, 16), cube: span(3, 10) }),
    expert: Object.freeze({ exponents: Object.freeze([0, 1, 2, 3]), base: span(10, 99), square: span(11, 25), cube: span(5, 12) })
  })
});

const BEGINNER_PERCENTS = Object.freeze([10, 20, 25, 30, 40, 50, 60, 70, 75, 80, 90]);

/** The percentage (as an exact decimal, in percent units) for a conversion question. */
function drawPercent(difficulty, random) {
  switch (difficulty) {
    case "beginner":
      return decimal(random.pick(BEGINNER_PERCENTS));
    case "easy":
      return decimal(random.int(1, 99));
    case "medium":
      return decimal(random.int(1, 200));
    case "hard":
      // Half are tenths of a percent (12.5%), half are whole percents above 100.
      if (random.next() < 0.5) return decimal(tenthsNotWhole(random, 1, 999), 1);
      return decimal(random.int(101, 500));
    case "expert": {
      const roll = random.next();
      if (roll < 0.25) return decimal(tenthsNotWhole(random, 1, 99), 2); // 0.01% to 0.99%
      return decimal(tenthsNotWhole(random, 1, 9999), 1); // 0.1% to 999.9%
    }
    default:
      throw new RangeError(`Unknown difficulty: ${String(difficulty)}`);
  }
}

function tenthsNotWhole(random, min, max) {
  for (;;) {
    const value = random.int(min, max);
    if (value % 10 !== 0) return value;
  }
}

/** Place-value slips a learner really makes: one or two places either way. */
const SHIFT_SLIPS = Object.freeze({
  beginner: Object.freeze([1, -1]),
  easy: Object.freeze([1, -1]),
  medium: Object.freeze([1, -1, 2]),
  hard: Object.freeze([1, -1, 2, -2]),
  expert: Object.freeze([1, -1, 2, -2])
});
const MAX_DECIMAL_PLACES = 6;

/** Near misses for a missing whole number: off by one or two, or by ten. */
const OFFSET_SLIPS = Object.freeze({
  beginner: Object.freeze([2, -2, 1, -1, 3, -3]),
  easy: Object.freeze([1, -1, 2, -2]),
  medium: Object.freeze([1, -1, 2, -2, 10, -10]),
  hard: Object.freeze([1, -1, 2, -2, 10, -10]),
  expert: Object.freeze([1, -1, 10, -10, 100, -100])
});

function pickWrong(random, candidates, isAllowed) {
  const pool = [...new Set(candidates)].filter(isAllowed);
  if (pool.length === 0) throw new Error("No distractor available.");
  return random.pick(pool);
}

function spokenChoices(a, b) {
  return `${a} or ${b}`;
}

function build(category, difficulty, key, text, spoken, operands, correct, wrong, random) {
  const correctIndex = random.next() < 0.5 ? 0 : 1;
  const choices = correctIndex === 0 ? [correct, wrong] : [wrong, correct];
  return Object.freeze({
    category,
    difficulty,
    key,
    text,
    spoken: `${spoken} ${spokenChoices(choices[0], choices[1])}?`,
    operands: Object.freeze(operands),
    choices: Object.freeze(choices),
    correctIndex,
    answer: correct
  });
}

function drawMissingWhole(category, difficulty, random) {
  const range = RANGES[category][difficulty];
  const known = random.int(range.known.min, range.known.max);
  const missing = random.int(range.missing.min, range.missing.max);
  const offsets = OFFSET_SLIPS[difficulty].map(offset => missing + offset);
  let first;
  let result;
  let symbol;
  let word;
  let extra = [];
  switch (category) {
    case "missing-addend":
      first = known;
      result = known + missing;
      symbol = "+";
      word = "plus";
      break;
    case "missing-subtrahend":
      first = known + missing;
      result = known;
      symbol = MINUS;
      word = "minus";
      break;
    case "missing-multiplier":
      first = known;
      result = known * missing;
      symbol = TIMES;
      word = "times";
      break;
    default:
      first = known * missing;
      result = known;
      symbol = DIVIDE;
      word = "divided by";
      // Mixing up the divisor and the quotient is the classic slip.
      if (difficulty !== "beginner" && difficulty !== "easy") extra = [known];
  }
  // A wrong choice is a positive whole number other than the missing one. For
  // subtraction it never exceeds the first number, so it is never absurd
  // (missing + 1 always qualifies, because the result is at least 1).
  const wrong = pickWrong(random, [...offsets, ...extra], value =>
    Number.isInteger(value) && value >= 1 && value !== missing && (category !== "missing-subtrahend" || value <= first)
  );
  return build(
    category,
    difficulty,
    `${category}:${first}:${missing}`,
    `${first} ${symbol} ? = ${result}`,
    `${first} ${word} what number equals ${result}?`,
    [first, missing, result],
    String(missing),
    String(wrong),
    random
  );
}

function drawConversion(category, difficulty, random) {
  const percent = drawPercent(difficulty, random);
  const asDecimal = shiftDecimal(percent, -2);
  const toDecimal = category === "percent-to-decimal";
  const correct = toDecimal ? asDecimal : percent;
  const slips = SHIFT_SLIPS[difficulty]
    .map(places => shiftDecimal(correct, places))
    .filter(value => value.e <= MAX_DECIMAL_PLACES);
  const wrong = slips[Math.floor(random.next() * slips.length)];
  const show = toDecimal ? formatDecimal : formatPercent;
  const shownPercent = formatPercent(percent);
  const shownDecimal = formatDecimal(asDecimal);
  return build(
    category,
    difficulty,
    `${category}:${percent.m}e${percent.e}`,
    toDecimal ? `${shownPercent} = ?` : `${shownDecimal} = ?`,
    toDecimal ? `${shownPercent.replace("%", " percent")} as a decimal:` : `${shownDecimal} as a percentage:`,
    [shownPercent, shownDecimal],
    show(correct),
    show(wrong),
    random
  );
}

function drawPower(difficulty, random) {
  const range = RANGES.powers[difficulty];
  const exponent = random.pick(range.exponents);
  const baseRange = exponent === 3 ? range.cube : exponent === 2 ? range.square : range.base;
  // The base is never 0, so 0⁰ can never be asked.
  const base = random.int(baseRange.min, baseRange.max);
  const value = base ** exponent;
  let candidates;
  switch (exponent) {
    case 0:
      candidates = [0, base]; // "anything to the power 0 is 0" / "is itself"
      break;
    case 1:
      candidates = [1, base * base, base + 1]; // mixed up with exponent 0 or 2
      break;
    case 2:
      candidates = [2 * base, base * (base + 1), base * (base - 1), base + 2]; // doubled instead of squared
      break;
    default:
      candidates = [3 * base, base * base, value + base * base, value - base * base]; // tripled, or squared
  }
  const wrong = pickWrong(random, candidates, candidate => Number.isInteger(candidate) && candidate >= 0 && candidate !== value);
  return build(
    "powers",
    difficulty,
    `powers:${base}^${exponent}`,
    `${base}${SUPERSCRIPTS[exponent]} = ?`,
    `${base} to the power of ${exponent}:`,
    [base, exponent, value],
    String(value),
    String(wrong),
    random
  );
}

function drawCandidate(category, difficulty, random) {
  switch (category) {
    case "missing-addend":
    case "missing-subtrahend":
    case "missing-multiplier":
    case "missing-divisor":
      return drawMissingWhole(category, difficulty, random);
    case "percent-to-decimal":
    case "decimal-to-percent":
      return drawConversion(category, difficulty, random);
    case "powers":
      return drawPower(difficulty, random);
    default:
      throw new RangeError(`Unknown Math Race Champions category: ${String(category)}`);
  }
}

/**
 * Draw one question while refusing any key in `recentKeys`.
 * Pure given the random source, so a seed reproduces the whole sequence.
 */
export function drawQuestion(category, difficulty, random, recentKeys = []) {
  if (!isCategoryId(category)) throw new RangeError(`Unknown Math Race Champions category: ${String(category)}`);
  if (!isDifficultyId(difficulty)) throw new RangeError(`Unknown Math Race Champions difficulty: ${String(difficulty)}`);
  let candidate = drawCandidate(category, difficulty, random);
  for (let attempt = 0; attempt < MAX_REDRAWS && recentKeys.includes(candidate.key); attempt += 1) {
    candidate = drawCandidate(category, difficulty, random);
  }
  return candidate;
}

function flip(question) {
  const correctIndex = question.correctIndex === 0 ? 1 : 0;
  const choices = Object.freeze([question.choices[1], question.choices[0]]);
  const spoken = question.spoken.replace(/ [^ ]+ or [^ ]+\?$/, ` ${spokenChoices(choices[0], choices[1])}?`);
  return Object.freeze({ ...question, choices, correctIndex, spoken });
}

/**
 * A question stream for one racer or team.
 *
 * `seed` decides the numbers. `orderSeed` decides the order of categories and
 * is meant to be SHARED by opponents: question n is then the same category for
 * everyone (with different numbers), and each cycle through the bag uses every
 * selected category exactly once, so nobody gets an easier mix.
 */
export function createQuestionStream(settingsInput, seed, options = {}) {
  const settings = normalizeSettings(settingsInput);
  const random = createRandom(seed);
  const order = createRandom(`${hashSeed(options.orderSeed ?? seed)}:category-order`);
  const recent = [];
  let bag = [];
  let lastCategory = null;
  let index = 0;
  let sideRun = 0;
  let lastSide = -1;

  function nextCategory() {
    if (bag.length === 0) {
      bag = order.shuffle(settings.categories);
      // Never the same category twice in a row across a bag boundary.
      if (bag.length > 1 && bag[0] === lastCategory) [bag[0], bag[1]] = [bag[1], bag[0]];
    }
    lastCategory = bag.shift();
    return lastCategory;
  }

  return Object.freeze({
    settings,
    next() {
      let question = drawQuestion(nextCategory(), settings.difficulty, random, recent);
      if (question.correctIndex === lastSide && sideRun >= MAX_SAME_SIDE_RUN) question = flip(question);
      sideRun = question.correctIndex === lastSide ? sideRun + 1 : 1;
      lastSide = question.correctIndex;
      recent.push(question.key);
      if (recent.length > RECENT_HISTORY) recent.shift();
      index += 1;
      return Object.freeze({ ...question, index: index - 1 });
    },
    get index() {
      return index;
    }
  });
}

/**
 * The question at position `index` of the stream seeded by `seed`.
 * The server uses this: it replays the stream, so the browser never needs
 * (or gets) the answer in a server-checked race.
 */
export function questionAt(settings, seed, index, options = {}) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError("Question index must be a non-negative integer.");
  const stream = createQuestionStream(settings, seed, options);
  let question = stream.next();
  for (let position = 0; position < index; position += 1) question = stream.next();
  return question;
}

/** What a browser may see of a server-checked question: no answer. */
export function publicQuestion(question) {
  return Object.freeze({
    index: question.index,
    category: question.category,
    text: question.text,
    spoken: question.spoken,
    choices: question.choices
  });
}

export function isCorrectChoice(question, choiceIndex) {
  return (choiceIndex === 0 || choiceIndex === 1) && choiceIndex === question.correctIndex;
}

// ---------------------------------------------------------------------------
// Independent validity check used by the audits. It does not reuse the
// generator: it reads the question as shown and tests BOTH choices against it.
// ---------------------------------------------------------------------------

const EQUATION = new RegExp(`^(\\d+) ([+${MINUS}${TIMES}${DIVIDE}]) \\? = (\\d+)$`);
const POWER = new RegExp(`^(\\d+)([${SUPERSCRIPTS.join("")}]) = \\?$`);

function satisfies(question, choice) {
  const text = question.text;
  const equation = EQUATION.exec(text);
  if (equation) {
    if (!/^\d+$/.test(choice)) return false;
    const first = Number(equation[1]);
    const result = Number(equation[3]);
    const value = Number(choice);
    switch (equation[2]) {
      case "+":
        return first + value === result;
      case MINUS:
        return first - value === result;
      case TIMES:
        return first * value === result;
      default:
        return value !== 0 && first === result * value;
    }
  }
  const power = POWER.exec(text);
  if (power) {
    if (!/^\d+$/.test(choice)) return false;
    const base = Number(power[1]);
    const exponent = SUPERSCRIPTS.indexOf(power[2]);
    let value = 1;
    for (let step = 0; step < exponent; step += 1) value *= base;
    return Number(choice) === value;
  }
  const shown = /^(.+) = \?$/.exec(text);
  const left = shown ? parseDecimal(shown[1]) : null;
  const right = parseDecimal(choice);
  if (!left || !right) return false;
  const leftIsPercent = shown[1].endsWith("%");
  const rightIsPercent = choice.endsWith("%");
  if (leftIsPercent === rightIsPercent) return false;
  // percent = decimal × 100
  return leftIsPercent ? decimalsEqual(left, shiftDecimal(right, 2)) : decimalsEqual(shiftDecimal(left, 2), right);
}

export function validateQuestion(question) {
  const problems = [];
  if (!isCategoryId(question.category)) problems.push("unknown-category");
  if (!isDifficultyId(question.difficulty)) problems.push("unknown-difficulty");
  if (!Array.isArray(question.choices) || question.choices.length !== 2) {
    problems.push("choice-count");
    return problems;
  }
  const [left, right] = question.choices;
  if (left === right) problems.push("identical-choices");
  if (question.correctIndex !== 0 && question.correctIndex !== 1) problems.push("correct-index");
  if (question.answer !== question.choices[question.correctIndex]) problems.push("answer-mismatch");
  if (question.text.includes("-") || left.includes("-") || right.includes("-")) problems.push("ascii-hyphen");
  if (!question.text.includes("?")) problems.push("no-unknown");

  const fits = [satisfies(question, left), satisfies(question, right)];
  if (!fits[question.correctIndex]) problems.push("wrong-answer-marked-correct");
  if (fits[question.correctIndex === 0 ? 1 : 0]) problems.push("distractor-also-correct");
  if (fits.filter(Boolean).length !== 1) problems.push("not-exactly-one-correct");

  // Same number written two ways ("0.5" and "0.50", "50%" and "50.0%") would be ambiguous.
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  if (!a || !b) problems.push("unreadable-choice");
  else if (decimalsEqual(a, b)) problems.push("equivalent-choices");
  for (const choice of question.choices) {
    if (/\.\d*0%?$/.test(choice)) problems.push("trailing-zero");
    if (/^\./.test(choice) || /^0\d/.test(choice)) problems.push("malformed-number");
  }

  const shape = {
    "missing-addend": / \+ \? = /,
    "missing-subtrahend": new RegExp(` ${MINUS} \\? = `),
    "missing-multiplier": new RegExp(` ${TIMES} \\? = `),
    "missing-divisor": new RegExp(` ${DIVIDE} \\? = `),
    "percent-to-decimal": /^\d+(\.\d+)?% = \?$/,
    "decimal-to-percent": /^\d+(\.\d+)? = \?$/,
    powers: POWER
  }[question.category];
  if (shape && !shape.test(question.text)) problems.push("wrong-shape");

  if (question.category === "percent-to-decimal" && question.choices.some(choice => choice.includes("%"))) problems.push("percent-in-decimal-choice");
  if (question.category === "decimal-to-percent" && question.choices.some(choice => !choice.endsWith("%"))) problems.push("missing-percent-sign");
  if (question.category === "missing-divisor" && question.choices.includes("0")) problems.push("zero-divisor");
  if (question.category === "powers") {
    const power = POWER.exec(question.text);
    if (power) {
      const exponent = SUPERSCRIPTS.indexOf(power[2]);
      if (exponent < 0 || exponent > MAX_EXPONENT) problems.push("exponent-out-of-range");
      if (Number(power[1]) === 0) problems.push("zero-base");
    }
  }
  return problems;
}
