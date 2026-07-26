import { describe, expect, it } from "vitest";

import { FEATURE_KEYS, PRODUCT_KEYS } from "@math-vocabulary-hunt/platform-core";

import { getProductCatalogView } from "./catalog.js";
import { getPlatformAccess } from "./entitlements.js";
import { getTeacherSession } from "./identity.js";
import { getLegacyGameDestination } from "../legacy-game.js";

describe("platform-web adapters", () => {
  it("reads the product definition from platform-core", () => {
    const view = getProductCatalogView();
    expect(view.product.key).toBe(PRODUCT_KEYS[0]);
    expect(view.product.featureKeys).toEqual(FEATURE_KEYS);
  });

  it("returns only the anonymous teacher state", async () => {
    await expect(getTeacherSession()).resolves.toEqual({
      status: "anonymous",
      teacher: null,
      message: "Teacher accounts are not connected in this preview."
    });
  });

  it("denies product and premium feature access by default", async () => {
    const access = await getPlatformAccess();
    expect(access.productAccess).toBe(false);
    expect(access.features["premium-game-modes"]).toBe(false);
    expect(access.features["teacher-reporting"]).toBe(false);
    expect(access.source).toBe("default-deny");
  });

  it("falls back to the canonical repository path for unsafe values", () => {
    expect(getLegacyGameDestination("javascript:alert(1)")).toBe(
      "/docs/index.html"
    );
    expect(getLegacyGameDestination("//attacker.example/game")).toBe(
      "/docs/index.html"
    );
    expect(getLegacyGameDestination("https://example.test/game")).toBe(
      "https://example.test/game"
    );
  });
});
