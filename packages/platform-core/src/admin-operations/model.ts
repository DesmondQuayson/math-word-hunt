export const PLATFORM_FEATURE_FLAGS = [
  "maintenance-mode",
  "announcement-published",
  "checkout-emergency-disabled",
  "admin-emergency-disabled"
] as const;

export type PlatformFeatureFlag = (typeof PLATFORM_FEATURE_FLAGS)[number];

export type AdminAnalyticsRange = Readonly<{ from: string; to: string }>;

export type AdminFeatureFlagAction = Readonly<{
  flag: PlatformFeatureFlag;
  enabled: boolean;
  expectedVersion: number;
  message: string | null;
  reason: string;
}>;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CONTROL = /[\u0000-\u001f\u007f]/;

function dateOnly(value: unknown): Date | null {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value ? parsed : null;
}

export function parseAdminAnalyticsRange(input: Readonly<Record<string, unknown>>, now = new Date()): AdminAnalyticsRange | null {
  const defaultTo = now.toISOString().slice(0, 10);
  const defaultFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 29)).toISOString().slice(0, 10);
  const from = typeof input.from === "string" && input.from ? input.from : defaultFrom;
  const to = typeof input.to === "string" && input.to ? input.to : defaultTo;
  const start = dateOnly(from); const end = dateOnly(to);
  if (!start || !end || start > end || end.getTime() - start.getTime() > 366 * 86_400_000) return null;
  return Object.freeze({ from, to });
}

export function parseAdminFeatureFlagAction(input: Readonly<Record<string, unknown>>): AdminFeatureFlagAction | null {
  const flag = typeof input.flag === "string" && PLATFORM_FEATURE_FLAGS.includes(input.flag as PlatformFeatureFlag)
    ? input.flag as PlatformFeatureFlag : null;
  const enabled = input.enabled === "true" ? true : input.enabled === "false" ? false : null;
  const expectedVersion = typeof input.expectedVersion === "string" && /^[1-9]\d{0,9}$/.test(input.expectedVersion)
    ? Number(input.expectedVersion) : null;
  const reason = typeof input.reason === "string" ? input.reason.trim() : "";
  const messageValue = typeof input.message === "string" ? input.message.trim() : "";
  const message = messageValue || null;
  if (!flag || enabled === null || expectedVersion === null || reason.length < 3 || reason.length > 500 || CONTROL.test(reason)) return null;
  if (message && (message.length > 280 || CONTROL.test(message))) return null;
  if ((flag === "maintenance-mode" || flag === "announcement-published") && enabled && !message) return null;
  return Object.freeze({ flag, enabled, expectedVersion, message, reason });
}
