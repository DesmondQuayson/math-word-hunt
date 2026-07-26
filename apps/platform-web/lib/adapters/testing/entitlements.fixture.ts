import {
  createEntitlementPolicy,
  type EntitlementService,
  type EntitlementSourceReader
} from "@math-vocabulary-hunt/platform-core";

/** Explicit test-only factory. No runtime environment or request input is read. */
export function createFixtureEntitlementPolicy(
  records: readonly unknown[],
  now: Date
): EntitlementService {
  const reader: EntitlementSourceReader = {
    async getUserEntitlements() {
      return records;
    }
  };
  return createEntitlementPolicy(reader, () => now);
}
