import { STORAGE_KEYS } from "./storage-keys.js";

export const PREFERENCES_KEY = STORAGE_KEYS.preferences;

export const DEFAULT_PREFERENCES = Object.freeze({
  sound: true,
  music: false,
  soundVolume: 0.55,
  musicVolume: 0.24
});

export function parseStoredJson(serializedValue, fallback) {
  if (serializedValue === null || serializedValue === undefined) return fallback;
  try {
    return JSON.parse(serializedValue) ?? fallback;
  } catch {
    return fallback;
  }
}

const finiteVolume = (value, fallback, maximum) => {
  if (value === null || typeof value === "boolean" || (typeof value === "string" && value.trim() === "")) return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(maximum, Math.max(0, number)) : fallback;
};

export function migratePreferences(rawPreferences) {
  const raw = rawPreferences && typeof rawPreferences === "object" && !Array.isArray(rawPreferences)
    ? rawPreferences
    : {};
  return {
    sound: typeof raw.sound === "boolean" ? raw.sound : DEFAULT_PREFERENCES.sound,
    music: typeof raw.music === "boolean" ? raw.music : DEFAULT_PREFERENCES.music,
    soundVolume: finiteVolume(raw.soundVolume, DEFAULT_PREFERENCES.soundVolume, 1),
    musicVolume: finiteVolume(raw.musicVolume, DEFAULT_PREFERENCES.musicVolume, 0.35)
  };
}
