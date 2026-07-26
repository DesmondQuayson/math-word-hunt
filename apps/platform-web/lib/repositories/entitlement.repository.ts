import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { EntitlementSourceReader, UserId } from "@math-vocabulary-hunt/platform-core";

export class SupabaseEntitlementRepository implements EntitlementSourceReader {
  constructor(private readonly client: SupabaseClient) {}

  async getUserEntitlements(userId: UserId): Promise<readonly unknown[]> {
    const { data, error } = await this.client.from("product_entitlements").select(
      "id, teacher_user_id, product_key, scope, feature_key, status, source, starts_at, expires_at"
    ).eq("teacher_user_id", userId);
    if (error || !Array.isArray(data)) return [];
    return data.map((item) => {
      const row = item as Record<string, unknown>;
      return {
        id: row.id,
        userId: row.teacher_user_id,
        productKey: row.product_key,
        scope: row.scope,
        featureKey: row.feature_key,
        status: row.status,
        source: row.source,
        startsAt: row.starts_at,
        expiresAt: row.expires_at
      };
    });
  }
}
