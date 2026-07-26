export const FEATURE_KEYS = [
  "basic-play",
  "limited-content",
  "complete-library",
  "classroom-tools",
  "teacher-reporting",
  "premium-game-modes"
] as const;

export type FeatureKey = (typeof FEATURE_KEYS)[number];

const featureKeySet = new Set<string>(FEATURE_KEYS);

export function isFeatureKey(value: unknown): value is FeatureKey {
  return typeof value === "string" && featureKeySet.has(value);
}

export function parseFeatureKey(value: unknown): FeatureKey {
  if (!isFeatureKey(value)) {
    throw new Error("Unknown feature key");
  }
  return value;
}
