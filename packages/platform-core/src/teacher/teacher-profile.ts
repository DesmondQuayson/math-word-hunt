import type { AccountStatus, UserId } from "../identity/types";

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

const accountStatuses = ["active", "suspended", "deletion-requested", "closed"] as const;

export type TeacherProfileRecord = Readonly<{
  teacherId: UserId;
  displayName: string;
  organizationLabel: string | null;
  accountStatus: AccountStatus;
  createdAt: string;
  updatedAt: string;
}>;

export function parseTeacherProfile(value: unknown): TeacherResult<TeacherProfileRecord> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "teacherId",
    "displayName",
    "organizationLabel",
    "accountStatus",
    "createdAt",
    "updatedAt"
  ])) return invalid("profile", "Teacher profile shape is invalid.");
  if (!isTrimmedText(value.teacherId, 1, 128)) return invalid("teacherId", "Teacher ID is invalid.");
  if (!isTrimmedText(value.displayName, 1, 80)) return invalid("displayName", "Display name must contain 1 to 80 characters.");
  if (!isNullableTrimmedText(value.organizationLabel, 1, 120)) return invalid("organizationLabel", "Organization label must be empty or contain 1 to 120 characters.");
  if (!isOneOf(value.accountStatus, accountStatuses)) return invalid("accountStatus", "Account status is invalid.");
  if (!isIsoTimestamp(value.createdAt)) return invalid("createdAt", "Created timestamp is invalid.");
  if (!isIsoTimestamp(value.updatedAt)) return invalid("updatedAt", "Updated timestamp is invalid.");
  if (!timestampsAreOrdered(value.createdAt, value.updatedAt)) return invalid("updatedAt", "Updated timestamp cannot precede creation.");

  return teacherSuccess({
    teacherId: value.teacherId as UserId,
    displayName: value.displayName,
    organizationLabel: value.organizationLabel,
    accountStatus: value.accountStatus,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  });
}
