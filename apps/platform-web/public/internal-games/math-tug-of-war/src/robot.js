// MathNexa Robot for the VS Robot mode. There is exactly one robot and no
// user-facing difficulty. All tuning lives in ROBOT_TUNING.
//
// The robot answers its OWN question (it never sees the player's), waits a
// natural, variable "thinking" time first, is usually but not always right,
// and only pulls when its simulated answer is actually correct - its answers
// go through the same submit path as a human's.

export const ROBOT_TUNING = Object.freeze({
  /** Typical thinking time per skill, in milliseconds. */
  baseDelayMs: Object.freeze({
    addition: 3300,
    subtraction: 3500,
    multiplication: 4200,
    integers: 4600,
    opposite: 3000,
    absolute: 3000
  }),
  /** Uniform spread around the base delay (fraction of the base). */
  jitter: 0.35,
  /** The robot never answers faster than this. */
  minDelayMs: 1800,
  /** Probability that a simulated answer is correct. */
  accuracy: 0.8,
  /** Extra pause after a wrong answer, like a person regrouping. */
  afterMistakeMs: 600
});

/**
 * Plan the robot's next answer to `question`.
 * `random()` returns a float in [0, 1).
 */
export function planRobotAnswer(question, random, tuning = ROBOT_TUNING) {
  const base = tuning.baseDelayMs[question.skill] ?? 3500;
  const spread = base * tuning.jitter;
  const delayMs = Math.max(tuning.minDelayMs, Math.round(base - spread + random() * spread * 2));
  const correct = random() < tuning.accuracy;
  const answer = correct ? question.answer : plausibleMistake(question, random);
  return Object.freeze({ delayMs, correct: answer === question.answer, answer });
}

/** A believable wrong answer (off by one or two, or a sign slip). */
export function plausibleMistake(question, random) {
  const signedSkill = question.skill === "integers" || question.skill === "opposite";
  if (signedSkill && question.answer !== 0 && random() < 0.5) return -question.answer;
  const offset = random() < 0.5 ? 1 : 2;
  let wrong = question.answer + (random() < 0.5 ? -offset : offset);
  const nonNegative = question.skill !== "integers" && question.skill !== "opposite";
  if (nonNegative && wrong < 0) wrong = question.answer + offset;
  if (wrong === question.answer) wrong += 1;
  return wrong === 0 ? 0 : wrong;
}

/** Robot answers go through the normal submit path as text. */
export function robotEntry(value) {
  return value < 0 ? `-${Math.abs(value)}` : String(value);
}
