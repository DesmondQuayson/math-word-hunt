import { DIFFICULTIES, migrateReasoningHistory } from "./game-engine.js";
import { STORAGE_KEYS } from "./storage-keys.js";

export const ENGAGEMENT_PROFILE_VERSION = 1;
export const ENGAGEMENT_PROFILE_KEY = STORAGE_KEYS.playerProfile;
export const MUSIC_TRACK = Object.freeze({
  title: "Determined Pursuit",
  author: "Emma_MA",
  license: "CC0",
  path: "./audio/music/determined-pursuit.mp3"
});

const difficultyOrder = Object.keys(DIFFICULTIES);
const finiteInteger = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.max(0, Math.floor(Number(value))) : fallback;
const clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));

export function migrateEngagementProfile(rawProfile) {
  const raw = rawProfile && typeof rawProfile === "object" && !Array.isArray(rawProfile) ? rawProfile : {};
  const declines = raw.declines && typeof raw.declines === "object" && !Array.isArray(raw.declines) ? raw.declines : {};
  return {
    version: ENGAGEMENT_PROFILE_VERSION,
    puzzleStreak: finiteInteger(raw.puzzleStreak),
    masterStreak: finiteInteger(raw.masterStreak),
    perfectStreak: finiteInteger(raw.perfectStreak),
    totalPerfect: finiteInteger(raw.totalPerfect),
    totalDoubleLogic: finiteInteger(raw.totalDoubleLogic),
    declines: Object.fromEntries(Object.entries(declines).flatMap(([key, value]) => {
      if (!value || typeof value !== "object") return [];
      return [[key, { relevantCount: finiteInteger(value.relevantCount) }]];
    }))
  };
}

export function updateEngagementProfile(rawProfile, { completed = false, score = 0, perfect = false, doubleLogicCount = 0 } = {}) {
  const profile = migrateEngagementProfile(rawProfile);
  if (!completed) return profile;
  const safeScore = clamp(finiteInteger(score), 0, 100);
  return {
    ...profile,
    puzzleStreak: profile.puzzleStreak + 1,
    masterStreak: safeScore >= 85 ? profile.masterStreak + 1 : 0,
    perfectStreak: perfect ? profile.perfectStreak + 1 : 0,
    totalPerfect: profile.totalPerfect + (perfect ? 1 : 0),
    totalDoubleLogic: profile.totalDoubleLogic + finiteInteger(doubleLogicCount)
  };
}

export function calculateDecisionEfficiencyPercent({ puzzle, decisions = 0, reveals = 0 } = {}) {
  const required = Math.max(1, Array.isArray(puzzle?.solution) ? puzzle.solution.flat().filter(active => !active).length : 1);
  const effective = Math.max(required, finiteInteger(decisions) + finiteInteger(reveals));
  return Math.round(clamp(required / effective * 100, 0, 100) * 10) / 10;
}

export function evaluatePerfectReasoning({ completed = false, puzzle, decisions = 0, reveals = 0, hintsUsed = 0, impossibleEvents = 0 } = {}) {
  const efficiencyPercent = calculateDecisionEfficiencyPercent({ puzzle, decisions, reveals });
  const qualifies = Boolean(completed)
    && finiteInteger(hintsUsed) === 0
    && finiteInteger(impossibleEvents) === 0
    && finiteInteger(reveals) === 0
    && efficiencyPercent >= 95;
  return { qualifies, efficiencyPercent };
}

export function detectDoubleLogic({ beforeRows = [], beforeColumns = [], afterRows = [], afterColumns = [], row = -1, column = -1, source = "manual" } = {}) {
  if (source !== "manual" || row < 0 || column < 0) return { triggered: false, rowSolved: false, columnSolved: false };
  const isCorrect = value => value === true || value === "correct";
  const rowSolved = !isCorrect(beforeRows[row]) && isCorrect(afterRows[row]);
  const columnSolved = !isCorrect(beforeColumns[column]) && isCorrect(afterColumns[column]);
  return { triggered: rowSolved && columnSolved, rowSolved, columnSolved };
}

function average(values) {
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function getAdaptiveRecommendation({ history = [], mode = "addition", difficulty = "easy", declines = {} } = {}) {
  const records = migrateReasoningHistory(history).filter(record => record.mode === mode && record.difficulty === difficulty);
  const recent = records.slice(-5).map(record => record.score);
  if (recent.length < 3) return null;
  const recentAverage = average(recent);
  const minimum = Math.min(...recent);
  const maximum = Math.max(...recent);
  const currentIndex = difficultyOrder.indexOf(difficulty);
  let direction = null;
  if (recentAverage >= 85 && minimum >= 78 && currentIndex < difficultyOrder.length - 1) direction = "harder";
  if (recentAverage < 55 && maximum <= 65 && currentIndex > 0) direction = "easier";
  if (!direction) return null;
  const key = `${mode}:${difficulty}:${direction}`;
  const declinedAt = finiteInteger(declines?.[key]?.relevantCount, -999);
  if (declinedAt >= 0 && records.length - declinedAt < 3) return null;
  const targetIndex = direction === "harder" ? currentIndex + 1 : currentIndex - 1;
  return {
    key,
    direction,
    fromDifficulty: difficulty,
    toDifficulty: difficultyOrder[targetIndex],
    recentScores: recent,
    average: Math.round(recentAverage * 10) / 10,
    relevantCount: records.length
  };
}
