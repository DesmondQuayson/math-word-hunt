export const BILLING_PLAN_KEYS = [
  "free",
  "teacher-pro-monthly",
  "teacher-pro-annual",
  "mathnexa-monthly"
] as const;

export type BillingPlanKey = (typeof BILLING_PLAN_KEYS)[number];

const planKeys = new Set<string>(BILLING_PLAN_KEYS);

export function isBillingPlanKey(value: unknown): value is BillingPlanKey {
  return typeof value === "string" && planKeys.has(value);
}

export function parseBillingPlanKey(value: unknown): BillingPlanKey {
  if (!isBillingPlanKey(value)) throw new Error("Unknown billing plan key");
  return value;
}
