import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseClassRecord,
  teacherFailure,
  type ClassRecord,
  type ClassRepository,
  type DeletionRequestReceipt,
  type TeacherResult,
  type UserId
} from "@math-vocabulary-hunt/platform-core";

import { mapProviderError, normalizeTimestamp } from "./errors";

const selection = "id, owner_teacher_id, class_name, grade_level, period_or_section, status, archived_at, created_at, updated_at";

function parseRow(data: unknown): TeacherResult<ClassRecord> {
  if (!data || typeof data !== "object") return teacherFailure("not-found", "Class was not found.");
  const row = data as Record<string, unknown>;
  return parseClassRecord({
    classId: row.id,
    ownerTeacherId: row.owner_teacher_id,
    className: row.class_name,
    grade: row.grade_level,
    periodOrSection: row.period_or_section,
    status: row.status,
    archivedAt: row.archived_at === null ? null : normalizeTimestamp(row.archived_at),
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  });
}

export class SupabaseClassRepository implements ClassRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByOwner(ownerTeacherId: UserId): Promise<TeacherResult<readonly ClassRecord[]>> {
    const { data, error } = await this.client.from("teacher_classes").select(selection)
      .eq("owner_teacher_id", ownerTeacherId).order("created_at", { ascending: false });
    if (error) return mapProviderError(error);
    const records: ClassRecord[] = [];
    for (const row of Array.isArray(data) ? data : []) {
      const parsed = parseRow(row);
      if (!parsed.ok) return parsed;
      records.push(parsed.value);
    }
    return { ok: true, value: records };
  }

  async getById(ownerTeacherId: UserId, classId: string): Promise<TeacherResult<ClassRecord>> {
    const { data, error } = await this.client.from("teacher_classes").select(selection)
      .eq("owner_teacher_id", ownerTeacherId).eq("id", classId).maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async save(record: ClassRecord): Promise<TeacherResult<ClassRecord>> {
    const parsed = parseClassRecord(record);
    if (!parsed.ok) return parsed;
    const existing = await this.getById(parsed.value.ownerTeacherId, parsed.value.classId);
    const query = existing.ok
      ? this.client.from("teacher_classes").update({
          class_name: parsed.value.className,
          grade_level: parsed.value.grade,
          period_or_section: parsed.value.periodOrSection,
          status: parsed.value.status
        }).eq("id", parsed.value.classId).eq("owner_teacher_id", parsed.value.ownerTeacherId)
      : this.client.from("teacher_classes").insert({
          id: parsed.value.classId,
          owner_teacher_id: parsed.value.ownerTeacherId,
          class_name: parsed.value.className,
          grade_level: parsed.value.grade,
          period_or_section: parsed.value.periodOrSection
        });
    const { data, error } = await query.select(selection).maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async archive(ownerTeacherId: UserId, classId: string): Promise<TeacherResult<ClassRecord>> {
    const { data, error } = await this.client.from("teacher_classes").update({ status: "archived" })
      .eq("owner_teacher_id", ownerTeacherId).eq("id", classId).select(selection).maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async restore(): Promise<TeacherResult<ClassRecord>> {
    return teacherFailure("unavailable", "Class restoration requires owner approval in a later phase.");
  }

  async requestDeletion(): Promise<TeacherResult<DeletionRequestReceipt>> {
    return teacherFailure("unavailable", "Permanent class deletion is not available.");
  }
}
