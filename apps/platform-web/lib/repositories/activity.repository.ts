import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  parseActivityDefinition,
  teacherFailure,
  type ActivityDefinition,
  type ActivityRepository,
  type TeacherResult,
  type UserId
} from "@math-vocabulary-hunt/platform-core";

import { mapProviderError, normalizeTimestamp } from "./errors";

const selection = "id, owner_teacher_id, class_id, grade_level, topic_key, lesson_key, game_mode_key, time_limit_minutes, team_count, combine_mode_enabled, status, created_at, updated_at";

function parseRow(data: unknown): TeacherResult<ActivityDefinition> {
  if (!data || typeof data !== "object") return teacherFailure("not-found", "Activity was not found.");
  const row = data as Record<string, unknown>;
  return parseActivityDefinition({
    activityId: row.id,
    ownerTeacherId: row.owner_teacher_id,
    classId: row.class_id,
    grade: row.grade_level,
    topicId: row.topic_key,
    lessonId: row.lesson_key,
    gameMode: row.game_mode_key,
    timeLimitMinutes: row.time_limit_minutes,
    teamCount: row.team_count,
    combineMode: row.combine_mode_enabled,
    status: row.status === "archived" ? "draft" : row.status,
    createdAt: normalizeTimestamp(row.created_at),
    updatedAt: normalizeTimestamp(row.updated_at)
  });
}

export class SupabaseActivityRepository implements ActivityRepository {
  constructor(private readonly client: SupabaseClient) {}

  async listByOwner(ownerTeacherId: UserId): Promise<TeacherResult<readonly ActivityDefinition[]>> {
    const { data, error } = await this.client.from("teacher_activities").select(selection)
      .eq("owner_teacher_id", ownerTeacherId).neq("status", "archived").order("created_at", { ascending: false });
    if (error) return mapProviderError(error);
    const records: ActivityDefinition[] = [];
    for (const row of Array.isArray(data) ? data : []) {
      const parsed = parseRow(row);
      if (!parsed.ok) return parsed;
      records.push(parsed.value);
    }
    return { ok: true, value: records };
  }

  async getById(ownerTeacherId: UserId, activityId: string): Promise<TeacherResult<ActivityDefinition>> {
    const { data, error } = await this.client.from("teacher_activities").select(selection)
      .eq("owner_teacher_id", ownerTeacherId).eq("id", activityId).neq("status", "archived").maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async save(activity: ActivityDefinition): Promise<TeacherResult<ActivityDefinition>> {
    const parsed = parseActivityDefinition(activity);
    if (!parsed.ok) return parsed;
    const existing = await this.getById(parsed.value.ownerTeacherId, parsed.value.activityId);
    const values = {
      class_id: parsed.value.classId,
      grade_level: parsed.value.grade,
      topic_key: parsed.value.topicId,
      lesson_key: parsed.value.lessonId,
      game_mode_key: parsed.value.gameMode,
      time_limit_minutes: parsed.value.timeLimitMinutes,
      team_count: parsed.value.teamCount,
      combine_mode_enabled: parsed.value.combineMode,
      status: parsed.value.status
    };
    if (!existing.ok) {
      const { error } = await this.client.rpc("create_teacher_activity", {
        p_activity_id: parsed.value.activityId,
        p_class_id: values.class_id,
        p_grade_level: values.grade_level,
        p_topic_key: values.topic_key,
        p_lesson_key: values.lesson_key,
        p_game_mode_key: values.game_mode_key,
        p_time_limit_minutes: values.time_limit_minutes,
        p_team_count: values.team_count,
        p_combine_mode_enabled: values.combine_mode_enabled
      });
      if (error) return mapProviderError(error);
      return this.getById(parsed.value.ownerTeacherId, parsed.value.activityId);
    }
    const query = this.client.from("teacher_activities").update(values)
      .eq("id", parsed.value.activityId).eq("owner_teacher_id", parsed.value.ownerTeacherId);
    const { data, error } = await query.select(selection).maybeSingle();
    if (error) return mapProviderError(error);
    return parseRow(data);
  }

  async archive(ownerTeacherId: UserId, activityId: string): Promise<TeacherResult<Readonly<{ activityId: string; archived: true }>>> {
    const { data, error } = await this.client.from("teacher_activities").update({ status: "archived" })
      .eq("owner_teacher_id", ownerTeacherId).eq("id", activityId).neq("status", "archived").select("id").maybeSingle();
    if (error) return mapProviderError(error);
    if (!data?.id) return teacherFailure("not-found", "Activity was not found.");
    return { ok: true, value: Object.freeze({ activityId: String(data.id), archived: true }) };
  }
}
