export const CAPABILITY_KEYS = [
  "game.launch.canonical",
  "curriculum.view",
  "teacher.preview",
  "class.view",
  "class.create",
  "class.edit",
  "class.archive",
  "activity.view",
  "activity.create",
  "activity.edit",
  "activity.archive",
  "activity.attach_to_class",
  "account.manage",
  "billing.checkout",
  "billing.portal",
  "managed_session.view_placeholder",
  "managed_session.create",
  "report.view_placeholder"
] as const;

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number];

const capabilityKeys = new Set<string>(CAPABILITY_KEYS);

export function isCapabilityKey(value: unknown): value is CapabilityKey {
  return typeof value === "string" && capabilityKeys.has(value);
}

export function parseCapabilityKey(value: unknown): CapabilityKey {
  if (!isCapabilityKey(value)) throw new Error("Unknown capability key");
  return value;
}
