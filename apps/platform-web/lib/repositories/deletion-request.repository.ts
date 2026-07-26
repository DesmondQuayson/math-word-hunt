import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { teacherFailure, type TeacherResult, type UserId } from "@math-vocabulary-hunt/platform-core";

import { mapProviderError, normalizeTimestamp } from "./errors";

export type AccountDeletionRequest = Readonly<{
  id: string;
  ownerTeacherId: UserId;
  status: "requested" | "resolved";
  requestedAt: string;
  resolvedAt: string | null;
  resolutionCode: string | null;
}>;

function parseRow(data: unknown): TeacherResult<AccountDeletionRequest> {
  if (!data || typeof data !== "object") return teacherFailure("not-found", "No deletion request was found.");
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.owner_teacher_id !== "string" ||
      (row.status !== "requested" && row.status !== "resolved") || typeof row.requested_at !== "string") {
    return teacherFailure("validation", "Deletion-request information is malformed.");
  }
  return { ok: true, value: {
    id: row.id,
    ownerTeacherId: row.owner_teacher_id as UserId,
    status: row.status,
    requestedAt: normalizeTimestamp(row.requested_at) as string,
    resolvedAt: typeof row.resolved_at === "string" ? normalizeTimestamp(row.resolved_at) as string : null,
    resolutionCode: typeof row.resolution_code === "string" ? row.resolution_code : null
  } };
}

export class SupabaseDeletionRequestRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getOpen(ownerTeacherId: UserId): Promise<TeacherResult<AccountDeletionRequest>> {
    const { data, error } = await this.client.from("account_deletion_requests").select(
      "id, owner_teacher_id, status, requested_at, resolved_at, resolution_code"
    ).eq("owner_teacher_id", ownerTeacherId).eq("status", "requested").maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async create(ownerTeacherId: UserId): Promise<TeacherResult<AccountDeletionRequest>> {
    const { data, error } = await this.client.from("account_deletion_requests")
      .insert({ owner_teacher_id: ownerTeacherId })
      .select("id, owner_teacher_id, status, requested_at, resolved_at, resolution_code").maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }
}
