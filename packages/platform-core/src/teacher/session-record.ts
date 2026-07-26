import type { UserId } from "../identity/types";

import { teacherSuccess, type TeacherResult } from "./teacher-errors";
import {
  hasOnlyKeys,
  invalid,
  isIntegerInRange,
  isIsoTimestamp,
  isOneOf,
  isRecord,
  isTrimmedText,
  isNullableTrimmedText,
  timestampsAreOrdered
} from "./validation";

export const SESSION_STATUSES = [
  "planned",
  "ready",
  "active",
  "completed",
  "interrupted",
  "cancelled"
] as const;
export type SessionStatus = typeof SESSION_STATUSES[number];

export type SessionRecord = Readonly<{
  sessionId: string;
  ownerTeacherId: UserId;
  activityId: string;
  classId: string | null;
  status: SessionStatus;
  teamCount: number;
  termsReviewed: number;
  aggregateResponseCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}>;

export function parseSessionRecord(value: unknown): TeacherResult<SessionRecord> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "sessionId",
    "ownerTeacherId",
    "activityId",
    "classId",
    "status",
    "teamCount",
    "termsReviewed",
    "aggregateResponseCount",
    "startedAt",
    "completedAt",
    "createdAt",
    "updatedAt"
  ])) return invalid("session", "Session shape is invalid.");
  if (!isTrimmedText(value.sessionId, 1, 128)) return invalid("sessionId", "Session ID is invalid.");
  if (!isTrimmedText(value.ownerTeacherId, 1, 128)) return invalid("ownerTeacherId", "Teacher owner is invalid.");
  if (!isTrimmedText(value.activityId, 1, 128)) return invalid("activityId", "Activity reference is invalid.");
  if (!isNullableTrimmedText(value.classId, 1, 128)) return invalid("classId", "Class reference is invalid.");
  if (!isOneOf(value.status, SESSION_STATUSES)) return invalid("status", "Session status is invalid.");
  if (!isIntegerInRange(value.teamCount, 0, 8)) return invalid("teamCount", "Aggregate team count must be from 0 to 8.");
  if (!isIntegerInRange(value.termsReviewed, 0, 1000)) return invalid("termsReviewed", "Terms reviewed count is invalid.");
  if (!isIntegerInRange(value.aggregateResponseCount, 0, 100000)) return invalid("aggregateResponseCount", "Aggregate response count is invalid.");
  if (value.startedAt !== null && !isIsoTimestamp(value.startedAt)) return invalid("startedAt", "Started timestamp is invalid.");
  if (value.completedAt !== null && !isIsoTimestamp(value.completedAt)) return invalid("completedAt", "Completed timestamp is invalid.");
  if (value.status === "completed" && value.completedAt === null) return invalid("completedAt", "A completed session requires a completion timestamp.");
  if (!isIsoTimestamp(value.createdAt)) return invalid("createdAt", "Created timestamp is invalid.");
  if (!isIsoTimestamp(value.updatedAt)) return invalid("updatedAt", "Updated timestamp is invalid.");
  if (!timestampsAreOrdered(value.createdAt, value.updatedAt)) return invalid("updatedAt", "Updated timestamp cannot precede creation.");

  return teacherSuccess({
    sessionId: value.sessionId,
    ownerTeacherId: value.ownerTeacherId as UserId,
    activityId: value.activityId,
    classId: value.classId,
    status: value.status,
    teamCount: value.teamCount,
    termsReviewed: value.termsReviewed,
    aggregateResponseCount: value.aggregateResponseCount,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  });
}
