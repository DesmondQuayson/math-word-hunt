import { BILLING_PLAN_KEYS, isBillingPlanKey, type BillingPlanKey } from "../billing/plan-keys";
import { CAPABILITY_REGISTRY } from "./registry";
import type { CapabilityKey } from "./keys";

export type ProductPackage = Readonly<{
  planKey: BillingPlanKey;
  displayName: string;
  activeClassLimit: number;
  activeActivityLimit: number;
  capabilityKeys: readonly CapabilityKey[];
}>;

export const PRODUCT_PACKAGES: readonly ProductPackage[] = Object.freeze(BILLING_PLAN_KEYS.map((planKey) => Object.freeze({
  planKey,
  displayName: planKey === "free" ? "Free" : planKey === "teacher-pro-monthly" ? "Teacher Pro Monthly" : "Teacher Pro Annual",
  activeClassLimit: planKey === "free" ? 2 : 25,
  activeActivityLimit: planKey === "free" ? 3 : 100,
  capabilityKeys: Object.freeze(CAPABILITY_REGISTRY.filter((definition) => (planKey === "free" ? definition.free : definition.pro) === "included").map((definition) => definition.key))
})));

export function getProductPackage(planKey: unknown): ProductPackage | null {
  if (!isBillingPlanKey(planKey)) return null;
  return PRODUCT_PACKAGES.find((item) => item.planKey === planKey) ?? null;
}
