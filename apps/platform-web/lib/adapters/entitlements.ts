import {
  FEATURE_KEYS,
  PRODUCT_KEYS,
  createEntitlementPolicy,
  parseUserId,
  type FeatureKey
} from "@math-vocabulary-hunt/platform-core";

export type PlatformAccessView = Readonly<{
  productAccess: boolean;
  features: Readonly<Record<FeatureKey, boolean>>;
  source: "default-deny";
}>;

const anonymousUserId = parseUserId("anonymous-platform-preview");
const productionPolicy = createEntitlementPolicy({
  async getUserEntitlements() {
    return [];
  }
});

export async function getPlatformAccess(): Promise<PlatformAccessView> {
  const summary = await productionPolicy.getUserAccessSummary(
    anonymousUserId,
    PRODUCT_KEYS[0]
  );
  const features = Object.fromEntries(
    FEATURE_KEYS.map((featureKey) => [featureKey, false])
  ) as Record<FeatureKey, boolean>;

  return Object.freeze({
    productAccess: summary?.productAccess ?? false,
    features: Object.freeze(features),
    source: "default-deny"
  });
}
