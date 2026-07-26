import { describe, expect, it } from "vitest";

import { FEATURE_KEYS } from "../catalog/feature-keys.js";
import { PRODUCT_KEYS } from "../catalog/product-keys.js";
import { parseUserId } from "../identity/types.js";
import { createEntitlementPolicy, parseEntitlement } from "./policy.js";
import type {
  Entitlement,
  EntitlementSourceReader
} from "./types.js";

const USER_ID = parseUserId("teacher-123");
const PRODUCT_KEY = PRODUCT_KEYS[0];
const FEATURE_KEY = FEATURE_KEYS[0];
const NOW = new Date("2026-07-26T12:00:00.000Z");

function entitlement(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: "entitlement-1",
    userId: USER_ID,
    productKey: PRODUCT_KEY,
    scope: "product",
    featureKey: null,
    status: "active",
    source: "manual",
    startsAt: "2026-01-01T00:00:00.000Z",
    expiresAt: null,
    ...overrides
  };
}

function serviceFor(records: readonly unknown[]) {
  const reader: EntitlementSourceReader = {
    async getUserEntitlements() {
      return records;
    }
  };
  return createEntitlementPolicy(reader, () => NOW);
}

describe("entitlement policy", () => {
  it("grants active product access without implicitly granting features", async () => {
    const service = serviceFor([entitlement()]);
    await expect(
      service.canAccessProduct(USER_ID, PRODUCT_KEY)
    ).resolves.toBe(true);
    await expect(
      service.canAccessFeature(USER_ID, PRODUCT_KEY, FEATURE_KEY)
    ).resolves.toBe(false);
  });

  it("grants a specifically entitled feature and product access", async () => {
    const service = serviceFor([
      entitlement({ scope: "feature", featureKey: FEATURE_KEY })
    ]);
    await expect(
      service.canAccessFeature(USER_ID, PRODUCT_KEY, FEATURE_KEY)
    ).resolves.toBe(true);
    await expect(
      service.canAccessProduct(USER_ID, PRODUCT_KEY)
    ).resolves.toBe(true);
  });

  it("denies expired entitlements", async () => {
    const service = serviceFor([
      entitlement({ expiresAt: "2026-07-25T12:00:00.000Z" })
    ]);
    await expect(
      service.canAccessProduct(USER_ID, PRODUCT_KEY)
    ).resolves.toBe(false);
  });

  it("denies revoked entitlements", async () => {
    const service = serviceFor([entitlement({ status: "revoked" })]);
    await expect(
      service.canAccessProduct(USER_ID, PRODUCT_KEY)
    ).resolves.toBe(false);
  });

  it("denies unknown products and features", async () => {
    const service = serviceFor([entitlement()]);
    await expect(
      service.canAccessProduct(USER_ID, "unknown-product")
    ).resolves.toBe(false);
    await expect(
      service.canAccessFeature(USER_ID, PRODUCT_KEY, "unknown-feature")
    ).resolves.toBe(false);
    await expect(
      service.getUserAccessSummary(USER_ID, "unknown-product")
    ).resolves.toBeNull();
  });

  it("ignores malformed records safely", async () => {
    const malformed = [
      null,
      {},
      entitlement({ id: "" }),
      entitlement({ source: "browser" as Entitlement["source"] }),
      entitlement({ startsAt: "not-a-date" }),
      entitlement({ expiresAt: "2025-01-01T00:00:00.000Z" }),
      entitlement({ scope: "product", featureKey: FEATURE_KEY })
    ];
    expect(malformed.map(parseEntitlement)).toEqual(
      malformed.map(() => null)
    );
    await expect(
      serviceFor(malformed).canAccessProduct(USER_ID, PRODUCT_KEY)
    ).resolves.toBe(false);
  });

  it("does not treat browser-controlled values as authority", async () => {
    const browserHints = {
      productKey: PRODUCT_KEY,
      featureKey: FEATURE_KEY,
      paid: true,
      paymentSuccess: true,
      cookie: "entitled=true",
      localStorage: { access: "premium" },
      query: "?paid=true"
    };
    const service = serviceFor([browserHints]);
    await expect(
      service.canAccessProduct(USER_ID, PRODUCT_KEY)
    ).resolves.toBe(false);
    await expect(
      service.canAccessFeature(USER_ID, PRODUCT_KEY, FEATURE_KEY)
    ).resolves.toBe(false);
  });

  it("returns a complete default-deny access summary", async () => {
    const service = serviceFor([
      entitlement({
        scope: "feature",
        featureKey: FEATURE_KEYS[2]
      })
    ]);
    const summary = await service.getUserAccessSummary(
      USER_ID,
      PRODUCT_KEY
    );
    expect(summary).toMatchObject({
      userId: USER_ID,
      productKey: PRODUCT_KEY,
      productAccess: true,
      evaluatedAt: NOW.toISOString()
    });
    expect(summary?.features[FEATURE_KEYS[2]]).toBe(true);
    expect(summary?.features[FEATURE_KEYS[1]]).toBe(false);
    expect(Object.keys(summary?.features ?? {})).toHaveLength(
      FEATURE_KEYS.length
    );
  });
});
