import { teacherFailure, type TeacherResult } from "@math-vocabulary-hunt/platform-core";

type ProviderError = Readonly<{ code?: string; message?: string }> | null;

export function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

export function mapProviderError(error: ProviderError, fallback = "The requested operation is unavailable."): TeacherResult<never> {
  if (error?.code === "P0001" && error.message?.includes("capability_limit_reached:class.create")) {
    return teacherFailure("conflict", "Your active class limit has been reached. Archive a class to restore capacity, or review Teacher Pro in the test sandbox.");
  }
  if (error?.code === "P0001" && error.message?.includes("capability_limit_reached:activity.create")) {
    return teacherFailure("conflict", "Your active activity-draft limit has been reached. Existing work remains safe; review Teacher Pro in the test sandbox for more capacity.");
  }
  if (error?.code === "23505") return teacherFailure("conflict", "That record already exists.");
  if (error?.code === "23503" || error?.code === "23514" || error?.code === "22P02") {
    return teacherFailure("validation", "The submitted information is invalid.");
  }
  if (error?.code === "42501" || error?.code === "PGRST301") {
    return teacherFailure("unauthorized", "You are not authorized to perform that operation.");
  }
  if (error?.code === "PGRST116") return teacherFailure("not-found", "The requested record was not found.");
  return teacherFailure("unavailable", fallback);
}
