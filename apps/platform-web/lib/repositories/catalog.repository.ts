import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { PRODUCT_CATALOG, teacherFailure, type ProductDefinition, type TeacherResult } from "@math-vocabulary-hunt/platform-core";

import { mapProviderError } from "./errors";

export class SupabaseProductCatalogRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listActive(): Promise<TeacherResult<readonly ProductDefinition[]>> {
    const { data, error } = await this.client.from("products").select("product_key, display_name").eq("is_active", true);
    if (error) return mapProviderError(error);
    const allowed = new Map(PRODUCT_CATALOG.map((product) => [product.key, product]));
    const products = (Array.isArray(data) ? data : []).flatMap((row) => {
      if (!row || typeof row !== "object") return [];
      const key = (row as Record<string, unknown>).product_key;
      const product = typeof key === "string" ? allowed.get(key as ProductDefinition["key"]) : undefined;
      return product ? [product] : [];
    });
    return products.length > 0 ? { ok: true, value: products } : teacherFailure("not-found", "No active product was found.");
  }
}
