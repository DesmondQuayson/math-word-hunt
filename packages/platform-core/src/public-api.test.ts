import { describe, expect, it } from "vitest";

import * as platformCore from "./index.js";

describe("platform-core public API", () => {
  it("exposes the intentional runtime contract surface", () => {
    expect(Object.keys(platformCore).sort()).toEqual([
      "BILLING_CATALOG",
      "BILLING_PLAN_KEYS",
      "BILLING_SUBSCRIPTION_STATUSES",
      "BILLING_UI_COPY",
      "BILLING_UI_STATES",
      "CAPABILITIES_BY_KEY",
      "CAPABILITY_DECISION_REASONS",
      "CAPABILITY_KEYS",
      "CAPABILITY_REGISTRY",
      "CLASS_GRADES",
      "CURRICULUM_STATUSES",
      "FEATURE_KEYS",
      "PRODUCT_CATALOG",
      "PRODUCT_KEYS",
      "PRODUCT_PACKAGES",
      "SESSION_STATUSES",
      "assertUniqueKeys",
      "createEntitlementPolicy",
      "decideCapability",
      "defineBillingCatalog",
      "defineCapabilityRegistry",
      "defineProductCatalog",
      "denyTeacherOperation",
      "deriveBillingEntitlement",
      "getProductPackage",
      "isBillingPlanKey",
      "isCapabilityKey",
      "isFeatureKey",
      "isProductKey",
      "normalizeBillingSubscriptionStatus",
      "parseActivityDefinition",
      "parseAggregateReport",
      "parseBillingPlanKey",
      "parseCapabilityDefinition",
      "parseCapabilityKey",
      "parseClassRecord",
      "parseCurriculumSummary",
      "parseEntitlement",
      "parseFeatureKey",
      "parseProductKey",
      "parseSessionRecord",
      "parseTeacherDashboard",
      "parseTeacherProfile",
      "parseUserId",
      "teacherFailure",
      "teacherSuccess"
    ]);
  });

  it("preserves default-deny guards through the package entry point", () => {
    expect(platformCore.isProductKey("math-vocabulary-hunt")).toBe(true);
    expect(platformCore.isProductKey("premium=true")).toBe(false);
    expect(platformCore.isFeatureKey("premium-game-modes")).toBe(true);
    expect(platformCore.isFeatureKey("everything")).toBe(false);
  });
});
