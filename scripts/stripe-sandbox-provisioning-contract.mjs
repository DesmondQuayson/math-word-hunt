export const STRIPE_SANDBOX_METADATA = Object.freeze({
  application: "mathnexa",
  environment: "sandbox",
  phase: "7c"
});

export const LEGACY_STRIPE_SANDBOX_METADATA = Object.freeze({
  mathnexa_internal_product: "game-subscription",
  mathnexa_environment: "test"
});

export const STRIPE_SANDBOX_PRODUCT_NAME = "MathNexa";
export const STRIPE_SANDBOX_LEGACY_PRODUCT_NAME = "MathNexa (Test)";
export const STRIPE_SANDBOX_MONTHLY_LOOKUP_KEY = "mathnexa_monthly_usd_599";
export const STRIPE_SANDBOX_LEGACY_MONTHLY_LOOKUP_KEY = "mathnexa_monthly_test_v1";
export const STRIPE_SANDBOX_MONTHLY_AMOUNT = 599;

const CANCELLATION_REASONS = Object.freeze([
  "too_expensive",
  "missing_features",
  "unused",
  "other"
]);

export function hasCanonicalSandboxMetadata(resource) {
  return Object.entries(STRIPE_SANDBOX_METADATA).every(
    ([key, value]) => resource?.metadata?.[key] === value
  );
}

export function hasLegacySandboxMetadata(resource) {
  return Object.entries(LEGACY_STRIPE_SANDBOX_METADATA).every(
    ([key, value]) => resource?.metadata?.[key] === value
  );
}

export function isOwnedSandboxResource(resource) {
  return hasCanonicalSandboxMetadata(resource) || hasLegacySandboxMetadata(resource);
}

export function requireSingleCandidate(resources, label) {
  const unique = [...new Map(resources.map((resource) => [resource.id, resource])).values()];
  if (unique.length > 1) {
    throw new Error(`Conflicting duplicate MathNexa Sandbox ${label} resources: ${unique.map(({ id }) => id).join(", ")}`);
  }
  return unique[0] ?? null;
}

export function isMonthlyPriceContract(price, productId) {
  return Boolean(
    price &&
    !price.livemode &&
    price.active &&
    price.currency === "usd" &&
    price.unit_amount === STRIPE_SANDBOX_MONTHLY_AMOUNT &&
    price.recurring?.interval === "month" &&
    price.recurring?.interval_count === 1 &&
    price.recurring?.usage_type === "licensed" &&
    price.product === productId
  );
}

export function buildPortalConfigurationPayload() {
  return {
    business_profile: { headline: "MathNexa billing" },
    features: {
      customer_update: { enabled: false },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
        proration_behavior: "none",
        cancellation_reason: {
          enabled: true,
          options: [...CANCELLATION_REASONS]
        }
      },
      subscription_update: { enabled: false }
    },
    metadata: { ...STRIPE_SANDBOX_METADATA }
  };
}

export function portalConfigurationMatchesContract(portal) {
  const cancellation = portal?.features?.subscription_cancel;
  const actualReasons = cancellation?.cancellation_reason?.options ?? [];
  return Boolean(
    portal &&
    !portal.livemode &&
    portal.active &&
    portal.features?.invoice_history?.enabled &&
    portal.features?.payment_method_update?.enabled &&
    cancellation?.enabled &&
    cancellation.mode === "at_period_end" &&
    cancellation.proration_behavior === "none" &&
    cancellation.cancellation_reason?.enabled &&
    CANCELLATION_REASONS.length === actualReasons.length &&
    CANCELLATION_REASONS.every((reason) => actualReasons.includes(reason)) &&
    portal.features?.subscription_update?.enabled === false
  );
}

export function findEmptyArrays(value, path = "payload") {
  if (Array.isArray(value)) {
    if (value.length === 0) return [path];
    return value.flatMap((item, index) => findEmptyArrays(item, `${path}[${index}]`));
  }
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => findEmptyArrays(child, `${path}.${key}`));
}
