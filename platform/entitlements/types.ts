import type {
  FeatureKey
} from "../catalog/feature-keys.js";
import type {
  ProductKey
} from "../catalog/product-keys.js";
import type { UserId } from "../identity/types.js";

export type EntitlementStatus = "active" | "revoked";

export type EntitlementSource =
  | "system"
  | "manual"
  | "subscription"
  | "license";

type EntitlementBase = Readonly<{
  id: string;
  userId: UserId;
  productKey: ProductKey;
  status: EntitlementStatus;
  source: EntitlementSource;
  startsAt: string;
  expiresAt: string | null;
}>;

export type ProductEntitlement = EntitlementBase &
  Readonly<{
    scope: "product";
    featureKey: null;
  }>;

export type FeatureEntitlement = EntitlementBase &
  Readonly<{
    scope: "feature";
    featureKey: FeatureKey;
  }>;

export type Entitlement = ProductEntitlement | FeatureEntitlement;

export type UserAccessSummary = Readonly<{
  userId: UserId;
  productKey: ProductKey;
  productAccess: boolean;
  features: Readonly<Record<FeatureKey, boolean>>;
  evaluatedAt: string;
}>;

export interface EntitlementSourceReader {
  /** Trusted server-side persistence boundary; never backed by browser hints. */
  getUserEntitlements(userId: UserId): Promise<readonly unknown[]>;
}

/** Server-only authorization boundary for product and feature access. */
export interface EntitlementService {
  canAccessProduct(
    userId: UserId,
    productKey: unknown
  ): Promise<boolean>;
  canAccessFeature(
    userId: UserId,
    productKey: unknown,
    featureKey: unknown
  ): Promise<boolean>;
  getUserAccessSummary(
    userId: UserId,
    productKey: unknown
  ): Promise<UserAccessSummary | null>;
}
