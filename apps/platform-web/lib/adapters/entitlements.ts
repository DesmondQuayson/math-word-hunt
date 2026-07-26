import {
  FEATURE_KEYS,
  PRODUCT_KEYS,
  createEntitlementPolicy,
  parseUserId,
  type FeatureKey
} from "@math-vocabulary-hunt/platform-core";

import { resolveTeacherContext } from "@/lib/auth/teacher-context";
import { createServerRepositories } from "@/lib/repositories/server-repositories";

export type PlatformAccessView = Readonly<{
  productAccess: boolean;
  features: Readonly<Record<FeatureKey, boolean>>;
  source: "default-deny" | "server-authoritative";
}>;

const anonymousUserId = parseUserId("anonymous-platform-preview");
const productionPolicy = createEntitlementPolicy({
  async getUserEntitlements() {
    return [];
  }
});

export async function getPlatformAccess(): Promise<PlatformAccessView> {
  const [context, repositories] = await Promise.all([
    resolveTeacherContext(),
    createServerRepositories()
  ]);
  const canRead = context.status === "active" && repositories !== null;
  const policy = canRead ? createEntitlementPolicy(repositories.entitlements) : productionPolicy;
  const summary = await policy.getUserAccessSummary(
    canRead ? context.userId : anonymousUserId,
    PRODUCT_KEYS[0]
  );
  const features = Object.fromEntries(
    FEATURE_KEYS.map((featureKey) => [featureKey, false])
  ) as Record<FeatureKey, boolean>;

  return Object.freeze({
    productAccess: summary?.productAccess ?? false,
    features: Object.freeze(features),
    source: canRead ? "server-authoritative" : "default-deny"
  });
}
