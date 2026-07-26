import { teacherFailure, type TeacherResult } from "./teacher-errors";

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function hasOnlyKeys(record: UnknownRecord, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(record).every((key) => allowed.has(key));
}

export function isTrimmedText(value: unknown, minimum: number, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value === value.trim() &&
    value.length >= minimum &&
    value.length <= maximum
  );
}

export function isNullableTrimmedText(
  value: unknown,
  minimum: number,
  maximum: number
): value is string | null {
  return value === null || isTrimmedText(value, minimum, maximum);
}

export function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

export function isIntegerInRange(value: unknown, minimum: number, maximum: number): value is number {
  return Number.isInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

export function isOneOf<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === "string" && values.includes(value as T);
}

export function invalid<T>(field: string, message: string): TeacherResult<T> {
  return teacherFailure("validation", message, field);
}

export function timestampsAreOrdered(createdAt: string, updatedAt: string): boolean {
  return Date.parse(updatedAt) >= Date.parse(createdAt);
}
