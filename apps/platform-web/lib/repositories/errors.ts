import { teacherFailure, type TeacherResult } from "@math-vocabulary-hunt/platform-core";

type ProviderError = Readonly<{ code?: string }> | null;

export function normalizeTimestamp(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? value : new Date(timestamp).toISOString();
}

export function mapProviderError(error: ProviderError, fallback = "The requested operation is unavailable."): TeacherResult<never> {
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
