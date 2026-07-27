import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { DELETION_STATES, teacherFailure, type DeletionState, type TeacherResult, type UserId } from "@math-vocabulary-hunt/platform-core";

import { mapProviderError, normalizeTimestamp } from "./errors";

export type AccountDeletionRequest = Readonly<{
  id: string;
  ownerTeacherId: UserId;
  status: "requested" | "resolved";
  requestedAt: string;
  resolvedAt: string | null;
  resolutionCode: string | null;
  lifecycleState: DeletionState;
  idempotencyKey: string;
}>;

function parseRow(data: unknown): TeacherResult<AccountDeletionRequest> {
  if (!data || typeof data !== "object") return teacherFailure("not-found", "No deletion request was found.");
  const row = data as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.owner_teacher_id !== "string" ||
      (row.status !== "requested" && row.status !== "resolved") || typeof row.requested_at !== "string" ||
      typeof row.lifecycle_state !== "string" || !DELETION_STATES.includes(row.lifecycle_state as DeletionState) || typeof row.idempotency_key !== "string") {
    return teacherFailure("validation", "Deletion-request information is malformed.");
  }
  return { ok: true, value: {
    id: row.id,
    ownerTeacherId: row.owner_teacher_id as UserId,
    status: row.status,
    requestedAt: normalizeTimestamp(row.requested_at) as string,
    resolvedAt: typeof row.resolved_at === "string" ? normalizeTimestamp(row.resolved_at) as string : null,
    resolutionCode: typeof row.resolution_code === "string" ? row.resolution_code : null,
    lifecycleState: row.lifecycle_state as DeletionState,
    idempotencyKey: row.idempotency_key
  } };
}

export class SupabaseDeletionRequestRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getOpen(ownerTeacherId: UserId): Promise<TeacherResult<AccountDeletionRequest>> {
    const { data, error } = await this.client.from("account_deletion_requests").select(
      "id, owner_teacher_id, status, requested_at, resolved_at, resolution_code, lifecycle_state, idempotency_key"
    ).eq("owner_teacher_id", ownerTeacherId).eq("status", "requested").maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async create(ownerTeacherId: UserId): Promise<TeacherResult<AccountDeletionRequest>> {
    const { data, error } = await this.client.from("account_deletion_requests")
      .insert({ owner_teacher_id: ownerTeacherId })
      .select("id, owner_teacher_id, status, requested_at, resolved_at, resolution_code, lifecycle_state, idempotency_key").maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }
}
