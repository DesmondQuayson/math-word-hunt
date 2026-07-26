import type { UserId } from "../identity/types";

import type { ActivityDefinition } from "./activity-definition";
import type { AggregateReport } from "./aggregate-report";
import type { ClassRecord } from "./class-record";
import type { CurriculumStatusSummary } from "./curriculum-summary";
import type { SessionRecord } from "./session-record";
import type { TeacherResult } from "./teacher-errors";
import type { TeacherProfileRecord } from "./teacher-profile";

export type DeletionRequestReceipt = Readonly<{
  subjectType: "teacher-profile" | "class";
  subjectId: string;
  status: "requested";
  requestedAt: string;
}>;

export interface TeacherProfileRepository {
  getByTeacherId(teacherId: UserId): Promise<TeacherResult<TeacherProfileRecord>>;
  save(profile: TeacherProfileRecord): Promise<TeacherResult<TeacherProfileRecord>>;
  requestDeletion(
    teacherId: UserId,
    requestedAt: string
  ): Promise<TeacherResult<DeletionRequestReceipt>>;
}

export interface ClassRepository {
  listByOwner(ownerTeacherId: UserId): Promise<TeacherResult<readonly ClassRecord[]>>;
  getById(ownerTeacherId: UserId, classId: string): Promise<TeacherResult<ClassRecord>>;
  save(record: ClassRecord): Promise<TeacherResult<ClassRecord>>;
  archive(
    ownerTeacherId: UserId,
    classId: string,
    archivedAt: string
  ): Promise<TeacherResult<ClassRecord>>;
  restore(
    ownerTeacherId: UserId,
    classId: string,
    restoredAt: string
  ): Promise<TeacherResult<ClassRecord>>;
  requestDeletion(
    ownerTeacherId: UserId,
    classId: string,
    requestedAt: string
  ): Promise<TeacherResult<DeletionRequestReceipt>>;
}

export interface ActivityRepository {
  listByOwner(ownerTeacherId: UserId): Promise<TeacherResult<readonly ActivityDefinition[]>>;
  getById(ownerTeacherId: UserId, activityId: string): Promise<TeacherResult<ActivityDefinition>>;
  save(activity: ActivityDefinition): Promise<TeacherResult<ActivityDefinition>>;
}

export interface SessionRepository {
  listByOwner(ownerTeacherId: UserId): Promise<TeacherResult<readonly SessionRecord[]>>;
  getById(ownerTeacherId: UserId, sessionId: string): Promise<TeacherResult<SessionRecord>>;
  save(session: SessionRecord): Promise<TeacherResult<SessionRecord>>;
}

export interface AggregateReportRepository {
  listByOwner(ownerTeacherId: UserId): Promise<TeacherResult<readonly AggregateReport[]>>;
  getById(ownerTeacherId: UserId, reportId: string): Promise<TeacherResult<AggregateReport>>;
  save(report: AggregateReport): Promise<TeacherResult<AggregateReport>>;
}

export interface CurriculumRepository {
  getSummary(curriculumId: string): Promise<TeacherResult<CurriculumStatusSummary>>;
}
