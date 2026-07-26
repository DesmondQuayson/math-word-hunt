import type { UserId } from "../identity/types";

import { teacherSuccess, type TeacherResult } from "./teacher-errors";
import {
  hasOnlyKeys,
  invalid,
  isIntegerInRange,
  isIsoTimestamp,
  isRecord,
  isTrimmedText
} from "./validation";

export type TeacherDashboardSummary = Readonly<{
  teacherId: UserId;
  activeClassCount: number;
  draftActivityCount: number;
  readyActivityCount: number;
  activeSessionCount: number;
  aggregateReportCount: number;
  currentV7GameAvailable: boolean;
  generatedAt: string;
}>;

export function parseTeacherDashboard(value: unknown): TeacherResult<TeacherDashboardSummary> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "teacherId",
    "activeClassCount",
    "draftActivityCount",
    "readyActivityCount",
    "activeSessionCount",
    "aggregateReportCount",
    "currentV7GameAvailable",
    "generatedAt"
  ])) return invalid("dashboard", "Teacher dashboard shape is invalid.");
  if (!isTrimmedText(value.teacherId, 1, 128)) return invalid("teacherId", "Teacher ID is invalid.");
  for (const field of ["activeClassCount", "draftActivityCount", "readyActivityCount", "activeSessionCount", "aggregateReportCount"] as const) {
    if (!isIntegerInRange(value[field], 0, 100000)) return invalid(field, `${field} is invalid.`);
  }
  if (typeof value.currentV7GameAvailable !== "boolean") return invalid("currentV7GameAvailable", "Current v7 availability is invalid.");
  if (!isIsoTimestamp(value.generatedAt)) return invalid("generatedAt", "Generated timestamp is invalid.");
  return teacherSuccess({
    teacherId: value.teacherId as UserId,
    activeClassCount: value.activeClassCount as number,
    draftActivityCount: value.draftActivityCount as number,
    readyActivityCount: value.readyActivityCount as number,
    activeSessionCount: value.activeSessionCount as number,
    aggregateReportCount: value.aggregateReportCount as number,
    currentV7GameAvailable: value.currentV7GameAvailable,
    generatedAt: value.generatedAt
  });
}
