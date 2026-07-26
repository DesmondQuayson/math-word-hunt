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
  isNullableTrimmedText
} from "./validation";

export type LessonReviewCategory =
  | "strong-recall"
  | "continue-practice"
  | "ready-to-revisit";

export type AggregateLessonResult = Readonly<{
  lessonId: string;
  lessonLabel: string;
  aggregateCorrectPercent: number;
  reviewCategory: LessonReviewCategory;
}>;

export type AggregateVocabularyCategory = Readonly<{
  termId: string;
  termLabel: string;
  category: "strength" | "review";
}>;

export type AggregateReport = Readonly<{
  reportId: string;
  ownerTeacherId: UserId;
  classId: string | null;
  activityId: string | null;
  sessionId: string | null;
  aggregateSessionCount: number;
  aggregateTeamCount: number;
  lessonResults: readonly AggregateLessonResult[];
  vocabularyCategories: readonly AggregateVocabularyCategory[];
  generatedAt: string;
}>;

function parseLessonResult(value: unknown, index: number): TeacherResult<AggregateLessonResult> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "lessonId",
    "lessonLabel",
    "aggregateCorrectPercent",
    "reviewCategory"
  ])) return invalid(`lessonResults.${index}`, "Lesson result shape is invalid.");
  if (!isTrimmedText(value.lessonId, 1, 128)) return invalid(`lessonResults.${index}.lessonId`, "Lesson reference is invalid.");
  if (!isTrimmedText(value.lessonLabel, 1, 160)) return invalid(`lessonResults.${index}.lessonLabel`, "Lesson label is invalid.");
  if (!isIntegerInRange(value.aggregateCorrectPercent, 0, 100)) return invalid(`lessonResults.${index}.aggregateCorrectPercent`, "Aggregate percentage must be from 0 to 100.");
  if (!isOneOf(value.reviewCategory, ["strong-recall", "continue-practice", "ready-to-revisit"] as const)) return invalid(`lessonResults.${index}.reviewCategory`, "Review category is invalid.");
  return teacherSuccess({
    lessonId: value.lessonId,
    lessonLabel: value.lessonLabel,
    aggregateCorrectPercent: value.aggregateCorrectPercent,
    reviewCategory: value.reviewCategory
  });
}

function parseVocabularyCategory(value: unknown, index: number): TeacherResult<AggregateVocabularyCategory> {
  if (!isRecord(value) || !hasOnlyKeys(value, ["termId", "termLabel", "category"])) return invalid(`vocabularyCategories.${index}`, "Vocabulary category shape is invalid.");
  if (!isTrimmedText(value.termId, 1, 128)) return invalid(`vocabularyCategories.${index}.termId`, "Term reference is invalid.");
  if (!isTrimmedText(value.termLabel, 1, 160)) return invalid(`vocabularyCategories.${index}.termLabel`, "Term label is invalid.");
  if (!isOneOf(value.category, ["strength", "review"] as const)) return invalid(`vocabularyCategories.${index}.category`, "Vocabulary category is invalid.");
  return teacherSuccess({ termId: value.termId, termLabel: value.termLabel, category: value.category });
}

export function parseAggregateReport(value: unknown): TeacherResult<AggregateReport> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "reportId",
    "ownerTeacherId",
    "classId",
    "activityId",
    "sessionId",
    "aggregateSessionCount",
    "aggregateTeamCount",
    "lessonResults",
    "vocabularyCategories",
    "generatedAt"
  ])) return invalid("report", "Aggregate report shape is invalid.");
  if (!isTrimmedText(value.reportId, 1, 128)) return invalid("reportId", "Report ID is invalid.");
  if (!isTrimmedText(value.ownerTeacherId, 1, 128)) return invalid("ownerTeacherId", "Teacher owner is invalid.");
  for (const field of ["classId", "activityId", "sessionId"] as const) {
    if (!isNullableTrimmedText(value[field], 1, 128)) return invalid(field, `${field} reference is invalid.`);
  }
  if (!isIntegerInRange(value.aggregateSessionCount, 0, 100000)) return invalid("aggregateSessionCount", "Aggregate session count is invalid.");
  if (!isIntegerInRange(value.aggregateTeamCount, 0, 100000)) return invalid("aggregateTeamCount", "Aggregate team count is invalid.");
  if (!Array.isArray(value.lessonResults)) return invalid("lessonResults", "Lesson results must be an array.");
  if (!Array.isArray(value.vocabularyCategories)) return invalid("vocabularyCategories", "Vocabulary categories must be an array.");
  if (!isIsoTimestamp(value.generatedAt)) return invalid("generatedAt", "Generated timestamp is invalid.");

  const lessonResults: AggregateLessonResult[] = [];
  for (const [index, item] of value.lessonResults.entries()) {
    const parsed = parseLessonResult(item, index);
    if (!parsed.ok) return parsed;
    lessonResults.push(parsed.value);
  }
  const vocabularyCategories: AggregateVocabularyCategory[] = [];
  for (const [index, item] of value.vocabularyCategories.entries()) {
    const parsed = parseVocabularyCategory(item, index);
    if (!parsed.ok) return parsed;
    vocabularyCategories.push(parsed.value);
  }

  return teacherSuccess({
    reportId: value.reportId,
    ownerTeacherId: value.ownerTeacherId as UserId,
    classId: value.classId as string | null,
    activityId: value.activityId as string | null,
    sessionId: value.sessionId as string | null,
    aggregateSessionCount: value.aggregateSessionCount,
    aggregateTeamCount: value.aggregateTeamCount,
    lessonResults,
    vocabularyCategories,
    generatedAt: value.generatedAt
  });
}
