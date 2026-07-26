import { describe, expect, it } from "vitest";

import {
  FEATURE_KEYS,
  isFeatureKey,
  parseFeatureKey
} from "./feature-keys.js";
import {
  PRODUCT_KEYS,
  isProductKey,
  parseProductKey
} from "./product-keys.js";
import {
  PRODUCT_CATALOG,
  assertUniqueKeys,
  defineProductCatalog,
  type ProductDefinition
} from "./types.js";

describe("platform catalog", () => {
  it("registers the stable Math Vocabulary Hunt product key", () => {
    expect(PRODUCT_KEYS).toEqual(["math-vocabulary-hunt"]);
    expect(PRODUCT_CATALOG).toHaveLength(1);
    expect(PRODUCT_CATALOG[0]?.key).toBe("math-vocabulary-hunt");
  });

  it("registers the approved feature keys", () => {
    expect(FEATURE_KEYS).toEqual([
      "basic-play",
      "limited-content",
      "complete-library",
      "classroom-tools",
      "teacher-reporting",
      "premium-game-modes"
    ]);
    expect(PRODUCT_CATALOG[0]?.featureKeys).toEqual(FEATURE_KEYS);
  });

  it("rejects duplicate product and feature keys", () => {
    expect(() => assertUniqueKeys(["one", "one"], "test")).toThrow(
      "Duplicate test key"
    );

    const product = PRODUCT_CATALOG[0] as ProductDefinition;
    expect(() => defineProductCatalog([product, product])).toThrow(
      "Duplicate product key"
    );
    expect(() =>
      defineProductCatalog([
        {
          ...product,
          featureKeys: [FEATURE_KEYS[0], FEATURE_KEYS[0]]
        }
      ])
    ).toThrow("Duplicate feature key");
  });

  it("uses default-deny parsing for unknown keys", () => {
    expect(isProductKey("another-product")).toBe(false);
    expect(isFeatureKey("paid=true")).toBe(false);
    expect(() => parseProductKey("another-product")).toThrow(
      "Unknown product key"
    );
    expect(() => parseFeatureKey("paid=true")).toThrow(
      "Unknown feature key"
    );
  });
});
