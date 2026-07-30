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
export { CAPABILITY_KEYS, isCapabilityKey, parseCapabilityKey, type CapabilityKey } from "./capabilities/keys";
export {
  CAPABILITIES_BY_KEY,
  CAPABILITY_REGISTRY,
  defineCapabilityRegistry,
  parseCapabilityDefinition,
  type CapabilityAllowance,
  type CapabilityAvailability,
  type CapabilityCategory,
  type CapabilityDefinition,
  type CapabilityLifecycle,
  type UsageLimitUnit
} from "./capabilities/registry";
export {
  CAPABILITY_DECISION_REASONS,
  decideCapability,
  type CapabilityDecision,
  type CapabilityDecisionInput,
  type CapabilityDecisionReason,
  type CapabilityEntitlementState
} from "./capabilities/authorization";
export { PRODUCT_PACKAGES, getProductPackage, type ProductPackage } from "./capabilities/packaging";
export { PLATFORM_ENVIRONMENTS, parseEnvironmentRegistry, type PlatformEnvironment, type EnvironmentRegistry, type EnvironmentInput } from "./environment/registry";
export { DELETION_STATES, canTransitionDeletion, planDeletion, type DeletionState, type DeletionPlan } from "./deletion/lifecycle";
export { OBSERVABILITY_CATEGORIES, createSafeEvent, type ObservabilityCategory, type SafeEvent } from "./observability/events";
export { renderEmailTemplate, type EmailTemplate, type EmailTemplateKey } from "./email/templates";
export {
  AUTH_EMAIL_DELIVERY_STATES,
  isTransactionalAuthEmailVerified,
  parseAuthEmailDeliveryState,
  type AuthEmailDeliveryState
} from "./email/delivery-state";
export {
  PILOT_CHECKLIST_KEYS,
  PILOT_READINESS_STATES,
  createEmptyPilotChecklist,
  evaluatePilotPolicy,
  evaluatePilotReadiness,
  type PilotChecklist,
  type PilotChecklistKey,
  type PilotPolicy,
  type PilotPolicyInput,
  type PilotReadinessEvaluation,
  type PilotReadinessState
} from "./pilot/policy";
export { createSyntheticPilotFixture, verifySyntheticFixtureCleanup, type SyntheticFixtureCounts, type SyntheticPilotFixture } from "./pilot/fixtures";
export { PILOT_EVENT_CODES, createPilotEvent, parsePilotCorrelationId, type PilotEnvironmentClass, type PilotEventCode, type PilotRouteCategory } from "./pilot/operations";
export {
  CONTROLLED_PILOT_STATES,
  PILOT_ACTIVATION_PREREQUISITES,
  createIncompletePilotPrerequisites,
  evaluatePilotActivation,
  type ControlledPilotState,
  type PilotActivationInput,
  type PilotActivationPolicy,
  type PilotActivationPrerequisite,
  type PilotActivationPrerequisites,
  type PilotPrerequisiteState
} from "./pilot/activation";
