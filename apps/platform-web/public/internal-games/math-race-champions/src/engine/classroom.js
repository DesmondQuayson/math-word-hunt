// Classroom Competition: two teams, one Smart Board, both playing at once.
// Pure match engine: no DOM, no timers. The screen passes in the time of each
// press (a monotonic clock: the pointer event's own timestamp), so the engine
// decides the order of events and never the order in which code happened to run.
//
// Rules, all of them:
//   * each team has its own question stream and answers independently;
//   * a correct answer moves that team's football exactly ONE space;
//   * a wrong answer moves nothing: no step back, no penalty;
//   * no bonuses, no shortcuts, nothing random about progress;
//   * the first team to land on the last space wins.

import { createQuestionStream, normalizeSettings } from "./questions.js";
import { TRACK_LENGTHS, TRACK_SPACES } from "./track.js";

export const TEAMS = Object.freeze(["turquoise", "pink"]);
export const DEFAULT_TEAM_NAMES = Object.freeze({ turquoise: "Team Turquoise", pink: "Team Pink" });
export const TEAM_NAME_MAX = 18;

/** After a correct answer the team's buttons rest this long; one press can never count twice. */
export const CORRECT_LOCK_MS = 450;
/** After a wrong answer the pause is longer, so guessing is slower than thinking. */
export const WRONG_LOCK_MS = 900;
/**
 * Two finishing presses this close together are a tie. A Smart Board samples
 * touches every 8 to 16 ms and redraws every 16 ms, and nobody in the room can
 * tell which of two presses 100 ms apart came first, so neither side is
 * declared the winner on evidence the room cannot see.
 */
export const TIE_WINDOW_MS = 100;

export function sanitizeTeamName(value, team) {
  const cleaned = String(value ?? "")
    .replace(/[\u0000-\u001f\u007f<>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TEAM_NAME_MAX)
    .trim();
  return cleaned || DEFAULT_TEAM_NAMES[team];
}

export function isTrackLength(value) {
  return TRACK_LENGTHS.includes(value);
}

export function createClassroomMatch({ settings: settingsInput, names = {}, seed, length = TRACK_SPACES }) {
  const settings = normalizeSettings(settingsInput);
  if (!isTrackLength(length)) throw new RangeError("The track is 62 spaces, or 30 for a practice race.");
  let round = 0;
  let phase = "ready";
  let startedAt = null;
  let firstFinishAt = null;
  let endedAt = null;
  let teams = {};

  function freshTeam(team) {
    // Same category order for both teams (orderSeed), different numbers (seed).
    const stream = createQuestionStream(settings, `${seed}:${round}:${team}`, { orderSeed: `${seed}:${round}` });
    return {
      team,
      name: sanitizeTeamName(names[team], team),
      stream,
      question: stream.next(),
      position: 0,
      correct: 0,
      wrong: 0,
      lockedUntil: 0,
      finishedAt: null
    };
  }

  function reset() {
    teams = Object.fromEntries(TEAMS.map(team => [team, freshTeam(team)]));
    phase = "ready";
    startedAt = null;
    firstFinishAt = null;
    endedAt = null;
  }
  reset();

  function view(team) {
    const record = teams[team];
    return Object.freeze({
      team,
      name: record.name,
      position: record.position,
      remaining: length - record.position,
      correct: record.correct,
      wrong: record.wrong,
      question: record.question,
      finished: record.finishedAt !== null,
      finishedAt: record.finishedAt
    });
  }

  function outcome() {
    if (phase !== "finished") return null;
    const finishers = TEAMS.filter(team => teams[team].finishedAt !== null);
    const stats = Object.fromEntries(
      TEAMS.map(team => {
        const record = teams[team];
        const answered = record.correct + record.wrong;
        return [
          team,
          Object.freeze({
            name: record.name,
            position: record.position,
            correct: record.correct,
            wrong: record.wrong,
            accuracy: answered === 0 ? 0 : Math.round((record.correct / answered) * 100),
            timeMs: record.finishedAt === null ? null : Math.max(0, record.finishedAt - startedAt)
          })
        ];
      })
    );
    return Object.freeze({
      result: finishers.length === 2 ? "tie" : "win",
      winner: finishers.length === 1 ? finishers[0] : null,
      length,
      durationMs: Math.max(0, endedAt - startedAt),
      teams: Object.freeze(stats)
    });
  }

  return Object.freeze({
    settings,
    length,
    get phase() {
      return phase;
    },
    get round() {
      return round;
    },
    team: view,
    start(atMs) {
      if (phase !== "ready") return false;
      phase = "playing";
      startedAt = atMs;
      return true;
    },
    /**
     * One press of one of a team's two buttons, at `atMs`.
     * Refused (and changes nothing) while the team's buttons are resting.
     */
    submit(team, choiceIndex, atMs) {
      const record = teams[team];
      if (!record) return Object.freeze({ accepted: false, reason: "unknown-team" });
      if (choiceIndex !== 0 && choiceIndex !== 1) return Object.freeze({ accepted: false, reason: "invalid-choice" });
      if (phase !== "playing" && phase !== "resolving") return Object.freeze({ accepted: false, reason: phase });
      if (record.finishedAt !== null) return Object.freeze({ accepted: false, reason: "finished" });
      if (phase === "resolving" && atMs - firstFinishAt > TIE_WINDOW_MS) return Object.freeze({ accepted: false, reason: "finished" });
      if (atMs < record.lockedUntil) return Object.freeze({ accepted: false, reason: "locked" });

      const question = record.question;
      const correct = choiceIndex === question.correctIndex;
      const from = record.position;
      if (correct) {
        record.correct += 1;
        record.position = Math.min(length, record.position + 1);
      } else {
        record.wrong += 1;
      }
      record.lockedUntil = atMs + (correct ? CORRECT_LOCK_MS : WRONG_LOCK_MS);
      const finished = correct && record.position === length;
      if (finished) {
        record.finishedAt = atMs;
        if (firstFinishAt === null || atMs < firstFinishAt) firstFinishAt = atMs;
        phase = "resolving";
      } else {
        record.question = record.stream.next();
      }
      return Object.freeze({
        accepted: true,
        team,
        correct,
        answered: question,
        choiceIndex,
        from,
        position: record.position,
        remaining: length - record.position,
        finished,
        lockMs: correct ? CORRECT_LOCK_MS : WRONG_LOCK_MS
      });
    },
    /** Call once the tie window may have passed; returns the outcome when the race is over. */
    resolve(atMs) {
      if (phase === "resolving" && atMs - firstFinishAt >= TIE_WINDOW_MS) {
        // A second finisher only counts if its press fell inside the window.
        for (const team of TEAMS) {
          const record = teams[team];
          if (record.finishedAt !== null && record.finishedAt - firstFinishAt > TIE_WINDOW_MS) {
            record.finishedAt = null;
            record.position = length - 1;
          }
        }
        phase = "finished";
        endedAt = firstFinishAt;
      }
      return outcome();
    },
    outcome,
    /** Same settings and names, new questions, both footballs back at START. */
    restart() {
      round += 1;
      reset();
    }
  });
}
