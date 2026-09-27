// Question engine for Math Tug of War. Pure: no DOM, no timers, no storage.
//
// Exactly six skills, one balanced ruleset each (no difficulty tiers):
//   addition        a + b          a, b in 1..12
//   subtraction     a - b          a, b in 1..12, a >= b (answer >= 0)
//   multiplication  a x b          a, b in 1..12
//   integers        a + b | a - b  a, b in -12..12, one operation, at least
//                                  one negative number in the problem
//   opposite        opposite of n  n in -12..12
//   absolute        |n|            n in -12..12

import { createRandom } from "./random.js";

export const MINUS = String.fromCharCode(0x2212);
export const TIMES = String.fromCharCode(0xd7);

export const SKILLS = Object.freeze([
  Object.freeze({ id: "addition", title: "Addition", shortTitle: "Addition", signed: false }),
  Object.freeze({ id: "subtraction", title: "Subtraction", shortTitle: "Subtraction", signed: false }),
  Object.freeze({ id: "multiplication", title: "Multiplication", shortTitle: "Multiplication", signed: false }),
  Object.freeze({ id: "integers", title: "Addition & Subtraction of Integers", shortTitle: "Integer Add & Subtract", signed: true }),
  Object.freeze({ id: "opposite", title: "Opposite of Integers", shortTitle: "Opposite of Integers", signed: true }),
  Object.freeze({ id: "absolute", title: "Absolute Value", shortTitle: "Absolute Value", signed: true })
]);

export const SKILL_IDS = Object.freeze(SKILLS.map(skill => skill.id));

export const RANGES = Object.freeze({
  whole: Object.freeze({ min: 1, max: 12 }),
  integer: Object.freeze({ min: -12, max: 12 })
});

/** How many recent question keys a generator refuses to repeat. */
export const RECENT_HISTORY = 6;
const MAX_REDRAWS = 40;

export function getSkill(skillId) {
  return SKILLS.find(skill => skill.id === skillId) ?? null;
}

export function isSkillId(value) {
  return typeof value === "string" && SKILL_IDS.includes(value);
}

/** Display an integer with a true minus sign; never produces "-0". */
export function formatInteger(value) {
  if (value === 0) return "0";
  return value < 0 ? `${MINUS}${Math.abs(value)}` : String(value);
}

/** Second operand of a signed expression: negatives are parenthesised. */
function formatOperand(value) {
  return value < 0 ? `(${formatInteger(value)})` : formatInteger(value);
}

function spokenInteger(value) {
  if (value === 0) return "0";
  return value < 0 ? `negative ${Math.abs(value)}` : String(value);
}

function normalizeZero(value) {
  return value === 0 ? 0 : value;
}

function binary(skill, a, operator, b) {
  const answer = normalizeZero(operator === "+" ? a + b : operator === "-" ? a - b : a * b);
  const symbol = operator === "+" ? "+" : operator === "-" ? MINUS : TIMES;
  const word = operator === "+" ? "plus" : operator === "-" ? "minus" : "times";
  return Object.freeze({
    skill,
    key: `${skill}:${a}${operator}${b}`,
    kind: "expression",
    operands: Object.freeze([a, b]),
    operator,
    text: `${formatInteger(a)} ${symbol} ${formatOperand(b)}`,
    spoken: `${spokenInteger(a)} ${word} ${spokenInteger(b)}`,
    answer
  });
}

function unary(skill, value) {
  if (skill === "opposite") {
    return Object.freeze({
      skill,
      key: `${skill}:${value}`,
      kind: "sentence",
      operands: Object.freeze([value]),
      operator: "opposite",
      text: `What is the opposite of ${formatInteger(value)}?`,
      spoken: `What is the opposite of ${spokenInteger(value)}?`,
      answer: normalizeZero(-value)
    });
  }
  return Object.freeze({
    skill,
    key: `${skill}:${value}`,
    kind: "expression",
    operands: Object.freeze([value]),
    operator: "absolute",
    text: `|${formatInteger(value)}|`,
    spoken: `the absolute value of ${spokenInteger(value)}`,
    answer: normalizeZero(Math.abs(value))
  });
}

