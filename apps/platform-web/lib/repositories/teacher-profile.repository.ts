import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseTeacherProfile,
  teacherFailure,
  type TeacherProfileRecord,
  type TeacherProfileRepository,
  type TeacherResult,
  type UserId
} from "@math-vocabulary-hunt/platform-core";

import { mapProviderError, normalizeTimestamp } from "./errors";

function parseRow(data: unknown): TeacherResult<TeacherProfileRecord> {
  if (!data || typeof data !== "object") return teacherFailure("not-found", "Teacher profile was not found.");
  const row = data as Record<string, unknown>;
  return parseTeacherProfile({
    teacherId: row.user_id,
    displayName: row.display_name,
    organizationLabel: row.school_or_organization_label,
    accountStatus: row.account_status === "deletion_requested" ? "deletion-requested" : row.account_status,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  });
}

export class SupabaseTeacherProfileRepository implements TeacherProfileRepository {
  constructor(private readonly client: SupabaseClient) {}

  async getByTeacherId(teacherId: UserId): Promise<TeacherResult<TeacherProfileRecord>> {
    const { data, error } = await this.client.from("teacher_profiles").select(
      "user_id, display_name, school_or_organization_label, account_status, created_at, updated_at"
    ).eq("user_id", teacherId).maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async save(profile: TeacherProfileRecord): Promise<TeacherResult<TeacherProfileRecord>> {
    const parsed = parseTeacherProfile(profile);
    if (!parsed.ok) return parsed;
    const { data, error } = await this.client.from("teacher_profiles").update({
      display_name: parsed.value.displayName
    }).eq("user_id", parsed.value.teacherId).select(
      "user_id, display_name, school_or_organization_label, account_status, created_at, updated_at"
    ).maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async requestDeletion(): Promise<TeacherResult<never>> {
    return teacherFailure("unavailable", "Use the account deletion-request repository.");
  }
}
