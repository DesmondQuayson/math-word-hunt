import { describe, expectTypeOf, it } from "vitest";

import type { UserId } from "../identity/types.js";
import type { ActivityDefinition } from "./activity-definition.js";
import type { AggregateReport } from "./aggregate-report.js";
import type { ClassRecord } from "./class-record.js";
import type { CurriculumStatusSummary } from "./curriculum-summary.js";
import type {
  ActivityRepository,
  AggregateReportRepository,
  ClassRepository,
  CurriculumRepository,
  SessionRepository,
  TeacherProfileRepository
} from "./repository-interfaces.js";
import type { SessionRecord } from "./session-record.js";
import type { TeacherResult } from "./teacher-errors.js";
import type { TeacherProfileRecord } from "./teacher-profile.js";

describe("teacher repository interfaces", () => {
  it("keeps all reads scoped by teacher ownership", () => {
    expectTypeOf<ClassRepository["getById"]>().parameter(0).toEqualTypeOf<UserId>();
    expectTypeOf<ActivityRepository["getById"]>().parameter(0).toEqualTypeOf<UserId>();
    expectTypeOf<SessionRepository["getById"]>().parameter(0).toEqualTypeOf<UserId>();
    expectTypeOf<AggregateReportRepository["getById"]>().parameter(0).toEqualTypeOf<UserId>();
  });

  it("returns explicit result types instead of nullable authority", () => {
    expectTypeOf<TeacherProfileRepository["getByTeacherId"]>()
      .returns.resolves.toEqualTypeOf<TeacherResult<TeacherProfileRecord>>();
    expectTypeOf<ClassRepository["getById"]>()
      .returns.resolves.toEqualTypeOf<TeacherResult<ClassRecord>>();
    expectTypeOf<ActivityRepository["getById"]>()
      .returns.resolves.toEqualTypeOf<TeacherResult<ActivityDefinition>>();
    expectTypeOf<SessionRepository["getById"]>()
      .returns.resolves.toEqualTypeOf<TeacherResult<SessionRecord>>();
    expectTypeOf<AggregateReportRepository["getById"]>()
      .returns.resolves.toEqualTypeOf<TeacherResult<AggregateReport>>();
    expectTypeOf<CurriculumRepository["getSummary"]>()
      .returns.resolves.toEqualTypeOf<TeacherResult<CurriculumStatusSummary>>();
  });

  it("exposes request boundaries but no permanent delete method", () => {
    expectTypeOf<TeacherProfileRepository>().toHaveProperty("requestDeletion");
    expectTypeOf<ClassRepository>().toHaveProperty("requestDeletion");
    expectTypeOf<ClassRepository>().not.toHaveProperty("delete");
  });
});
