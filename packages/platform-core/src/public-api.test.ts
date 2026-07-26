import { describe, expect, it } from "vitest";

import * as platformCore from "./index.js";

describe("platform-core public API", () => {
  it("exposes the intentional runtime contract surface", () => {
    expect(Object.keys(platformCore).sort()).toEqual([
      "FEATURE_KEYS",
      "PRODUCT_CATALOG",
      "PRODUCT_KEYS",
      "assertUniqueKeys",
      "createEntitlementPolicy",
      "defineProductCatalog",
      "isFeatureKey",
      "isProductKey",
      "parseEntitlement",
      "parseFeatureKey",
      "parseProductKey",
      "parseUserId"
    ]);
  });

  it("preserves default-deny guards through the package entry point", () => {
    expect(platformCore.isProductKey("math-vocabulary-hunt")).toBe(true);
    expect(platformCore.isProductKey("premium=true")).toBe(false);
    expect(platformCore.isFeatureKey("premium-game-modes")).toBe(true);
    expect(platformCore.isFeatureKey("everything")).toBe(false);
  });
});