function drawCandidate(skill, random) {
  const { whole, integer } = RANGES;
  switch (skill) {
    case "addition":
      return binary(skill, random.int(whole.min, whole.max), "+", random.int(whole.min, whole.max));
    case "subtraction": {
      const a = random.int(whole.min, whole.max);
      const b = random.int(whole.min, a);
      return binary(skill, a, "-", b);
    }
    case "multiplication":
      return binary(skill, random.int(whole.min, whole.max), "*", random.int(whole.min, whole.max));
    case "integers": {
      // Redraw until the problem genuinely involves a negative number
      // (a negative operand or a negative answer). "3 + 4" is whole-number
      // addition and belongs to the Addition skill.
      for (;;) {
        const a = random.int(integer.min, integer.max);
        const b = random.int(integer.min, integer.max);
        const operator = random.next() < 0.5 ? "+" : "-";
        const question = binary(skill, a, operator, b);
        if (a < 0 || b < 0 || question.answer < 0) return question;
      }
    }
    case "opposite":
    case "absolute":
      return unary(skill, random.int(integer.min, integer.max));
    default:
      throw new RangeError(`Unknown Math Tug of War skill: ${String(skill)}`);
  }
}

/**
 * Draw one question while refusing any key in `recentKeys`.
 * Pure given the random source, so a seed reproduces the whole sequence.
 */
export function drawQuestion(skill, random, recentKeys = []) {
  if (!isSkillId(skill)) throw new RangeError(`Unknown Math Tug of War skill: ${String(skill)}`);
  let candidate = drawCandidate(skill, random);
  for (let attempt = 0; attempt < MAX_REDRAWS && recentKeys.includes(candidate.key); attempt += 1) {
    candidate = drawCandidate(skill, random);
  }
  return candidate;
}

/** A question stream for one team: seeded, with a recent-repeat guard. */
export function createQuestionStream(skill, seed) {
  const random = createRandom(seed);
  const recent = [];
  let index = 0;
  return Object.freeze({
    skill,
    next() {
      const question = drawQuestion(skill, random, recent);
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
 * Online Match uses this on the server: it replays the stream, so the
 * browser never needs (or gets) the answer.
 */
export function questionAt(skill, seed, index) {
  if (!Number.isInteger(index) || index < 0) throw new RangeError("Question index must be a non-negative integer.");
  const stream = createQuestionStream(skill, seed);
  let question = stream.next();
  for (let position = 0; position < index; position += 1) question = stream.next();
  return question;
}

/** Independent validity check used by the audits and the server. */
export function validateQuestion(question) {
  const problems = [];
  const inRange = (value, range) => Number.isInteger(value) && value >= range.min && value <= range.max;
  const { whole, integer } = RANGES;
  const [a, b] = question.operands;
  if (Object.is(question.answer, -0)) problems.push("negative-zero");
  if (!Number.isInteger(question.answer)) problems.push("non-integer-answer");
  if (/--|\+-|-\+|\+\+/.test(question.text) || question.text.includes(`${MINUS}${MINUS}`)) problems.push("malformed");
  if (/[+\u2212\u00d7] -|[+\u2212\u00d7] \u2212/.test(question.text)) problems.push("ambiguous-sign");
  if (question.text.includes("-")) problems.push("ascii-hyphen");
  switch (question.skill) {
    case "addition":
      if (question.operator !== "+" || !inRange(a, whole) || !inRange(b, whole)) problems.push("out-of-range");
      if (question.answer !== a + b) problems.push("answer-mismatch");
      break;
    case "subtraction":
      if (question.operator !== "-" || !inRange(a, whole) || !inRange(b, whole)) problems.push("out-of-range");
      if (a < b || question.answer < 0) problems.push("negative-subtraction");
      if (question.answer !== a - b) problems.push("answer-mismatch");
      break;
    case "multiplication":
      if (question.operator !== "*" || !inRange(a, whole) || !inRange(b, whole)) problems.push("out-of-range");
      if (question.answer !== a * b) problems.push("answer-mismatch");
      break;
    case "integers": {
      if (!["+", "-"].includes(question.operator) || !inRange(a, integer) || !inRange(b, integer)) problems.push("out-of-range");
      if (question.operands.length !== 2) problems.push("operand-count");
      const expected = question.operator === "+" ? a + b : a - b;
      if (question.answer !== expected) problems.push("answer-mismatch");
      const operatorCount = (question.text.match(/ [+\u2212] /g) ?? []).length;
      if (operatorCount !== 1) problems.push("operation-count");
      if (b < 0 && !question.text.endsWith(`(${formatInteger(b)})`)) problems.push("unparenthesised-negative");
      break;
    }
    case "opposite":
      if (question.operands.length !== 1 || !inRange(a, integer)) problems.push("out-of-range");
      if (question.answer !== (a === 0 ? 0 : -a)) problems.push("answer-mismatch");
      break;
    case "absolute":
      if (question.operands.length !== 1 || !inRange(a, integer)) problems.push("out-of-range");
      if (question.answer !== Math.abs(a) || question.answer < 0) problems.push("answer-mismatch");
      break;
    default:
      problems.push("unknown-skill");
  }
  return problems;
}
