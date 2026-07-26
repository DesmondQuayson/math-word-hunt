import {
  FEATURE_KEYS,
  isFeatureKey,
  type FeatureKey
} from "../catalog/feature-keys.js";
import {
  isProductKey,
  type ProductKey
} from "../catalog/product-keys.js";
import type { UserId } from "../identity/types.js";
import type {
  Entitlement,
  EntitlementService,
  EntitlementSource,
  EntitlementSourceReader,
  UserAccessSummary
} from "./types.js";

const statuses = new Set(["active", "revoked"]);
const sources = new Set<EntitlementSource>([
  "system",
  "manual",
  "subscription",
  "license"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function timestamp(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseEntitlement(value: unknown): Entitlement | null {
  if (!isRecord(value)) return null;
  if (
    typeof value.id !== "string" ||
    value.id.length === 0 ||
    typeof value.userId !== "string" ||
    value.userId.length === 0 ||
    !isProductKey(value.productKey) ||
    !statuses.has(String(value.status)) ||
    !sources.has(value.source as EntitlementSource)
  ) {
    return null;
  }

  const startsAt = timestamp(value.startsAt);
  const expiresAt =
    value.expiresAt === null ? null : timestamp(value.expiresAt);
  if (
    startsAt === null ||
    (value.expiresAt !== null && expiresAt === null) ||
    (expiresAt !== null && expiresAt <= startsAt)
  ) {
    return null;
  }

  if (value.scope === "product" && value.featureKey === null) {
    return value as unknown as Entitlement;
  }
  if (value.scope === "feature" && isFeatureKey(value.featureKey)) {
    return value as unknown as Entitlement;
  }
  return null;
}

function isEffective(
  entitlement: Entitlement,
  userId: UserId,
  productKey: ProductKey,
  now: number
): boolean {
  if (
    entitlement.userId !== userId ||
    entitlement.productKey !== productKey ||
    entitlement.status !== "active"
  ) {
    return false;
  }
  const startsAt = Date.parse(entitlement.startsAt);
  const expiresAt =
    entitlement.expiresAt === null
      ? null
      : Date.parse(entitlement.expiresAt);
  return startsAt <= now && (expiresAt === null || expiresAt > now);
}

export function createEntitlementPolicy(
  reader: EntitlementSourceReader,
  now: () => Date = () => new Date()
): EntitlementService {
  async function effectiveEntitlements(
    userId: UserId,
    productKey: ProductKey
  ): Promise<Entitlement[]> {
    const evaluatedAt = now().getTime();
    const values = await reader.getUserEntitlements(userId);
    return values
      .map(parseEntitlement)
      .filter(
        (value): value is Entitlement =>
          value !== null &&
          isEffective(value, userId, productKey, evaluatedAt)
      );
  }

  return Object.freeze({
    async canAccessProduct(userId: UserId, productKey: unknown) {
      if (!isProductKey(productKey)) return false;
      const entitlements = await effectiveEntitlements(userId, productKey);
      return entitlements.length > 0;
    },

    async canAccessFeature(
      userId: UserId,
      productKey: unknown,
      featureKey: unknown
    ) {
      if (!isProductKey(productKey) || !isFeatureKey(featureKey)) {
        return false;
      }
      const entitlements = await effectiveEntitlements(userId, productKey);
      return entitlements.some(
        (entitlement) =>
          entitlement.scope === "feature" &&
          entitlement.featureKey === featureKey
      );
    },

    async getUserAccessSummary(
      userId: UserId,
      productKey: unknown
    ): Promise<UserAccessSummary | null> {
      if (!isProductKey(productKey)) return null;
      const entitlements = await effectiveEntitlements(userId, productKey);
      const features = Object.fromEntries(
        FEATURE_KEYS.map((featureKey) => [
          featureKey,
          entitlements.some(
            (entitlement) =>
              entitlement.scope === "feature" &&
              entitlement.featureKey === featureKey
          )
        ])
      ) as Record<FeatureKey, boolean>;

      return Object.freeze({
        userId,
        productKey,
        productAccess: entitlements.length > 0,
        features: Object.freeze(features),
        evaluatedAt: now().toISOString()
      });
    }
  });
}
