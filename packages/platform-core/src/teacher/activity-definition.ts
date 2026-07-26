import type { UserId } from "../identity/types";

import { CLASS_GRADES, type ClassGrade } from "./class-record";
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

export type ActivityStatus = "draft" | "ready";

/** Structurally stable key; the owner has not approved a final mode enumeration. */
export type ActivityGameMode = string & { readonly __activityGameModeBrand: unique symbol };

export type ActivityDefinition = Readonly<{
  activityId: string;
  ownerTeacherId: UserId;
  classId: string | null;
  grade: ClassGrade;
  topicId: string;
  lessonId: string;
  gameMode: ActivityGameMode;
  timeLimitMinutes: number;
  teamCount: number;
  combineMode: boolean;
  status: ActivityStatus;
  createdAt: string;
  updatedAt: string;
}>;

export function parseActivityDefinition(value: unknown): TeacherResult<ActivityDefinition> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "activityId",
    "ownerTeacherId",
    "classId",
    "grade",
    "topicId",
    "lessonId",
    "gameMode",
    "timeLimitMinutes",
    "teamCount",
    "combineMode",
    "status",
    "createdAt",
    "updatedAt"
  ])) return invalid("activity", "Activity shape is invalid.");
  if (!isTrimmedText(value.activityId, 1, 128)) return invalid("activityId", "Activity ID is invalid.");
  if (!isTrimmedText(value.ownerTeacherId, 1, 128)) return invalid("ownerTeacherId", "Teacher owner is invalid.");
  if (!isNullableTrimmedText(value.classId, 1, 128)) return invalid("classId", "Class reference is invalid.");
  if (!isOneOf(value.grade, CLASS_GRADES)) return invalid("grade", "Grade must be 6, 7, or 8.");
  if (!isTrimmedText(value.topicId, 1, 128)) return invalid("topicId", "Topic reference is invalid.");
  if (!isTrimmedText(value.lessonId, 1, 128)) return invalid("lessonId", "Lesson reference is invalid.");
  if (!isTrimmedText(value.gameMode, 1, 64)) return invalid("gameMode", "Game mode is invalid.");
  if (!isIntegerInRange(value.timeLimitMinutes, 1, 60)) return invalid("timeLimitMinutes", "Time limit must be from 1 to 60 minutes.");
  if (!isIntegerInRange(value.teamCount, 2, 8)) return invalid("teamCount", "Team count must be from 2 to 8.");
  if (typeof value.combineMode !== "boolean") return invalid("combineMode", "Combine Mode must be true or false.");
  if (!isOneOf(value.status, ["draft", "ready"] as const)) return invalid("status", "Activity status is invalid.");
  if (!isIsoTimestamp(value.createdAt)) return invalid("createdAt", "Created timestamp is invalid.");
  if (!isIsoTimestamp(value.updatedAt)) return invalid("updatedAt", "Updated timestamp is invalid.");
  if (!timestampsAreOrdered(value.createdAt, value.updatedAt)) return invalid("updatedAt", "Updated timestamp cannot precede creation.");

  return teacherSuccess({
    activityId: value.activityId,
    ownerTeacherId: value.ownerTeacherId as UserId,
    classId: value.classId,
    grade: value.grade,
    topicId: value.topicId,
    lessonId: value.lessonId,
    gameMode: value.gameMode as ActivityGameMode,
    timeLimitMinutes: value.timeLimitMinutes,
    teamCount: value.teamCount,
    combineMode: value.combineMode,
    status: value.status,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt
  });
}
