// Math Bingo Live game settings: the one definition shared by the host
// screen (what can be chosen), the server (what is accepted) and the tests.
// The database functions repeat the timing constants below; the engine tests
// read the migration and fail if the two ever disagree.

export const MODES = Object.freeze([
  Object.freeze({
    id: "addition", label: "Addition", symbol: "+",
    levels: Object.freeze([
      Object.freeze({ id: "facts-10", label: "Facts to 10" }),
      Object.freeze({ id: "facts-20", label: "Facts to 20" }),
      Object.freeze({ id: "within-50", label: "Within 50" }),
      Object.freeze({ id: "within-100", label: "Within 100" })
    ])
  }),
  Object.freeze({
    id: "subtraction", label: "Subtraction", symbol: "−",
    levels: Object.freeze([
      Object.freeze({ id: "facts-10", label: "Facts to 10" }),
      Object.freeze({ id: "facts-20", label: "Facts to 20" }),
      Object.freeze({ id: "within-50", label: "Within 50" }),
      Object.freeze({ id: "within-100", label: "Within 100" })
    ])
  }),
  Object.freeze({
    id: "multiplication", label: "Multiplication", symbol: "×",
    levels: Object.freeze([
      Object.freeze({ id: "x0-5", label: "×0–5" }),
      Object.freeze({ id: "x0-10", label: "×0–10" }),
      Object.freeze({ id: "x0-12", label: "×0–12" }),
      Object.freeze({ id: "mixed-facts", label: "Mixed facts" })
    ])
  }),
  Object.freeze({
    id: "division", label: "Division", symbol: "÷",
    levels: Object.freeze([
      Object.freeze({ id: "facts-5", label: "Facts to 5" }),
      Object.freeze({ id: "facts-10", label: "Facts to 10" }),
      Object.freeze({ id: "facts-12", label: "Facts to 12" })
    ])
  }),
  Object.freeze({
    id: "mixed", label: "Mixed Operations", symbol: "±",
    levels: Object.freeze([
      Object.freeze({ id: "starter", label: "Starter", hint: "+ − to 10 · × ÷ to 5" }),
      Object.freeze({ id: "core", label: "Core", hint: "+ − to 20 · × ÷ to 10" }),
      Object.freeze({ id: "challenge", label: "Challenge", hint: "+ − within 100 · × ÷ to 12" })
    ])
  }),
  Object.freeze({
    id: "fractions", label: "Fraction Bingo", symbol: "½",
    levels: Object.freeze([
      Object.freeze({ id: "to-fifths", label: "Halves to fifths" }),
      Object.freeze({ id: "to-sixths", label: "Halves to sixths" }),
      Object.freeze({ id: "to-eighths", label: "Halves to eighths" }),
      Object.freeze({ id: "to-tenths", label: "Halves to tenths" }),
      Object.freeze({ id: "to-twelfths", label: "Halves to twelfths" })
    ])
  })
]);

export const QUESTION_SECONDS = Object.freeze([5, 10, 15, 20, 30, 45, 60, 0]);
export const REVEAL_SECONDS = Object.freeze([2, 3, 5, 0]);
export const AUDIO_TARGETS = Object.freeze(["host", "all", "off"]);

export const MAX_PARTICIPANTS = 60;
/**
 * A winner target is any whole number from 1 to 60. There is no preset list
 * and no limit from the level's questions; 60 is the room's player capacity,
 * the most winners any room can have. A room with fewer players than its
 * target ends when every player has Bingo.
 */
export const MIN_WINNERS = 1;
export const MAX_WINNERS = MAX_PARTICIPANTS;
export const NAME_MIN = 2;
export const NAME_MAX = 20;
/** Wrong taps allowed per question before the card locks until the next one. */
export const ATTEMPTS_PER_QUESTION = 2;
export const COUNTDOWN_SECONDS = 3;
export const LEADERBOARD_SECONDS = 3;
export const WINNER_REVEAL_SECONDS = 5;
/** Full passes over the answer pool before the deck runs out. */
export const DECK_PASSES = 3;

