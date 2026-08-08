export const STORAGE_NAMESPACE = "mathnexa:number-cross";

export const STORAGE_KEYS = Object.freeze({
  preferences: `${STORAGE_NAMESPACE}:preferences`,
  playerProfile: `${STORAGE_NAMESPACE}:player-profile:v1`,
  reasoningHistory: `${STORAGE_NAMESPACE}:reasoning-history:v2`,
  tutorialComplete: `${STORAGE_NAMESPACE}:tutorial-complete`
});

export const LEGACY_STORAGE_KEYS = Object.freeze({
  preferences: Object.freeze(["number-cross-preferences"]),
  playerProfile: Object.freeze(["number-cross-player-profile-v1"]),
  reasoningHistory: Object.freeze(["number-cross-reasoning-history-v2", "number-cross-reasoning-history"]),
  tutorialComplete: Object.freeze(["number-cross-tutorial-complete"])
});

export const bestTimeKey = (mode, difficulty) => `${STORAGE_NAMESPACE}:best:${mode}:${difficulty}`;
export const legacyBestTimeKey = (mode, difficulty) => `number-cross-best:${mode}:${difficulty}`;
