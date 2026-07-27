import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

import { SupabaseCapabilityRepository } from "./capability.repository";

function client(data: unknown, error: unknown = null): SupabaseClient {
  return { rpc: async () => ({ data, error }) } as unknown as SupabaseClient;
}

describe("SupabaseCapabilityRepository", () => {
  it("parses a server-derived Free usage snapshot", async () => {
    const repository = new SupabaseCapabilityRepository(client([{
      plan_key: "free", plan_expires_at: null, active_class_count: 1,
      active_class_limit: 2, active_activity_count: 2, active_activity_limit: 3
    }]));
    await expect(repository.getUsage()).resolves.toEqual({
      planKey: "free", planExpiresAt: null, activeClassCount: 1,
      activeClassLimit: 2, activeActivityCount: 2, activeActivityLimit: 3
    });
  });

  it("parses verified Pro only with an expiry", async () => {
    const repository = new SupabaseCapabilityRepository(client([{
      plan_key: "teacher-pro-annual", plan_expires_at: "2030-01-01T00:00:00.000Z",
      active_class_count: 3, active_class_limit: 25, active_activity_count: 4, active_activity_limit: 100
    }]));
    await expect(repository.getUsage()).resolves.toMatchObject({ planKey: "teacher-pro-annual", activeClassLimit: 25, activeActivityLimit: 100 });
  });

  it.each([
    [{ plan_key: "forged", plan_expires_at: null, active_class_count: 0, active_class_limit: 2, active_activity_count: 0, active_activity_limit: 3 }],
    [{ plan_key: "teacher-pro-monthly", plan_expires_at: null, active_class_count: 0, active_class_limit: 25, active_activity_count: 0, active_activity_limit: 100 }],
    [{ plan_key: "free", plan_expires_at: null, active_class_count: "browser-forged", active_class_limit: 2, active_activity_count: 0, active_activity_limit: 3 }]
  ])("fails closed for malformed usage data", async (row) => {
    const repository = new SupabaseCapabilityRepository(client([row]));
    await expect(repository.getUsage()).resolves.toBeNull();
  });
});
