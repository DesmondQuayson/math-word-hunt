import type { UserId } from "../identity/types";

import { teacherSuccess, type TeacherResult } from "./teacher-errors";
import {
  hasOnlyKeys,
  invalid,
  isIsoTimestamp,
  isOneOf,
  isRecord,
  isTrimmedText,
  isNullableTrimmedText,
  timestampsAreOrdered
} from "./validation";

export const CLASS_GRADES = ["6", "7", "8"] as const;
export type ClassGrade = typeof CLASS_GRADES[number];
export type ClassStatus = "active" | "archived";

export type ClassRecord = Readonly<{
  classId: string;
  ownerTeacherId: UserId;
  className: string;
  grade: ClassGrade | null;
  periodOrSection: string | null;
  status: ClassStatus;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export function parseClassRecord(value: unknown): TeacherResult<ClassRecord> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "classId",
    "ownerTeacherId",
    "className",
    "grade",
    "periodOrSection",
    "status",
    "archivedAt",
    "createdAt",
    "updatedAt"
  ])) return invalid("class", "Class shape is invalid.");
  if (!isTrimmedText(value.classId, 1, 128)) return invalid("classId", "Class ID is invalid.");
  if (!isTrimmedText(value.ownerTeacherId, 1, 128)) return invalid("ownerTeacherId", "Teacher owner is invalid.");
  if (!isTrimmedText(value.className, 2, 80)) return invalid("className", "Class name must contain 2 to 80 characters.");
  if (value.grade !== null && !isOneOf(value.grade, CLASS_GRADES)) return invalid("grade", "Grade must be 6, 7, 8, or empty.");
  if (!isNullableTrimmedText(value.periodOrSection, 1, 40)) return invalid("periodOrSection", "Period or section must be empty or contain 1 to 40 characters.");
  if (!isOneOf(value.status, ["active", "archived"] as const)) return invalid("status", "Class status is invalid.");
  if (value.archivedAt !== null && !isIsoTimestamp(value.archivedAt)) return invalid("archivedAt", "Archive timestamp is invalid.");
  if (value.status === "active" && value.archivedAt !== null) return invalid("archivedAt", "An active class cannot have an archive timestamp.");
  if (value.status === "archived" && value.archivedAt === null) return invalid("archivedAt", "An archived class requires an archive timestamp.");
  if (!isIsoTimestamp(value.createdAt)) return invalid("createdAt", "Created timestamp is invalid.");
  if (!isIsoTimestamp(value.updatedAt)) return invalid("updatedAt", "Updated timestamp is invalid.");
  if (!timestampsAreOrdered(value.createdAt, value.updatedAt)) return invalid("updatedAt", "Updated timestamp cannot precede creation.");

  return teacherSuccess({
    classId: value.classId,
    ownerTeacherId: value.ownerTeacherId as UserId,
    className: value.className,
    grade: value.grade,
    periodOrSection: value.periodOrSection,
    status: value.status,
    archivedAt: value.archivedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  });
}
