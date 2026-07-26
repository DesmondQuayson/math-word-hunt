import type { FeatureKey } from "../catalog/feature-keys";
import { PRODUCT_KEYS, type ProductKey } from "../catalog/product-keys";
import { assertUniqueKeys } from "../catalog/types";
import { BILLING_PLAN_KEYS, type BillingPlanKey } from "./plan-keys";

export type BillingInterval = "none" | "month" | "year";
export type BillingPricingStatus = "free" | "owner-decision-required";

export type BillingPlanDefinition = Readonly<{
  key: BillingPlanKey;
  productKey: ProductKey;
  displayName: string;
  interval: BillingInterval;
  currency: string | null;
  amountMinorUnits: number | null;
  pricingStatus: BillingPricingStatus;
  lifecycle: "proposed" | "active" | "retired";
  featureKeys: readonly FeatureKey[];
}>;

export function defineBillingCatalog(definitions: readonly BillingPlanDefinition[]): readonly BillingPlanDefinition[] {
  assertUniqueKeys(definitions.map((definition) => definition.key), "billing plan");
  for (const definition of definitions) {
    if (!BILLING_PLAN_KEYS.includes(definition.key)) throw new Error("Unknown billing plan key in catalog");
    if (definition.key === "free" && (definition.interval !== "none" || definition.amountMinorUnits !== 0)) {
      throw new Error("Free plan must not define a recurring charge");
    }
    if (definition.key !== "free" && (definition.amountMinorUnits !== null || definition.currency !== null)) {
      throw new Error("Paid pricing is not owner-approved");
    }
    assertUniqueKeys(definition.featureKeys, "billing feature");
  }
  return Object.freeze(definitions.map((definition) => Object.freeze({
    ...definition,
    featureKeys: Object.freeze([...definition.featureKeys])
  })));
}

export const BILLING_CATALOG = defineBillingCatalog([
  {
    key: "free",
    productKey: PRODUCT_KEYS[0],
    displayName: "Free",
    interval: "none",
    currency: null,
    amountMinorUnits: 0,
    pricingStatus: "free",
    lifecycle: "proposed",
    featureKeys: ["basic-play", "limited-content"]
  },
  {
    key: "teacher-pro-monthly",
    productKey: PRODUCT_KEYS[0],
    displayName: "Teacher Pro Monthly",
    interval: "month",
    currency: null,
    amountMinorUnits: null,
    pricingStatus: "owner-decision-required",
    lifecycle: "proposed",
    featureKeys: ["basic-play", "limited-content", "complete-library", "classroom-tools", "premium-game-modes"]
  },
  {
    key: "teacher-pro-annual",
    productKey: PRODUCT_KEYS[0],
    displayName: "Teacher Pro Annual",
    interval: "year",
    currency: null,
    amountMinorUnits: null,
    pricingStatus: "owner-decision-required",
    lifecycle: "proposed",
    featureKeys: ["basic-play", "limited-content", "complete-library", "classroom-tools", "premium-game-modes"]
  }
]);
