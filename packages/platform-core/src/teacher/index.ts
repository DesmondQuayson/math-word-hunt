export {
  parseActivityDefinition,
  type ActivityDefinition,
  type ActivityGameMode,
  type ActivityStatus
} from "./activity-definition";
export {
  parseAggregateReport,
  type AggregateLessonResult,
  type AggregateReport,
  type AggregateVocabularyCategory,
  type LessonReviewCategory
} from "./aggregate-report";
export {
  CLASS_GRADES,
  parseClassRecord,
  type ClassGrade,
  type ClassRecord,
  type ClassStatus
} from "./class-record";
export {
  CURRICULUM_STATUSES,
  parseCurriculumSummary,
  type CurriculumStatus,
  type CurriculumStatusSummary
} from "./curriculum-summary";
export type {
  ActivityRepository,
  AggregateReportRepository,
  ClassRepository,
  CurriculumRepository,
  DeletionRequestReceipt,
  SessionRepository,
  TeacherProfileRepository
} from "./repository-interfaces";
export {
  SESSION_STATUSES,
  parseSessionRecord,
  type SessionRecord,
  type SessionStatus
} from "./session-record";
export {
  denyTeacherOperation,
  teacherFailure,
  teacherSuccess,
  type TeacherContractError,
  type TeacherErrorCode,
  type TeacherResult
} from "./teacher-errors";
export {
  parseTeacherDashboard,
  type TeacherDashboardSummary
} from "./teacher-dashboard";
export {
  parseTeacherProfile,
  type TeacherProfileRecord
} from "./teacher-profile";
