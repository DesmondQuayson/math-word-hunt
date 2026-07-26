import {
  FEATURE_KEYS,
  isFeatureKey,
  type FeatureKey
} from "./feature-keys";
import {
  isProductKey,
  PRODUCT_KEYS,
  type ProductKey
} from "./product-keys";

export type ProductDefinition = Readonly<{
  key: ProductKey;
  displayName: string;
  featureKeys: readonly FeatureKey[];
}>;

export function assertUniqueKeys(
  keys: readonly string[],
  label: string
): void {
  const seen = new Set<string>();
  for (const key of keys) {
    if (seen.has(key)) {
      throw new Error("Duplicate " + label + " key: " + key);
    }
    seen.add(key);
  }
}

export function defineProductCatalog(
  definitions: readonly ProductDefinition[]
): readonly ProductDefinition[] {
  assertUniqueKeys(
    definitions.map((definition) => definition.key),
    "product"
  );

  return Object.freeze(
    definitions.map((definition) => {
      if (!isProductKey(definition.key)) {
        throw new Error("Unknown product key in catalog");
      }
      assertUniqueKeys(definition.featureKeys, "feature");
      if (!definition.featureKeys.every(isFeatureKey)) {
        throw new Error(
          "Unknown feature key for product: " + definition.key
        );
      }
      return Object.freeze({
        ...definition,
        featureKeys: Object.freeze([...definition.featureKeys])
      });
    })
  );
}

export const PRODUCT_CATALOG = defineProductCatalog([
  {
    key: PRODUCT_KEYS[0],
    displayName: "Math Vocabulary Hunt",
    featureKeys: FEATURE_KEYS
  }
]);
