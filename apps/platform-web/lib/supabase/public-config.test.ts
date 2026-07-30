import { afterEach, describe, expect, it, vi } from "vitest";

import { getSupabasePublicConfig } from "./public-config";

describe("Supabase public configuration", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses provider initialization in public Production even when values are supplied", () => {
    vi.stubEnv("MVH_APP_ENVIRONMENT", "production-public");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://preview.example.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-preview-value");
    expect(getSupabasePublicConfig()).toBeNull();
  });
});
