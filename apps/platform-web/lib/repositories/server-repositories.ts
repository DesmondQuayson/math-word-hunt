import "server-only";

import { createServerSupabaseClient } from "@/lib/supabase/server";

import { SupabaseActivityRepository } from "./activity.repository";
import { SupabaseClassRepository } from "./class.repository";
import { SupabaseCapabilityRepository } from "./capability.repository";
import { SupabaseDeletionRequestRepository } from "./deletion-request.repository";
import { SupabaseEntitlementRepository } from "./entitlement.repository";
import { SupabaseProductCatalogRepository } from "./catalog.repository";
import { SupabaseTeacherProfileRepository } from "./teacher-profile.repository";

export async function createServerRepositories() {
  const client = await createServerSupabaseClient();
  if (!client) return null;
  return Object.freeze({
    client,
    profiles: new SupabaseTeacherProfileRepository(client),
    classes: new SupabaseClassRepository(client),
    capabilities: new SupabaseCapabilityRepository(client),
    activities: new SupabaseActivityRepository(client),
    catalog: new SupabaseProductCatalogRepository(client),
    entitlements: new SupabaseEntitlementRepository(client),
    deletionRequests: new SupabaseDeletionRequestRepository(client)
  });
}