export const DEFAULT_SETTINGS = Object.freeze({
  mode: "addition",
  level: "facts-10",
  questionSeconds: 15,
  revealSeconds: 3,
  patterns: Object.freeze({ rows: true, columns: true, diagonals: true }),
  winners: 3,
  freeSpace: true,
  music: "host",
  celebration: "host",
  equivalentFractions: false
});

export function getMode(modeId) {
  return MODES.find(mode => mode.id === modeId) ?? null;
}

export function getLevel(modeId, levelId) {
  return getMode(modeId)?.levels.find(level => level.id === levelId) ?? null;
}

const isBoolean = value => typeof value === "boolean";

/**
 * Validate a settings object exactly. Anything unknown, missing or out of
 * range is refused (never silently replaced), so the host sees the error.
 * `legacyWinners`: the settings a room stored before winner targets (its
 * "everyone" is 0) are read as they are, so such a room can still play again;
 * new settings never accept 0.
 */
export function normalizeSettings(raw, { legacyWinners = false } = {}) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ok: false, error: "invalid-settings" };
  const mode = getMode(raw.mode);
  if (!mode) return { ok: false, error: "invalid-mode" };
  if (!getLevel(mode.id, raw.level)) return { ok: false, error: "invalid-level" };
  if (!QUESTION_SECONDS.includes(raw.questionSeconds)) return { ok: false, error: "invalid-question-seconds" };
  if (!REVEAL_SECONDS.includes(raw.revealSeconds)) return { ok: false, error: "invalid-reveal-seconds" };
  const patterns = raw.patterns;
  if (!patterns || typeof patterns !== "object" || !isBoolean(patterns.rows) || !isBoolean(patterns.columns) || !isBoolean(patterns.diagonals)) {
    return { ok: false, error: "invalid-patterns" };
  }
  if (!patterns.rows && !patterns.columns && !patterns.diagonals) return { ok: false, error: "pattern-required" };
  const winnersOk = Number.isInteger(raw.winners) && raw.winners >= MIN_WINNERS && raw.winners <= MAX_WINNERS;
  if (!winnersOk && !(legacyWinners && raw.winners === 0)) return { ok: false, error: "invalid-winners" };
  if (!isBoolean(raw.freeSpace) || !isBoolean(raw.equivalentFractions)) return { ok: false, error: "invalid-settings" };
  if (!AUDIO_TARGETS.includes(raw.music) || !AUDIO_TARGETS.includes(raw.celebration)) return { ok: false, error: "invalid-audio" };
  return {
    ok: true,
    settings: Object.freeze({
      mode: mode.id,
      level: raw.level,
      questionSeconds: raw.questionSeconds,
      revealSeconds: raw.revealSeconds,
      patterns: Object.freeze({ rows: patterns.rows, columns: patterns.columns, diagonals: patterns.diagonals }),
      winners: raw.winners,
      freeSpace: raw.freeSpace,
      music: raw.music,
      celebration: raw.celebration,
      // Equivalent fractions only mean something in Fraction Bingo.
      equivalentFractions: mode.id === "fractions" ? raw.equivalentFractions : false
    })
  };
}

const NAME_ALLOWED = /^[\p{L}\p{M}\p{N} .'’_-]+$/u;

/**
 * A display name for one game: trimmed, inner spaces collapsed, 2-20
 * characters of letters, numbers, spaces and . ' - _. Names are shown with
 * textContent only, so this is about readability, not about escaping.
 */
export function sanitizeDisplayName(raw) {
  if (typeof raw !== "string") return { ok: false, error: "name-required" };
  const name = raw.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, "").replace(/\s+/gu, " ").trim();
  if (!name) return { ok: false, error: "name-required" };
  const length = [...name].length;
  if (length < NAME_MIN) return { ok: false, error: "name-too-short" };
  if (length > NAME_MAX) return { ok: false, error: "name-too-long" };
  if (!NAME_ALLOWED.test(name)) return { ok: false, error: "name-invalid" };
  return { ok: true, name };
}
