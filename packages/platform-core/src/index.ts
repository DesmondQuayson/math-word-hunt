export {
  FEATURE_KEYS,
  isFeatureKey,
  parseFeatureKey,
  type FeatureKey
} from "./catalog/feature-keys";
export {
  PRODUCT_KEYS,
  isProductKey,
  parseProductKey,
  type ProductKey
} from "./catalog/product-keys";
export {
  PRODUCT_CATALOG,
  assertUniqueKeys,
  defineProductCatalog,
  type ProductDefinition
} from "./catalog/types";
export {
  createEntitlementPolicy,
  parseEntitlement
} from "./entitlements/policy";
export type {
  Entitlement,
  EntitlementService,
  EntitlementSource,
  EntitlementSourceReader,
  EntitlementStatus,
  FeatureEntitlement,
  ProductEntitlement,
  UserAccessSummary
} from "./entitlements/types";
export {
  parseUserId,
  type AccountStatus,
  type PlatformRole,
  type TeacherProfile,
  type UserId
} from "./identity/types";
export * from "./teacher/index";
export { BILLING_PLAN_KEYS, isBillingPlanKey, parseBillingPlanKey, type BillingPlanKey } from "./billing/plan-keys";
export { BILLING_CATALOG, defineBillingCatalog, type BillingInterval, type BillingPlanDefinition, type BillingPricingStatus } from "./billing/catalog";
export { BILLING_SUBSCRIPTION_STATUSES, deriveBillingEntitlement, normalizeBillingSubscriptionStatus, type BillingEntitlementDecision, type BillingEntitlementInput, type BillingSubscriptionStatus } from "./billing/subscription-state";
export { BILLING_UI_COPY, BILLING_UI_STATES, type BillingUiCopy, type BillingUiState } from "./billing/ui-state";
