// Tug model and local match engine for Math Tug of War. Pure and synchronous:
// no DOM, no timers. The UI animates whatever these functions return.
//
// Rope position is an integer in [-TUG_LIMIT, TUG_LIMIT], starting at 0.
// Turquoise (left) pulls toward negative, Pink (right) toward positive.
// Reaching -TUG_LIMIT is a Turquoise win; +TUG_LIMIT is a Pink win.
// Wrong answers never move the rope. There is no timer and no score other
// than the rope.

import { createQuestionStream, isSkillId } from "./questions.js";
import { parseAnswer } from "./answer.js";
import { freshSeed, hashSeed } from "./random.js";

export const TUG_LIMIT = 5;
export const TEAMS = Object.freeze(["turquoise", "pink"]);
export const TEAM_DIRECTION = Object.freeze({ turquoise: -1, pink: 1 });
export const DEFAULT_TEAM_NAMES = Object.freeze({ turquoise: "Team 1", pink: "Team 2" });
export const NAME_MAX_LENGTH = 20;

export function isTeam(value) {
  return value === "turquoise" || value === "pink";
}

export function otherTeam(team) {
  return team === "turquoise" ? "pink" : "turquoise";
}

/**
 * Trim, collapse whitespace, drop control characters and cap the length.
 * Rendering always goes through textContent as well; this keeps names tidy.
 */
export function sanitizeName(raw, fallback) {
  const text = typeof raw === "string" ? raw : "";
  let cleaned = "";
  for (const character of text.normalize("NFC")) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || (code >= 0x7f && code < 0xa0) || character === "<" || character === ">") continue;
    cleaned += character;
  }
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  const limited = Array.from(cleaned).slice(0, NAME_MAX_LENGTH).join("").trim();
  return limited === "" ? fallback : limited;
}

export function createTugState() {
  return Object.freeze({ position: 0, winner: null, pulls: Object.freeze({ turquoise: 0, pink: 0 }) });
}

export function winnerForPosition(position) {
  if (position <= -TUG_LIMIT) return "turquoise";
  if (position >= TUG_LIMIT) return "pink";
  return null;
}

/** One pull for `team`. A finished tug never moves again. */
export function applyPull(tug, team) {
  if (!isTeam(team)) throw new RangeError(`Unknown team: ${String(team)}`);
  if (tug.winner) return tug;
  const position = Math.max(-TUG_LIMIT, Math.min(TUG_LIMIT, tug.position + TEAM_DIRECTION[team]));
  return Object.freeze({
    position,
    winner: winnerForPosition(position),
    pulls: Object.freeze({ ...tug.pulls, [team]: tug.pulls[team] + 1 })
  });
}

/** 0..1 progress toward a team's victory line (for announcements/meters). */
export function progressFor(tug, team) {
  return Math.max(0, (TEAM_DIRECTION[team] * tug.position) / TUG_LIMIT);
}

/**
 * Plain-language rope description for screen readers, never the raw number.
 */
export function describePosition(position, names) {
  if (position === 0) return "The rope is centered.";
  const leader = position < 0 ? "turquoise" : "pink";
  const steps = Math.abs(position);
  const remaining = TUG_LIMIT - steps;
  if (remaining <= 0) return `${names[leader]} pulled the rope across the line.`;
  const lead = `${names[leader]} leads by ${steps} ${steps === 1 ? "pull" : "pulls"}`;
  return `${lead}, ${remaining} ${remaining === 1 ? "pull" : "pulls"} from victory.`;
}

/**
 * Local match: two teams (or a human and the robot) answering at the same
 * time on one device. Each team has its own question stream; one team's
 * answer never touches the other team's question or entry.
 */
export function createLocalMatch({ skill, names, seed } = {}) {
  if (!isSkillId(skill)) throw new RangeError(`Unknown skill: ${String(skill)}`);
  const baseSeed = seed ?? freshSeed();
  let tug = createTugState();
  let round = 0;
  const teams = {};

  const resetTeams = () => {
    for (const team of TEAMS) {
      const stream = createQuestionStream(skill, hashSeed(`${baseSeed}:${round}:${team}`));
      teams[team] = { stream, question: stream.next(), answered: 0, correct: 0 };
    }
  };
  resetTeams();

  const snapshot = () => Object.freeze({
    skill,
    round,
    status: tug.winner ? "won" : "playing",
    tug,
    names: Object.freeze({ ...names }),
    questions: Object.freeze({ turquoise: teams.turquoise.question, pink: teams.pink.question }),
    stats: Object.freeze({
      turquoise: Object.freeze({ answered: teams.turquoise.answered, correct: teams.turquoise.correct }),
      pink: Object.freeze({ answered: teams.pink.answered, correct: teams.pink.correct })
    })
  });

  return Object.freeze({
    snapshot,
    /**
     * Submit a raw entry for `team`.
     * - invalid entry (empty/malformed): nothing changes, question kept
     * - wrong: no pull, the team gets its next question
     * - correct: the team pulls and gets its next question
     * The opposing team's current question is never touched.
     */
    submit(team, raw) {
      if (!isTeam(team)) throw new RangeError(`Unknown team: ${String(team)}`);
      if (tug.winner) return Object.freeze({ type: "finished", team, match: snapshot() });
      const parsed = parseAnswer(raw);
      if (!parsed.ok) return Object.freeze({ type: "invalid", team, reason: parsed.reason, match: snapshot() });
      const entry = teams[team];
      const question = entry.question;
      entry.answered += 1;
      const correct = parsed.value === question.answer;
      if (correct) {
        entry.correct += 1;
        tug = applyPull(tug, team);
      }
      if (!tug.winner) entry.question = entry.stream.next();
      return Object.freeze({
        type: correct ? "correct" : "incorrect",
        team,
        question,
        value: parsed.value,
        pulled: correct,
        winner: tug.winner,
        match: snapshot()
      });
    },
    /** Play Again: same names, same skill, fresh rope and fresh questions. */
    rematch() {
      round += 1;
      tug = createTugState();
      resetTeams();
      return snapshot();
    }
  });
}
