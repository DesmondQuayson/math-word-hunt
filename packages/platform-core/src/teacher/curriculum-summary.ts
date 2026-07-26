import { teacherSuccess, type TeacherResult } from "./teacher-errors";
import {
  hasOnlyKeys,
  invalid,
  isIntegerInRange,
  isOneOf,
  isRecord,
  isTrimmedText
} from "./validation";

export const CURRICULUM_STATUSES = ["ready", "thin", "coming-soon", "review-pending"] as const;
export type CurriculumStatus = typeof CURRICULUM_STATUSES[number];

export type CurriculumStatusSummary = Readonly<{
  curriculumId: string;
  availableGrades: readonly ("6" | "7" | "8")[];
  termCount: number;
  playableLessonCount: number;
  missingLessonCount: number;
  thinLessonCount: number;
  unresolvedReferenceCount: number;
  teacherReviewComplete: boolean;
  statuses: readonly CurriculumStatus[];
}>;

export function parseCurriculumSummary(value: unknown): TeacherResult<CurriculumStatusSummary> {
  if (!isRecord(value) || !hasOnlyKeys(value, [
    "curriculumId",
    "availableGrades",
    "termCount",
    "playableLessonCount",
    "missingLessonCount",
    "thinLessonCount",
    "unresolvedReferenceCount",
    "teacherReviewComplete",
    "statuses"
  ])) return invalid("curriculum", "Curriculum summary shape is invalid.");
  if (!isTrimmedText(value.curriculumId, 1, 128)) return invalid("curriculumId", "Curriculum ID is invalid.");
  if (!Array.isArray(value.availableGrades) || value.availableGrades.length === 0 || value.availableGrades.some((grade) => !isOneOf(grade, ["6", "7", "8"] as const)) || new Set(value.availableGrades).size !== value.availableGrades.length) return invalid("availableGrades", "Available grades are invalid.");
  for (const field of ["termCount", "playableLessonCount", "missingLessonCount", "thinLessonCount", "unresolvedReferenceCount"] as const) {
    if (!isIntegerInRange(value[field], 0, 100000)) return invalid(field, `${field} is invalid.`);
  }
  if (typeof value.teacherReviewComplete !== "boolean") return invalid("teacherReviewComplete", "Teacher review status is invalid.");
  if (!Array.isArray(value.statuses) || value.statuses.some((status) => !isOneOf(status, CURRICULUM_STATUSES))) return invalid("statuses", "Curriculum statuses are invalid.");

  return teacherSuccess({
    curriculumId: value.curriculumId,
    availableGrades: value.availableGrades as ("6" | "7" | "8")[],
    termCount: value.termCount as number,
    playableLessonCount: value.playableLessonCount as number,
    missingLessonCount: value.missingLessonCount as number,
    thinLessonCount: value.thinLessonCount as number,
    unresolvedReferenceCount: value.unresolvedReferenceCount as number,
    teacherReviewComplete: value.teacherReviewComplete,
    statuses: value.statuses as CurriculumStatus[]
  });
}
